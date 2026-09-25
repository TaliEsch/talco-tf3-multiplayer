-- Decode the bounded scalar coordination envelope for a TF3 road Stop.
-- This only reconstructs data. It never prepares or submits a command.
local M = {}
local MODEL = "::/stations/street/small_stops/small_mid.mdl"
local function fail() error("invalid road Stop wire", 0) end
local function entity(v)
  return type(v) == "number" and v == math.floor(v) and v > 0 and v <= 2147483647
end
local function decode(value)
  if type(value) ~= "table" or not entity(value.entity)
    or not entity(value.companyEntity) or type(value.left) ~= "boolean"
    or type(value.oneWay) ~= "boolean" or type(value.paramText) ~= "string"
    or #value.paramText > 128 or not value.paramText:match("^[0-9e%.%-]+$") then fail() end
  local param = tonumber(value.paramText)
  if type(param) ~= "number" or param ~= param or param < 0 or param > 1 then fail() end
  local count = value.nameChunkCount
  if type(count) ~= "number" or count ~= math.floor(count) or count < 0 or count > 16 then fail() end
  local bytes = {}
  for index = 1, count do
    local chunk = value["nameChunk" .. index]
    if type(chunk) ~= "string" or #chunk < 2 or #chunk > 128 or #chunk % 2 ~= 0
      or index < count and #chunk ~= 128 or not chunk:match("^[0-9a-f]+$") then fail() end
    for offset = 1, #chunk, 2 do
      local byte = tonumber(chunk:sub(offset, offset + 1), 16)
      if byte == nil or byte == 0 then fail() end
      bytes[#bytes + 1] = string.char(byte)
    end
  end
  if value["nameChunk" .. (count + 1)] ~= nil or #bytes > 1024 then fail() end
  local name = table.concat(bytes)
  return {edgeEntity=value.entity, companyEntity=value.companyEntity,
    param=param, left=value.left, oneWay=value.oneWay, model=MODEL, name=name}
end
function M.decode(value)
  local ok, result = pcall(decode, value)
  if ok then return result end
  return nil
end
return M
