import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess, {type ChildProcessWithoutNullStreams} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {syncBuiltinESMExports} from 'node:module';
import {PassThrough} from 'node:stream';
import {adler32,decodeCells,decodePacket,OpticalAssembler,OpticalReceiver,OPTICAL_CHUNK} from '../src/optical.js';
import {configSchema} from '../src/config.js';
import {makeSample} from '../src/sample.js';
import {ingestAddonBundle} from '../src/acquisition.js';
import {Store} from '../src/store.js';
import {Queries} from '../src/queries.js';
import {characterKey} from '../src/model.js';
function encodePackets(text:string,generation=1){
 const data=Buffer.from(text),sum=adler32(data),count=Math.ceil(data.length/OPTICAL_CHUNK);const packets:Buffer[]=[];
 for(let page=0;page<count;page++){
  const payload=data.subarray(page*OPTICAL_CHUNK,(page+1)*OPTICAL_CHUNK),bytes=Buffer.alloc(1440);
  bytes.write('WCI1');bytes.writeUInt32BE(generation,4);bytes.writeUInt16BE(page,8);bytes.writeUInt16BE(count,10);bytes.writeUInt16BE(payload.length,12);bytes.writeUInt32BE(sum,14);payload.copy(bytes,18);
  packets.push(bytes.subarray(0,18+payload.length));
 }return packets;
}
function encode(text:string,generation=1){
 return encodePackets(text,generation).map(packet=>{
  const bytes=Buffer.alloc(1440);packet.copy(bytes);
  const cells=Buffer.alloc(6000);[[255,0,255],[0,255,255],[255,255,0],[0,255,0]].forEach((m,i)=>m.forEach((v,c)=>cells[i*3+c]=v));
  for(let i=0;i<1920;i++){const bit=i*6,byte=Math.floor(bit/8),shift=bit%8;const value=((bytes[byte]<<8)|(bytes[byte+1]??0))>>(10-shift)&63;cells[(80+i)*3]=24+64*(value>>4);cells[(80+i)*3+1]=24+64*(value>>2&3);cells[(80+i)*3+2]=24+64*(value&3);}
  return cells;
 });
}
test('optical round-trip accepts reordered UTF-8 pages only when complete and ignores retransmission',()=>{
 const text='Synthetic — quest fragments 🧪 '.repeat(180),frames=encode(text),a=new OpticalAssembler();let result:string|null=null;
 for(const frame of [...frames].reverse())result=a.accept(decodeCells(frame));
 assert.equal(result,text);a.markCommitted(decodeCells(frames[0]));
 for(const frame of frames)assert.equal(a.accept(decodeCells(frame)),null);
});
test('binary packet decode rejects truncation, trailing bytes and invalid header bounds',()=>{
 const [packet]=encodePackets('packet');
 assert.deepEqual(decodePacket(packet),decodeCells(encode('packet')[0]));
 assert.throws(()=>decodePacket(packet.subarray(0,-1)),/size/);
 assert.throws(()=>decodePacket(Buffer.concat([packet,Buffer.from([0])])),/size/);
 for(const [offset,value] of [[8,1],[10,0],[10,257],[10,2],[12,0],[12,1423]]){
  const invalid=Buffer.from(packet);invalid.writeUInt16BE(value,offset);
  assert.throws(()=>decodePacket(invalid),/bounds|length/);
 }
});
test('optical corruption, conflicting pages and interrupted generations cannot produce partial data',()=>{
 const frames=encode('x'.repeat(4000)),a=new OpticalAssembler();
 assert.equal(a.accept(decodeCells(frames[0])),null);
 const conflict=decodeCells(frames[0]);conflict.payload=Buffer.from(conflict.payload);conflict.payload[0]^=1;assert.throws(()=>a.accept(conflict),/Conflicting/);
 const damaged=frames.map(decodeCells);damaged[1].payload=Buffer.from(damaged[1].payload);damaged[1].payload[5]^=1;
 const b=new OpticalAssembler();assert.equal(b.accept(damaged[0]),null);assert.equal(b.accept(damaged[1]),null);assert.throws(()=>b.accept(damaged[2]),/checksum/);
 const c=new OpticalAssembler();c.accept(decodeCells(frames[0]),0);c.accept(decodeCells(frames[1]),180001);assert.equal(c.accept(decodeCells(frames[2]),180002),null);
 const hidden=Buffer.from(frames[0]);hidden[0]=0;assert.throws(()=>decodeCells(hidden),/marker/);
 const badColor=Buffer.from(frames[0]);badColor[240]=255;assert.throws(()=>decodeCells(badColor),/colors/);
});
test('decoded optical snapshot uses the same authorized store, freshness and bank-unknown semantics',()=>{
 const fixture=makeSample('2023-11-14T22:13:20Z');fixture.source='addon';fixture.sample=false;fixture.subject={playerName:'Examplewarlock',realm:'Test Realm'};
 const source={id:'test-optical',format:'addon' as const,path:'unused',identity:fixture.identity,expectedName:fixture.identity.name,expectedPlayerName:'Examplewarlock',expectedRealm:'Test Realm'};
 const a=new OpticalAssembler(),store=new Store(':memory:');
 try {
  const frames=encode(JSON.stringify({schemaVersion:1,snapshots:[fixture]}));
  for(const f of frames){const text=a.accept(decodeCells(f));if(text!==null)ingestAddonBundle(store,source,text,'optical');}
  const q=new Queries(store),key=characterKey(fixture.identity);
  assert.equal(q.questDetails(key,1740).active?.objectives[0].current,0);
  assert.equal(q.data(key,'quests').observation?.transport,'optical');assert.equal(q.data(key,'quests').observation?.freshness.state,'stale');
  assert.equal(q.data(key,'bank').availability,'not_observed');assert.equal(q.data(key,'bank').data,null);
 } finally {store.close();}
});

