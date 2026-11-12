-- Original implementation. No protected actions, hooks, communication, or other-player scans.
local N = {} -- explicit JSON null
local arrays = setmetatable({}, {__mode='k'})
local function arr(t) t=t or {}; arrays[t]=true; return t end
local function plain(v)
    if type(issecretvalue)=='function' and issecretvalue(v) then return nil end
    return v
end
local function call(fn,...)
    if type(fn)~='function' then return nil end
    local function pack(...) return {n=select('#',...),...} end
    local r=pack(pcall(fn,...)); if not r[1] then return nil end
    for i=2,r.n do r[i]=plain(r[i]) end
    return unpack(r,2,r.n)
end
local function checked(fn,...)
    if type(fn)~='function' then return false,nil end
    local ok,v=pcall(fn,...)
    if not ok then return false,nil end
    if type(issecretvalue)=='function' and issecretvalue(v) then return false,nil end
    return true,v
end
local function field(t,k) t=plain(t); if type(t)=='table' then return plain(t[k]) end end
local function n(v) v=plain(v); if v==nil then return N end; return v end
local function utc(t) return date('!%Y-%m-%dT%H:%M:%SZ',t or time()) end
local function quote(s)
    return '"'..s:gsub('[%z\1-\31\\"]',function(c)
        local e={['"']='\\"',['\\']='\\\\',['\n']='\\n',['\r']='\\r',['\t']='\\t'}
        return e[c] or string.format('\\u%04x',string.byte(c))
    end)..'"'
