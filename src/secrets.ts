import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const exec=promisify(execFile);
export async function readSecret(directory:string,name:string):Promise<string>{
  if(process.platform!=='win32')throw new Error('Windows DPAPI required; use a managed secrets adapter on another OS');
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(name))throw new Error('Invalid secret name');
  const script=fileURLToPath(new URL('../../scripts/Read-Secret.ps1',import.meta.url));
  try {
    const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-File',script,'-Directory',directory,'-Name',name],{windowsHide:true,maxBuffer:16384});
    const secret=stdout.trim();if(!secret)throw new Error('empty');return secret;
  }catch{throw new Error(`Secret ${name} unavailable for this Windows user. Use scripts/Set-Secret.ps1.`);}
}
