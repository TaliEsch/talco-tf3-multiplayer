local react = ug_require "::/gui/main/react.lua"
local builtin = ug_require "::/gui/main/builtin.lua"
local widgets = ug_require "::/gui/game_bar/game_bar_widgets.tl"
local gameGlobals = ug_require "::/gui/main/game_react_globals.tl"
local previewModule = ug_require "tf3mp_status_1::/tf3mp_depot_preview.script.lua"
local Preview = previewModule.registerRecipe()
local function exists(n) for _, f in ipairs(app.getAllUserdata("tf3mp_status_1")) do if f == n or f == n .. ".lua" then return true end end return false end
local function entity(n) return type(n)=="number" and n>0 and n<=2147483647 and n==math.floor(n) end
local function nonce(n) return type(n)=="string" and #n==32 and n:match("^[a-f0-9]+$") end
local function status(s) return s=="selecting" or s=="ready" or s=="running" or s=="complete" or s=="failed" end
local function construction(suffix, code)
  local found=nil
  for _, name in pairs(api.res.constructionRep.getAll()) do if name:match(suffix) then if found then error("AMBIGUOUS_"..code) end; found=name end end
  assert(found,code.."_NOT_FOUND"); return found
end
local function busModels()
  local models={}
  for _, name in pairs(api.res.modelRep.getAll()) do
    if name:match("/vehicle/bus/") then
      local model=api.res.modelRep.get(api.res.modelRep.find(name)); local meta=model and model.metadata and model.metadata.transportVehicle
      if meta and meta.carrier==api.type["enum"].Carrier.ROAD then
        assert(#models < 256, "TOO_MANY_ROAD_BUS_MODELS")
        models[#models+1]=name
      end
    end
  end
  table.sort(models)
  return models
end
local function copySetup(old)
  local next={model=old and old.model or nil}
  for _, key in ipairs({"depot","stationA","stationB"}) do
    local value=old and old[key]
    if value then next[key]={resource=value.resource,x=value.x,y=value.y,z=value.z,yaw=value.yaw,seed=value.seed} end
  end
  return next
end
local function restoredSetup(plan)
  return {model=plan.model,
    depot={resource=plan.depotResource,x=plan.depotX,y=plan.depotY,z=plan.depotZ,yaw=plan.depotYaw,seed=plan.depotSeed},
    stationA={resource=plan.stationAResource,x=plan.stationAX,y=plan.stationAY,z=plan.stationAZ,yaw=plan.stationAYaw,seed=plan.stationASeed},
    stationB={resource=plan.stationBResource,x=plan.stationBX,y=plan.stationBY,z=plan.stationBZ,yaw=plan.stationBYaw,seed=plan.stationBSeed}}
end
local function matchesPlan(plan, request)
  if not (type(plan)=="table" and plan.schemaVersion==1 and plan.kind=="phase2_plan"
    and plan.revision==1 and plan.nonce==request.nonce
    and plan.originalCompany==request.originalCompany and plan.targetCompany==request.targetCompany
    and plan.fundingAmount==1000000 and type(plan.model)=="string"
    and type(plan.depotResource)=="string" and type(plan.stationAResource)=="string" and type(plan.stationBResource)=="string"
    and plan.depotSeed==1 and plan.stationASeed==2 and plan.stationBSeed==3) then return false end
  local count=0
  for _ in pairs(plan) do count=count+1; if count>26 then return false end end
  if count~=26 then return false end
  for _, prefix in ipairs({"depot","stationA","stationB"}) do
    for _, suffix in ipairs({"X","Y","Z","Yaw"}) do
      local value=plan[prefix..suffix]
      local bound=suffix=="Yaw" and math.pi or (suffix=="Z" and 10000 or 100000)
      if type(value)~="number" or value~=value or math.abs(value)>bound then return false end
    end
  end
  return #plan.model<=256 and #plan.depotResource<=256 and #plan.stationAResource<=256 and #plan.stationBResource<=256
end
local Panel
-- Kept as builtin.Window wrapper: it has the managed-window recipe metadata.
Panel = react.RegisterWrapperRecipe("TalCoDepotToolsWindow", builtin.Window, function()
  local control=react.useState(nil); local placement=react.useState(nil); local setup=react.useState(nil)
  local message=react.useState("Point at empty ground near a road.\nThen click Preview last map position.\nRead-only: nothing will be built or charged.")
  local live=react.useRefLazy(function() return {frames=0,counter=-1,stale=0,serial=0,nonce="",config=nil,yaw=0,setupYaw={depot=0,stationA=0,stationB=0},pending=nil,submitted=false} end)
  react.onStep(function()
    local state=live:get()
    state.frames=state.frames+1; if state.frames%30~=0 then return end
    local ok, config=pcall(function()
      if not exists("bridge") or not exists("ack") then return nil end
      local bridge=app.loadUserdata("tf3mp_status_1","bridge"); local ack=app.loadUserdata("tf3mp_status_1","ack")
      local request=nil; if exists("phase2_setup") then request=app.loadUserdata("tf3mp_status_1","phase2_setup") end
      if request then
        if request.schemaVersion~=1 or request.kind~="phase2_setup" or not nonce(request.nonce) or not entity(request.originalCompany) or not entity(request.targetCompany) or request.originalCompany==request.targetCompany or not status(request.status) then return nil end
      elseif exists("depot_preview") then
        request=app.loadUserdata("tf3mp_status_1","depot_preview")
        if request.schemaVersion~=1 or not nonce(request.nonce) or not entity(request.originalCompany) or not entity(request.targetCompany) or request.originalCompany==request.targetCompany then return nil end
      else return nil end
      if (bridge.mode ~= "telemetry" and bridge.mode ~= "company_test") or request.nonce ~= bridge.nonce or request.nonce ~= ack.nonce or type(ack.counter) ~= "number" then return nil end
      if state.nonce~=request.nonce then state.nonce=request.nonce; state.counter=-1; state.stale=0; state.pending=nil; state.submitted=false; state.setupYaw={depot=0,stationA=0,stationB=0}; placement:set(nil); setup:set(nil) end
      state.stale=ack.counter > state.counter and 0 or state.stale+1; state.counter=ack.counter; if state.stale > 10 then return nil end
      return request
    end)
    if not ok or config==nil then
      if state.config then control:set(nil); placement:set(nil); setup:set(nil) end
      state.config=nil
      state.pending=nil
      return
    end
    if config.kind=="phase2_setup" and config.status~="selecting" then
      local loaded, restored=pcall(function()
        if not exists("phase2_plan") then return nil end
        local plan=app.loadUserdata("tf3mp_status_1","phase2_plan")
        if not matchesPlan(plan,config) then return nil end
        return restoredSetup(plan)
      end)
      if loaded and type(restored)=="table" then setup:set(restored) end
      state.submitted=true
      state.pending=nil
    end
    if not state.config or state.config.nonce~=config.nonce or state.config.status~=config.status then
      control:set(config)
      if config.kind=="phase2_setup" then
        local messages={selecting="Choose three clear points beside roads.\nUse a bus available in this save's year.",
          ready="Review and confirm setup in launcher; nothing built yet.",
          running="Setup is running once.\nLeave the game paused and wait for the launcher.",
          complete="Setup receipts verified.\nService operation is not yet tested.",
          failed="Setup stopped. Do not retry.\nInspect the launcher logs and any existing assets."}
        message:set(messages[config.status])
      end
    end
    state.config=config
    -- A click merely queues the proposal. It is consumed only after a fresh,
    -- correlated selecting config has been read in this callback.
    if state.pending and config.kind=="phase2_setup" and config.status=="selecting" and state.pending.nonce==config.nonce then
      local plan=state.pending; state.pending=nil
      local written=pcall(function() app.saveUserdata("tf3mp_status_1","phase2_plan",plan) end)
      if written then state.submitted=true; message:set("Review and confirm setup in launcher; nothing built yet.") else message:set("Plan could not be sent to launcher. Nothing was built.") end
    end
  end)
  -- Original preview mode remains untouched in behavior and remains read-only.
  local function selectPosition()
    local state=live:get(); if not state.config then return end
    local ok=pcall(function() local resource=construction("/road/road_depot/road_depot%.con$","DEPOT"); local p=api.gui.mouse.getTerrainPosition(); assert(p,"POINT_AT_MAP_FIRST"); state.serial=state.serial+1; placement:set({placementId=state.serial,originalCompany=state.config.originalCompany,targetCompany=state.config.targetCompany,resource=resource,x=p.x,y=p.y,z=p.z,yaw=state.yaw}); message:set("Read-only preview.\nNo build or funding action is enabled.") end)
    if not ok then placement:set(nil); message:set("Cannot prepare preview. Point at ground first.\nThe stock road depot must be installed.") end
  end
  local function rotate()
    local state=live:get(); if not state.config then return end; state.yaw=state.yaw+math.pi/2; if state.yaw>math.pi then state.yaw=state.yaw-2*math.pi end
    local old=placement:old(); if old then local next={}; for k,v in pairs(old) do next[k]=v end; state.serial=state.serial+1; next.yaw=state.yaw; next.placementId=state.serial; placement:set(next) end
  end
  local function point(key,suffix,code,seed)
    local state=live:get()
    if not state.config or state.config.kind~="phase2_setup" or state.config.status~="selecting" or state.submitted or state.pending then return end
    local ok=pcall(function()
      local p=api.gui.mouse.getTerrainPosition(); assert(p,"POINT_AT_MAP_FIRST")
      local next=copySetup(setup:old())
      next[key]={resource=construction(suffix,code),x=p.x,y=p.y,z=p.z,yaw=state.setupYaw[key],seed=seed}
      setup:set(next)
      message:set("Selected "..key..".\nChoose remaining points and a bus, then submit.")
    end)
    if not ok then message:set("Cannot select "..key..". Point at ground; the required stock construction must be uniquely installed.") end
  end
  local function rotateSetup(key)
    local state=live:get()
    if not state.config or state.config.kind~="phase2_setup" or state.config.status~="selecting" or state.submitted or state.pending then return end
    state.setupYaw[key]=state.setupYaw[key]+math.pi/2
    if state.setupYaw[key]>math.pi then state.setupYaw[key]=state.setupYaw[key]-2*math.pi end
    local next=copySetup(setup:old())
    if next[key] then next[key].yaw=state.setupYaw[key]; setup:set(next) end
  end
  local function cycleModel()
    local state=live:get()
    if not state.config or state.config.kind~="phase2_setup" or state.config.status~="selecting" or state.submitted or state.pending then return end
    local ok=pcall(function()
      local models=busModels(); assert(#models>0,"NO_ROAD_BUS_MODELS")
      local next=copySetup(setup:old()); local index=0
      for i,n in ipairs(models) do if n==next.model then index=i end end
      next.model=models[index%#models+1]; setup:set(next); message:set("Bus selected. Check its displayed name.\nUse a model available in this save's year.")
    end)
    if not ok then message:set("No eligible road bus model was found. Nothing was built.") end
  end
  local function submit()
    local state=live:get(); local s=setup:old(); if not state.config or state.config.kind~="phase2_setup" or state.config.status~="selecting" or state.submitted or state.pending then return end
    if not(s and s.depot and s.stationA and s.stationB and s.model) then message:set("Select depot, station A, station B, and a road bus model first."); return end
    state.pending={schemaVersion=1,kind="phase2_plan",nonce=state.config.nonce,revision=1,originalCompany=state.config.originalCompany,targetCompany=state.config.targetCompany,fundingAmount=1000000,model=s.model,depotResource=s.depot.resource,depotX=s.depot.x,depotY=s.depot.y,depotZ=s.depot.z,depotYaw=s.depot.yaw,depotSeed=1,stationAResource=s.stationA.resource,stationAX=s.stationA.x,stationAY=s.stationA.y,stationAZ=s.stationA.z,stationAYaw=s.stationA.yaw,stationASeed=2,stationBResource=s.stationB.resource,stationBX=s.stationB.x,stationBY=s.stationB.y,stationBZ=s.stationB.z,stationBYaw=s.stationB.yaw,stationBSeed=3}
    message:set("Submitting read-only setup plan to launcher…")
  end
  local children
  if control:old() and control:old().kind=="phase2_setup" then
    local s=setup:old() or {}; local frozen=live:get().submitted
    local function details(label,value)
      if not value then return label..": not selected" end
      return label..": ("..string.format("%.1f",value.x)..", "..string.format("%.1f",value.y)..", "..string.format("%.1f",value.z)..") yaw "..string.format("%.2f",value.yaw)
    end
    local function shortName(name)
      return name and name:match("([^/]+)$") or "not selected"
    end
    local function pointRow(label,key,suffix,code,seed)
      return builtin.BoxLayout{orientation=builtin.type.Orientation.Horizontal,children={
        builtin.Button{content=builtin.BoxLayout{children={builtin.TextView{text="Select "..label}}},onClick=function() point(key,suffix,code,seed) end},
        builtin.Button{content=builtin.BoxLayout{children={builtin.TextView{text="Rotate 90°"}}},onClick=function() rotateSetup(key) end},
        builtin.TextView{text=details(label,s[key])},
      }}
    end
    children={
      builtin.TextView{text="Phase 2 setup selection (read-only). Funding: 1000000.\nStatus: "..control:old().status.." (setup is not service verified)."},
      pointRow("depot point","depot","/road/road_depot/road_depot%.con$","DEPOT",1),
      pointRow("station A point","stationA","/street/modular_street_station/modular_terminal%.con$","STATION",2),
      pointRow("station B point","stationB","/street/modular_street_station/modular_terminal%.con$","STATION",3),
      builtin.BoxLayout{orientation=builtin.type.Orientation.Horizontal,children={
        builtin.Button{content=builtin.BoxLayout{children={builtin.TextView{text="Cycle road bus model"}}},onClick=cycleModel},
        builtin.TextView{text="Road bus model: "..shortName(s.model)},
      }},
      builtin.TextView{text=message:old()},
      builtin.Button{content=builtin.BoxLayout{children={builtin.TextView{text=frozen and "Plan submitted (editing frozen)" or "Submit plan to launcher (read-only)"}}},onClick=submit},
      builtin.TextView{text="Station placement is point selection only.\nThis window does not build or show station previews.\nExecution results appear in the launcher."},
    }
  elseif control:old() then
    children={builtin.TextView{text=message:old()},builtin.Button{content=builtin.BoxLayout{children={builtin.TextView{text="Preview last map position"}}},onClick=selectPosition},builtin.Button{content=builtin.BoxLayout{children={builtin.TextView{text="Rotate 90 degrees"}}},onClick=rotate},builtin.Button{content=builtin.BoxLayout{children={builtin.TextView{text="Clear preview"}}},onClick=function() placement:set(nil) end}}
    if placement:old() then children[#children+1]=Preview(placement:old()) end
  else children={builtin.TextView{text="Enable Phase 2: depot preview in launcher Debug.\nA fresh solo host and existing test company are required."}} end
  local title="TalCo — Depot preview (read-only)"
  if control:old() and control:old().kind=="phase2_setup" then title="TalCo — Company setup (read-only)" end
  return builtin.Window{title=title,id="tf3mp-depot-tools",closable=true,movable=true,initialX=60,initialY=120,onClose=function() local windows=gameGlobals.getDefaultWindowApi(); if windows then windows.removeAllWindows(Panel) end end,content=builtin.Component{meta={class="tf3mp-company-panel"},layout=builtin.BoxLayout{orientation=builtin.type.Orientation.Vertical,children=children}}}
end)
local Tools = react.RegisterPluginRecipe(widgets.GameBarInfoDisplayExtension, "TalCoDepotTools", function() return builtin.BoxLayout{orientation=builtin.type.Orientation.Horizontal,children={builtin.Button{meta={class="tf3mp-company-entry"},content=builtin.BoxLayout{children={builtin.TextView{text="Company tools"}}},onClick=function() local windows=gameGlobals.getDefaultWindowApi(); if windows then windows.addSingletonWindow(Panel,{}) end end}}} end)
function data()
  return {TalCoDepotTools=Tools}
end
