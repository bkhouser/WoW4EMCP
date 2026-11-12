-- Optional one-way screen transport and explicit user-click save controls.
-- No game inputs, network access, memory inspection or protected-value decoding.
WoWCISync = {}
local S=WoWCISync
local settings={reload=true,optical=false,reminder=900,saved=0,angle=220}
local COLS,ROWS,CELL,CHUNK=80,24,2,1422
local current,pending,lastText,capture,authorized,button,panel,options,pixels
local leaving,started,elapsed,pageElapsed,lastCapture=false,false,0,0,0
local lastCaptured=0
local firstUnsaved=0
local generation=0
local dragging=false
local lastDragEnded=0
local function safe()return started and not leaving and authorized() and InCombatLockdown()==false end
local function saveSettings()
    WoWCharacterIntelligenceSettings=string.format('reload=%d;optical=%d;reminder=%d;saved=%d;angle=%d',settings.reload and 1 or 0,settings.optical and 1 or 0,settings.reminder,settings.saved,settings.angle)
end
local function loadSettings()
    local value=WoWCharacterIntelligenceSettings
    if type(value)=='string' then
        local angle=value:match(';angle=(%d+)$')
        if angle then value=value:gsub(';angle=%d+$','') end
        local r,o,m,s=value:match('^reload=([01]);optical=([01]);reminder=(%d+);saved=(%d+)$')
        if r and tonumber(m)>=60 and tonumber(m)<=7200 and tonumber(s)<=time()+300 then
            settings={reload=r=='1',optical=o=='1',reminder=tonumber(m),saved=tonumber(s),angle=angle and tonumber(angle)%360 or 220}
        end
    end
    saveSettings()
end
local function checksum(text)
    local a,b=1,0
    for i=1,#text do a=(a+text:byte(i))%65521;b=(b+a)%65521 end
    return b*65536+a
