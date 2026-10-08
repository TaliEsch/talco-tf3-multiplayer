-- Central compatibility layer for the GUI and startup userdata namespace.
-- The legacy profile remains the only qualified profile. Prefix storage is
-- implemented for review but cannot be selected until its payload and request
-- retirement semantics qualify. An empty load is unavailable, not proof of absence.
local M = {}

local DIRECTORY = "tf3mp_status_1"
local PREFIX_DIRECTORY = "mod_presets"
local PREFIX = ".tf3mp_status_1__"
local LEGACY_PROFILE = "legacy"
local PREFIX_PROFILE = "prefix"
local PREFIX_PROFILE_QUALIFIED = false

local function validLogicalName(name)
  return type(name) == "string" and #name > 0 and #name <= 128
    and string.match(name, "^[A-Za-z0-9_%-]+$") ~= nil
end

local function checkDirectory(directory)
  assert(directory == DIRECTORY, "USERDATA_DIRECTORY_REJECTED")
end

local function checkName(name)
  assert(validLogicalName(name), "USERDATA_LOGICAL_NAME_REJECTED")
end

function M.new(profile)
  assert(profile == LEGACY_PROFILE or profile == PREFIX_PROFILE, "USERDATA_PROFILE_REJECTED")
  if profile == PREFIX_PROFILE then
    assert(PREFIX_PROFILE_QUALIFIED, "USERDATA_PREFIX_PROFILE_UNQUALIFIED")
  end

  local function physicalName(name)
    checkName(name)
    if profile == PREFIX_PROFILE then return PREFIX .. name end
    return name
  end
  local function physicalDirectory()
    if profile == PREFIX_PROFILE then return PREFIX_DIRECTORY end
    return DIRECTORY
  end

  local storage = { profile = profile }

  function storage.loadUserdata(directory, name)
    checkDirectory(directory)
    local fileName = physicalName(name)
    -- These pure-data publications are atomically replaced by the helper.
    -- A Windows open can briefly fail during replacement. Never retry action
    -- requests, return cached data, or accept an empty read as evidence.
    if profile ~= PREFIX_PROFILE or (name ~= "ack" and name ~= "bridge_inventory") then
      return app.loadUserdata(physicalDirectory(), fileName)
    end
    for attempt = 1, 3 do
      local ok, value = pcall(app.loadUserdata, physicalDirectory(), fileName)
      if ok then
        if type(value) ~= "table" or next(value) ~= nil or attempt == 3 then return value end
      else
        local transient = type(value) == "string"
          and string.find(value, "cannot open", 1, true) ~= nil
          and string.find(value, fileName .. ".lua", 1, true) ~= nil
          and string.find(value, "Permission denied", 1, true) ~= nil
        if not transient or attempt == 3 then error(value, 0) end
      end
    end
  end

  function storage.saveUserdata(directory, name, value)
    checkDirectory(directory)
    return app.saveUserdata(physicalDirectory(), physicalName(name), value)
  end

  function storage.removeUserdata(directory, name)
    checkDirectory(directory)
    return app.removeUserdata(physicalDirectory(), physicalName(name))
  end

  function storage.getAllUserdata(directory)
    checkDirectory(directory)
    if profile == LEGACY_PROFILE then return app.getAllUserdata(DIRECTORY) end
    error("USERDATA_PREFIX_LIST_UNQUALIFIED")
  end

  function storage.loadInventoryCatalog(directory, expectedNonce)
    checkDirectory(directory)
    assert(profile == PREFIX_PROFILE, "USERDATA_CATALOG_PREFIX_ONLY")
    assert(type(expectedNonce) == "string" and #expectedNonce == 32
      and string.match(expectedNonce, "^[0-9a-f]+$") ~= nil, "USERDATA_CATALOG_EXPECTED_NONCE_INVALID")
    local catalog = storage.loadUserdata(DIRECTORY, "bridge_inventory")
    assert(type(catalog) == "table", "USERDATA_CATALOG_INVALID")
    local headerFields = 0
    for key in pairs(catalog) do
      if key ~= "schemaVersion" and key ~= "nonce" and key ~= "names" then error("USERDATA_CATALOG_HEADER_INVALID") end
      headerFields = headerFields + 1
    end
    assert(headerFields == 3 and catalog.schemaVersion == 1 and catalog.nonce == expectedNonce
      and type(catalog.names) == "table", "USERDATA_CATALOG_HEADER_INVALID")
    local count = 0
    for name, available in pairs(catalog.names) do
      count = count + 1
      if count > 512 then error("USERDATA_CATALOG_LIMIT") end
      if type(name) ~= "string" or #name < 1 or #name > 128
        or string.match(name, "^[A-Za-z_][A-Za-z0-9_]*$") == nil or available ~= true then
        error("USERDATA_CATALOG_ENTRY_INVALID")
      end
    end
    return catalog.names
  end

  function storage.exists(directory, name)
    checkDirectory(directory)
    checkName(name)
    if profile == LEGACY_PROFILE then
      local entries = storage.getAllUserdata(DIRECTORY)
      assert(type(entries) == "table", "USERDATA_LIST_INVALID")
      for _, entry in ipairs(entries) do
        if entry == name or entry == name .. ".lua" then return true end
      end
      return false
    end

    local ok, value = pcall(storage.loadUserdata, DIRECTORY, name)
    if not ok then return nil, "load_error" end
    if type(value) ~= "table" then return nil, "invalid_payload" end
    if next(value) == nil then return false, "empty_unavailable" end
    return true, "payload_available"
  end

  return storage
end

M.legacyProfile = LEGACY_PROFILE
M.prefixProfile = PREFIX_PROFILE
M.defaultProfile = LEGACY_PROFILE

return M
