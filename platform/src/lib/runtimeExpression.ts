export type RuntimeRoots = Record<string, unknown>;

const OPERATORS = new Set(["$lit", "$ref", "$fn", "$tpl", "$if"]);

export function isExpression(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).some((key) => OPERATORS.has(key));
}

function parsePath(path: string): string[] {
  const tokens: string[] = [];
  let index = 0;
  const source = path.startsWith("$") ? path.slice(1) : path;
  while (index < source.length) {
    const char = source[index];
    if (char === ".") {
      index += 1;
      continue;
    }
    if (char === "[") {
      const end = source.indexOf("]", index);
      if (end < 0) break;
      let key = source.slice(index + 1, end).trim();
      if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
        key = key.slice(1, -1);
      }
      tokens.push(key);
      index = end + 1;
      continue;
    }
    let end = index;
    while (end < source.length && source[end] !== "." && source[end] !== "[") end += 1;
    if (end > index) tokens.push(source.slice(index, end));
    index = end;
  }
  return tokens;
}

export function getPath(source: unknown, path: string): unknown {
  if (!path) return source;
  const tokens = parsePath(path);
  let current: unknown = source;
  for (const token of tokens) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(token);
      current = Number.isInteger(index) ? current[index] : undefined;
      continue;
    }
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[token];
  }
  return current;
}

export function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const tokens = parsePath(path);
  if (!tokens.length) return;
  let current: Record<string, unknown> | unknown[] = target;
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    const nextIsIndex = /^\d+$/.test(tokens[index + 1]);
    const existing = Array.isArray(current)
      ? current[Number(token)]
      : (current as Record<string, unknown>)[token];
    if (existing && typeof existing === "object") {
      current = existing as Record<string, unknown> | unknown[];
      continue;
    }
    const created: Record<string, unknown> | unknown[] = nextIsIndex ? [] : {};
    if (Array.isArray(current)) current[Number(token)] = created;
    else (current as Record<string, unknown>)[token] = created;
    current = created;
  }
  const last = tokens[tokens.length - 1];
  if (Array.isArray(current)) current[Number(last)] = value;
  else (current as Record<string, unknown>)[last] = value;
}

export function deletePath(target: Record<string, unknown>, path: string): void {
  const tokens = parsePath(path);
  if (tokens.length === 1) {
    delete target[tokens[0]];
    return;
  }
  const parent = getPath(target, tokens.slice(0, -1).join("."));
  if (!parent || typeof parent !== "object") return;
  if (Array.isArray(parent)) parent.splice(Number(tokens[tokens.length - 1]), 1);
  else delete (parent as Record<string, unknown>)[tokens[tokens.length - 1]];
}

export function resolveRef(path: string, roots: RuntimeRoots): unknown {
  const tokens = parsePath(path);
  if (!tokens.length) return undefined;
  const [root, ...rest] = tokens;
  const base = roots[root];
  return rest.length ? getPath(base, rest.join(".")) : base;
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

function formatDate(value: unknown, pattern = "yyyy-MM-dd HH:mm:ss"): string {
  const date = toDate(value);
  if (!date) return "";
  const map: Record<string, string> = {
    yyyy: String(date.getFullYear()),
    MM: pad(date.getMonth() + 1),
    dd: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds())
  };
  return pattern.replace(/yyyy|MM|dd|HH|mm|ss/g, (token) => map[token] ?? token);
}

function addDate(value: unknown, amount: number, unit = "day"): string {
  const date = toDate(value) ?? new Date();
  const next = new Date(date.getTime());
  switch (unit) {
    case "year":
      next.setFullYear(next.getFullYear() + amount);
      break;
    case "month":
      next.setMonth(next.getMonth() + amount);
      break;
    case "week":
      next.setDate(next.getDate() + amount * 7);
      break;
    case "hour":
      next.setHours(next.getHours() + amount);
      break;
    case "minute":
      next.setMinutes(next.getMinutes() + amount);
      break;
    default:
      next.setDate(next.getDate() + amount);
  }
  return next.toISOString();
}

