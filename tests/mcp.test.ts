import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {Store} from '../src/store.js';
import {createMcp,serveHttp} from '../src/mcp.js';
import {makeSample} from '../src/sample.js';
import {characterKey} from '../src/model.js';
import {request} from 'node:http';
test('real MCP SDK initialize, discovery and every tool round-trip',async()=>{
  const store=new Store(':memory:','sample'),fixture=makeSample();store.ingest(fixture);const key=characterKey(fixture.identity);
  const server=createMcp(store),client=new Client({name:'acceptance',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
  try{await server.connect(a);await client.connect(b);const tools=await client.listTools();assert.equal(tools.tools.length,13);assert.ok(tools.tools.every(t=>t.annotations?.readOnlyHint===true&&t.outputSchema));
    const args:Record<string,Record<string,unknown>>={list_characters:{},get_character_overview:{characterKey:key},get_character_data:{characterKey:key,domain:'talents'},get_quest_log:{characterKey:key,limit:5},get_completed_quests:{characterKey:key},get_quest_details:{characterKey:key,questId:1740},analyze_quest_log:{characterKey:key},get_quest_chain_status:{characterKey:key,questIds:[1740]},get_dungeon_quest_readiness:{characterKey:key,questIds:[1740]},search_items:{characterKey:key,query:'Murloc'},compare_equipment:{characterKey:key,leftItemId:1001,rightItemId:9999},get_character_changes:{characterKey:key,domain:'identity'},get_sync_status:{}};
    for(const t of tools.tools){const result=await client.callTool({name:t.name,arguments:args[t.name]});assert.ok(!result.isError,`${t.name}: ${JSON.stringify(result)}`);assert.ok(result.structuredContent);}
    const page=await client.callTool({name:'get_quest_log',arguments:{characterKey:key,limit:5}});assert.equal((page.structuredContent as any).data.entries.length,5);assert.equal((page.structuredContent as any).nextOffset,5);
    const bad=await client.callTool({name:'get_quest_log',arguments:{characterKey:key,limit:999}});assert.equal(bad.isError,true);
    const unknown=await client.callTool({name:'get_character_overview',arguments:{characterKey:'not-owned'}});assert.equal(unknown.isError,true);
    const injection=await client.callTool({name:'get_quest_details',arguments:{characterKey:"' OR 1=1 --",questId:1740}});assert.equal(injection.isError,true);
  }finally{await client.close();await server.close();store.close();}
});
test('MCP sync errors omit private paths while local diagnostics retain details',async()=>{
  const store=new Store(':memory:','sample');
  const rawError='ENOENT: cannot open C:/synthetic-private-account/SavedVariables/export.lua';
  store.status('safe-source-label',rawError);
  const server=createMcp(store),client=new Client({name:'privacy-acceptance',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
  try {
    await server.connect(a);await client.connect(b);
    const result=await client.callTool({name:'get_sync_status',arguments:{}});
    assert.ok(!result.isError);
    const sources=(result.structuredContent as any).sources;
    assert.equal(sources.length,1);assert.equal(sources[0].success_at,null);
    assert.match(sources[0].error,/local doctor/);
    assert.ok(!JSON.stringify(result).includes('synthetic-private-account'));
    assert.equal(store.syncStatus()[0].error,rawError);
    store.status('safe-source-label',null);
    const recovered=await client.callTool({name:'get_sync_status',arguments:{}});
    assert.equal((recovered.structuredContent as any).sources[0].error,null);
    assert.ok((recovered.structuredContent as any).sources[0].success_at);
  } finally {await client.close();await server.close();store.close();}
});

test('authenticated Streamable HTTP requires bearer/valid Host/no Origin on every request',async()=>{
  const store=new Store(':memory:','sample');store.ingest(makeSample());const token='local-test-only-'.repeat(4),server=await serveHttp(store,0,token);
  const address=server.address();assert.ok(address&&typeof address!=='string');const url=`http://127.0.0.1:${address.port}/mcp`;
  const client=new Client({name:'http-acceptance',version:'1'});
  try{
    assert.equal((await fetch(url,{method:'POST'})).status,401);
    assert.equal((await fetch(url,{method:'POST',headers:{Authorization:'Bearer wrong'}})).status,401);
    assert.equal((await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,Origin:'https://evil.invalid'}})).status,403);
    const evilHost=await new Promise<number|undefined>((resolve,reject)=>{const r=request(url,{method:'POST',headers:{Authorization:'Bearer '+token,Host:'evil.invalid'}},res=>{res.resume();resolve(res.statusCode);});r.once('error',reject);r.end();});
    assert.equal(evilHost,403);
    const transport=new StreamableHTTPClientTransport(new URL(url),{requestInit:{headers:{Authorization:'Bearer '+token}}});await client.connect(transport);
    const result=await client.callTool({name:'list_characters',arguments:{}});assert.ok(!result.isError);assert.equal((result.structuredContent as any).characters.length,1);
    assert.equal((await fetch(url,{method:'POST'})).status,401);
    const big=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',method:'tools/call',id:2,params:{x:'x'.repeat(70000)}})});assert.equal(big.status,413);
  }finally{await client.close();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));store.close();}
});
