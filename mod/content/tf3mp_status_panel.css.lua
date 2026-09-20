local ssu = require "::/gui/main/stylesheetutil.lua"

function data()
  local result = {}
  local add = ssu.makeAdder(result)

  add("R::Tf3MpStatusPanel", {
    gravity = { 0.5, 0.5 },
  })

  add("R::Tf3MpStatusPanel BoxLayout", {
    innerSpacing = { 8, 0 },
    outerSpacing = { 14, 0 },
  })

  add("!tf3mp-company-panel", {
    padding = { 28, 28, 28, 28 },
  })
  add("!tf3mp-company-panel BoxLayout", {
    innerSpacing = { 0, 12 },
  })
  add("R::TalCoDepotTools Button!tf3mp-company-entry", {
    padding = { 0, 6, 0, 6 },
    margin = { 0, 0, 0, 0 },
    minSize = { 0, 0 },
    size = { -1, 20 },
    gravity = { 0.5, 0.5 },
  })
  add("R::TalCoDepotTools Button!tf3mp-company-entry TextView", {
    fontSize = 14,
    padding = { 0, 0, 0, 0 },
    margin = { 0, 0, 0, 0 },
  })
  return result
end
