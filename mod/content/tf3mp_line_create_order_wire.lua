-- Bounded scalar payload for one target-owned two-stop ROAD line.
-- entity is the first station, stationB is the second; neither is a group.
local M={}
local function entity(v)
  return type(v)=="number" and v==math.floor(v) and v>0 and v<=2147483647
end
function M.decode(request)
  if type(request)~="table" or not entity(request.companyEntity)
    or not entity(request.entity) or not entity(request.stationB)
    or request.entity==request.stationB then return nil end
  return {companyEntity=request.companyEntity,stationA=request.entity,
    stationB=request.stationB,lineName="TalCo disposable service"}
end
return M
