-- Process-local closure shared through TF3's per-VM module cache. Nothing here
-- is persisted or grants Loan authority; native rechecks and consumes each arm.
local consumer = nil
local dueConsumer = nil

local function install(fn)
  if type(fn) ~= "function" then error("LOAN_NATIVE_CONSUMER_REQUIRED") end
  if consumer ~= nil and consumer ~= fn then
    error("LOAN_NATIVE_CONSUMER_REPLACEMENT_DENIED")
  end
  consumer = fn
  return true
end

local function consume(...)
  if consumer == nil then return false end
  return consumer(...)
end

-- Independent read-only due probe. A false result is expected while native
-- servicing remains inert; registration never replaces the resume consumer.
local function installDue(fn)
  if type(fn) ~= "function" then error("LOAN_NATIVE_DUE_CONSUMER_REQUIRED") end
  if dueConsumer ~= nil and dueConsumer ~= fn then
    error("LOAN_NATIVE_DUE_CONSUMER_REPLACEMENT_DENIED")
  end
  dueConsumer = fn
  return true
end

local function consumeDue(...)
  if dueConsumer == nil then return false, false end
  return dueConsumer(...), true
end

return { install = install, consume = consume,
  installDue = installDue, consumeDue = consumeDue }
