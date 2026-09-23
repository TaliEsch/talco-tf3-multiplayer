// A HostAuthority schedule must use the current game's observed update, not
// its zero-valued test default. NaN deliberately fails the coordinator and
// authority clock checks when the bridge is unavailable or stale.
export function liveHostUpdateCount(bridge) {
  const observation = bridge?.engineObservation;
  const update = observation?.sample?.updateCount;
  return bridge?.connected === true && observation?.available === true
    && Number.isSafeInteger(update) && update >= 0 && update <= 2147483647
    ? update : Number.NaN;
}
