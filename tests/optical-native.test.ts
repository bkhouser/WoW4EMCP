import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import test from 'node:test';
import {adler32,decodePacket,OPTICAL_CHUNK} from '../src/optical.js';

function packet(payload:Buffer,index=0,count=1){
 const header=Buffer.alloc(18);
 header.write('WCI1');header.writeUInt32BE(42,4);header.writeUInt16BE(index,8);
 header.writeUInt16BE(count,10);header.writeUInt16BE(payload.length,12);header.writeUInt32BE(adler32(payload),14);
 return Buffer.concat([header,payload]);
}

function paint(bytes:Buffer){
 const bitmap=Buffer.alloc(160*50*4);
 function cell(column:number,row:number,r:number,g:number,b:number){
  // Set each pixel of the cell so the same fixture works with the production center sampler.
  for(let y=row*2;y<row*2+2;y++)for(let x=column*2;x<column*2+2;x++){
   const offset=(y*160+x)*4;
   bitmap[offset]=b;bitmap[offset+1]=g;bitmap[offset+2]=r;
  }
 }
 cell(0,0,255,0,255);cell(1,0,0,255,255);cell(2,0,255,255,0);cell(3,0,0,255,0);
 for(let i=0;i<1920;i++){
  const bit=i*6,byte=bit>>3;
  const color=(((bytes[byte]??0)<<8)|(bytes[byte+1]??0))>>(10-(bit%8))&63;
  cell(i%80,1+Math.floor(i/80),24+64*(color>>4),24+64*((color>>2)&3),24+64*(color&3));
 }
 return bitmap;
}

test('native packet decoder rejects invalid captures and emits only the declared packet bytes',{skip:process.platform!=='win32'},async()=>{
 const short=packet(Buffer.from('Élan'));
 const full=packet(Buffer.alloc(OPTICAL_CHUNK,0xa5),0,2);
 const overlay=paint(short);
 overlay.fill(0xff,16*4,160*4); // Unused marker row cells.
 overlay.fill(0xff,4*160*4); // Unused payload padding.
 const badColor=paint(short);badColor[2*160*4+2]=255;
 const badMarker=paint(short);badMarker[2]=0;
 const invalid=[packet(Buffer.alloc(0)),packet(Buffer.alloc(1423)),packet(Buffer.from('short'),0,2),
  packet(Buffer.from('index'),1),packet(Buffer.from('count'),0,257)];
 const badMagic=Buffer.from(short);badMagic[0]^=0x80;
 const cases=[paint(short),paint(full),overlay,badColor,badMarker,paint(badMagic),...invalid.map(paint)];
 const script=[
  '$ErrorActionPreference="Stop"',
  '$script=Get-Content -LiteralPath scripts/Read-Optical.ps1 -Raw',
  "$match=[regex]::Match($script,\"(?s)using System;.*?(?=\\r?\\n'@)\")",
  'if (!$match.Success) { throw "Native decoder source missing" }',
  'Add-Type -AssemblyName System.Drawing',
  'Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition $match.Value',
  '$cases=ConvertFrom-Json -InputObject ([Console]::In.ReadToEnd())',
  'foreach ($value in $cases) {',
  '  $bytes=[WCIOpticalCapture]::DecodePacket([Convert]::FromBase64String($value),640,160,50,0,0,2.0)',
  '  if ($null -eq $bytes) { [Console]::WriteLine("rejected") }',
  '  else { [Console]::WriteLine([Convert]::ToBase64String($bytes)) }',
  '}',
 ].join('\n');
 const stdout=await new Promise<string>((resolve,reject)=>{
  const process=execFile('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],
   {windowsHide:true,timeout:15_000},(error,out,stderr)=>error?reject(new Error(stderr,{cause:error})):resolve(out));
  process.stdin!.on('error',reject);
  process.stdin!.end(JSON.stringify(cases.map(bytes=>bytes.toString('base64'))));
 });
 const lines=stdout.trim().split(/\r?\n/);
 assert.deepEqual(lines,[short.toString('base64'),full.toString('base64'),short.toString('base64'),
  ...Array<string>(cases.length-3).fill('rejected')]);
 assert.deepEqual(decodePacket(Buffer.from(lines[1],'base64')),decodePacket(full));
});
