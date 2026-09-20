import test from "node:test";
import assert from "node:assert/strict";
import { runLocalSessionTest } from "../src/local-session-test.mjs";

for (const players of [2, 4]) {
  test(`${players}-participant localhost session with synthetic engine models`, { timeout: 15000 }, async () => {
    const report = await runLocalSessionTest({ players });
    assert.equal(report.passed, true);
    assert.equal(report.players, players);
    assert.equal(report.gameSimulationTested, false);
    assert.equal(report.gameplayVerified, false);
    assert.ok(report.checks.includes("injected_model_divergence_detected"));
    assert.ok(report.checks.includes("every_participant_pulls_identical_synthetic_save"));
  });
}
