import crypto from "node:crypto";

const MAX_CHANGES = 200;
const INLINE_LIMIT = 2000;
const KEY_FIELDS = ["key", "id", "name"];

/** 版本内容 = 信封内的 bundle 去掉 snapshot；与 bff 的 PublishSeal.content 一致。 */
export function contentOf(raw) {
  const bundle = raw && typeof raw === "object" && raw.bundle && !("protocolVersion" in raw)
    ? raw.bundle
    : raw;
  if (!bundle || typeof bundle !== "object") return null;
  const copy = structuredClone(bundle);
  delete copy.snapshot;
  return copy;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
    return out;
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonical(value));
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function contentChecksum(raw) {
  const content = contentOf(raw);
  return content == null ? null : sha256(canonicalJson(content));
}

export function fullChecksum(raw) {
  const bundle = raw && typeof raw === "object" && raw.bundle && !("protocolVersion" in raw)
    ? raw.bundle
    : raw;
  return bundle == null ? null : sha256(canonicalJson(bundle));
}

function allKeyed(array, field) {
  const seen = new Set();
  for (const item of array) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const value = item[field];
    if (typeof value !== "string" || value.trim() === "") return false;
    if (seen.has(value)) return false;
    seen.add(value);
  }
  return true;
}

function keyField(left, right) {
  for (const field of KEY_FIELDS) {
    if (allKeyed(left, field) && allKeyed(right, field)) return field;
  }
  return null;
}

function indexBy(array, field) {
  const map = new Map();
  for (const item of array) map.set(item[field], item);
  return map;
}

function join(path, name) {
  return path ? `${path}.${name}` : name;
}

function singular(collection) {
  switch (collection) {
    case "dataSchemas": return "dataSchema";
    case "uiSchemas": return "uiSchema";
    case "logicSchemas": return "logicSchema";
    case "components": return "component";
    case "enums": return "enum";
    case "roles": return "role";
    case "permissions": return "permission";
    default: return collection;
  }
}

function present(node) {
  if (node == null) return null;
  const text = JSON.stringify(node);
  if (text.length <= INLINE_LIMIT) return node;
  const summary = { _truncated: true, _chars: text.length };
  if (node && typeof node === "object" && !Array.isArray(node)) {
    for (const field of ["id", "key", "name", "title", "type"]) {
      if (node[field] != null && typeof node[field] !== "object") summary[field] = node[field];
    }
  }
  return summary;
}

class Builder {
  constructor() {
    this.changes = [];
    this.truncated = false;
  }

  get full() {
    if (this.changes.length >= MAX_CHANGES) {
      this.truncated = true;
      return true;
    }
    return false;
  }

  add(path, kind, before, after) {
    if (this.full) return;
    let artifactKind = null;
    let artifactKey = null;
    if (path.startsWith("artifacts.")) {
      const rest = path.slice("artifacts.".length);
      const dot = rest.indexOf(".");
      const collection = dot < 0 ? rest : rest.slice(0, dot);
      artifactKind = singular(collection);
      if (dot > 0) {
        const segment = rest.slice(dot + 1);
        const bracket = segment.indexOf("[");
        let end = bracket > 0 ? bracket : segment.length;
        const nextDot = segment.indexOf(".");
        if (nextDot > 0 && nextDot < end) end = nextDot;
        artifactKey = segment.slice(0, end);
      }
    }
    this.changes.push({ path, kind, artifact_kind: artifactKind, artifact_key: artifactKey, before: present(before), after: present(after) });
  }
}

function compareNode(left, right, path, out) {
  if (out.full) return;
  const from = left === undefined ? null : left;
  const to = right === undefined ? null : right;
  if (JSON.stringify(from) === JSON.stringify(to)) return;
  if (from == null || to == null) {
    out.add(path, from == null ? "added" : "removed", from, to);
    return;
  }
  if (typeof from === "object" && typeof to === "object" && !Array.isArray(from) && !Array.isArray(to)) {
    const names = new Set([...Object.keys(from), ...Object.keys(to)]);
    for (const name of names) {
      compareNode(from[name], to[name], join(path, name), out);
      if (out.full) return;
    }
    return;
  }
  if (Array.isArray(from) && Array.isArray(to)) {
    const field = keyField(from, to);
    if (field) {
      const leftById = indexBy(from, field);
      const rightById = indexBy(to, field);
      const keys = new Set([...leftById.keys(), ...rightById.keys()]);
      for (const key of keys) {
        compareNode(leftById.get(key), rightById.get(key), `${path}[${key}]`, out);
        if (out.full) return;
      }
    } else {
      const size = Math.max(from.length, to.length);
      for (let index = 0; index < size; index += 1) {
        compareNode(from[index], to[index], `${path}[${index}]`, out);
        if (out.full) return;
      }
    }
    return;
  }
  out.add(path, "changed", from, to);
}

export function compareBundles(leftRaw, rightRaw) {
  const left = contentOf(leftRaw);
  const right = contentOf(rightRaw);
  const builder = new Builder();
  const identical = left != null && right != null && canonicalJson(left) === canonicalJson(right);
  if (!identical) compareNode(left, right, "", builder);
  const summary = { added: 0, removed: 0, changed: 0, total: builder.changes.length };
  for (const entry of builder.changes) {
    if (entry.kind === "added") summary.added += 1;
    else if (entry.kind === "removed") summary.removed += 1;
    else summary.changed += 1;
  }
  return {
    identical,
    content_checksum: { from: contentChecksum(leftRaw), to: contentChecksum(rightRaw) },
    summary,
    changes: builder.changes,
    truncated: builder.truncated
  };
}