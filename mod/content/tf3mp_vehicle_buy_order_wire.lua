-- Scalar intent for one Host-ordered road-vehicle purchase. The depot entity
-- is the VEHICLE_DEPOT child, never its parent construction.
local M = {}
local function entity(value)
  return type(value) == "number" and value == math.floor(value)
    and value > 0 and value <= 2147483647
end
function M.decode(request)
  if type(request) ~= "table" or not entity(request.companyEntity)
    or not entity(request.entity) or type(request.model) ~= "string"
    or #request.model < 5 or #request.model > 256
    or request.model:find("..",1,true)
    or not request.model:match("^[A-Za-z0-9_.:/%-]+%.mdl$") then return nil end
  return {companyEntity=request.companyEntity,depotEntity=request.entity,
    model=request.model}
end
return M
