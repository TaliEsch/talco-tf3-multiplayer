-- Bounded scalar envelope for a stock road depot intent. Data reconstruction
-- only; no native command is prepared or submitted by this module.
local M = {}
local RESOURCE = "::/depots/road/road_depot/road_depot.con"
local function integer(v)
  return type(v) == "number" and v == math.floor(v) and v >= 0 and v <= 2147483647
end
local function numberText(text, bound)
  if type(text) ~= "string" or #text < 1 or #text > 128
    or not text:match("^%-?[0-9%.e%-]+$") then return nil end
  local value = tonumber(text)
  if type(value) ~= "number" or value ~= value or math.abs(value) > bound
    or value == 0 and text:sub(1,1) == "-" then return nil end
  return value
end
function M.decode(wire)
  if type(wire) ~= "table" or not integer(wire.companyEntity) or wire.companyEntity == 0
    or not integer(wire.entity) or wire.entity ~= 0
    or not integer(wire.seed) or wire.seed == 0 then return nil end
  local x = numberText(wire.xText,100000)
  local y = numberText(wire.yText,100000)
  local z = numberText(wire.zText,10000)
  local yaw = numberText(wire.yawText,math.pi+0.000001)
  if x == nil or y == nil or z == nil or yaw == nil then return nil end
  return {companyEntity=wire.companyEntity,resource=RESOURCE,
    x=x,y=y,z=z,yaw=yaw,seed=wire.seed}
end
return M
