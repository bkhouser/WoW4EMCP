import assert from 'node:assert/strict';
import { mkdtemp, rm, rmdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ingestAddonBundle, ingestSource, parseSavedVariables, type SourceConfig } from '../src/acquisition.js';
import { characterKey, observation, payloadSchemas, type Snapshot } from '../src/model.js';
import { Store } from '../src/store.js';

const exportVariable = 'WoWCharacterIntelligenceExport';
const settingsVariable = 'WoWCharacterIntelligenceSettings';
const settings = `${settingsVariable} = 'reload=1;optical=0;reminder=900'`;
const savedSettings = `${settingsVariable} = "reload=1;optical=0;reminder=900;saved=1700000000"`;

const config: SourceConfig = {
  id: 'addon-test', path: 'unused.lua', format: 'addon',
  identity: { gameVersion: 'forever', region: 'us', scope: 'normal', slug: 'elan-testvale', name: 'Élan Testvale' },
  expectedName: 'Élan Testvale', expectedPlayerName: 'Élan', expectedRealm: 'Test Realm',
};
const key = characterKey(config.identity);
const capturedAt = '2026-01-01T00:00:00Z';

function snapshot(): Snapshot {
  return {
    schemaVersion: 1, identity: { ...config.identity }, source: 'addon', sample: false, capturedAt,
    subject: { playerName: config.expectedPlayerName!, realm: config.expectedRealm! },
    observations: [
      observation('identity', payloadSchemas.identity.parse({ level: 28, race: 'Human', class: 'WARLOCK' }), capturedAt),
      observation('bags', { items: [] }, capturedAt),
    ],
  };
}

function bundle(...snapshots: Snapshot[]) {
  return JSON.stringify({ schemaVersion: 1, snapshots });
}

function exportAssignment(json: string) {
  return `${exportVariable} = ${JSON.stringify(json)}`;
}

test('addon SavedVariables accept either assignment order and an optional settings string', () => {
  const value = { name: 'Élan — "test"', path: 'a\\b' };
  const exported = exportAssignment(JSON.stringify(value));
  for (const input of [`${exported}\n${savedSettings.slice(0,-1)};angle=220"`, exported, `\uFEFF\r\n${settings}\r\n${exported}\r\n`, `${exported}\n${savedSettings}`]) {
    assert.deepEqual(parseSavedVariables(input, exportVariable), value);
  }
  assert.deepEqual(parseSavedVariables(String.raw`${exportVariable} = '{"name":"\195\137lan"}'`, exportVariable),
    { name: 'Élan' });
});

test('addon SavedVariables reject malformed, duplicate or executable settings', () => {
  const exported = exportAssignment('{}');
  const invalid = [
    settings,
    `${exported}\n${settings}\n${settings}`,
    `${exported}\n${settings}\n${exported}`,
    `${exported}\n${settings}\nOther = "data"`,
    `${exported}\n${settingsVariable} = { reload = 1 }`,
    `${exported}\n${settingsVariable} = [[reload=1;optical=0;reminder=900]]`,
    `${exported}\n${settingsVariable} = 'reload=1;optical=0;reminder=900`,
    `${exported}\n${settingsVariable} = 'reload=1;optical=0;reminder=900;os.execute("echo")'`,
    `${exported}\n${settingsVariable} = 'reload=2;optical=0;reminder=900'`,
    `${exported}\n${settings} .. os.execute("echo")`,
    `${exported}\n${settings}\nos.execute("echo")`,
    `${exported}\n${settings} trailingjunk`,
    `${settings}\n${exportVariable} = "truncated`,
    String.raw`${exportVariable} = '{"name":"\256"}'`,
    String.raw`${exportVariable} = '{"name":"\195"}'`,
  ];
  for (const input of invalid) assert.throws(() => parseSavedVariables(input, exportVariable), Error, input);
});

test('legacy WowAdvisor SavedVariables still require just their single assignment', () => {
  const exported = 'WowAdvisorExport = "{}"';
  assert.deepEqual(parseSavedVariables(exported, 'WowAdvisorExport'), {});
  for (const input of [`${exported}\n${settings}`, `${settings}\n${exported}`, `${exported}\n${exported}`]) {
    assert.throws(() => parseSavedVariables(input, 'WowAdvisorExport'));
  }
});

