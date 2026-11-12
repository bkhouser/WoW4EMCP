import test from 'node:test';
import assert from 'node:assert/strict';
import {watchLoop} from '../src/watch.js';
test('config opt-out and shutdown revoke capture while a disk batch is still blocked',async()=>{
  let config={screen:true},observed=true,stops=0,allowed:((c:typeof config)=>boolean)|undefined;
  let release!:()=>void;const pending=new Promise<void>(r=>release=r),controller=new AbortController();
  const running=watchLoop({read:()=>config,reconcile:c=>{observed=c.screen;},stop:()=>{observed=false;stops++;},
    sync:async(_,check)=>{allowed=check;await pending;},pollSeconds:()=>15,error:()=>{},signal:controller.signal,intervalMs:5});
  config={screen:false};await new Promise(r=>setTimeout(r,30));assert.equal(observed,false);assert.equal(allowed!({screen:true}),false);
  controller.abort();assert.ok(stops>0);release();await running;
});
test('invalid config stops capture without closing storage under an in-flight batch',async()=>{
  let invalid=false,stopped=false,errors=0,release!:()=>void;const pending=new Promise<void>(r=>release=r),controller=new AbortController();
  const running=watchLoop({read:()=>{if(invalid)throw Error('invalid');return 1;},reconcile:()=>{},stop:()=>{stopped=true;},
    sync:async()=>{await pending;},pollSeconds:()=>15,error:()=>{errors++;},signal:controller.signal,intervalMs:5});
  invalid=true;await new Promise(r=>setTimeout(r,30));assert.ok(stopped&&errors>0);controller.abort();release();await running;
});

test('enabling acquisition reschedules immediately even when old batch completes after config change',async()=>{
 let config={enabled:false,poll:3600},release!:()=>void;const pending=new Promise<void>(r=>release=r),controller=new AbortController();
 const seen:boolean[]=[];let notify!:()=>void;const second=new Promise<void>(r=>notify=r);
 const running=watchLoop({read:()=>config,reconcile:()=>{},stop:()=>{},sync:async c=>{seen.push(c.enabled);if(seen.length===1)await pending;else notify();},
 pollSeconds:c=>c.poll,error:()=>{},signal:controller.signal,intervalMs:5});
 try{config={enabled:true,poll:5};await new Promise(r=>setTimeout(r,30));release();
 await Promise.race([second,new Promise((_,reject)=>setTimeout(()=>reject(Error('New acquisition was delayed')),500))]);assert.deepEqual(seen,[false,true]);}
 finally{controller.abort();release();await running;}
});
