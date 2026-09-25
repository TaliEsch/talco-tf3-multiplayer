-- Bounded scalars: entity is the vehicle; lineEntity is an existing line.
local M={}
local function entity(v)return type(v)=="number" and v==math.floor(v) and v>0 and v<=2147483647 end
function M.decode(request)
  if type(request)~="table" or not entity(request.companyEntity)
    or not entity(request.entity) or not entity(request.lineEntity)
    or request.entity==request.lineEntity then return nil end
  return {companyEntity=request.companyEntity,vehicleEntity=request.entity,lineEntity=request.lineEntity}
end
return M
