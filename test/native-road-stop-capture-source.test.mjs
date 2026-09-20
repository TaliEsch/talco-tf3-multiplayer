import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("../experimental/native-road-stop-capture.lua",import.meta.url),"utf8");
test("native road-stop capture remains passive, bounded, and source-schema aligned",()=>{
  for(const token of ["function M.collect(proposal, enumTypes)","code = \"captured\"","code = \"unsupported\"","schemaVersion = 1","builderId = \"streetTerminalBuilder\"","MAX_RECORDS, MAX_BYTES, MAX_TEXT = 64, 256 * 1024, 1024","nodeConfigsToAdd","nodeConfigsToRemove","baseHeightMod","new2oldEdgeObjects","old2newEdgeObjects","emissionEmitter","playerOwned","transf0","roadDevelopmentLocked"]) assert.match(source,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.match(source,/enums\.Mat4f\.cols\(v, col\)/); assert.match(source,/col = 1, 4/);
  assert.match(source,/expected ~= nil and v == expected/); assert.doesNotMatch(source,/tostring\s*\(/);
  assert.doesNotMatch(source,/api\s*\.\s*(?:cmd|engine)|sendCommand|makeWorldBuildProposalCmd|\.clone\s*\(/);
  assert.doesNotMatch(source,/print\s*\(|log\s*\(|require\s*\(/);
  assert.match(source,/pcall\(capture, proposal, enumTypes\)/);
});