function diffDate(from: unknown, to: unknown, unit = "day"): number {
  const left = toDate(from);
  const right = toDate(to);
  if (!left || !right) return 0;
  const ms = right.getTime() - left.getTime();
  switch (unit) {
    case "year":
      return right.getFullYear() - left.getFullYear();
    case "month":
      return (right.getFullYear() - left.getFullYear()) * 12 + right.getMonth() - left.getMonth();
    case "week":
      return Math.trunc(ms / (7 * 86_400_000));
    case "hour":
      return Math.trunc(ms / 3_600_000);
    case "minute":
      return Math.trunc(ms / 60_000);
    default:
      return Math.trunc(ms / 86_400_000);
  }
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null || left === undefined || right === undefined) return false;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => deepEqual(item, right[index]));
  }
  if (typeof left === "object" && typeof right === "object") {
    const leftKeys = Object.keys(left as Record<string, unknown>).sort();
    const rightKeys = Object.keys(right as Record<string, unknown>).sort();
    if (leftKeys.length !== rightKeys.length) return false;
    if (leftKeys.some((key, index) => key !== rightKeys[index])) return false;
    return leftKeys.every((key) =>
      deepEqual(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key]
      )
    );
  }
  return false;
}

function compare(left: unknown, right: unknown): number {
  const leftNumber = toNumber(left);
  const rightNumber = toNumber(right);
  if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber;
  return String(left ?? "").localeCompare(String(right ?? ""));
}

