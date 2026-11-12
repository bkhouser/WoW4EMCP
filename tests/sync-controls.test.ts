import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {decodeCells,OpticalAssembler} from '../src/optical.js';
const require=createRequire(import.meta.url);const {lua,lauxlib,lualib,to_luastring,to_jsstring}=require('fengari');
const source=readFileSync('addon/WoWCharacterIntelligence/Sync.lua','utf8');
const prefix=`
unpack=table.unpack;now=1700000000;combat=false;reloads=0;captures=0;frames={}
function time()return now end
function GetTime()return now+0.25 end
function print()end
function InCombatLockdown()return combat end
function GetPhysicalScreenSize()return 1920,1080 end
function ReloadUI()reloads=reloads+1 end
local function object()
 local o={scripts={},textures={},shown=true,alpha=1}
 function o:SetScript(name,fn)self.scripts[name]=fn end
 function o:CreateTexture()local t=object();table.insert(self.textures,t);return t end
 function o:CreateFontString()return object()end
 function o:Show()self.shown=true end;function o:Hide()self.shown=false end
 function o:SetAlpha(x)self.alpha=x end;function o:SetText(x)self.text=x end;function o:GetText()return self.text end
 function o:SetChecked(x)self.checked=x end;function o:GetChecked()return self.checked end
 function o:SetColorTexture(r,g,b)self.color={r,g,b}end
 function o:GetEffectiveScale()return 1 end
 for _,name in ipairs({'SetSize','SetPoint','SetScale','SetFrameStrata','SetAllPoints','EnableMouse','RegisterForClicks','SetWidth','SetJustifyH','SetAutoFocus','SetNumeric','SetMaxLetters','SetTexture','SetTexCoord','SetHighlightTexture','RegisterForDrag','ClearAllPoints'})do o[name]=function()end end
 return o
end
UIParent=object();Minimap=object()
function Minimap:GetWidth()return 140 end;function Minimap:GetHeight()return 140 end;function Minimap:GetCenter()return 100,100 end
function GetCursorPosition()return 100,200 end
function CreateFrame(_,name)local o=object();o.TitleText=object();if name then frames[name]=o end;return o end
function cap()captures=captures+1;if failCapture then return false end;WoWCISync.Captured('new snapshot');return true end
`;
function run(suffix:string,before=''){
 const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
 try{const rc=lauxlib.luaL_dostring(L,to_luastring(prefix+before+source+'\n'+suffix));if(rc!==lua.LUA_OK)throw new Error(to_jsstring(lua.lua_tostring(L,-1)));lua.lua_getglobal(L,to_luastring('Result'));const b=lua.lua_tolstring(L,-1);return b?Buffer.from(b):null;}finally{lua.lua_close(L);}
}
test('one click captures then reloads; failures and combat never reload or queue a reload',()=>{
 run(`WoWCISync.Initialize(cap,function()return true end);assert(WoWCISync.SaveNow());assert(captures==1 and reloads==1)
 failCapture=true;assert(not WoWCISync.SaveNow());assert(reloads==1);failCapture=false;combat=true;assert(not WoWCISync.SaveNow());assert(captures==2)
 WoWCISync.Tick(5);assert(not frames.WoWCISyncButton.shown);combat=false;WoWCISync.Tick(1);assert(reloads==1 and frames.WoWCISyncButton.shown)`);
});
test('save reminder pulses after threshold and settings persist independently of optical sending',()=>{
 run(`WoWCISync.Initialize(cap,function()return true end);now=now+1;WoWCISync.Captured('snapshot');now=now+30;WoWCISync.Tick(1);assert(frames.WoWCISyncButton.alpha==1)
 now=now+871;WoWCISync.Tick(1);assert(frames.WoWCISyncButton.alpha<1);assert(reloads==0);assert(WoWCISync.Configure(true,true,5));WoWCISync.Options()
 assert(frames.WoWCISyncOptions.reload:GetChecked() and frames.WoWCISyncOptions.optical:GetChecked());assert(WoWCharacterIntelligenceSettings:find('reload=1;optical=1;reminder=300'))
 WoWCISync.Leaving(true);assert(WoWCharacterIntelligenceSettings:find('saved=1700000902'));assert(not frames.WoWCISyncButton.shown)`,
 `WoWCharacterIntelligenceSettings='reload=1;optical=0;reminder=900;saved=1700000000'\n`);
});
test('optical/off modes disable save action; optical panel hides immediately on tick in combat',()=>{
 run(`WoWCISync.Initialize(cap,function()return true end);WoWCISync.Command('mode screen');WoWCISync.Captured('sample data');WoWCISync.Tick(0.25)
 assert(frames.WoWCIOpticalMarker.shown);assert(not WoWCISync.SaveNow());combat=true;WoWCISync.Tick(0.01);assert(not frames.WoWCIOpticalMarker.shown)
 combat=false;WoWCISync.Command('mode off');WoWCISync.Tick(1);assert(not frames.WoWCIOpticalMarker.shown and reloads==0)
 assert(not WoWCISync.Configure(true,true,0));assert(not WoWCISync.Configure(true,true,121))`);
});
test('actual Lua pixel encoder decodes across all pages using the Windows companion protocol',()=>{
 const message='Synthetic optical snapshot '.repeat(180),pages=Math.ceil(Buffer.byteLength(message)/1422);
 const buffer=run(`WoWCISync.Initialize(cap,function()return true end);WoWCISync.Configure(false,true,15);WoWCISync.Captured(${JSON.stringify(message)});local output={}
 for page=1,${pages} do
  WoWCISync.Tick(0.25);local textures=frames.WoWCIOpticalMarker.textures
  for cell=1,2000 do
   local color=cell<=4 and textures[cell+1].color or cell<=80 and {0,0,0} or textures[cell-75].color
   for c=1,3 do output[#output+1]=string.char(math.floor(color[c]*255+0.5)) end
  end
 end
 Result=table.concat(output)`)!;
 assert.equal(buffer.length,pages*6000);const assembler=new OpticalAssembler();let result=null;
 for(let i=0;i<pages;i++)result=assembler.accept(decodeCells(buffer.subarray(i*6000,(i+1)*6000)));
 assert.equal(result,message);
});

 test('first capture gets a full reminder interval and logout records the save opportunity',()=>{
 run(`WoWCISync.Initialize(cap,function()return true end);WoWCISync.Captured('snapshot');WoWCISync.Tick(1);assert(frames.WoWCISyncButton.alpha==1)
 now=now+899;WoWCISync.Tick(1);assert(frames.WoWCISyncButton.alpha==1);now=now+2;WoWCISync.Tick(1);assert(frames.WoWCISyncButton.alpha<1)
 now=now+3600;WoWCISync.Leaving(true);assert(WoWCharacterIntelligenceSettings:find('saved=1700004501'))`);
 });
 test('combat pauses keep advancing a generation and long pauses allow latest pending capture',()=>{
 run(`WoWCISync.Initialize(cap,function()return true end);WoWCISync.Configure(false,true,15);WoWCISync.Captured(string.rep('a',4500))
 local first
 for i=1,8 do
  WoWCISync.Tick(0.25);local color=frames.WoWCIOpticalMarker.textures[5+12].color
  combat=true;WoWCISync.Tick(0.25);combat=false
 end
 WoWCISync.Tick(0.25);assert(not frames.WoWCIOpticalMarker.shown)
 WoWCISync.Captured(string.rep('b',4500));WoWCISync.Tick(0.25);WoWCISync.Captured('latest')
 combat=true;now=now+181;WoWCISync.Tick(1);combat=false;failCapture=true;WoWCISync.Tick(0.25);assert(frames.WoWCIOpticalMarker.shown)
 WoWCISync.Tick(0.25);WoWCISync.Tick(0.25);assert(not frames.WoWCIOpticalMarker.shown)`);
 });

