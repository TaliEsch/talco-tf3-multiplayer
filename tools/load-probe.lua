-- Read-only qualification probe for TF3's own --script startup route.
-- No save, configuration, or gameplay mutations are performed.
print("TF3MP_LOAD_PROBE chunk app=" .. type(app) .. " api=" .. type(api))
local seenUpdate = false
local function probeUpdate(...)
  if not seenUpdate then
    seenUpdate = true
    print("TF3MP_LOAD_PROBE update argc=" .. select("#", ...))
    if app then
      print("TF3MP_LOAD_PROBE loadGame=" .. type(app.loadGame)
        .. " findAllSavegames=" .. type(app.findAllSavegames))
    end
  end
end
local function probeEvent(...)
  local values = {}
  for i = 1, select("#", ...) do values[i] = tostring(select(i, ...)) end
  print("TF3MP_LOAD_PROBE event " .. table.concat(values, " | "))
end
function data()
  return { update = probeUpdate, handleEvent = probeEvent }
end