test('receiver retries a failed import and ignores late events after revoking the helper',{skip:process.platform!=='win32'},async t=>{
 const children:FakeHelper[]=[];
 class FakeHelper extends EventEmitter {
  stdin=new PassThrough();stdout=new PassThrough();stderr=new PassThrough();
  killed=false;
  kill(){this.killed=true;return true;}
 }
 const spawn=t.mock.method(childProcess,'spawn',()=>{
  const helper=new FakeHelper();children.push(helper);
  return helper as unknown as ChildProcessWithoutNullStreams;
 });
 syncBuiltinESMExports();
 t.after(()=>{spawn.mock.restore();syncBuiltinESMExports();});

 const fixture=makeSample('2023-11-14T22:13:20Z');fixture.source='addon';fixture.sample=false;
 fixture.subject={playerName:'Examplewarlock',realm:'Test Realm'};
 const source={id:'optical',format:'addon',path:'unused.lua',identity:fixture.identity,expectedName:fixture.identity.name,
  expectedPlayerName:fixture.subject.playerName,expectedRealm:fixture.subject.realm};
 const config=configSchema.parse({database:':memory:',sources:[source],optical:{enabled:true,sourceId:source.id,executablePath:'game.exe'}});
 const packets=encodePackets(JSON.stringify({schemaVersion:1,snapshots:[fixture]}));
 const wire=packets.map(packet=>'PACKET '+packet.toString('base64')+'\r\n');
 const store=new Store(':memory:');
 t.after(()=>store.close());
 const ingest=store.ingestBatch.bind(store);
 let failFirst=true;
 const attempts=t.mock.method(store,'ingestBatch',(snapshots:unknown[])=>{
  if(failFirst){failFirst=false;throw new Error('Simulated transient SQLite write failure');}
  return ingest(snapshots);
 });
 const receiver=new OpticalReceiver(store);
 store.status(source.id,'SavedVariables error');
 receiver.reconcile(config);
 const [old]=children;
 // Oversized unterminated input cannot ingest the valid-looking suffix or poison the next line.
 old.stdout.write('x'.repeat(4000));
 old.stdout.write(wire.join(''));
 assert.equal(attempts.mock.callCount(),0);
 old.stdout.write(wire.join(''));
 assert.equal(attempts.mock.callCount(),1);
 assert.equal(store.list().length,0);
 for(const line of wire){old.stdout.write(line.slice(0,-1));old.stdout.write('\n');}
 assert.equal(attempts.mock.callCount(),2);
 assert.equal(store.list().length,1);
 old.stdout.write(wire.join(''));
 assert.equal(attempts.mock.callCount(),2);
 const statuses=store.syncStatus();
 assert.equal(statuses.find(row=>row.source_id==='@optical')?.error,null);
 assert.equal(statuses.find(row=>row.source_id===source.id)?.error,'SavedVariables error');

 const next={...config,optical:{...config.optical,executablePath:'other.exe'}};
 receiver.reconcile(next);
 const stopped=receiver.stop();
 let closed=false;
 void stopped.then(()=>{closed=true;});
 assert.equal(children.length,1);
 assert.equal(old.killed,true);
 assert.equal(old.stdin.writableEnded,true);
 old.stderr.write('late private diagnostic');
 old.stdout.write('WAIT late\n');
 old.emit('error',new Error('late child error'));
 await Promise.resolve();
 assert.equal(closed,false);
 assert.deepEqual(store.syncStatus(),statuses);
 old.emit('close');
 await stopped;
 receiver.reconcile(next);
 assert.equal(children.length,2);
 const stopNext=receiver.stop();
 children[1].emit('close');
 await stopNext;
});
