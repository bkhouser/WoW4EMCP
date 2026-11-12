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
export function parseSavedVariables(input: string, variable: 'WoWCharacterIntelligenceExport'|'WowAdvisorExport'): unknown {
  if(Buffer.byteLength(input)>MAX_FILE_BYTES)throw new Error('SavedVariables exceeds 16 MiB');
  const prefix=new RegExp('^\\s*'+variable+'\\s*=\\s*').exec(input.replace(/^\uFEFF/,''));
  input=input.replace(/^\uFEFF/,'');
  if(!prefix)throw new Error('Unexpected SavedVariables variable');
  let p=prefix[0].length;const quote=input[p++];if(quote!=='"'&&quote!=="'")throw new Error('Expected Lua short string');
  let out='',closed=false;
  const escapes:Record<string,string>={a:'\x07',b:'\b',f:'\f',n:'\n',r:'\r',t:'\t',v:'\v','\\':'\\','"':'"',"'":"'"};
  while(p<input.length){
    const c=input[p++];if(c===quote){closed=true;break;}
    if(c==='\n'||c==='\r')throw new Error('Unescaped Lua newline');
    if(c!=='\\'){out+=c;continue;}
    const e=input[p++];
    if(e in escapes){out+=escapes[e];continue;}
    if(e==='\n'){out+='\n';continue;}
    if(e==='\r'){if(input[p]==='\n')p++;out+='\n';continue;}
    if(e && /\d/.test(e)){const m=/^\d{1,3}/.exec(input.slice(p-1))!;const n=Number(m[0]);if(n>255)throw new Error('Invalid Lua byte escape');out+=String.fromCharCode(n);p+=m[0].length-1;continue;}
    throw new Error('Unsupported Lua escape');
  }
  if(!closed||input.slice(p).trim()!=='')throw new Error('Truncated or unexpected SavedVariables content');
  return strictJson(out);
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
export async function ingestSource(store:Store, config:SourceConfig, settleMs=750) {
  try {
    const input=await readStable(config.path,settleMs);
    let snapshots:Snapshot[];
    if(config.format==='wowadvisor') snapshots=[normalizeWowAdvisor(parseSavedVariables(input,'WowAdvisorExport'),config)];
    else {
      const raw=config.format==='addon'?parseSavedVariables(input,'WoWCharacterIntelligenceExport'):strictJson(input);
      if(config.format==='addon') {
        const bundle=z.object({schemaVersion:z.literal(1),snapshots:z.array(snapshotSchema).max(100)}).strict().parse(raw);
        snapshots=bundle.snapshots.filter(s=>characterKey(s.identity)===characterKey(config.identity));
        if(!snapshots.length)throw new Error('No authorized character snapshot in addon file');
      } else snapshots=[validateSnapshot(raw)];
      for(const s of snapshots){
        if(characterKey(s.identity)!==characterKey(config.identity) || s.identity.name!==config.expectedName)throw new Error('Character identity mismatch');
        if(s.source==='addon' && (!config.expectedPlayerName || !config.expectedRealm || s.subject?.playerName!==config.expectedPlayerName || s.subject?.realm!==config.expectedRealm))throw new Error('Observed addon subject does not match explicit player/realm configuration');
      }
    }
    const results=store.ingestBatch(snapshots);store.status(config.id,null);return results;
  } catch(e) {store.status(config.id,e instanceof Error?e.message.slice(0,400):'Sync failed');throw e;}
}
