import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { characterKey, domains, validateSnapshot, type Domain, type Identity, type Snapshot, type Observation } from './model.js';

export const digest = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
export interface StoredObservation extends Observation {
  id: number; characterKey: string; identity: Identity; source: Snapshot['source']; sample: boolean;
  syncedAt: string; capturedAt: string;
}
export class Store {
  readonly db: DatabaseSync;
  constructor(readonly path: string, readonly mode: 'real' | 'sample' = 'real', readonly readOnly = false) {
    if (path !== ':memory:' && !readOnly) mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path, { readOnly });
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
    if (readOnly) {
      const existing=this.db.prepare('SELECT value FROM metadata WHERE key=?').get('mode') as {value:string}|undefined;
      if(existing?.value!==mode){this.db.close();throw new Error('Database mode mismatch');}
      return;
    }
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS characters(key TEXT PRIMARY KEY,identity TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS snapshots(id INTEGER PRIMARY KEY,hash TEXT UNIQUE NOT NULL,character_key TEXT NOT NULL REFERENCES characters(key),source TEXT NOT NULL,captured_at TEXT NOT NULL,synced_at TEXT NOT NULL,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS observations(id INTEGER PRIMARY KEY,snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,character_key TEXT NOT NULL,domain TEXT NOT NULL,observed_at TEXT,body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS observation_lookup ON observations(character_key,domain,observed_at DESC);
      CREATE TABLE IF NOT EXISTS sync_status(source_id TEXT PRIMARY KEY,attempt_at TEXT NOT NULL,success_at TEXT,error TEXT);
      PRAGMA user_version=1;`);
    const existing = this.db.prepare('SELECT value FROM metadata WHERE key=?').get('mode') as {value:string}|undefined;
    if (existing && existing.value !== mode) {this.db.close();throw new Error('Refusing to mix sample and real stores');}
    this.db.prepare('INSERT OR IGNORE INTO metadata VALUES (?,?)').run('mode',mode);
  }
  close() { this.db.close(); }
  ingest(value: unknown, now = new Date()): { inserted: boolean; characterKey: string } {
    return this.ingestBatch([value],now)[0];
  }
  ingestBatch(values:unknown[],now=new Date()):{inserted:boolean;characterKey:string}[]{
    const snapshots=values.map(v=>validateSnapshot(v,now));
    if(snapshots.some(s=>s.sample!==(this.mode==='sample')))throw new Error('Refusing sample/live data contamination');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const results=snapshots.map(s=>{
      const key=characterKey(s.identity),body=JSON.stringify(s),hash=digest(body);
      if(this.db.prepare('SELECT id FROM snapshots WHERE hash=?').get(hash))return {inserted:false,characterKey:key};
      this.db.prepare('INSERT OR IGNORE INTO characters VALUES (?,?)').run(key, JSON.stringify(s.identity));
      const result = this.db.prepare('INSERT INTO snapshots(hash,character_key,source,captured_at,synced_at,body) VALUES (?,?,?,?,?,?)')
        .run(hash,key,s.source,s.capturedAt,now.toISOString(),body);
      const put = this.db.prepare('INSERT INTO observations(snapshot_id,character_key,domain,observed_at,body) VALUES (?,?,?,?,?)');
      for (const o of s.observations) put.run(result.lastInsertRowid,key,o.domain,o.observedAt,JSON.stringify(o));
      return {inserted:true,characterKey:key};
      });
      this.db.exec('COMMIT');return results;
    } catch(e) { this.db.exec('ROLLBACK'); throw e; }
  }
  list(limit = 50, offset = 0) {
    return (this.db.prepare('SELECT key,identity FROM characters ORDER BY key LIMIT ? OFFSET ?').all(limit,offset) as {key:string;identity:string}[])
      .map(r => ({ characterKey:r.key, identity:JSON.parse(r.identity) as Identity, sample:this.mode==='sample' }));
  }
  has(key: string) { return !!this.db.prepare('SELECT 1 FROM characters WHERE key=?').get(key); }
  observationById(key:string,id:number):StoredObservation|null{
    const row=this.db.prepare(`SELECT o.id,o.body,s.source,s.synced_at,s.captured_at FROM observations o JOIN snapshots s ON s.id=o.snapshot_id WHERE o.character_key=? AND o.id=?`).get(key,id) as
      {id:number;body:string;source:Snapshot['source'];synced_at:string;captured_at:string}|undefined;
    return row?{...JSON.parse(row.body),id:row.id,characterKey:key,identity:this.identity(key),source:row.source,sample:this.mode==='sample',syncedAt:row.synced_at,capturedAt:row.captured_at}:null;
  }
  questEvidence(key:string,limit=50,offset=0,questId?:number){
    this.identity(key);
    const cte=`WITH evidence AS (
      SELECT o.id AS observation_id,e.value AS event,
        ROW_NUMBER() OVER (PARTITION BY json_extract(e.value,'$.id'),json_extract(e.value,'$.kind'),json_extract(e.value,'$.at'),json_extract(e.value,'$.evidence'),s.source
          ORDER BY julianday(o.observed_at) DESC,o.id DESC) AS rn
      FROM observations o JOIN snapshots s ON s.id=o.snapshot_id JOIN json_each(o.body,'$.payload.entries') e
      WHERE o.character_key=? AND o.domain='quest_history' AND (? IS NULL OR json_extract(e.value,'$.id')=?))`;
    const params=[key,questId??null,questId??null];
    const total=Number(this.db.prepare(cte+' SELECT COUNT(*) AS n FROM evidence WHERE rn=1').get(...params)?.n??0);
    const rows=this.db.prepare(cte+` SELECT observation_id,event FROM evidence WHERE rn=1 ORDER BY julianday(json_extract(event,'$.at')) DESC,json_extract(event,'$.id'),json_extract(event,'$.kind'),event LIMIT ? OFFSET ?`).all(...params,limit,offset) as {observation_id:number;event:string}[];
    return {entries:rows.map(r=>({event:JSON.parse(r.event),observation:this.observationById(key,r.observation_id)!})),total,nextOffset:offset+limit<total?offset+limit:null};
  }
  identity(key: string): Identity {
    const row = this.db.prepare('SELECT identity FROM characters WHERE key=?').get(key) as {identity:string}|undefined;
    if (!row) throw new Error('Unknown characterKey; call list_characters');
    return JSON.parse(row.identity);
  }
  observations(key: string, domain: Domain, limit = 100): StoredObservation[] {
    const rows = this.db.prepare(`SELECT o.id,o.body,s.source,s.synced_at,s.captured_at FROM observations o JOIN snapshots s ON s.id=o.snapshot_id
      WHERE o.character_key=? AND o.domain=? ORDER BY julianday(o.observed_at) DESC,julianday(s.captured_at) DESC,o.id DESC LIMIT ?`).all(key,domain,limit) as
      {id:number;body:string;source:Snapshot['source'];synced_at:string;captured_at:string}[];
    const identity = this.identity(key);
    return rows.map(r=>({...JSON.parse(r.body),id:r.id,characterKey:key,identity,source:r.source,sample:this.mode==='sample',syncedAt:r.synced_at,capturedAt:r.captured_at}));
  }
  current(key: string, domain: Domain) {
    // One latest observation per source (bounded number of sources), so an old conflicting
    // source cannot be pushed out by hundreds of repeated addon captures.
    const rows = this.db.prepare(`SELECT o.id,o.body,s.source,s.synced_at,s.captured_at FROM observations o JOIN snapshots s ON s.id=o.snapshot_id
      WHERE o.character_key=? AND o.domain=? AND o.id IN (
        SELECT id FROM (SELECT o2.id,DENSE_RANK() OVER (PARTITION BY s2.source,json_extract(o2.body,'$.coverage'),json_extract(o2.body,'$.basis') ORDER BY julianday(o2.observed_at) DESC,julianday(s2.captured_at) DESC) AS rn
          FROM observations o2 JOIN snapshots s2 ON s2.id=o2.snapshot_id WHERE o2.character_key=? AND o2.domain=?) WHERE rn=1)`).all(key,domain,key,domain) as
        {id:number;body:string;source:Snapshot['source'];synced_at:string;captured_at:string}[];
    const identity=this.identity(key);
    const candidates: StoredObservation[] = rows.map(r=>({...JSON.parse(r.body),id:r.id,characterKey:key,identity,source:r.source,sample:this.mode==='sample',syncedAt:r.synced_at,capturedAt:r.captured_at}));
    // Keep both transport receipts in history, but expose identical evidence only once.
    const seen=new Set<string>();
    const values=candidates.filter(o=>{const evidence=JSON.stringify([o.source,o.capturedAt,o.observedAt,o.coverage,o.basis,o.notes,o.payload]);if(seen.has(evidence))return false;seen.add(evidence);return true;});
    const authority = {addon:4,wowadvisor:3,blizzard:2,sample:1};
    const collection=['bags','bank','reagent_bank','account_bank','equipment'].includes(domain);
    const coverageRank=(o:StoredObservation)=>collection&&o.coverage==='observed'?1:0;
    const basisRank=(o:StoredObservation)=>o.basis==='direct'?2:o.basis==='derived'?1:0;
    values.sort((a,b)=> Number(b.payload!=null)-Number(a.payload!=null) || Number(!!b.observedAt)-Number(!!a.observedAt) ||
      basisRank(b)-basisRank(a) || coverageRank(b)-coverageRank(a) || (b.observedAt?Date.parse(b.observedAt):0)-(a.observedAt?Date.parse(a.observedAt):0) || authority[b.source]-authority[a.source] || JSON.stringify(a.payload).localeCompare(JSON.stringify(b.payload)));
    const selected=values[0]??null;
    return { selected, alternatives:values.slice(1), selectionPolicy:'Dated direct evidence; for inventory prefer complete enumeration over partial scans, retaining the original age. Then newest observation, source authority on ties. Read alternatives by observationId; domains never silently unioned.',
      conflicting:!!selected && values.slice(1).some(o=>o.payload!=null && (o.source!==selected.source || o.observedAt===selected.observedAt) && JSON.stringify(o.payload)!==JSON.stringify(selected.payload)) };
  }
  status(sourceId: string, error: string | null) {
    const now=new Date().toISOString();
    this.db.prepare(`INSERT INTO sync_status VALUES (?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET attempt_at=excluded.attempt_at,
      success_at=COALESCE(excluded.success_at,sync_status.success_at),error=excluded.error`).run(sourceId,now,error?null:now,error);
  }
  syncStatus() { return this.db.prepare('SELECT * FROM sync_status ORDER BY source_id').all(); }
  export(key: string) {
    this.identity(key);
    return this.db.prepare('SELECT body FROM snapshots WHERE character_key=? ORDER BY id').all(key).map(r=>JSON.parse(r.body as string));
  }
  deleteCharacter(key: string) {
    this.db.exec('BEGIN IMMEDIATE');
    try { this.db.prepare('DELETE FROM snapshots WHERE character_key=?').run(key);this.db.prepare('DELETE FROM characters WHERE key=?').run(key);this.db.exec('COMMIT'); }
    catch(e){this.db.exec('ROLLBACK');throw e;}
    this.db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');
  }
}
export function freshness(o: StoredObservation | null, now=new Date(), staleSeconds=900) {
  const ageSeconds=o?.observedAt ? Math.max(0,Math.floor((now.getTime()-Date.parse(o.observedAt))/1000)):null;
  return { state:ageSeconds===null?'unknown':ageSeconds>staleSeconds?'stale':'fresh',ageSeconds,staleAfterSeconds:staleSeconds };
}
