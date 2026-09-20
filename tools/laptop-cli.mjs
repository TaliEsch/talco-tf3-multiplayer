import { createInterface } from "node:readline/promises";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runLaptopResilienceTest } from "../src/laptop-test.mjs";

const prompt = createInterface({ input: process.stdin, output: process.stdout });
const base = path.resolve(fileURLToPath(new URL("../", import.meta.url)), "test-results");
let destinationDir;
const checks = [];
try {
  console.log("TF3MP laptop resilience test 0.2.0 — TF3 is NOT required. No gameplay access.");
  console.log("Checks: reconnects, wrong keys, diagnostic-only permissions, verified save download.");
  console.log("Only paste a LAN code from your own desktop. The selected host save will be downloaded here.");
  const code = await prompt.question("Private LAN join code (not saved in the report): ");
  prompt.close();
  await mkdir(base, { recursive: true });
  destinationDir = await mkdtemp(path.join(base, "run-"));
  const report = await runLaptopResilienceTest({ code, destinationDir, logger: e => { checks.push(e); console.log(JSON.stringify(e)); } });
  await writeFile(path.join(destinationDir, "report.json"), JSON.stringify(report, null, 2), { flag: "wx" });
  console.log("PASS. Save and report are in: " + destinationDir);
  console.log("Share report.json, NOT your private join code. This does not verify gameplay or laptop game version.");
} catch (e) {
  const failureCode = /^[A-Z_0-9]{1,64}$/.test(e.message) ? e.message : "NETWORK_OR_DOWNLOAD_ERROR";
  console.error("FAIL: " + failureCode);
  if (destinationDir) {
    try {
      await writeFile(path.join(destinationDir, "failure-report.json"), JSON.stringify({ event: "laptop_resilience_test_failed", testVersion: "0.2.0", code: failureCode, checks, gameplayVerified: false }, null, 2), { flag: "wx" });
      console.error("Failure report: " + path.join(destinationDir, "failure-report.json"));
    } catch { console.error("Could not write failure report."); }
  }
  console.error("Use a fresh LAN Host without vehicle tests enabled. Check both TCP ports 37333/37334 and Private-network firewall permissions. Never turn the firewall off.");
  process.exitCode = 1;
} finally { prompt.close(); }