function asList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function callFunction(name: string, args: unknown[], roots: RuntimeRoots): unknown {
  switch (name) {
    case "eq":
      return deepEqual(args[0], args[1]);
    case "ne":
      return !deepEqual(args[0], args[1]);
    case "lt":
      return compare(args[0], args[1]) < 0;
    case "lte":
      return compare(args[0], args[1]) <= 0;
    case "gt":
      return compare(args[0], args[1]) > 0;
    case "gte":
      return compare(args[0], args[1]) >= 0;
    case "between":
      return compare(args[0], args[1]) >= 0 && compare(args[0], args[2]) <= 0;
    case "in": {
      const list = asList(args[1]);
      if (Array.isArray(args[0])) {
        return args[0].some((item) => list.some((candidate) => deepEqual(item, candidate)));
      }
      return list.some((candidate) => deepEqual(args[0], candidate));
    }
    case "notIn":
      return !callFunction("in", args, roots);
    case "like":
      return String(args[0] ?? "")
        .toLowerCase()
        .includes(String(args[1] ?? "").replace(/%/g, "").toLowerCase());
    case "startsWith":
      return String(args[0] ?? "").startsWith(String(args[1] ?? ""));
    case "endsWith":
      return String(args[0] ?? "").endsWith(String(args[1] ?? ""));
    case "isNull":
      return args[0] === null || args[0] === undefined;
    case "isNotNull":
      return !(args[0] === null || args[0] === undefined);
    case "isEmpty":
      return isEmptyValue(args[0]);
    case "isNotEmpty":
      return !isEmptyValue(args[0]);
    case "not":
      return !truthy(args[0]);
    case "coalesce":
      return args.find((item) => !isEmptyValue(item)) ?? null;
    case "default":
      return isEmptyValue(args[0]) ? args[1] : args[0];
    case "concat":
      return args.map((item) => (item === null || item === undefined ? "" : String(item))).join("");
    case "upper":
      return String(args[0] ?? "").toUpperCase();
    case "lower":
      return String(args[0] ?? "").toLowerCase();
    case "trim":
      return String(args[0] ?? "").trim();
    case "substr":
      return String(args[0] ?? "").substr(Number(args[1] ?? 0), args[2] === undefined ? undefined : Number(args[2]));
    case "replace":
      return String(args[0] ?? "").split(String(args[1] ?? "")).join(String(args[2] ?? ""));
    case "split":
      return String(args[0] ?? "").split(String(args[1] ?? ","));
    case "join":
      return asList(args[0]).map((item) => String(item ?? "")).join(String(args[1] ?? ","));
    case "padStart":
      return String(args[0] ?? "").padStart(Number(args[1] ?? 0), String(args[2] ?? " "));
    case "padEnd":
      return String(args[0] ?? "").padEnd(Number(args[1] ?? 0), String(args[2] ?? " "));
    case "len":
      return Array.isArray(args[0])
        ? args[0].length
        : typeof args[0] === "object" && args[0] !== null
          ? Object.keys(args[0] as Record<string, unknown>).length
          : String(args[0] ?? "").length;
    case "size":
      return callFunction("len", args, roots);
    case "indexOf":
      return String(args[0] ?? "").indexOf(String(args[1] ?? ""));
    case "format": {
      const pattern = String(args[0] ?? "");
      return pattern.replace(/\{(\d+)\}/g, (_match, index) => String(args[Number(index) + 1] ?? ""));
    }
    case "add":
      return args.reduce<number>((total, item) => total + (toNumber(item) ?? 0), 0);
    case "sub":
      return (toNumber(args[0]) ?? 0) - (toNumber(args[1]) ?? 0);
    case "mul":
      return args.reduce<number>((total, item) => total * (toNumber(item) ?? 1), 1);
    case "div": {
      const divisor = toNumber(args[1]);
      return divisor ? (toNumber(args[0]) ?? 0) / divisor : null;
    }
    case "mod": {
      const divisor = toNumber(args[1]);
      return divisor ? (toNumber(args[0]) ?? 0) % divisor : null;
    }
    case "round":
      return Math.round((toNumber(args[0]) ?? 0) * 10 ** Number(args[1] ?? 0)) / 10 ** Number(args[1] ?? 0);
    case "floor":
      return Math.floor(toNumber(args[0]) ?? 0);
    case "ceil":
      return Math.ceil(toNumber(args[0]) ?? 0);
    case "abs":
      return Math.abs(toNumber(args[0]) ?? 0);
    case "min":
      return Math.min(...args.map((item) => toNumber(item) ?? 0));
    case "max":
      return Math.max(...args.map((item) => toNumber(item) ?? 0));
    case "sum":
      return asList(args[0]).reduce<number>((total, item) => total + (toNumber(item) ?? 0), 0);
    case "avg": {
      const list = asList(args[0]).map((item) => toNumber(item) ?? 0);
      return list.length ? list.reduce((total, item) => total + item, 0) / list.length : 0;
    }
    case "first":
      return asList(args[0])[0] ?? null;
    case "last": {
      const list = asList(args[0]);
      return list.length ? list[list.length - 1] : null;
    }
    case "nth":
      return asList(args[0])[Number(args[1] ?? 0)] ?? null;
    case "slice":
      return asList(args[0]).slice(Number(args[1] ?? 0), args[2] === undefined ? undefined : Number(args[2]));
    case "reverse":
      return [...asList(args[0])].reverse();
    case "unique":
      return Array.from(new Set(asList(args[0])));
    case "flatten":
      return asList(args[0]).flatMap((item) => (Array.isArray(item) ? item : [item]));
    case "pluck": {
      const key = String(args[1] ?? "");
      return asList(args[0]).map((item) => getPath(item, key));
    }
    case "get":
      return getPath(args[0], String(args[1] ?? "")) ?? args[2] ?? null;
    case "has":
      return getPath(args[0], String(args[1] ?? "")) !== undefined;
    case "keys":
      return args[0] && typeof args[0] === "object" ? Object.keys(args[0] as Record<string, unknown>) : [];
    case "values":
      return args[0] && typeof args[0] === "object" ? Object.values(args[0] as Record<string, unknown>) : [];
    case "merge":
      return Object.assign({}, ...args.filter((item) => item && typeof item === "object"));
    case "toNumber":
      return toNumber(args[0]);
    case "toString":
      return args[0] === null || args[0] === undefined ? "" : String(args[0]);
    case "toBool":
      return truthy(args[0]);
    case "toDate":
      return toDate(args[0])?.toISOString() ?? null;
    case "toArray":
      return asList(args[0]);
    case "typeOf":
      if (args[0] === null) return "null";
      if (Array.isArray(args[0])) return "array";
      return typeof args[0];
    case "now":
      return new Date().toISOString();
    case "today":
      return formatDate(new Date(), "yyyy-MM-dd");
    case "dateAdd":
      return addDate(args[0], Number(args[1] ?? 0), String(args[2] ?? "day"));
    case "dateDiff":
      return diffDate(args[0], args[1], String(args[2] ?? "day"));
    case "formatDate":
      return formatDate(args[0], String(args[1] ?? "yyyy-MM-dd HH:mm:ss"));
    case "year": {
      const date = toDate(args[0]);
      return date ? date.getFullYear() : null;
    }
    case "month": {
      const date = toDate(args[0]);
      return date ? date.getMonth() + 1 : null;
    }
    case "day": {
      const date = toDate(args[0]);
      return date ? date.getDate() : null;
    }
    case "startOf":
    case "endOf": {
      const date = toDate(args[0]) ?? new Date();
      const unit = String(args[1] ?? "day");
      const next = new Date(date.getTime());
      if (unit === "year") {
        next.setMonth(0, 1);
        next.setHours(0, 0, 0, 0);
        if (name === "endOf") next.setFullYear(next.getFullYear() + 1, 0, 0);
      } else if (unit === "month") {
        next.setDate(1);
        next.setHours(0, 0, 0, 0);
        if (name === "endOf") next.setMonth(next.getMonth() + 1, 0);
      } else {
        next.setHours(0, 0, 0, 0);
        if (name === "endOf") next.setHours(23, 59, 59, 999);
      }
      return next.toISOString();
    }
    case "entityField":
      return args[1] === undefined ? args[0] : getPath(args[0], String(args[1]));
    case "fileName":
      return String(args[0] ?? "").split(/[\\/]/).pop() ?? "";
    case "fileExt": {
      const parts = String(args[0] ?? "").split(".");
      return parts.length > 1 ? parts.pop() : "";
    }
    case "uuid":
      return typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    default:
      return null;
  }
}

