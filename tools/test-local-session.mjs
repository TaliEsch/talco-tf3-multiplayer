import { runLocalSessionTest } from "../src/local-session-test.mjs";

try {
  for (const players of [2, 4]) console.log(JSON.stringify(await runLocalSessionTest({ players })));
} catch (error) {
  console.error(JSON.stringify({ test: "localhost_session_model", passed: false,
    code: error.code ?? "TEST_FAILED", gameplayVerified: false }));
  process.exitCode = 1;
}
