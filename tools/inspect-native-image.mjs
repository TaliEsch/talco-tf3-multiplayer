#!/usr/bin/env node
import { inventoryNativeImage } from '../src/native-image-inventory.mjs';

const [input] = process.argv.slice(2);
if (!input || process.argv.length !== 3) {
  process.stderr.write('Usage: node tools/inspect-native-image.mjs <path-to-pe>\n');
  process.exitCode = 2;
} else {
  try { process.stdout.write(`${JSON.stringify(await inventoryNativeImage(input), null, 2)}\n`); }
  catch (error) { process.stderr.write(`inspect-native-image: ${error.message}\n`); process.exitCode = 1; }
}
