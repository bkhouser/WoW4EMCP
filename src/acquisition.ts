import { readFile, stat } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { characterKey, identitySchema, itemSchema, observation, snapshotSchema, validateSnapshot, type Identity, type Snapshot, type Observation } from './model.js';
import { digest, Store } from './store.js';

export const MAX_FILE_BYTES = 16 * 1024 * 1024;
// Validate JSON grammar, duplicate keys and depth before native decoding. Never evaluate Lua.
export function strictJson(input: string): unknown {
  if (Buffer.byteLength(input)>MAX_FILE_BYTES) throw new Error('Input exceeds 16 MiB');
  let p=0;
  const ws=()=>{while (/\s/.test(input[p]??'') && p<input.length) p++;};
  const string=():string=>{
    const start=p++;
    while(p<input.length) { const c=input[p++]; if(c==='\\'){p++;continue;} if(c==='"') return JSON.parse(input.slice(start,p)); }
    throw new Error('Unterminated JSON string');
  };
  const value=(depth:number):void=>{
    if(depth>40) throw new Error('JSON nesting limit'); ws(); const c=input[p];
    if(c==='"'){string();return;}
    if(c==='{'||c==='['){
      p++;ws();const close=c==='{'?'}':']', keys=new Set<string>();
      if(input[p]===close){p++;return;}
      while(p<input.length){
        if(c==='{'){if(input[p]!=='"')throw new Error('Expected object key');const k=string();if(keys.has(k)||['__proto__','constructor','prototype'].includes(k))throw new Error('Duplicate or unsafe JSON key');keys.add(k);ws();if(input[p++]!==':')throw new Error('Expected colon');}
        value(depth+1);ws();if(input[p]===close){p++;return;}if(input[p++]!==',')throw new Error('Expected comma');ws();
      } throw new Error('Unterminated JSON collection');
    }
    const m=/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(input.slice(p));
    if(!m)throw new Error('Invalid JSON value');p+=m[0].length;
  };
  value(0);ws();if(p!==input.length)throw new Error('Unexpected JSON suffix');return JSON.parse(input);
}
const addonExport = 'WoWCharacterIntelligenceExport';
const addonSettings = 'WoWCharacterIntelligenceSettings';
type ExportVariable = typeof addonExport | 'WowAdvisorExport';

function readLuaShortString(input: string, p: number) {
  const quote = input[p++];
  if (quote !== '"' && quote !== "'") throw new Error('Expected Lua short string');
  const escapes: Record<string, string> = { a:'\x07', b:'\b', f:'\f', n:'\n', r:'\r', t:'\t', v:'\v', '\\':'\\', '"':'"', "'":"'" };
  const decimal = /[0-9]{1,3}/y;
  let start = p;
  let bytes: Buffer | undefined;
  let written = 0;
  while (p < input.length) {
    const c = input[p++];
    if (c === quote) {
      const literal = input.slice(start, p - 1);
      if (!bytes) return { value: literal, end: p };
      written += bytes.write(literal, written, 'utf8');
      const value = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, written));
      return { value, end: p };
    }
    if (c === '\n' || c === '\r') throw new Error('Unescaped Lua newline');
    if (c !== '\\') continue;

    // Lua decimal escapes encode bytes, including individual bytes of UTF-8 characters.
    bytes ??= Buffer.allocUnsafe(Buffer.byteLength(input.slice(start)));
    written += bytes.write(input.slice(start, p - 1), written, 'utf8');
    decimal.lastIndex = p;
    const digits = decimal.exec(input);
    if (digits) {
      const byte = Number(digits[0]);
      if (byte > 255) throw new Error('Invalid Lua byte escape');
      bytes[written++] = byte;
      p = start = decimal.lastIndex;
      continue;
    }

    const e = input[p++];
    if (e === '\r' && input[p] === '\n') p++;
    const escaped = e === '\n' || e === '\r' ? '\n' : escapes[e];
    if (escaped === undefined) throw new Error('Unsupported Lua escape');
    bytes[written++] = escaped.charCodeAt(0);
    start = p;
  }
  throw new Error('Truncated SavedVariables string');
}

