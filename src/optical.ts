import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import type {Readable} from 'node:stream';
import type {Config} from './config.js';
import type {Store} from './store.js';
import {ingestAddonBundle} from './acquisition.js';

export const OPTICAL_CHUNK=1422,MAX_OPTICAL_BYTES=OPTICAL_CHUNK*256;
const HEADER_BYTES=18,MAX_PACKET_BYTES=HEADER_BYTES+OPTICAL_CHUNK;
const PACKET_PREFIX='PACKET ',MAX_HELPER_LINE=PACKET_PREFIX.length+4*Math.ceil(MAX_PACKET_BYTES/3);
const STATUS_ID='@optical';
export function adler32(data:Uint8Array){let a=1,b=0;for(const v of data){a=(a+v)%65521;b=(b+a)%65521;}return (b*65536+a)>>>0;}
export type OpticalPacket={generation:number;index:number;count:number;checksum:number;payload:Buffer};

function packetSize(header:Buffer):number {
  if(header.toString('latin1',0,4)!=='WCI1')throw new Error('Not a WCI optical packet');
  const index=header.readUInt16BE(8),count=header.readUInt16BE(10),payloadLength=header.readUInt16BE(12);
  if(payloadLength<1||payloadLength>OPTICAL_CHUNK)throw new Error('Invalid optical payload length');
  if(count<1||count>256||index>=count||(index<count-1&&payloadLength!==OPTICAL_CHUNK))throw new Error('Invalid optical page bounds');
  return HEADER_BYTES+payloadLength;
}

export function decodePacket(bytes:Buffer):OpticalPacket {
  if(bytes.length<HEADER_BYTES||bytes.length>MAX_PACKET_BYTES||bytes.length!==packetSize(bytes))throw new Error('Invalid optical packet size');
  return {generation:bytes.readUInt32BE(4),index:bytes.readUInt16BE(8),count:bytes.readUInt16BE(10),
    checksum:bytes.readUInt32BE(14),payload:bytes.subarray(HEADER_BYTES)};
}

export function decodeCells(cells:Buffer):OpticalPacket {
  if(cells.length!==80*25*3)throw new Error('Invalid optical cell count');
  const markers=[[255,0,255],[0,255,255],[255,255,0],[0,255,0]];
  for(let i=0;i<4;i++)for(let c=0;c<3;c++)if(Math.abs(cells[i*3+c]-markers[i][c])>25)throw new Error('Optical marker not visible');
  const bytes=Buffer.alloc(MAX_PACKET_BYTES);let length=0,bits=0,acc=0,needed=HEADER_BYTES;
  for(let i=80;i<80*25;i++){
    let value=0;
    for(let c=0;c<3;c++){const channel=cells[i*3+c],level=Math.round((channel-24)/64);if(level<0||level>3||Math.abs(channel-(24+level*64))>25)throw new Error('Optical colors unreadable');value=value*4+level;}
    acc=acc*64+value;bits+=6;
    if(bits>=8){bits-=8;bytes[length++]=Math.floor(acc/2**bits)&255;acc%=2**bits;
      if(length===HEADER_BYTES)needed=packetSize(bytes);
      if(length===needed)break;
    }
  }
  return decodePacket(bytes.subarray(0,length));
}

function generationKey(p:OpticalPacket){return p.generation+':'+p.count+':'+p.checksum;}

export class OpticalAssembler {
  private key='';private parts=new Map<number,Buffer>();private started=0;private completed:string[]=[];
  accept(p:OpticalPacket,now=Date.now()):string|null {
    const key=generationKey(p);
    if(this.completed.includes(key))return null;
    if(key!==this.key||now-this.started>180_000){this.key=key;this.parts.clear();this.started=now;}
    const old=this.parts.get(p.index);if(old&&!old.equals(p.payload)){this.parts.clear();throw new Error('Conflicting optical page');}
    this.parts.set(p.index,p.payload);if(this.parts.size!==p.count)return null;
    const result=Buffer.concat(Array.from({length:p.count},(_,i)=>this.parts.get(i)!));this.parts.clear();
    if(result.length>MAX_OPTICAL_BYTES||adler32(result)!==p.checksum)throw new Error('Optical checksum mismatch');
    return new TextDecoder('utf-8',{fatal:true}).decode(result);
  }
  markCommitted(p:OpticalPacket){
    this.completed.push(generationKey(p));
    if(this.completed.length>16)this.completed.shift();
  }
}

