import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {validateSnapshot,payloadSchemas} from '../src/model.js';
const require=createRequire(import.meta.url);const {lua,lauxlib,lualib,to_luastring,to_jsstring}=require('fengari');
const source=readFileSync('addon/WoWCharacterIntelligence/Collector.lua','utf8');
const prefix=`
unpack=table.unpack
local fakeNow=1700000000
function time() return fakeNow end
function date() return '2023-11-14T22:13:20Z' end
function print() end
function issecretvalue(v) return type(v)=='table' and v.secret==true end
function InCombatLockdown() return combat or false end
function UnitName() return 'Examplewarlock' end
function GetRealmName() return 'test-realm' end
function UnitLevel() return 28 end
function UnitRace() return 'Human' end
function UnitClass() return 'Warlock','WARLOCK' end
function UnitXP() return 15 end
function UnitXPMax() return 30000 end
function GetXPExhaustion() return nil end
function GetMoney() return 12345 end
function GetBuildInfo() return '1.60.1','70888' end
function GetZoneText() return 'Wetlands' end
function GetInventoryItemID(_,slot) if slot==18 then return 8184 end end
function GetInventoryItemLink(_,slot) if slot==18 then return 'item:8184:0:0:0' end end
function UnitStat() return 10,11 end
function UnitArmor() return 50,60 end
function UnitHealthMax() return 500 end
function UnitPowerMax() return 600 end
function GetBindLocation() return 'Menethil Harbor' end
function GetNumSavedInstances() return 0 end
C_Item={GetItemInfo=function()return 'Firestarter','item:8184',2,29 end,GetItemStats=function()return {spellPower=4}end}
C_QuestLog={GetNumQuestLogEntries=function()return 1,1 end,GetInfo=function()return {questID=1740,title="The Orb of Soran'ruk",level=25,isHeader=false}end,
  IsComplete=function()return false end,GetMaxNumQuestsCanAccept=function()return 40 end,CanAbandonQuest=function()return true end,
  GetQuestObjectives=function()return {{text="0/3 Soran'ruk Fragment",type='item',numFulfilled=0,numRequired=3,finished=false},{text='1/1 Large Soranruk Fragment',type='item',numFulfilled=1,numRequired=1,finished=true}}end,
  GetAllCompletedQuestIDs=function()return {10}end}
C_Container={GetContainerNumSlots=function(bag)return bag==0 and 1 or 0 end,GetContainerItemID=function(bag)if bag==0 then return 730 end end,
  GetContainerItemInfo=function(bag)if bag==0 then return {itemID=730,stackCount=8,hyperlink='item:730:0:0:0',quality=1,isBound=false}end end}
function CreateFrame()return {RegisterEvent=function()end,SetScript=function(_,_,fn)handler=fn end}end
C_Timer={After=function(_,fn)fn()end};SlashCmdList={}
WoWCIIdentities={{playerName='Examplewarlock',realm='test-realm',identity={gameVersion='forever',region='us',scope='normal',slug='examplewarlock-testvale',name='Examplewarlock Testvale'}}}
`;
function run(suffix:string){const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);try{const rc=lauxlib.luaL_dostring(L,to_luastring(prefix+source+'\n'+suffix));if(rc!==lua.LUA_OK)throw new Error(to_jsstring(lua.lua_tostring(L,-1)));lua.lua_getglobal(L,to_luastring('WoWCharacterIntelligenceExport'));const raw=lua.lua_tostring(L,-1);return raw?JSON.parse(to_jsstring(raw)):null;}finally{lua.lua_close(L);}}
test('original addon executes and produces a schema-valid snapshot',()=>{const bundle=run("handler(nil,'PLAYER_LOGIN')");const s=validateSnapshot(bundle.snapshots[0]);assert.equal(s.source,'addon');const q=payloadSchemas.quests.parse(s.observations.find(o=>o.domain==='quests')!.payload);assert.equal(q.capacity,40);assert.equal(q.entries[0].objectives[0].current,0);assert.equal(q.entries[0].turnedIn,'unknown');const bags=payloadSchemas.bags.parse(s.observations.find(o=>o.domain==='bags')!.payload);assert.equal(bags.items[0].quantity,8);assert.equal(s.observations.find(o=>o.domain==='bank')?.coverage,'not_observed');});
test('explicit turn-in event remains separate from active quest state',()=>{const bundle=run("handler(nil,'PLAYER_LOGIN');handler(nil,'QUEST_TURNED_IN',1740)");const s=validateSnapshot(bundle.snapshots[0]);const h=payloadSchemas.quest_history.parse(s.observations.find(o=>o.domain==='quest_history')!.payload);assert.ok(h.entries.some(e=>e.kind==='turned_in'&&e.id===1740));assert.equal(payloadSchemas.quests.parse(s.observations.find(o=>o.domain==='quests')!.payload).entries[0].turnedIn,'unknown');});
test('addon defers capture in combat and rejects unmatched identities',()=>{assert.equal(run("combat=true;handler(nil,'PLAYER_LOGIN')"),null);assert.equal(run("WoWCIIdentities={};handler(nil,'PLAYER_LOGIN')"),null);});
test('unavailable quest API is reported rather than exported as empty log',()=>{const bundle=run("C_QuestLog=nil;handler(nil,'PLAYER_LOGIN')");const s=validateSnapshot(bundle.snapshots[0]);const q=s.observations.find(o=>o.domain==='quests')!;assert.equal(q.coverage,'unavailable');assert.equal(q.payload,null);});
test('failed item slot API downgrades coverage instead of asserting empty storage',()=>{const bundle=run("C_Container.GetContainerItemID=function()error('unreadable')end;C_Container.GetContainerItemInfo=function()error('unreadable')end;GetInventoryItemID=function()error('unreadable')end;handler(nil,'PLAYER_LOGIN')");const s=validateSnapshot(bundle.snapshots[0]);assert.equal(s.observations.find(o=>o.domain==='bags')!.coverage,'partial');assert.equal(s.observations.find(o=>o.domain==='equipment')!.coverage,'partial');});
test('missing or ambiguous realm mapping disables addon collection',()=>{assert.equal(run("WoWCIIdentities[1].realm=nil;handler(nil,'PLAYER_LOGIN')"),null);assert.equal(run("WoWCIIdentities[2]=WoWCIIdentities[1];handler(nil,'PLAYER_LOGIN')"),null);});
test('logout and delayed timer preserve the last export without reading unloading APIs',()=>{
  const bundle=run("handler(nil,'PLAYER_LOGIN');local before=WoWCharacterIntelligenceExport;C_Timer.After=function(_,fn)pending=fn end;handler(nil,'QUEST_LOG_UPDATE');C_QuestLog.GetInfo=function()error('unloading')end;UnitLevel=function()error('unloading')end;handler(nil,'PLAYER_LOGOUT');pending();assert(before==WoWCharacterIntelligenceExport)");
  const s=validateSnapshot(bundle.snapshots[0]);assert.equal(payloadSchemas.quests.parse(s.observations.find(o=>o.domain==='quests')!.payload).entries[0].objectives[0].required,3);
});
test('pending turn-in flushes at logout with original evidence and unchanged quest capture',()=>{
  const bundle=run("handler(nil,'PLAYER_LOGIN');local before=WoWCharacterIntelligenceExport;C_Timer.After=function(_,fn)pending=fn end;handler(nil,'QUEST_TURNED_IN',1740);C_QuestLog=nil;handler(nil,'PLAYER_LOGOUT');pending()");
  assert.equal(bundle.snapshots.length,2);const old=validateSnapshot(bundle.snapshots[0]),flush=validateSnapshot(bundle.snapshots[1]);
  assert.equal(old.observations.find(o=>o.domain==='quests')!.observedAt,'2023-11-14T22:13:20Z');
  const events=payloadSchemas.quest_history.parse(flush.observations[0].payload).entries;
  assert.equal(events.length,1);assert.equal(events[0].kind,'turned_in');assert.equal(events[0].at,flush.observations[0].observedAt);
});
test('new quest membership remains visible when its empty objectives and level are unknown',()=>{
  const bundle=run("handler(nil,'PLAYER_LOGIN');C_QuestLog.GetInfo=function()return {questID=999,title='New quest',level=0,isHeader=false}end;C_QuestLog.GetQuestObjectives=function()return {}end;handler(nil,'QUEST_LOG_UPDATE')");
  const q=payloadSchemas.quests.parse(validateSnapshot(bundle.snapshots[0]).observations.find(o=>o.domain==='quests')!.payload);
  assert.equal(q.entries[0].id,999);assert.equal(q.entries[0].objectivesCoverage,'unknown');assert.equal(q.entries[0].level,null);
});