end
local function json(v,depth)
    depth=depth or 0; if depth>30 then error('depth') end
    v=plain(v); if v==nil or v==N then return 'null' end
    local k=type(v)
    if k=='string' then return quote(v) end
    if k=='boolean' then return v and 'true' or 'false' end
    if k=='number' then if v~=v or v==math.huge or v==-math.huge then return 'null' end; return tostring(v) end
    if k~='table' then return 'null' end
    local parts={}
    if arrays[v] then for _,x in ipairs(v) do parts[#parts+1]=json(x,depth+1) end; return '['..table.concat(parts,',')..']' end
    for key,x in pairs(v) do if type(plain(key))=='string' then parts[#parts+1]=quote(key)..':'..json(x,depth+1) end end
    table.sort(parts); return '{'..table.concat(parts,',')..'}'
end
local state={events=arr(),eventRevision=0,exportedRevision=0,pending=false,bankOpen=false,coverage={},errors={},identity=nil,leaving=false}
local function obs(domain,payload,coverage,notes,at)
    state.coverage[domain]=coverage
    return {domain=domain,payload=payload or N,coverage=coverage,notes=arr(notes),basis='direct',observedAt=payload and (at or utc()) or N}
end
local function item(id,link,bag,slot,count,bound,quality)
    local name,_,q,il=call(C_Item and C_Item.GetItemInfo or GetItemInfo,link or id)
    local stats=call(C_Item and C_Item.GetItemStats or GetItemStats,link or '') or {}
    local clean={};for key,value in pairs(stats) do if type(plain(key))=='string' and type(plain(value))=='number' then clean[key]=value end end
    local enchant=type(link)=='string' and tonumber(link:match('item:%d+:(%d+)')) or nil
    return {itemId=id,name=n(name),quantity=n(count),bag=n(bag),slot=n(slot),quality=n(quality or q),bound=n(bound),link=n(link),itemLevel=n(il),stats=clean,enchantmentId=n(enchant)}
end
local function collectIdentity()
    local _,class=call(UnitClass,'player'); local race=call(UnitRace,'player');local version,build=call(GetBuildInfo)
    return obs('identity',{level=n(call(UnitLevel,'player')),race=n(race),class=n(class),specialization=N,
        xp=n(call(UnitXP,'player')),xpMax=n(call(UnitXPMax,'player')),restedXp=n(call(GetXPExhaustion)),goldCopper=n(call(GetMoney)),
        location=n(call(GetZoneText)),build=n(version and (version..'.'..tostring(build)))},'partial',{'Identity scope and slug use explicit operator configuration; specialization may be unavailable.'})
end
local function collectQuests()
    if not C_QuestLog then return obs('quests',nil,'unavailable',{'C_QuestLog missing'}) end
    local total,used=call(C_QuestLog.GetNumQuestLogEntries)
    if type(total)~='number' then return obs('quests',nil,'unavailable',{'Quest enumeration unreadable'}) end
    local entries=arr();local complete=true
    for index=1,math.min(total,1000) do
        local info=call(C_QuestLog.GetInfo,index)
        if not info then complete=false
        elseif field(info,'isHeader')~=true then
            local id,name=field(info,'questID'),field(info,'title')
            if type(id)=='number' and id>0 and type(name)=='string' then
                local objectives=arr(); local raw=call(C_QuestLog.GetQuestObjectives,id);local objectiveCoverage='unavailable'
                if type(raw)=='table' then
                    objectiveCoverage=#raw>0 and 'observed' or 'unknown'
                    for _,o in ipairs(raw) do
                        local text=field(o,'text')
                        if type(text)=='string' then objectives[#objectives+1]={text=text,type=n(field(o,'type')),current=n(field(o,'numFulfilled')),required=n(field(o,'numRequired')),complete=n(field(o,'finished')),countEvidence='api_fields'}
                        else objectiveCoverage='partial' end
                    end
                end
                local level=field(info,'level');if level==0 then level=nil end
                entries[#entries+1]={id=id,name=name,level=n(level),zone=N,objectivesComplete=n(call(C_QuestLog.IsComplete,id)),
                    turnedIn='unknown',objectives=objectives,objectivesCoverage=objectiveCoverage,classification=n(field(info,'frequency') and tostring(field(info,'frequency'))),
                    canAbandon=n(call(C_QuestLog.CanAbandonQuest,id)),rewards=arr(),rewardsCoverage='not_observed'}
            else complete=false end
        end
    end
    if total>1000 or used==nil or used~=#entries then complete=false end
    return obs('quests',{entries=entries,used=n(used),capacity=n(call(C_QuestLog.GetMaxNumQuestsCanAccept)),enumerationComplete=complete},complete and 'observed' or 'partial',{'Objectives complete is separate from turn-in. Hidden/filtered entries may not enumerate.'})
end
local function collectHistory()
    local entries=arr(); for _,e in ipairs(state.events) do entries[#entries+1]=e end
    local ids=call(C_QuestLog and C_QuestLog.GetAllCompletedQuestIDs)
    if type(ids)=='table' then
        for _,id in ipairs(ids) do if type(plain(id))=='number' then entries[#entries+1]={id=id,kind='completion_flag',at=N,evidence='C_QuestLog.GetAllCompletedQuestIDs; no turn-in time or repeatable occurrence implied'} end end
    end
    return obs('quest_history',{entries=entries},'partial',{'Completion flags plus this session events; absence means unknown. Repeatable quest occurrences are not reconciled.'})
end
local function collectEquipment()
    if type(GetInventoryItemID)~='function' then return obs('equipment',nil,'unavailable') end
    local items=arr();local complete=true
    for slot=1,19 do
        local readable,id=checked(GetInventoryItemID,'player',slot)
        if not readable then complete=false end
        if type(id)=='number' then local i=item(id,call(GetInventoryItemLink,'player',slot),nil,slot,1,nil,nil);items[#items+1]=i;if i.name==N then complete=false end end
    end
    return obs('equipment',{items=items},complete and 'observed' or 'partial',{'Binding may be unknown. Item links preserve bonus/enchantment data; empty slots are not individual rows.'})
end
local function containers(ids,domain,open)
    if not C_Container or not C_Container.GetContainerItemInfo then return obs(domain,nil,'unavailable') end
    local items=arr();local complete=true
    for _,bag in ipairs(ids) do
        local readable,size=checked(C_Container.GetContainerNumSlots,bag)
        if not readable then complete=false end
        if type(size)~='number' then complete=false;size=0 end
        for slot=1,math.min(size,200) do
            local idReadable,id=checked(C_Container.GetContainerItemID,bag,slot)
            local infoReadable,info=checked(C_Container.GetContainerItemInfo,bag,slot)
            if not idReadable or not infoReadable then complete=false end
            if type(id)=='number' or field(info,'itemID') then
                id=id or field(info,'itemID');local i=item(id,field(info,'hyperlink'),bag,slot,field(info,'stackCount'),field(info,'isBound'),field(info,'quality'))
                items[#items+1]=i;if i.quantity==N or i.name==N then complete=false end
            elseif info then complete=false end
        end
        if size>200 then complete=false end
    end
    local payload={items=items};if domain~='bags' then payload.open=open end
    return obs(domain,payload,complete and 'observed' or 'partial')
end
local function collectBags()
    local ids={0,1,2,3,4}; if state.identity.gameVersion=='retail' and NUM_TOTAL_EQUIPPED_BAG_SLOTS then ids={};for i=0,NUM_TOTAL_EQUIPPED_BAG_SLOTS do ids[#ids+1]=i end end
    return containers(ids,'bags')
end
local function collectTalents()
    local entries=arr();local unspent=call(GetUnspentTalentPoints)
    if C_Traits and C_SpecializationInfo then
        local group=call(C_SpecializationInfo.GetActiveSpecGroup)
        local config=group and call(C_SpecializationInfo.GetCombatConfigIDForSpecGroup,group)
        if not config or call(C_Traits.ConfigHasStagedChanges,config)~=false then return obs('talents',nil,'unavailable',{'Trait config missing or has uncommitted changes'}) end
        local trees=field(call(C_Traits.GetConfigInfo,config),'treeIDs');if type(trees)~='table' then return obs('talents',nil,'unavailable') end
        local complete=true
        for _,tree in ipairs(trees) do
            local nodes=call(C_Traits.GetTreeNodes,plain(tree));if type(nodes)~='table' then complete=false;nodes={} end
            for _,node in ipairs(nodes) do
                local info=call(C_Traits.GetNodeInfo,config,plain(node));local active=field(info,'activeEntry');local rank=field(active,'rank');local entryId=field(active,'entryID')
                if not info then complete=false end
                if type(rank)=='number' and rank>0 and entryId then
                    local definition=field(call(C_Traits.GetEntryInfo,config,entryId),'definitionID')
                    local spell=definition and field(call(C_Traits.GetDefinitionInfo,definition),'spellID')
                    local name=spell and field(call(C_Spell and C_Spell.GetSpellInfo,spell),'name')
                    if name then entries[#entries+1]={id=spell,name=name,rank=rank,maxRank=n(field(info,'maxRanks')),tree=tostring(tree)} else complete=false end
                end
            end
        end
        return obs('talents',{entries=entries,unspent=n(unspent),specialization=N},'partial',{'Trait ranks observed; unspent points and named specialization may be unavailable.'})
    end
    local tabs=call(GetNumTalentTabs);if type(tabs)~='number' then return obs('talents',nil,'unavailable') end
    for tab=1,tabs do
        local tree=call(GetTalentTabInfo,tab);local count=call(GetNumTalents,tab) or 0
        for index=1,count do
            local name,_,_,_,rank,maxRank=call(GetTalentInfo,tab,index)
            local link=call(GetTalentLink,tab,index);local id=type(link)=='string' and tonumber(link:match('talent:(%d+)'))
            if id and name and rank and rank>0 then entries[#entries+1]={id=id,name=name,rank=rank,maxRank=n(maxRank),tree=n(tree)} end
        end
    end
    return obs('talents',{entries=entries,unspent=n(unspent),specialization=N},'partial',{'Legacy talent IDs are talent IDs, not spell IDs.'})
end
local function collectSpells()
    if not C_SpellBook or not Enum or not Enum.SpellBookSpellBank then return obs('spells',nil,'unavailable') end
    local count=call(C_SpellBook.GetNumSpellBookSkillLines);if not count then return obs('spells',nil,'unavailable') end
    local entries=arr();local seen={};local complete=true
    for line=1,count do
        local info=call(C_SpellBook.GetSpellBookSkillLineInfo,line);local offset=field(info,'itemIndexOffset');local num=field(info,'numSpellBookItems')
        if offset and num then for index=offset+1,offset+num do
            local s=call(C_SpellBook.GetSpellBookItemInfo,index,Enum.SpellBookSpellBank.Player)
            local id=field(s,'spellID');local name=id and field(call(C_Spell and C_Spell.GetSpellInfo,id),'name')
            if field(s,'itemType')==Enum.SpellBookItemType.Spell and id and name and not seen[id] then
                local _,rank=call(C_SpellBook.GetSpellBookItemName,index,Enum.SpellBookSpellBank.Player);entries[#entries+1]={id=id,name=name,rank=n(rank)};seen[id]=true
            elseif not s then complete=false end
        end else complete=false end
    end
    return obs('spells',{entries=entries},complete and 'observed' or 'partial',{'Player spellbook only; pet abilities not collected.'})
end
local function collectStats()
    local values={};local names={'strength','agility','stamina','intellect','spirit'}
    for i,name in ipairs(names) do local _,v=call(UnitStat,'player',i);if v then values[name]=v end end
    local _,armor=call(UnitArmor,'player');values.armor=armor;values.healthMax=call(UnitHealthMax,'player');values.manaMax=call(UnitPowerMax,'player',0)
    return obs('stats',{values=values},'partial',{'Primary attributes/resources; advanced combat stats not collected.'})
end
local function collectDungeons()
    local count=call(GetNumSavedInstances);if not count then return obs('dungeons',nil,'unavailable') end
    local entries=arr()
    for i=1,math.min(count,500) do local name,id,reset,_,locked,_,_,_,_,_,encounters,killed=call(GetSavedInstanceInfo,i)
        if name then entries[#entries+1]={name=name,id=n(id),locked=n(locked),resetSeconds=n(reset),encounters=n(encounters),completedEncounters=n(killed)} end
    end
    return obs('dungeons',{entries=entries},'partial',{'Client cached lockouts only; no inference about all-time normal dungeon completion.'})
end
local function collectTravel()
    return obs('travel',{hearthLocation=n(call(GetBindLocation)),flightNodes=arr(),hearthCooldownSeconds=N},'partial',{'Flight nodes and hearth cooldown not collected.'})
end
local readers={{'identity',collectIdentity},{'quests',collectQuests},{'quest_history',collectHistory},{'equipment',collectEquipment},{'bags',collectBags},{'talents',collectTalents},{'spells',collectSpells},{'stats',collectStats},{'dungeons',collectDungeons},{'travel',collectTravel}}
local function persist(snapshots)
    local ok,result=pcall(json,{schemaVersion=1,snapshots=arr(snapshots)})
    if not ok or #result>8*1024*1024 then state.errors[#state.errors+1]='serialization/size';return false end
    WoWCharacterIntelligenceExport=result;return true
end
local function capture()
    if not state.identity or state.leaving or call(InCombatLockdown)==true then return false end
    local observations=arr();state.errors={}
    for _,entry in ipairs(readers) do
        local ok,result=pcall(entry[2]);if ok and result then observations[#observations+1]=result else state.errors[#state.errors+1]=entry[1];observations[#observations+1]=obs(entry[1],nil,'unavailable',{'Collector failed; inspect /wci status'}) end
    end
    if state.bank then observations[#observations+1]=state.bank else observations[#observations+1]=obs('bank',nil,'not_observed',{'Open bank to capture it; offline bank is unknown.'}) end
    for _,domain in ipairs({'reagent_bank','account_bank','professions','reputations','achievements','currencies','collections'}) do
        observations[#observations+1]=obs(domain,nil,'not_observed',{'Not collected by addon 0.1.0; see coverage matrix.'})
    end
    local snapshot={schemaVersion=1,identity=state.identity,subject=state.subject,source='addon',sample=false,capturedAt=utc(),observations=observations}
    if not persist({snapshot}) then return false end
    state.snapshot=snapshot;state.exportedRevision=state.eventRevision;state.last=snapshot.capturedAt;return true
end
local function saveOnLogout()
    state.leaving=true
    if state.eventRevision<=state.exportedRevision then return end
    local snapshots={};if state.snapshot then snapshots[1]=state.snapshot end
    local events=arr();for _,event in ipairs(state.events) do events[#events+1]=event end
    snapshots[#snapshots+1]={schemaVersion=1,identity=state.identity,subject=state.subject,source='addon',sample=false,capturedAt=utc(),observations=arr({
        {domain='quest_history',payload={entries=events},coverage='partial',basis='direct',observedAt=events[#events].at,
         notes=arr({'Pending session events flushed from memory at logout; no live game APIs scanned.'})}
    })}
    if persist(snapshots) then state.exportedRevision=state.eventRevision end
end
local function schedule()
    if state.pending then return end;state.pending=true
    C_Timer.After(3,function()state.pending=false;capture()end)
end
local f=CreateFrame('Frame')
for _,event in ipairs({'PLAYER_LOGIN','PLAYER_LOGOUT','PLAYER_LEAVING_WORLD','PLAYER_ENTERING_WORLD','PLAYER_REGEN_ENABLED','PLAYER_LEVEL_UP','PLAYER_XP_UPDATE','PLAYER_MONEY','QUEST_LOG_UPDATE','QUEST_ACCEPTED','QUEST_TURNED_IN','QUEST_REMOVED','BAG_UPDATE_DELAYED','PLAYER_EQUIPMENT_CHANGED','TRAIT_CONFIG_UPDATED','PLAYER_TALENT_UPDATE','SPELLS_CHANGED','BANKFRAME_OPENED','BANKFRAME_CLOSED'}) do pcall(f.RegisterEvent,f,event) end
f:SetScript('OnEvent',function(_,event,a,b)
    if event=='PLAYER_LOGIN' then
        local name=call(UnitName,'player');local realm=call(GetRealmName)
        local matches=0
        for _,mapping in ipairs(WoWCIIdentities or {}) do if mapping.playerName==name and mapping.realm and mapping.realm==realm then state.identity=mapping.identity;matches=matches+1 end end
        if matches~=1 then state.identity=nil end
        if not state.identity then print('WoW Character Intelligence: no matching configured identity; collection disabled.');return end
        state.subject={playerName=name,realm=realm}
    end
    if not state.identity then return end
    if event=='PLAYER_LOGOUT' then saveOnLogout();return end
    if event=='PLAYER_LEAVING_WORLD' then state.leaving=true;return end
    if event=='PLAYER_ENTERING_WORLD' then state.leaving=false end
    if event=='QUEST_TURNED_IN' or event=='QUEST_REMOVED' or event=='QUEST_ACCEPTED' then
        local id=plain(event=='QUEST_ACCEPTED' and b or a)
        if type(id)=='number' and id>0 then
            local kind=event=='QUEST_TURNED_IN' and 'turned_in' or event=='QUEST_ACCEPTED' and 'accepted' or 'removed_unknown'
            state.events[#state.events+1]={id=id,kind=kind,at=utc(),evidence=event}
            state.eventRevision=state.eventRevision+1
            if #state.events>2000 then table.remove(state.events,1) end
        end
    end
    if event=='BANKFRAME_OPENED' and call(InCombatLockdown)~=true then
        -- Forever/classic bank IDs only. Retail bank APIs differ and are deliberately unclaimed.
        if state.identity.gameVersion~='retail' then
            local ok,result=pcall(containers,{-1,5,6,7,8,9,10,11},'bank',true);if ok then state.bank=result end
        end
    elseif event=='BANKFRAME_CLOSED' and state.bank then state.bank.payload.open=false end
    schedule()
end)
SLASH_WOWCHARACTERINTELLIGENCE1='/wci'
SlashCmdList.WOWCHARACTERINTELLIGENCE=function(msg)
    if msg=='capture' then print(capture() and 'Snapshot captured in memory. /reload or logout to persist.' or 'Capture deferred/unavailable. Leave combat and check configuration.')
    else
        print('WoW Character Intelligence 0.1.0 | last memory capture: '..(state.last or 'none')..' | disk saves only on reload/logout.')
        for domain,coverage in pairs(state.coverage) do print(domain..': '..coverage) end
        if #state.errors>0 then print('Unavailable collectors: '..table.concat(state.errors,', ')) end
    end
end