test('file ingest labels observations, filters foreign characters and maintains sync status', async t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const dir = await mkdtemp(join(tmpdir(), 'wowci-settings-'));
  const path = join(dir, 'saved.lua');
  t.after(async () => { await rm(path, { force: true }); await rmdir(dir); });
  const source = { ...config, path };
  const foreign = snapshot();
  foreign.identity.slug = 'other-testvale';
  foreign.identity.name = 'Other Testvale';
  foreign.subject = { playerName: 'Other', realm: config.expectedRealm! };
  const input = `${exportAssignment(bundle(foreign, snapshot()))}\n${savedSettings}`;

  await writeFile(path, input, 'utf8');
  assert.deepEqual(await ingestSource(store, source, 1), [{ inserted: true, characterKey: key }]);
  assert.deepEqual(store.export(key)[0].observations.map((o: { transport: string }) => o.transport),
    ['savedvariables', 'savedvariables']);
  assert.equal(store.list().length, 1);
  assert.equal(store.syncStatus()[0].error, null);

  await writeFile(path, `${input}\n${settings}`, 'utf8');
  await assert.rejects(ingestSource(store, source, 1), /Duplicate SavedVariables variable/);
  assert.match(String(store.syncStatus()[0].error), /Duplicate SavedVariables variable/);
  assert.equal(store.export(key).length, 1);

  await writeFile(path, input, 'utf8');
  assert.deepEqual(await ingestSource(store, source, 1), [{ inserted: false, characterKey: key }]);
  assert.equal(store.syncStatus()[0].error, null);
});

test('optical import checks the configured subject and sets transport on each observation', t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const matching = snapshot();
  const input = JSON.stringify({
    schemaVersion: 1,
    snapshots: [{ ...matching, observations: matching.observations.map(o => ({ ...o, transport: 'savedvariables' })) }],
  });
  for (const subject of [
    undefined,
    { playerName: 'Other', realm: config.expectedRealm! },
    { playerName: config.expectedPlayerName!, realm: 'Other Realm' },
  ]) {
    assert.throws(() => ingestAddonBundle(store, config, bundle({ ...matching, subject }), 'optical'), /subject/);
  }
  assert.throws(() => ingestAddonBundle(store, { ...config, expectedRealm: undefined }, input, 'optical'), /subject/);
  assert.equal(store.list().length, 0);

  assert.deepEqual(ingestAddonBundle(store, config, input, 'optical'), [{ inserted: true, characterKey: key }]);
  assert.deepEqual(store.export(key)[0].observations.map((o: { transport: string }) => o.transport),
    ['optical', 'optical']);
});

test('optical rejects a whole bundle when a later member is invalid or unauthorized', t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const matching = snapshot();
  const badPayload = snapshot();
  badPayload.observations[0].payload = { level: -1 };
  const future = { ...snapshot(), capturedAt: '2999-01-01T00:00:00Z' };
  const foreign = { ...snapshot(), identity: { ...config.identity, slug: 'other-testvale' } };

  assert.throws(() => ingestAddonBundle(store, config, bundle(matching, badPayload), 'optical'), /payload/);
  assert.throws(() => ingestAddonBundle(store, config, bundle(matching, future), 'optical'), /future/);
  assert.throws(() => ingestAddonBundle(store, config, bundle(matching, foreign), 'optical'), /identity mismatch/);
  assert.equal(store.list().length, 0);
  assert.equal(store.db.prepare('SELECT count(*) AS count FROM snapshots').get()?.count, 0);
  assert.equal(store.db.prepare('SELECT count(*) AS count FROM observations').get()?.count, 0);
});

test('optical accepts only live addon provenance', t => {
  const realStore = new Store(':memory:');
  const sampleStore = new Store(':memory:', 'sample');
  t.after(() => { realStore.close(); sampleStore.close(); });
  assert.throws(() => ingestAddonBundle(realStore, config, bundle({ ...snapshot(), source: 'blizzard' }), 'optical'),
    /requires live addon/);
  assert.throws(() => ingestAddonBundle(sampleStore, config, bundle({ ...snapshot(), source: 'sample', sample: true }), 'optical'),
    /requires live addon/);
  assert.throws(() => ingestAddonBundle(sampleStore, config, bundle(snapshot()), 'optical'), /contamination/);
  assert.equal(realStore.list().length, 0);
  assert.equal(sampleStore.list().length, 0);
});

test('SavedVariables requires live addon provenance and subject just like optical input', t => {
 const store=new Store(':memory:');t.after(()=>store.close());
 for(const source of ['blizzard','wowadvisor','sample'] as const){
  const forged={...snapshot(),source,sample:source==='sample',subject:undefined};
  assert.throws(()=>ingestAddonBundle(store,config,bundle(forged),'savedvariables'),/live addon/);
 }
 assert.throws(()=>ingestAddonBundle(store,config,bundle({...snapshot(),subject:undefined}),'savedvariables'),/subject/);
 assert.equal(store.list().length,0);
});
test('normalized ingest discards undeclared payload fields before persisting',t=>{
 const store=new Store(':memory:');t.after(()=>store.close());const value=snapshot();
 value.observations[1].payload={items:[{itemId:730,quantity:2,unrelatedText:'synthetic extra nested'}],unrelatedText:'synthetic extra root'};
 ingestAddonBundle(store,config,bundle(value),'optical');const stored=store.export(key)[0];
 assert.ok(!JSON.stringify(stored).includes('unrelatedText'));
 assert.equal(stored.observations[1].payload.items[0].quantity,2);
});
