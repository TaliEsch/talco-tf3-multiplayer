-- Read-only GUI-side quote. Never constructs a proposal or sends a command.
local M = {}
local DEPOT = "::/depots/road/road_depot/road_depot.con"
local MAX = 9007199254740991
local function integer(n)
  return type(n)=="number" and n==n and n==math.floor(n) and n>=0 and n<=MAX
end
function M.inspect(request, gameApi)
  local result={schemaVersion=1,kind="funded_model_preflight_receipt",nonce=request.nonce,
    requestId=request.requestId,companyEntity=request.companyEntity,targetCompany=request.targetCompany,
    issuedUpdate=request.issuedUpdate,model=request.model,fundingAmount=request.fundingAmount,
    depotExact=0,modelExact=0,road=0,yearKnown=0,available=0,priceKnown=0,price=0,
    depotCostKnown=0,depotCost=0,code="UNKNOWN"}
  local ok=pcall(function()
    if type(request.model)~="string" or #request.model>256 then return end
    local depotId=gameApi.res.constructionRep.find(DEPOT)
    if not integer(depotId) or gameApi.res.constructionRep.getName(depotId)~=DEPOT then return end
    result.depotExact=1
    local modelId=gameApi.res.modelRep.find(request.model)
    if not integer(modelId) or gameApi.res.modelRep.getName(modelId)~=request.model then return end
    result.modelExact=1
    local model=gameApi.res.modelRep.get(modelId)
    local metadata=model and model.metadata
    local vehicle=metadata and metadata.transportVehicle
    if not vehicle or vehicle.carrier~=gameApi.type["enum"].Carrier.ROAD then return end
    result.road=1
    local price=metadata.cost and metadata.cost.price
    if not integer(price) or price<1 then return end
    result.priceKnown=1;result.price=price
    -- Compare only when both values are exposed as integral years. An absent
    -- endpoint (zero) is open-ended in the resource availability metadata.
    local availability=metadata.availability
    local year=gameApi.engine and gameApi.engine.util.getYear()
    if integer(year) and year>=1 and year<=9999 and availability
      and integer(availability.yearFrom) and integer(availability.yearTo)
      and availability.yearFrom<=9999 and availability.yearTo<=9999 then
      result.yearKnown=1
      if (availability.yearFrom==0 or year>=availability.yearFrom)
        and (availability.yearTo==0 or year<=availability.yearTo) then result.available=1 end
    end
    -- Resource metadata does not establish exact cost at this placement.
    -- Native construction still checks the target balance at execution.
    if result.yearKnown==1 and result.available==1 and price<=request.fundingAmount then
      result.code="READY"
    end
  end)
  if not ok then result.code="UNKNOWN" end
  return result
end
return M