test('minimap icon supports click, settings and persistent drag without triggering reload',()=>{
 run(`WoWCISync.Initialize(cap,function()return true end);local b=frames.WoWCISyncButton
 b.scripts.OnClick(b,'LeftButton');assert(reloads==1);b.scripts.OnClick(b,'RightButton');assert(frames.WoWCISyncOptions.shown)
 b.scripts.OnDragStart();WoWCISync.Tick(0.25);b.scripts.OnDragStop();assert(WoWCharacterIntelligenceSettings:find('angle=90'))
 b.scripts.OnClick(b,'LeftButton');assert(reloads==1);now=now+1;b.scripts.OnClick(b,'LeftButton');assert(reloads==2)`);
});

test('maximum-size optical generation gets both complete passes before expiry',()=>{
 run(`WoWCISync.Initialize(cap,function()return true end);WoWCISync.Configure(false,true,15);failCapture=true;local sent={}
 for i=1,100 do local name=debug.getupvalue(WoWCISync.Tick,i);if not name then break end;if name=='paint' then debug.setupvalue(WoWCISync.Tick,i,function(packet)sent[#sent+1]=packet end);break end end
 WoWCISync.Captured(string.rep('x',1422*256))
 for i=1,512 do now=now+0.25;WoWCISync.Tick(0.25) end
 assert(#sent==512);assert(sent[256]:byte(10)==255 and sent[512]:byte(10)==255)
 now=now+0.25;WoWCISync.Tick(0.25);assert(#sent==512)`);
});
