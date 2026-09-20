import test from "node:test";
import assert from "node:assert/strict";
import { describeBuild } from "../src/compatibility.mjs";
import { AUDITED_EXE_SHA256 } from "../src/constants.mjs";

test("audited build is accepted without claiming gameplay verification", () => {
  assert.deepEqual(describeBuild(AUDITED_EXE_SHA256), {
    hash: AUDITED_EXE_SHA256, supported: true, recommended: true,
    validation: "static-api-audit", gameplayVerified: false,
  });
});

test("other builds are allowed with a nonblocking recommendation", () => {
  for (const hash of ["0".repeat(64), "79f4d460ea2529924459ca599a0226deecc9ddf558057d289f8709c4ad98b7c2"]) {
    assert.equal(describeBuild(hash).supported, true);
    assert.equal(describeBuild(hash).recommended, false);
    assert.equal(describeBuild(hash).validation, "unaudited");
    assert.equal(describeBuild(hash).gameplayVerified, false);
  }
});

test("current audited executable is advisory and never implies verified gameplay", () => {
  const current = describeBuild("a4843accd706b9c476c645860e2b68f6488c9b89f33ef97efe00cffb74a47be5");
  assert.equal(current.recommended, true);
  assert.equal(current.gameplayVerified, false);
  const previous = describeBuild("e9dd1e2bce6e4e9e52dbe3228b65d82657636700807680b36a580453a4757686");
  assert.equal(previous.supported, true);
  assert.equal(previous.recommended, false);
});
