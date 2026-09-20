import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

async function filesBelow(root, current = root) {
  const result = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) result.push(...await filesBelow(root, full));
    else if (entry.isFile()) result.push(full);
  }
  return result;
}

export async function hashManifest(root) {
  const absoluteRoot = path.resolve(root);
  const files = (await filesBelow(absoluteRoot)).sort((a, b) => a.localeCompare(b));
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(path.relative(absoluteRoot, file).split(path.sep).join("/"), "utf8");
    hash.update(await readFile(file));
  }
  return hash.digest("hex");
}
