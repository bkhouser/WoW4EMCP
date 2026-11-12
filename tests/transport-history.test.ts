import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.js';
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
