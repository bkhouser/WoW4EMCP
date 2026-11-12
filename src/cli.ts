import { readFile,writeFile,mkdir,readdir,stat } from 'node:fs/promises';
import { resolve,dirname,join } from 'node:path';
import { loadConfig,type Config } from './config.js';
import { Store } from './store.js';
import { ingestSource,strictJson } from './acquisition.js';
import { serveHttp,serveStdio } from './mcp.js';
import { readSecret } from './secrets.js';
import { BlizzardClient,syncBlizzard } from './blizzard.js';
import { Queries } from './queries.js';
import { makeSample } from './sample.js';

async function discover(roots:string[]){
  const clients=[];
  for(const root of roots)for(const flavor of ['_forever_','_retail_','_classic_','_classic_era_']){
    const path=join(root,flavor);try{if(!(await stat(path)).isDirectory())continue;}catch{continue;}
    const sources:string[]=[];
    const walk=async(dir:string,depth:number):Promise<void>=>{
      if(depth>6)return;let entries;try{entries=await readdir(dir,{withFileTypes:true});}catch{return;}
      for(const entry of entries){if(entry.isSymbolicLink())continue;const p=join(dir,entry.name);if(entry.isDirectory())await walk(p,depth+1);
        else if(['WowAdvisor.lua','WoWCharacterIntelligence.lua'].includes(entry.name))sources.push(p);}
    };
    await walk(join(path,'WTF','Account'),0);clients.push({path,flavor,savedVariables:sources});
  }
  return clients;
}
async function sync(c:Config,store:Store){
  const results=[];
  for(const source of c.sources){try{results.push({id:source.id,ok:true,result:await ingestSource(store,source)});}catch(e){results.push({id:source.id,ok:false,error:e instanceof Error?e.message:'Sync failed'});}}
  return results;
}
async function main(){
  const command=process.argv[2]??'doctor';const arg=(name:string)=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined;};
  if(command==='discover'){
    const root=arg('--root');console.log(JSON.stringify(await discover(root?[resolve(root)]:[join(process.env['ProgramFiles(x86)']??'C:/Program Files (x86)','World of Warcraft'),join(process.env.ProgramFiles??'C:/Program Files','World of Warcraft')]),null,2));return;
  }
  if(command==='demo'){
    const path=resolve('data/sample.sqlite'),s=new Store(path,'sample');s.ingest(makeSample());console.log(JSON.stringify({sample:true,database:path,characters:s.list()},null,2));s.close();return;
  }
  const configPath=arg('--config')??process.env.WOW_MCP_CONFIG??'config.local.json';const c=loadConfig(configPath);
  const readOnly=['serve','stdio','doctor','export','show'].includes(command);
  const store=new Store(c.database,c.mode,readOnly);
  if(command==='sync'){const results=await sync(c,store);console.log(JSON.stringify(results,null,2));store.close();if(results.some(r=>!r.ok))process.exitCode=1;return;}
  if(command==='watch'){
    let stopping=false;
    const stop=()=>{stopping=true;};process.on('SIGINT',stop);process.on('SIGTERM',stop);
    while(!stopping){console.error(JSON.stringify({at:new Date().toISOString(),results:await sync(c,store)}));await new Promise(r=>setTimeout(r,c.pollSeconds*1000));}
    store.close();return;
  }
  if(command==='serve'||command==='stdio'){
    if(command==='stdio'){await serveStdio(store,c.staleSeconds);return;}
    const token=await readSecret(c.secretDirectory,c.http.tokenSecret);const http=await serveHttp(store,c.http.port,token,c.staleSeconds);
    console.error(`Authenticated MCP listening on http://127.0.0.1:${c.http.port}/mcp`);
    const close=()=>http.close(()=>{store.close();process.exit(0);});process.on('SIGINT',close);process.on('SIGTERM',close);return;
  }
  if(command==='blizzard-sync'){
    if(!c.blizzard)throw new Error('Configure blizzard.clientId, characters and a DPAPI client secret first');
    const b=c.blizzard;const client=new BlizzardClient(b.clientId,()=>readSecret(c.secretDirectory,b.clientSecretName),b.characters,join(dirname(c.database),'api-cache'));
    console.log(JSON.stringify(await syncBlizzard(store,client,process.argv.includes('--force')),null,2));store.close();return;
  }
  if(command==='doctor'){
    console.log(JSON.stringify({node:process.versions.node,database:c.database,mode:c.mode,characters:store.list(),sources:store.syncStatus(),
      capture:'SavedVariables require reload/logout. watch does not force a game save.',blizzardConfigured:!!c.blizzard,
      chatgptConnection:'Not checked by this command; confirm through an actual ChatGPT tool invocation.'},null,2));store.close();return;
  }
  const key=arg('--character');if(!key)throw new Error('Supply --character with a key from doctor/list_characters');
  if(command==='show'){console.log(JSON.stringify(new Queries(store,c.staleSeconds).overview(key),null,2));}
  else if(command==='export'){
    const output=arg('--output');if(!output)throw new Error('Supply --output');await writeFile(resolve(output),JSON.stringify({schemaVersion:1,snapshots:store.export(key)},null,2),{flag:'wx',mode:0o600});console.log('Exported local character history. Protect this file as personal data.');
  } else if(command==='delete'){
    if(arg('--confirm')!==key)throw new Error('Deletion requires --confirm with the same character key');store.deleteCharacter(key);console.log('Deleted character observations. Remove corresponding sources/cache/backups separately to prevent re-import.');
  } else throw new Error('Unknown command');
  store.close();
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Operation failed');process.exitCode=1;});