export function truthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false || value === 0 || value === "") {
    return false;
  }
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function evalExpression(expression: unknown, roots: RuntimeRoots): unknown {
  if (!expression || typeof expression !== "object" || Array.isArray(expression)) {
    return expression;
  }
  const record = expression as Record<string, unknown>;
  if ("$lit" in record) return record.$lit;
  if ("$ref" in record) return resolveRef(String(record.$ref ?? ""), roots);
  if ("$tpl" in record) {
    const parts = Array.isArray(record.$tpl) ? record.$tpl : [];
    return parts
      .map((part) => {
        const value = typeof part === "string" ? part : evalExpression(part, roots);
        return value === null || value === undefined ? "" : String(value);
      })
      .join("");
  }
  if ("$if" in record) {
    return truthy(evalExpression(record.$if, roots))
      ? evalExpression(record.$then, roots)
      : evalExpression(record.$else, roots);
  }
  if ("$fn" in record) {
    const name = String(record.$fn ?? "");
    const rawArgs = Array.isArray(record.$args) ? record.$args : [];
    if (name === "and") {
      for (const arg of rawArgs) {
        if (!truthy(evalExpression(arg, roots))) return false;
      }
      return true;
    }
    if (name === "or") {
      for (const arg of rawArgs) {
        if (truthy(evalExpression(arg, roots))) return true;
      }
      return false;
    }
    if (name === "coalesce") {
      for (const arg of rawArgs) {
        const value = evalExpression(arg, roots);
        if (!isEmptyValue(value)) return value;
      }
      return null;
    }
    return callFunction(name, rawArgs.map((arg) => evalExpression(arg, roots)), roots);
  }
  return evalDeep(record, roots);
}

export function evalDeep(value: unknown, roots: RuntimeRoots): unknown {
  if (Array.isArray(value)) return value.map((item) => evalDeep(item, roots));
  if (!value || typeof value !== "object") return value;
  if (isExpression(value)) return evalExpression(value, roots);
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = evalDeep(item, roots);
  }
  return out;
}