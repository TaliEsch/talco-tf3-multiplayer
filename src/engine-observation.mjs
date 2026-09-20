import { parseFlatDataFile } from "./userdata-ipc.mjs";

const uint = n => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647;
export function parseEngineObservation(source, nonce) {
  const p = parseFlatDataFile(source);
  if (Object.keys(p).sort().join(",") !== "balance,balanceKnown,balanceNegative,companyEntity,counter,kind,nonce,schemaVersion,speedup,tickCount,updateCount"
      || p.schemaVersion !== 1 || p.kind !== "engine_observation" || p.nonce !== nonce || !/^[0-9a-f]{32}$/.test(p.nonce)
      || ![p.companyEntity, p.counter, p.tickCount, p.updateCount, p.speedup].every(uint)
      || ![0, 1].includes(p.balanceKnown) || ![0, 1].includes(p.balanceNegative) || !Number.isSafeInteger(p.balance) || p.balance < 0
      || (p.balance === 0 && p.balanceNegative !== 0)
      || (p.balanceKnown === 0 && p.balance !== 0)) throw new TypeError("invalid engine observation");
  return p;
}

// Passive, partial GUI observations, NOT a canonical checkpoint or pause lock.
export class EngineObservationMonitor {
  #last = null;
  #pause = null;
  #pausedObserved = false;
  #fault = null;
  #received = null;
  constructor({ nonce, logger = () => {}, now = Date.now, stableMs = 1500, staleMs = 5000 }) {
    if (!/^[0-9a-f]{32}$/.test(nonce) || !Number.isSafeInteger(stableMs) || stableMs < 1
        || !Number.isSafeInteger(staleMs) || staleMs <= stableMs) throw new TypeError("invalid observation options");
    this.nonce = nonce; this.logger = logger; this.now = now; this.stableMs = stableMs; this.staleMs = staleMs;
  }
  get status() {
    return { available: this.#received !== null && this.now() - this.#received < this.staleMs && !this.#fault,
      fault: this.#fault, sample: this.#last ? { ...this.#last } : null, gameplayVerified: false };
  }
  #emit(event, sample, code) { this.logger({ level: code ? "warn" : "info", event, ...(code ? { code } : {}),
    updateCount: sample.updateCount, tickCount: sample.tickCount, speedup: sample.speedup, companyEntity: sample.companyEntity, gameplayVerified: false }); }
  accept(source) {
    const p = parseEngineObservation(source, this.nonce);
    if (this.#fault) return false;
    const previous = this.#last;
    if (previous && p.counter <= previous.counter) {
      // A single local outbox has one writer. A lower counter is a restarted
      // producer (or a stale overwrite), not permission to wait for catch-up.
      // An identical read is harmless but must never refresh freshness.
      const changed=Object.keys(p).some(key=>p[key]!==previous[key]);
      if(p.counter<previous.counter || changed) {
        this.#fault=p.counter<previous.counter ? "OBSERVATION_PRODUCER_RESET" : "OBSERVATION_COUNTER_CONFLICT";
        this.#emit("engine_observation_invalidated",p,this.#fault);
      }
      return false;
    }
    if (previous && (p.tickCount < previous.tickCount || p.updateCount < previous.updateCount || p.companyEntity !== previous.companyEntity)) {
      this.#fault = "CLOCK_OR_COMPANY_CHANGED"; this.#emit("engine_observation_invalidated", p, this.#fault); return false;
    }
    if (this.#received !== null && this.now() - this.#received >= this.staleMs) { this.#pause = null; this.#pausedObserved = false; }
    if (!previous) this.#emit("engine_observation_connected", p);
    if (p.speedup === 0) {
      if (!this.#pause) this.#pause = { update: p.updateCount, tick: p.tickCount, since: this.now() };
      else if (p.updateCount !== this.#pause.update) {
        this.#emit("engine_pause_observation_unstable", p, "UPDATES_ADVANCED_WHILE_PAUSED");
        this.#pause = { update: p.updateCount, tick: p.tickCount, since: this.now() }; this.#pausedObserved = false;
      } else if (!this.#pausedObserved && p.tickCount > this.#pause.tick && this.now() - this.#pause.since >= this.stableMs) {
        this.#pausedObserved = true; this.#emit("engine_pause_observed", p);
      }
    } else {
      if (this.#pausedObserved && this.#pause && p.updateCount > this.#pause.update) {
        this.#emit("engine_resume_observed", p); this.#pausedObserved = false; this.#pause = null;
      } else if (!this.#pausedObserved) this.#pause = null;
    }
    this.#last = { ...p }; this.#received = this.now(); return true;
  }
}