end
local function u16(n)return string.char(math.floor(n/256)%256,n%256)end
local function u32(n)return u16(math.floor(n/65536))..u16(n%65536)end
local function packets(text)
    local count=math.ceil(#text/CHUNK)
    if count<1 or count>256 then return nil end
    generation=(generation+1)%4294967296
    local sum=checksum(text);local result={index=1,remaining=count*2,started=time(),pages={}}
    for i=0,count-1 do
        local part=text:sub(i*CHUNK+1,(i+1)*CHUNK)
        result.pages[i+1]='WCI1'..u32(generation)..u16(i)..u16(count)..u16(#part)..u32(sum)..part
    end
    return result
end
local function createPanel()
    if panel then return end
    panel=CreateFrame('Frame','WoWCIOpticalMarker',UIParent)
    panel:SetSize(COLS*CELL,(ROWS+1)*CELL+14)
    -- Same physical pixel sizing as the tested compact WowAdvisor marker.
    local _,height=GetPhysicalScreenSize()
    panel:SetScale(768/height/UIParent:GetEffectiveScale())
    panel:SetPoint('TOPRIGHT',UIParent,'TOPRIGHT',-12,-80)
    panel:SetFrameStrata('HIGH');panel:EnableMouse(false)
    local bg=panel:CreateTexture(nil,'BACKGROUND');bg:SetAllPoints();bg:SetColorTexture(0,0,0,1)
    local markers={{1,0,1},{0,1,1},{1,1,0},{0,1,0}}
    for i,color in ipairs(markers) do
        local t=panel:CreateTexture(nil,'ARTWORK');t:SetSize(CELL,CELL);t:SetPoint('TOPLEFT',(i-1)*CELL,0);t:SetColorTexture(unpack(color))
    end
    pixels={}
    for i=0,COLS*ROWS-1 do
        local t=panel:CreateTexture(nil,'ARTWORK');t:SetSize(CELL,CELL);t:SetPoint('TOPLEFT',(i%COLS)*CELL,-(math.floor(i/COLS)+1)*CELL);pixels[i+1]=t
    end
    local label=panel:CreateFontString(nil,'OVERLAY','GameFontNormalSmall');label:SetPoint('BOTTOMLEFT',2,0);label:SetText('WCI screen sync')
end
local function paint(packet)
    createPanel()
    local acc,bits,pos=0,0,1
    for i=1,COLS*ROWS do
        while bits<6 do acc=acc*256+(packet:byte(pos) or 0);bits=bits+8;pos=pos+1 end
        bits=bits-6;local n=math.floor(acc/2^bits);acc=acc%2^bits
        pixels[i]:SetColorTexture((24+64*math.floor(n/16))/255,(24+64*(math.floor(n/4)%4))/255,(24+64*(n%4))/255,1)
    end
    panel:Show()
end
function S.Captured(text)
    if not started or leaving then return end
    lastCaptured=time();lastText=text
    if firstUnsaved==0 then firstUnsaved=lastCaptured end
    if settings.optical then pending=text end
end
function S.SaveNow()
    if not settings.reload or not safe() then print('WCI: save unavailable; leave combat and enable reload mode.');return false end
    local reload=(C_UI and C_UI.Reload) or ReloadUI
    if type(reload)~='function' then print('WCI: UI reload is unavailable.');return false end
    if not capture() then print('WCI: capture failed; UI was not reloaded.');return false end
    -- Only the click/slash command invokes reload; reminders never invoke it.
    saveSettings();reload();return true
end
function S.Configure(reload,optical,minutes)
    if InCombatLockdown()~=false then print('WCI: change settings outside combat.');return false end
    if type(reload)~='boolean' or type(optical)~='boolean' or type(minutes)~='number' or minutes%1~=0 or minutes<1 or minutes>120 then return false end
    settings.reload=reload;settings.optical=optical;settings.reminder=minutes*60;saveSettings()
    if not optical then current=nil;pending=nil;if panel then panel:Hide() end
    elseif started and lastText then pending=lastText end
    if button then button:SetAlpha(1) end
    return true
end
function S.Options()
    if not safe() then print('WCI: settings are available outside combat on a configured character.');return end
    if not options then
        options=CreateFrame('Frame','WoWCISyncOptions',UIParent,'BasicFrameTemplateWithInset')
        options:SetSize(390,255);options:SetPoint('CENTER');options:SetFrameStrata('DIALOG')
        options.TitleText:SetText('WoW Character Intelligence - Sync')
        local function check(y,text)
            local c=CreateFrame('CheckButton',nil,options,'UICheckButtonTemplate');c:SetPoint('TOPLEFT',12,y)
            local label=c:CreateFontString(nil,'OVERLAY','GameFontNormal');label:SetPoint('LEFT',c,'RIGHT',4,0);label:SetText(text);return c
        end
        options.reload=check(-35,'Reload button and save-due reminder')
        options.optical=check(-70,'On-screen data marker (experimental)')
        local note=options:CreateFontString(nil,'OVERLAY','GameFontHighlightSmall');note:SetPoint('TOPLEFT',18,-112);note:SetWidth(350);note:SetJustifyH('LEFT')
        note:SetText('Screen mode also requires opt-in in the Windows companion. Both modes pause during combat. Settings persist on reload/logout.')
        local label=options:CreateFontString(nil,'OVERLAY','GameFontNormal');label:SetPoint('TOPLEFT',18,-162);label:SetText('Remind after minutes (1-120):')
        options.minutes=CreateFrame('EditBox',nil,options,'InputBoxTemplate');options.minutes:SetSize(50,24);options.minutes:SetPoint('TOPLEFT',270,-156);options.minutes:SetAutoFocus(false);options.minutes:SetNumeric(true);options.minutes:SetMaxLetters(3)
        local apply=CreateFrame('Button',nil,options,'UIPanelButtonTemplate');apply:SetSize(110,26);apply:SetPoint('BOTTOMRIGHT',-16,16);apply:SetText('Apply')
        apply:SetScript('OnClick',function()
            if S.Configure(options.reload:GetChecked()==true,options.optical:GetChecked()==true,tonumber(options.minutes:GetText())) then options:Hide() end
        end)
    end
    options.reload:SetChecked(settings.reload);options.optical:SetChecked(settings.optical);options.minutes:SetText(tostring(settings.reminder/60));options:Show()
end
local function positionButton()
    if not Minimap then button:SetPoint('TOPRIGHT',UIParent,'TOPRIGHT',-12,-36);return end
    local radians=settings.angle*math.pi/180
    button:ClearAllPoints()
    button:SetPoint('CENTER',Minimap,'CENTER',math.cos(radians)*(Minimap:GetWidth()/2+8),math.sin(radians)*(Minimap:GetHeight()/2+8))
end
local function dragPosition()
    if not Minimap then return end
    local x,y=GetCursorPosition();local cx,cy=Minimap:GetCenter();local scale=Minimap:GetEffectiveScale()
    if not cx or not cy or not scale or scale<=0 then return end
    local atan2=math.atan2 or math.atan
    settings.angle=math.floor(atan2(y/scale-cy,x/scale-cx)*180/math.pi+0.5)%360
    positionButton()
end
function S.Tick(delta)
    if not started then return end
    if not safe() then
        dragging=false
        if button then button:Hide() end;if panel then panel:Hide() end;if options then options:Hide() end
        -- Preserve the cursor across short pauses. Expire long interrupted transfers.
        if current and time()-current.started>180 then current=nil end
        return
    end
    if dragging then dragPosition() end
    elapsed=elapsed+delta;pageElapsed=pageElapsed+delta
    if elapsed>=0.25 then
        elapsed=0;button:Show()
        local baseline=settings.saved>0 and settings.saved or firstUnsaved
        local due=settings.reload and lastCaptured>settings.saved and baseline>0 and time()-baseline>=settings.reminder
        button.saveDue=due
        button:SetAlpha(due and (0.75+0.25*math.sin((GetTime and GetTime() or time())*2)) or 1)
    end
    if settings.optical and pageElapsed>=0.25 then
        pageElapsed=0
        if current and time()-current.started>180 then current=nil end
        if not current and pending then current=packets(pending);pending=nil;if not current then print('WCI: snapshot too large for screen mode; use capture + reload.') end end
        if current then
            paint(current.pages[current.index]);current.index=current.index%#current.pages+1;current.remaining=current.remaining-1
            if current.remaining<=0 then current=nil end
        elseif panel then panel:Hide() end
        -- Periodic capture is additional to the collector's event-driven refresh.
        if not current and time()-lastCapture>=30 then lastCapture=time();capture() end
    end
end
function S.Initialize(fn,check)
    capture=fn;authorized=check;loadSettings();started=true;leaving=false;lastCapture=time()
    button=CreateFrame('Button','WoWCISyncButton',Minimap or UIParent)
    button:SetSize(32,32);button:SetFrameStrata('MEDIUM');button:EnableMouse(true)
    local background=button:CreateTexture(nil,'BACKGROUND');background:SetSize(24,24);background:SetPoint('CENTER');background:SetTexture('Interface\\Minimap\\UI-Minimap-Background')
    local icon=button:CreateTexture(nil,'ARTWORK');icon:SetSize(20,20);icon:SetPoint('CENTER');icon:SetTexture('Interface\\Icons\\INV_Misc_Book_09');icon:SetTexCoord(0.05,0.95,0.05,0.95)
    if button.CreateMaskTexture and icon.AddMaskTexture then
        local mask=button:CreateMaskTexture();mask:SetTexture('Interface\\CHARACTERFRAME\\TempPortraitAlphaMask');mask:SetAllPoints(icon);icon:AddMaskTexture(mask)
    end
    local border=button:CreateTexture(nil,'OVERLAY');border:SetSize(54,54);border:SetPoint('TOPLEFT');border:SetTexture('Interface\\Minimap\\MiniMap-TrackingBorder')
    button:SetHighlightTexture('Interface\\Minimap\\UI-Minimap-ZoomButton-Highlight')
    positionButton();button:RegisterForClicks('LeftButtonUp','RightButtonUp');button:RegisterForDrag('LeftButton')
    button:SetScript('OnDragStart',function()if safe() then dragging=true end end)
    button:SetScript('OnDragStop',function()dragging=false;lastDragEnded=GetTime();saveSettings()end)
    button:SetScript('OnClick',function(_,mouse)
        if GetTime()-lastDragEnded<0.2 then return end
        if mouse=='RightButton' or not settings.reload then S.Options() else S.SaveNow() end
    end)
    button:SetScript('OnEnter',function(self)
        if GameTooltip then
            GameTooltip:SetOwner(self,'ANCHOR_LEFT');GameTooltip:SetText('WoW Character Intelligence')
            GameTooltip:AddLine(settings.reload and 'Left-click: capture + reload' or 'Left-click: sync settings',1,1,1)
            GameTooltip:AddLine('Right-click: settings. Drag: move around minimap.',1,1,1)
            GameTooltip:AddLine(self.saveDue and 'Save due: click to refresh your companion.' or 'Pulse means save due; it is not a delivery acknowledgement.',1,0.82,0,true)
            GameTooltip:Show()
        end
    end)
    button:SetScript('OnLeave',function()if GameTooltip then GameTooltip:Hide() end end)
    local ticker=CreateFrame('Frame');ticker:SetScript('OnUpdate',function(_,delta)S.Tick(delta)end)
    S.Tick(0.25)
end
function S.Leaving(logout)
    if logout then settings.saved=time();firstUnsaved=0;saveSettings() end
    leaving=true;if panel then panel:Hide() end;if button then button:Hide() end
end
function S.Resume()leaving=false end
function S.Status()
    print('WCI modes: reload='..tostring(settings.reload)..', screen='..tostring(settings.optical)..'; reminder='..tostring(settings.reminder/60)..' minutes. Screen transmission has no delivery acknowledgement.')
    print('/wci sync | /wci options | /wci mode reload|screen|both|off | /wci reminder 15')
end
function S.Command(msg)
    msg=(msg or ''):lower()
    if msg=='sync' then S.SaveNow();return true end
    if msg=='options' then S.Options();return true end
    local mode=msg:match('^mode (%a+)$')
    if mode then
        if mode=='reload' or mode=='screen' or mode=='both' or mode=='off' then
            if S.Configure(mode=='reload' or mode=='both',mode=='screen' or mode=='both',settings.reminder/60) then print('WCI mode: '..mode..'. Screen capture must also be enabled in the Windows companion.') end
        else print('WCI: /wci mode reload|screen|both|off') end
        return true
    end
    local minutes=tonumber(msg:match('^reminder (%d+)$'))
    if minutes then S.Configure(settings.reload,settings.optical,minutes);return true end
    return false
end
