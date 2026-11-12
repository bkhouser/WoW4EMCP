import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm,readFile,writeFile,access} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {readSecret} from '../src/secrets.js';
import {loadConfig} from '../src/config.js';
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

test('screen helper compiles without capturing and Windows sync settings are explicit opt-in',{skip:process.platform!=='win32'},async()=>{
  const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-File',resolve('scripts/Read-Optical.ps1'),'-ExecutablePath','unused.exe','-ParentPid','1','-CompileOnly'],{windowsHide:true});
  assert.match(stdout,/no screen capture performed/);
  const dir=await mkdtemp(join(tmpdir(),'wowci-modes-')),path=join(dir,'config.json');
  try {
    await writeFile(path,JSON.stringify({database:'data/test.sqlite',mode:'real',sources:[{id:'my-addon',path:'unused.lua',format:'addon',identity:{gameVersion:'forever',region:'us',scope:'normal',slug:'sample',name:'Sample'},expectedName:'Sample',expectedPlayerName:'Sample',expectedRealm:'Test Realm'}]}));
    assert.equal(loadConfig(path).optical.enabled,false);assert.equal(loadConfig(path).savedVariablesEnabled,true);
    const args=['-NoProfile','-NonInteractive','-File',resolve('scripts/Configure-Sync.ps1'),'-ConfigPath',path];
    for(const mode of ['both','screen','off','reload']) {
      await exec('powershell.exe',[...args,'-Mode',mode,'-SourceId','my-addon','-ExecutablePath',process.execPath],{windowsHide:true});
      const c=loadConfig(path);assert.equal(c.savedVariablesEnabled,['both','reload'].includes(mode));assert.equal(c.optical.enabled,['both','screen'].includes(mode));
    }
    await assert.rejects(exec('powershell.exe',[...args,'-Mode','screen','-SourceId','not-authorized','-ExecutablePath',process.execPath],{windowsHide:true}));
    assert.equal(loadConfig(path).optical.enabled,false,'invalid settings must leave the previous config intact');
  }finally{await rm(dir,{recursive:true,force:true});}
});
