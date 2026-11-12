import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm,readFile,writeFile,access} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {readSecret} from '../src/secrets.js';
const exec=promisify(execFile);
test('Windows DPAPI helper round-trip handles line endings and inherited module paths',{skip:process.platform!=='win32'},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'wowci-dpapi-'));
  try{
    const script=resolve('scripts/Set-Secret.ps1');await exec('powershell.exe',['-NoProfile','-NonInteractive','-File',script,'-Directory',dir,'-Name','test-bearer','-Generate'],{windowsHide:true});
    const secret=await readSecret(dir,'test-bearer');assert.ok(secret.length>=32);assert.ok(!(await readFile(join(dir,'test-bearer.dpapi'),'utf8')).includes(secret));
    const reader=resolve('scripts/Read-Secret.ps1').replaceAll("'","''"),safeDir=dir.replaceAll("'","''");
    const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',`$value=& '${reader}' -Name test-bearer -Directory '${safeDir}'; if ($value.Length -lt 32) { throw 'Capture failed' }; Write-Output 'captured'`],{windowsHide:true});
    assert.equal(stdout.trim(),'captured','same-process capture must not print the secret');
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('tunnel setup migrates credential to DPAPI without output and refuses overwrite',{skip:process.platform!=='win32'},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'wowci-tunnel-secret-')),secret='sk-test-'+randomBytes(32).toString('hex');
  try{
    const envPath=join(dir,'.env.tunnel');await writeFile(envPath,'CONTROL_PLANE_API_KEY='+secret+'\n');
    const args=['-NoProfile','-NonInteractive','-File',resolve('scripts/Protect-TunnelSecret.ps1'),'-Directory',dir];
    const {stdout,stderr}=await exec('powershell.exe',args,{windowsHide:true});assert.ok(!stdout.includes(secret)&&!stderr.includes(secret));
    assert.equal(await readSecret(dir,'openai-tunnel-runtime'),secret);await assert.rejects(access(envPath));
    await writeFile(envPath,'CONTROL_PLANE_API_KEY=sk-test-'+randomBytes(32).toString('hex')+'\n');
    await assert.rejects(exec('powershell.exe',args,{windowsHide:true}));assert.equal(await readSecret(dir,'openai-tunnel-runtime'),secret);
  }finally{await rm(dir,{recursive:true,force:true});}
});
