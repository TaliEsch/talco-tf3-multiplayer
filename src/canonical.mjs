import { createHash } from "node:crypto";

function canonicalValue(value, stack) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("non-finite number");
    if (Object.is(value, -0)) return "0";
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (stack.has(value)) throw new TypeError("cyclic value");
    stack.add(value);
    const result = `[${value.map((item) => canonicalValue(item, stack)).join(",")}]`;
    stack.delete(value);
    return result;
  }
  if (typeof value === "object") {
    if (stack.has(value)) throw new TypeError("cyclic value");
    stack.add(value);
    const keys = Object.keys(value).sort();
    for (const key of keys) {
      if (value[key] === undefined) throw new TypeError(`undefined field: ${key}`);
    }
    const result = `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalValue(value[key], stack)}`).join(",")}}`;
    stack.delete(value);
    return result;
  }
  throw new TypeError(`unsupported canonical type: ${typeof value}`);
}

export function canonicalJson(value) {
  return canonicalValue(value, new Set());
}

export function sha256Canonical(value) {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}