function readSavedVariablesExport(input: string, variable: ExportVariable): string {
  if (Buffer.byteLength(input) > MAX_FILE_BYTES) throw new Error('SavedVariables exceeds 16 MiB');
  input = input.replace(/^\uFEFF/, '');
  if (variable === 'WowAdvisorExport') {
    const prefix = /^\s*WowAdvisorExport\s*=\s*/.exec(input);
    if (!prefix) throw new Error('Unexpected SavedVariables variable');
    const { value, end } = readLuaShortString(input, prefix[0].length);
    if (input.slice(end).trim() !== '') throw new Error('Unexpected SavedVariables content');
    return value;
  }

  const whitespace = /[ \t\r\n\f\v]*/y;
  const assignment = /([A-Za-z_][A-Za-z_0-9]*)[ \t\r\n\f\v]*=[ \t\r\n\f\v]*/y;
  const values = new Map<string, string>();
  let p = 0;
  while (true) {
    whitespace.lastIndex = p;
    whitespace.exec(input);
    p = whitespace.lastIndex;
    if (p === input.length) break;

    assignment.lastIndex = p;
    const name = assignment.exec(input)?.[1];
    if (name !== addonExport && name !== addonSettings) throw new Error('Unexpected SavedVariables content or variable');
    if (values.has(name)) throw new Error('Duplicate SavedVariables variable');
    const { value, end } = readLuaShortString(input, assignment.lastIndex);
    values.set(name, value);
    p = end;
  }

  const exported = values.get(addonExport);
  if (exported === undefined) throw new Error('Missing SavedVariables export');
  const settings = values.get(addonSettings);
  if (settings !== undefined && !/^reload=[01];optical=[01];reminder=[0-9]+(?:;saved=[0-9]+)?(?:;angle=(?:[0-9]|[1-9][0-9]|[12][0-9]{2}|3[0-5][0-9]))?$/.test(settings)) {
    throw new Error('Invalid SavedVariables settings');
  }
  return exported;
}

export function parseSavedVariables(input: string, variable: ExportVariable): unknown {
  return strictJson(readSavedVariablesExport(input, variable));
}
export async function readStable(path: string, settleMs=750): Promise<string> {
  const before=await stat(path);if(!before.isFile()||before.size>MAX_FILE_BYTES)throw new Error('Invalid snapshot file size/type');
  const a=await readFile(path);await delay(settleMs);const middle=await stat(path);const b=await readFile(path);const after=await stat(path);
  if(before.size!==middle.size||middle.size!==after.size||before.mtimeMs!==middle.mtimeMs||middle.mtimeMs!==after.mtimeMs||digest(a)!==digest(b))throw new Error('Snapshot changed during read; retry after save');
  return new TextDecoder('utf-8',{fatal:true}).decode(b);
}
export const sourceConfigSchema=z.object({
  id:z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/),path:z.string().min(1),format:z.enum(['addon','wowadvisor','json']),
  identity:identitySchema, expectedName:z.string().min(1),expectedRealm:z.string().min(1).optional(),
  expectedPlayerName:z.string().min(1).optional(),
});
export type SourceConfig=z.infer<typeof sourceConfigSchema>;
const legacySchema=z.object({schema:z.literal(1),capturedAt:z.number().int().positive(),build:z.string(),
  player:z.object({name:z.string(),realm:z.string(),level:z.number().int(),race:z.string(),class:z.string()}),
  capabilities:z.record(z.string(),z.boolean()),location:z.object({zone:z.string().optional()}).optional(),
  quests:z.array(z.object({id:z.number().int().positive(),name:z.string(),complete:z.boolean().nullable().optional(),objectives:z.array(z.string())})).max(1000).optional(),
  equipment:z.array(z.object({id:z.number().int().positive(),name:z.string(),slot:z.number().int().optional(),itemLevel:z.number().int().optional(),stats:z.record(z.string(),z.number()).optional()})).max(50).optional(),
  bags:z.array(z.object({id:z.number().int().positive(),name:z.string(),itemLevel:z.number().int().optional(),stats:z.record(z.string(),z.number()).optional()})).max(5000).optional(),
  talents:z.array(z.object({id:z.number().int().positive(),name:z.string(),rank:z.number().int()})).max(1000).optional(),
  spells:z.array(z.object({id:z.number().int().positive(),name:z.string(),rankText:z.string().optional()})).max(5000).optional(),
  professions:z.array(z.object({id:z.number().int().positive(),name:z.string(),skill:z.number().optional(),maxSkill:z.number().optional(),scannedAt:z.number().optional(),needsRefresh:z.boolean().optional(),truncated:z.boolean().optional(),
    recipes:z.array(z.object({id:z.number().int().positive(),name:z.string(),learned:z.boolean().nullable().optional()})).max(5000)})).max(30).optional(),
});
export function normalizeWowAdvisor(value:unknown, config:SourceConfig):Snapshot {
  const x=legacySchema.parse(value);
  if(x.player.name!==config.expectedName || (config.expectedRealm && x.player.realm!==config.expectedRealm))throw new Error('Character does not match configured owner mapping');
  const at=new Date(x.capturedAt*1000).toISOString(), observations:Observation[]=[];
  observations.push(observation('identity',{level:x.player.level,race:x.player.race,class:x.player.class,build:x.build,location:x.location?.zone??null,
    specialization:null,xp:null,xpMax:null,restedXp:null,goldCopper:null},at,'partial',['Surname, region and ruleset are operator-configured mapping, not observed in this legacy export.']));
  if(x.quests)observations.push(observation('quests',{capacity:null,used:x.quests.length,enumerationComplete:false,entries:x.quests.map(q=>({
    id:q.id,name:q.name,level:null,zone:null,objectivesComplete:q.complete??null,turnedIn:'unknown' as const,classification:null,canAbandon:null,
    rewards:[],rewardsCoverage:'not_observed' as const,objectivesCoverage:'partial' as const,objectives:q.objectives.map(t=>{
      const m=/^\s*(\d+)\s*\/\s*(\d+)\s+/.exec(t);return {text:t,type:null,current:m?Number(m[1]):null,required:m?Number(m[2]):null,
        complete:null,countEvidence:m?'parsed_text' as const:'unknown' as const};
    })}))},at,'partial',['Legacy enumeration not certified complete; capacity absent. Counts parsed from preserved objective text; objective completion not inferred from counts.']));
  if(x.equipment)observations.push(observation('equipment',{items:x.equipment.map(i=>itemSchema.parse({itemId:i.id,name:i.name,slot:i.slot,itemLevel:i.itemLevel,stats:i.stats,quantity:1}))},at,'partial',['Legacy exporter omits empty-slot evidence, links, enchantments and binding.']));
  if(x.bags)observations.push(observation('bags',{items:x.bags.map(i=>itemSchema.parse({itemId:i.id,name:i.name,itemLevel:i.itemLevel,stats:i.stats}))},at,'partial',['Equippable items only; quantities and bag/slot locations unknown. Absence does not establish zero.']));
  if(x.talents)observations.push(observation('talents',{entries:x.talents.map(t=>({...t,maxRank:null,tree:null})),unspent:null,specialization:null},at,'partial',['Allocated talents only; unspent points and spec were not exported.']));
  if(x.spells)observations.push(observation('spells',{entries:x.spells.map(s=>({id:s.id,name:s.name,rank:s.rankText??null}))},at,x.capabilities.spellbook?'observed':'partial'));
  if(x.professions)observations.push(observation('professions',{entries:x.professions.map(p=>({id:p.id,name:p.name,skill:p.skill??null,cap:p.maxSkill??null,
    observedAt:p.scannedAt?new Date(p.scannedAt*1000).toISOString():null,needsRefresh:p.needsRefresh??true,recipesTruncated:p.truncated??true,
    recipes:p.recipes.map(r=>({id:r.id,name:r.name,learned:r.learned??null,craftable:null}))}))},
    x.professions.length && x.professions.every(p=>p.scannedAt)?new Date(Math.min(...x.professions.map(p=>p.scannedAt!))*1000).toISOString():null,
    'partial',['Recipe scans retain their own timestamps and truncation; do not infer learnability.']));
  return validateSnapshot({schemaVersion:1,identity:config.identity,source:'wowadvisor',sample:false,capturedAt:at,observations});
}
function assertConfiguredCharacter(snapshot: Snapshot, config: SourceConfig) {
  if (characterKey(snapshot.identity) !== characterKey(config.identity) || snapshot.identity.name !== config.expectedName) {
    throw new Error('Character identity mismatch');
  }
  if (snapshot.source === 'addon' && (!config.expectedPlayerName || !config.expectedRealm ||
    snapshot.subject?.playerName !== config.expectedPlayerName || snapshot.subject?.realm !== config.expectedRealm)) {
    throw new Error('Observed addon subject does not match explicit player/realm configuration');
  }
}