function readHelperLines(stream:Readable,onLine:(line:string)=>void){
  // Bound retained bytes even when the helper omits a newline. Allow a Windows CR before LF.
  const buffer=Buffer.alloc(MAX_HELPER_LINE+1);
  let length=0,discard=false;
  stream.on('data',(chunk:Buffer)=>{
    for(let start=0;start<chunk.length;){
      const newline=chunk.indexOf(10,start),end=newline<0?chunk.length:newline;
      if(!discard){
        if(length+end-start>buffer.length)discard=true;
        else{chunk.copy(buffer,length,start,end);length+=end-start;}
      }
      if(newline<0)break;
      if(!discard){
        const size=length>0&&buffer[length-1]===13?length-1:length;
        if(size<=MAX_HELPER_LINE)onLine(buffer.toString('latin1',0,size));
      }
      length=0;discard=false;start=newline+1;
    }
  });
}

type Helper={process:ChildProcessWithoutNullStreams;closed:Promise<void>};

export class OpticalReceiver {
  private child:Helper|null=null;
  private retiring:Promise<void>|null=null;
  private signature='';private lastStatus:string|null|undefined;private lastStatusAt=0;private retryAt=0;
  constructor(private store:Store){}
  private status(message:string|null){
    const now=Date.now();
    if(message!==null&&message===this.lastStatus&&now-this.lastStatusAt<=15_000)return;
    try{this.store.status(STATUS_ID,message);this.lastStatus=message;this.lastStatusAt=now;}
    catch{/* A status write must not interrupt capture cleanup or discard committed evidence. */}
  }
  reconcile(config:Config){
    const signature=JSON.stringify({mode:config.mode,optical:config.optical,sources:config.sources});
    if(signature===this.signature&&this.child)return;
    if(signature!==this.signature){this.stop();this.signature=signature;this.retryAt=0;}
    if(!config.optical.enabled||this.retiring)return;
    if(Date.now()<this.retryAt)return;
    this.retryAt=Date.now()+10_000;
    const source=config.sources.find(s=>s.id===config.optical.sourceId&&s.format==='addon');
    if(process.platform!=='win32'||config.mode!=='real'||!source||!source.expectedPlayerName||!source.expectedRealm||!config.optical.executablePath){this.status('Screen sync needs Windows, real mode, one authorized addon source and its executable path.');return;}
    const script=resolve(dirname(fileURLToPath(import.meta.url)),'../../scripts/Read-Optical.ps1');
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-ExecutablePath',config.optical.executablePath,'-ParentPid',String(process.pid)],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    const closed=new Promise<void>(resolve=>child.once('close',()=>resolve()));
    const helper={process:child,closed},assembler=new OpticalAssembler();
    const isCurrent=()=>this.child===helper;
    let childError=false;
    this.child=helper;
    const reportHelperError=()=>{
      if(isCurrent())this.status('Screen capture helper reported an error; inspect local settings.');
    };
    child.stdin.on('error',reportHelperError);
    child.stderr.on('error',reportHelperError);
    child.stdout.on('error',reportHelperError);
    child.stderr.on('data',reportHelperError);
    readHelperLines(child.stdout,line=>{
      if(!isCurrent())return;
      if(!line.startsWith(PACKET_PREFIX)){
        if(line.startsWith('WAIT '))this.status('Waiting for a visible WCI marker; screen evidence may be stale.');
        return;
      }
      try {
        const encoded=line.slice(PACKET_PREFIX.length),bytes=Buffer.from(encoded,'base64');
        if(bytes.toString('base64')!==encoded)throw new Error('Invalid optical packet encoding');
        const packet=decodePacket(bytes),text=assembler.accept(packet);
        if(text!==null){
          ingestAddonBundle(this.store,source,text,'optical');
          assembler.markCommitted(packet);
          this.status(null);
        }
      }catch{this.status('Optical packet unreadable, incomplete or rejected; retaining previous evidence.');}
    });
    child.on('error',()=>{
      childError=true;
      if(isCurrent())this.status('Unable to start or control the optical capture helper.');
    });
    child.once('close',()=>{
      if(!isCurrent())return;
      this.child=null;
      if(!childError)this.status('Optical capture stopped; retrying while enabled.');
    });
    this.status('Waiting for the enabled WCI marker in the foreground game window.');
  }
  stop():Promise<void>{
    const helper=this.child;
    if(!helper)return this.retiring??Promise.resolve();
    this.child=null;
    this.retiring=helper.closed;
    void helper.closed.then(()=>{this.retiring=null;});
    helper.process.stdin.end();
    helper.process.kill();
    return helper.closed;
  }
}
