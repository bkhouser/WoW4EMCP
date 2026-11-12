import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { characterKey, identitySchema, itemSchema, observation, type Identity, type Observation, type Snapshot } from './model.js';
import { digest, Store } from './store.js';
import { strictJson } from './acquisition.js';

export const endpointSuffixes=['','/equipment','/quests','/quests/completed','/reputations','/achievements','/professions','/encounters','/collections','/statistics','/specializations'] as const;
type Suffix=typeof endpointSuffixes[number];
export function profilePath(i:Identity){
  identitySchema.parse(i);
  return '/profile/wow/character/'+(i.gameVersion==='forever'?'':encodeURIComponent(i.scope.toLowerCase())+'/')+encodeURIComponent(i.slug.toLowerCase());
}
export function namespace(i:Identity,kind:'profile'|'static'|'dynamic'='profile'){
  const product={forever:'-forever',retail:'','classic-era':'-classic1x','mists-classic':'-classic'}[i.gameVersion];return `${kind}${product}-${i.region}`;
}
export interface ApiResult {status:number; receivedAt:string; cached:boolean; body:unknown|null; endpoint:string;}
export class BlizzardClient {
  private token='';private expires=0;private nextRequest=0;private queue:Promise<unknown>=Promise.resolve();
  constructor(readonly clientId:string,readonly secret:()=>Promise<string>,readonly authorized:Identity[],readonly cacheDirectory:string,
    readonly fetcher:typeof fetch=fetch,readonly pause:(ms:number)=>Promise<unknown>=delay,readonly intervalMs=500){}
  private async limited(url:string,init:RequestInit):Promise<Response>{
    const work=async()=>{
      await this.pause(Math.max(0,this.nextRequest-Date.now()));this.nextRequest=Date.now()+this.intervalMs;
      return this.fetcher(url,{...init,redirect:'error',signal:AbortSignal.timeout(15_000)});
    };
    const result=this.queue.then(work,work);this.queue=result.catch(()=>{});return result;
  }
  private async accessToken(){
    if(this.token && Date.now()<this.expires)return this.token;
    const secret=await this.secret();const auth=Buffer.from(this.clientId+':'+secret).toString('base64');
    const response=await this.limited('https://oauth.battle.net/token',{method:'POST',headers:{Authorization:'Basic '+auth,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});
    if(!response.ok)throw new Error(`Blizzard client-credentials authorization failed (HTTP ${response.status})`);
    const data=z.object({access_token:z.string().min(1),expires_in:z.number().positive()}).parse(await response.json());
    this.token=data.access_token;this.expires=Date.now()+Math.max(0,data.expires_in-60)*1000;return this.token;
  }
  async get(identity:Identity,suffix:Suffix,force=false):Promise<ApiResult>{
    if(!this.authorized.some(x=>characterKey(x)===characterKey(identity)))throw new Error('Character not explicitly authorized for Blizzard API');
    if(!endpointSuffixes.includes(suffix))throw new Error('Unsupported endpoint');
    const url=new URL(`https://${identity.region}.api.blizzard.com${profilePath(identity)}${suffix}`);
    url.searchParams.set('namespace',namespace(identity));url.searchParams.set('locale',{us:'en_US',eu:'en_GB',kr:'ko_KR',tw:'zh_TW'}[identity.region]);
    const cachePath=join(this.cacheDirectory,digest(url.href)+'.json');
    if(!force)try{const c=z.object({status:z.number(),receivedAt:z.string().datetime(),cached:z.boolean(),body:z.unknown(),endpoint:z.string()}).parse(strictJson(await readFile(cachePath,'utf8')));
      if(Date.now()-Date.parse(c.receivedAt)<300_000 && Date.parse(c.receivedAt)<=Date.now())return {...c,cached:true,body:c.body??null};}catch{}
    for(let attempt=0;attempt<3;attempt++){
      const token=await this.accessToken();let response:Response;
      try{response=await this.limited(url.href,{headers:{Authorization:'Bearer '+token,Accept:'application/json'}});}catch{if(attempt<2){await this.pause(500*2**attempt);continue;}throw new Error('Blizzard network request failed (timeout, DNS or redirect)');}
      if(response.status===401&&attempt<2){this.token='';this.expires=0;continue;}
      if((response.status===429||response.status>=500)&&attempt<2){const r=response.headers.get('retry-after');const seconds=r?(Number(r)||Math.max(0,(Date.parse(r)-Date.now())/1000)):0;
        await this.pause(Math.min(30_000,Math.max(500*2**attempt,seconds*1000)));continue;}
      const body=response.ok?await boundedJson(response):null;
      const result:ApiResult={status:response.status,receivedAt:new Date().toISOString(),cached:false,body,endpoint:profilePath(identity)+suffix};
      if(response.ok||[404,403].includes(response.status)){
        await mkdir(this.cacheDirectory,{recursive:true});const temp=cachePath+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(result),{mode:0o600});await rename(temp,cachePath);
      }
      return result;
    }
    throw new Error('Blizzard retry budget exhausted');
  }
}
async function boundedJson(response:Response){
  if(Number(response.headers.get('content-length')??0)>8*1024*1024)throw new Error('API response too large');
  const reader=response.body?.getReader();if(!reader)throw new Error('Missing API response body');const chunks:Buffer[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8*1024*1024)throw new Error('API response too large');chunks.push(Buffer.from(value));}}
  finally{await reader.cancel();}
  return strictJson(Buffer.concat(chunks).toString('utf8'));
}
const profileSchema=z.object({name:z.string(),surname:z.string().optional(),level:z.number().int().optional(),race:z.object({name:z.string()}).optional(),character_class:z.object({name:z.string()}).optional(),active_spec:z.object({name:z.string()}).optional()});
export function normalizeApi(identity:Identity,results:Map<Suffix,ApiResult>):Snapshot{
  const observations:Observation[]=[];const profile=results.get('');
  if(profile?.status===200){
    const p=profileSchema.parse(profile.body);
    const apiSlug=(identity.gameVersion==='forever'?`${p.name}-${p.surname??''}`:p.name).toLowerCase();
    if(apiSlug!==identity.slug.toLowerCase())throw new Error('API profile identity mismatch; do not merge');
    observations.push(observation('identity',{level:p.level??null,race:p.race?.name??null,class:p.character_class?.name??null,specialization:p.active_spec?.name??null,
      xp:null,xpMax:null,restedXp:null,goldCopper:null,location:null,build:null},null,'partial',['API fetch time is known; game observation time is unknown. last_login is not used as a field observation time.']));
  }
  const eq=results.get('/equipment');
  if(eq?.status===200){
    const body=z.object({equipped_items:z.array(z.object({item:z.object({id:z.number().int().positive()}),name:z.string().optional(),slot:z.object({type:z.string()}).optional(),level:z.object({value:z.number()}).optional()})).max(50)}).safeParse(eq.body);
    if(body.success)observations.push(observation('equipment',{items:body.data.equipped_items.map(i=>itemSchema.parse({itemId:i.item.id,name:i.name??null,itemLevel:i.level?.value??null,quantity:1}))},null,'partial',['API slot enum/stat/bonus normalization deferred; response retained in private cache.']));
  }
  const completed=results.get('/quests/completed');
  if(completed?.status===200){
    const body=z.object({quests:z.array(z.object({id:z.number().int().positive()})).max(100000)}).safeParse(completed.body);
    if(body.success)observations.push(observation('quest_history',{entries:body.data.quests.map(q=>({id:q.id,kind:'completion_flag' as const,at:null,evidence:'Blizzard quests/completed; occurrence and turn-in time unknown'}))},null,'partial'));
  }
  return {schemaVersion:1,identity,source:'blizzard',sample:false,capturedAt:new Date().toISOString(),observations};
}
export async function syncBlizzard(store:Store,client:BlizzardClient,force=false){
  const report=[];
  for(const identity of client.authorized){
    const results=new Map<Suffix,ApiResult>();
    for(const suffix of endpointSuffixes){
      const sourceId='blizzard:'+characterKey(identity)+suffix;
      try{const result=await client.get(identity,suffix,force);results.set(suffix,result);store.status(sourceId,result.status===200?null:`HTTP ${result.status}; unsupported, private, missing or unauthorized is not a confirmed empty result`);
        report.push({characterKey:characterKey(identity),endpoint:suffix||'profile',status:result.status,cached:result.cached});}
      catch{store.status(sourceId,'API request failed; run local diagnostics');report.push({characterKey:characterKey(identity),endpoint:suffix||'profile',status:'error',cached:false});}
    }
    const snapshot=normalizeApi(identity,results);if(snapshot.observations.length)store.ingest(snapshot);
  }
  return report;
}