const addonBundleSchema = z.object({ schemaVersion: z.literal(1), snapshots: z.array(snapshotSchema).max(100) }).strict();

export function ingestAddonBundle(store: Store, config: SourceConfig, input: string, transport: 'savedvariables' | 'optical') {
  const bundle = addonBundleSchema.parse(strictJson(input));
  const key = characterKey(config.identity);
  // Older SavedVariables files can contain snapshots for other characters.
  const snapshots = transport === 'savedvariables'
    ? bundle.snapshots.filter(s => characterKey(s.identity) === key)
    : bundle.snapshots;
  if (!snapshots.length) throw new Error('No authorized character snapshot in addon file');

  return store.ingestBatch(snapshots.map(snapshot => {
    if (snapshot.source !== 'addon' || snapshot.sample !== false) {
      throw new Error('Addon ingest requires live addon snapshots');
    }
    assertConfiguredCharacter(snapshot, config);
    return { ...snapshot, observations: snapshot.observations.map(o => ({ ...o, transport })) };
  }));
}

export async function ingestSource(store: Store, config: SourceConfig, settleMs = 750) {
  try {
    const input = await readStable(config.path, settleMs);
    let results;
    if (config.format === 'addon') {
      results = ingestAddonBundle(store, config, readSavedVariablesExport(input, addonExport), 'savedvariables');
    } else if (config.format === 'wowadvisor') {
      results = store.ingestBatch([normalizeWowAdvisor(parseSavedVariables(input, 'WowAdvisorExport'), config)]);
    } else {
      const snapshot = validateSnapshot(strictJson(input));
      assertConfiguredCharacter(snapshot, config);
      results = store.ingestBatch([snapshot]);
    }
    store.status(config.id, null);
    return results;
  } catch (e) {
    store.status(config.id, e instanceof Error ? e.message.slice(0, 400) : 'Sync failed');
    throw e;
  }
}
