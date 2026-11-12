import test from 'node:test';
import assert from 'node:assert/strict';
import {Store,digest} from '../src/store.js';
import {makeSample} from '../src/sample.js';
test('identical screen and file evidence keeps receipts without duplicating current alternatives',()=>{
  const store=new Store(':memory:','sample');
  try {
    const sample=makeSample();for(const o of sample.observations)o.transport='optical';
    const key=store.ingest(sample).characterKey;
    const file=structuredClone(sample);for(const o of file.observations)o.transport='savedvariables';store.ingest(file);
    assert.equal(store.export(key).length,2);assert.equal(store.observations(key,'quests').length,2);
    const current=store.current(key,'quests');assert.equal(current.alternatives.length,0);assert.equal(current.conflicting,false);
  }finally{store.close();}
});

test('legacy omitted defaults and newly canonical evidence do not create a false conflict',()=>{
 const store=new Store(':memory:','sample');
 try{
  const sample=makeSample();const key=store.ingest(sample).characterKey;
  const bag=store.db.prepare("SELECT id,body FROM observations WHERE domain='bags'").get() as {id:number;body:string};
  const legacy=JSON.parse(bag.body);delete legacy.payload.items[0].enchantmentId;legacy.payload.extra='synthetic unknown legacy field';
  store.db.prepare('UPDATE observations SET body=? WHERE id=?').run(JSON.stringify(legacy),bag.id);
  for(const o of sample.observations)o.transport='savedvariables';store.ingest(sample);
  const current=store.current(key,'bags');assert.equal(current.conflicting,false);assert.equal(current.alternatives.length,0);
  assert.ok(!JSON.stringify(store.observationById(key,bag.id)?.payload).includes('extra'));
  assert.ok(!JSON.stringify(store.observations(key,'bags')[1]?.payload).includes('extra'));
  assert.ok(String(store.db.prepare('SELECT body FROM observations WHERE id=?').get(bag.id)?.body).includes('extra'),'read canonicalization must not rewrite history');
 }finally{store.close();}
});

test('reimport of a pre-canonicalization body preserves original receipt without an upgrade-only history row',()=>{
 const store=new Store(':memory:','sample');
 try{
  const sample=makeSample();for(const o of sample.observations)o.transport='savedvariables';const key=store.ingest(sample).characterKey;
  const row=store.db.prepare('SELECT id,body,synced_at FROM snapshots').get() as {id:number;body:string;synced_at:string};
  const legacy=JSON.parse(row.body);delete legacy.observations.find((o:{domain:string})=>o.domain==='bags').payload.items[0].enchantmentId;
  const body=JSON.stringify(legacy);store.db.prepare('UPDATE snapshots SET body=?,hash=? WHERE id=?').run(body,digest(body),row.id);
  assert.equal(store.ingest(sample).inserted,false);assert.equal(store.export(key).length,1);
  const retained=store.db.prepare('SELECT body,synced_at FROM snapshots WHERE id=?').get(row.id);assert.equal(retained?.body,body);assert.equal(retained?.synced_at,row.synced_at);
  const optical=structuredClone(sample);for(const o of optical.observations)o.transport='optical';assert.equal(store.ingest(optical).inserted,true);
 }finally{store.close();}
});
