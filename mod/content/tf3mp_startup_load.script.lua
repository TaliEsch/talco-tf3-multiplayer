-- One-shot loader for a launcher-created disposable save copy. The request is
-- removed and verified absent before app.loadGame is called, so a failed or
-- uncertain load is never retried automatically.
local menuReady = false
local readyUpdates = 0
local attempted = false

local function exactRequest(value)
  if type(value) ~= "table" then return false end
  local expected = { schemaVersion = true, nonce = true, saveName = true, expectedBytes = true, expectedSha256 = true }
  local count = 0
  for key, _ in pairs(value) do
    if not expected[key] then return false end
    count = count + 1
  end
  return count == 5
    and value.schemaVersion == 1
    and type(value.nonce) == "string" and string.match(value.nonce, "^[a-f0-9]+$") and #value.nonce == 32
    and type(value.saveName) == "string" and string.match(value.saveName, "^tf3mp_disposable_[a-f0-9]+$") and #value.saveName == 49
    and type(value.expectedBytes) == "number" and value.expectedBytes >= 1 and value.expectedBytes % 1 == 0
    and type(value.expectedSha256) == "string" and string.match(value.expectedSha256, "^[a-f0-9]+$") and #value.expectedSha256 == 64
end

local function attemptLoad()
  if attempted then return end
  attempted = true
  local requestOk, request = pcall(app.loadUserdata, "tf3mp_status_1", "startup_load_request")
  if not requestOk or not exactRequest(request) then
    print("TF3MP_STARTUP_LOAD rejected=request")
    return
  end
  local namespace = app.SaveGameNamespace.getSavegame()
  local listOk, saves = pcall(app.findAllSavegames, namespace)
  if not listOk or type(saves) ~= "table" then
    print("TF3MP_STARTUP_LOAD rejected=enumeration")
    return
  end
  local selected = nil
  local matches = 0
  local scanned = 0
  local candidates = 0
  for _, info in pairs(saves) do
    scanned = scanned + 1
    if scanned > 4096 then
      print("TF3MP_STARTUP_LOAD rejected=enumeration_bound")
      return
    end
    local candidatePath = info.path
    if type(candidatePath) == "string" and string.find(candidatePath, request.saveName, 1, true) then
      candidates = candidates + 1
      local diagnosticPath = string.gsub(candidatePath, "\\", "/")
      local diagnosticName = request.saveName .. ".sav"
      print("TF3MP_STARTUP_LOAD candidate pathLength=" .. #diagnosticPath
        .. " exactRelative=" .. tostring(diagnosticPath == diagnosticName)
        .. " slashSuffix=" .. tostring(string.sub(diagnosticPath, -(#diagnosticName + 1)) == "/" .. diagnosticName)
        .. " saveNameType=" .. type(info.saveName)
        .. " sizeType=" .. type(info.size)
        .. " sizeMatch=" .. tostring(info.size == request.expectedBytes))
    end
    if type(info.path) == "string" and type(info.saveName) == "string" and #info.saveName >= 1 and #info.saveName <= 256
      and info.size == request.expectedBytes then
      local normalized = string.gsub(info.path, "\\", "/")
      local relativeName = request.saveName .. ".sav"
      local pathMatch = normalized == relativeName
        or string.sub(normalized, -(#relativeName + 1)) == "/" .. relativeName
      if pathMatch then
        selected = info
        matches = matches + 1
      end
    end
  end
  print("TF3MP_STARTUP_LOAD enumeration scanned=" .. scanned .. " candidates=" .. candidates .. " matches=" .. matches)
  if matches == 0 and candidates == 0 then
    -- Fresh launcher copies are not necessarily present in TF3's registered
    -- save index yet. The launcher created this exact random relative file with
    -- exclusive-create semantics and verified its size and SHA-256 first.
    -- SavegameId.path is a directory component, not a file name. For normal
    -- local saves the path is empty and saveGameName resolves below the
    -- savegame namespace. Using the file in both fields produces
    -- "name.sav/name.sav" in TF3.
    selected = { path = "", saveName = request.saveName }
    matches = 1
    print("TF3MP_STARTUP_LOAD source=verified_direct_copy")
  end
  if matches ~= 1 then
    print("TF3MP_STARTUP_LOAD rejected=unique_match")
    return
  end
  pcall(app.removeUserdata, "tf3mp_status_1", "startup_load_request")
  local listOk, userFiles = pcall(app.getAllUserdata, "tf3mp_status_1")
  local requestStillPresent = true
  if listOk and type(userFiles) == "table" then
    requestStillPresent = false
    for _, fileName in pairs(userFiles) do
      if fileName == "startup_load_request" or fileName == "startup_load_request.lua" then requestStillPresent = true end
    end
  end
  if requestStillPresent then
    print("TF3MP_STARTUP_LOAD rejected=request_not_removed")
    return
  end
  local id = api.type.SavegameId.new()
  id.path = selected.path
  id.saveGameName = selected.saveName
  id.saveGameNamespace = namespace
  print("TF3MP_STARTUP_LOAD accepted nonce=" .. request.nonce)
  local loadOk = pcall(app.loadGame, id, false)
  if not loadOk then print("TF3MP_STARTUP_LOAD outcome=unknown") end
end

local function protectedAttempt()
  local ok = pcall(attemptLoad)
  if not ok then print("TF3MP_STARTUP_LOAD rejected=protected_exception") end
end

function data()
  return {
    update = function()
      if attempted or not menuReady then return end
      readyUpdates = readyUpdates + 1
      if readyUpdates < 2 then return end
      protectedAttempt()
    end,
    handleEvent = function(_, name)
      if name == "mainMenuReady" then menuReady = true end
    end,
  }
end
