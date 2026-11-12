import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test, { type TestContext } from 'node:test';
import { promisify } from 'node:util';
import { loadConfig } from '../src/config.js';

const exec = promisify(execFile);
const script = resolve('scripts/Configure-Sync.ps1');
const windowsOnly = { skip: process.platform !== 'win32' };
const fixture = {
  database: 'données/test.sqlite',
  mode: 'real',
  pollSeconds: 15,
  sources: [{
    id: 'test-addon',
    path: 'sauvegardes/Élan.lua',
    format: 'addon',
    identity: { gameVersion: 'forever', region: 'us', scope: 'normal', slug: 'fixture', name: 'Élan d’Essai' },
    expectedName: 'Élan d’Essai',
    expectedPlayerName: 'Élan',
    expectedRealm: 'Royaume Épreuve',
  }],
};

async function makeFixture(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'wci-sync-config-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'réglages.json');
  const executablePath = join(dir, 'jeu-épreuve.exe');
  await writeFile(path, JSON.stringify(fixture), 'utf8');
  await writeFile(executablePath, '');
  return { dir, path, executablePath };
}

function runSaveHarness(config: Awaited<ReturnType<typeof makeFixture>>, setup: string[], externalText = '') {
  const command = [
    "$ErrorActionPreference='Stop'",
    '. $env:WCI_TEST_SYNC_SCRIPT',
    '$expected=Read-SyncConfigText $env:WCI_TEST_SYNC_CONFIG',
    ...setup,
    'Save-SyncConfig -Path $env:WCI_TEST_SYNC_CONFIG -ExpectedText $expected -Mode screen -SourceId test-addon -ExecutablePath $env:WCI_TEST_SYNC_EXE',
  ].join('\n');
  return exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], {
    windowsHide: true,
    timeout: 15_000,
    env: {
      ...process.env,
      WCI_TEST_SYNC_SCRIPT: script,
      WCI_TEST_SYNC_CONFIG: config.path,
      WCI_TEST_SYNC_EXE: config.executablePath,
      WCI_TEST_SYNC_EXTERNAL: externalText,
    },
  });
}

const externalEdit = '[IO.File]::WriteAllText($env:WCI_TEST_SYNC_CONFIG,$env:WCI_TEST_SYNC_EXTERNAL,[Text.UTF8Encoding]::new($false))';

test('Windows PowerShell preserves UTF-8 names and paths across repeated mode changes', windowsOnly, async t => {
  const { path, executablePath } = await makeFixture(t);
  // Windows CI can supply an 8.3 TEMP alias; the settings script resolves it.
  const resolvedExecutablePath = await realpath(executablePath);
  const args = ['-NoProfile', '-NonInteractive', '-File', script, '-ConfigPath', path];
  for (const mode of ['both', 'off', 'screen', 'reload']) {
    const selection = mode === 'both' ? ['-SourceId', 'test-addon', '-ExecutablePath', executablePath] : [];
    await exec('powershell.exe', [...args, '-Mode', mode, ...selection], { windowsHide: true, timeout: 15_000 });
    const { savedVariablesEnabled, optical, ...unchanged } = JSON.parse(await readFile(path, 'utf8'));
    assert.deepEqual(unchanged, fixture);
    assert.deepEqual(optical, {
      enabled: mode === 'both' || mode === 'screen',
      sourceId: 'test-addon',
      executablePath: resolvedExecutablePath,
    });
    assert.equal(savedVariablesEnabled, mode === 'both' || mode === 'reload');
    assert.equal(loadConfig(path).optical.executablePath, resolvedExecutablePath);
  }
});

test('saving a stale selection cannot restore a revoked addon source', windowsOnly, async t => {
  const config = await makeFixture(t);
  const edited = JSON.stringify({ ...fixture, sources: [] });
  await assert.rejects(runSaveHarness(config, [externalEdit], edited), /configuration changed since it was read/i);
  assert.equal(await readFile(config.path, 'utf8'), edited);

  await assert.rejects(runSaveHarness(config, []), /choose one explicitly authorized addon source/i);
  assert.equal(await readFile(config.path, 'utf8'), edited);
});

test('an unrelated edit during save is rejected before the atomic replacement', windowsOnly, async t => {
  const config = await makeFixture(t);
  const edited = JSON.stringify({ ...fixture, pollSeconds: 45 });
  await assert.rejects(runSaveHarness(config, [
    'function ConvertTo-Json {',
    ' param([Parameter(ValueFromPipeline=$true)]$InputObject,[int]$Depth)',
    ' process {',
    externalEdit,
    '  Microsoft.PowerShell.Utility\\ConvertTo-Json -InputObject $InputObject -Depth $Depth',
    ' }',
    '}',
  ], edited), /configuration changed since it was read/i);
  assert.equal(await readFile(config.path, 'utf8'), edited);
  assert.deepEqual((await readdir(config.dir)).filter(name => name.endsWith('.tmp')), []);
});
