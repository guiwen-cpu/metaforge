#!/usr/bin/env node
/**
 * 导出包 / 本地 Bundle ↔ 在线版本的元数据对比。
 *
 *   node tools/version-diff.mjs --export dist/leave_approval.zip --online <appId> --version 9 `
 *     --tenant tenant_demo_school --username alice --password alice123
 *
 *   node tools/version-diff.mjs --left a.zip --right b.zip --json
 *
 * 比较口径与平台 `GET /platform/apps/{id}/versions/{from}/diff/{to}` 一致：
 * 去掉 snapshot，数组按 key/id/name 配对，最多 200 条，单侧超长节点只回传定位字段。
 */
import fs from "node:fs";
import path from "node:path";
import { compareBundles, contentChecksum } from "./bundle-content.mjs";
import { readBundleSource } from "./codegen-export.mjs";

function fail(message) {
  console.error("version-diff 失败：" + message);
  process.exit(2);
}

function usage() {
  console.error("用法：node tools/version-diff.mjs --left <zip|dir|json> (--right <...> | --online <appId>)");
  console.error("      [--export <...>] [--version n] [--base-url url] [--token jwt]");
  console.error("      [--tenant id] [--username u --password p] [--json] [--out file] [--fail-on-diff] [--summary-only]");
  process.exit(2);
}

function takeValue(argv, index, flag) {
  const inline = argv[index];
  const eq = inline.indexOf("=");
  if (eq >= 0) return { value: inline.slice(eq + 1), next: index };
  const value = argv[index + 1];
  if (value == null || value.startsWith("--")) fail(flag + " 缺少参数值");
  return { value, next: index + 1 };
}

function parseArgs(argv) {
  const options = {
    left: null,
    right: null,
    online: null,
    version: null,
    baseUrl: process.env.LCP_BASE_URL || "http://localhost:8080",
    token: process.env.LCP_TOKEN || null,
    tenant: process.env.LCP_TENANT || null,
    username: process.env.LCP_USERNAME || null,
    password: process.env.LCP_PASSWORD || null,
    json: false,
    out: null,
    failOnDiff: false,
    summaryOnly: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") usage();
    if (arg === "--json") { options.json = true; continue; }
    if (arg === "--fail-on-diff") { options.failOnDiff = true; continue; }
    if (arg === "--summary-only") { options.summaryOnly = true; continue; }
    const valueFlags = {
      "--left": "left",
      "--export": "left",
      "--right": "right",
      "--online": "online",
      "--base-url": "baseUrl",
      "--token": "token",
      "--tenant": "tenant",
      "--username": "username",
      "--password": "password",
      "--out": "out"
    };
    const matched = Object.keys(valueFlags).find((flag) => arg === flag || arg.startsWith(flag + "="));
    if (matched) {
      const parsed = takeValue(argv, i, matched);
      options[valueFlags[matched]] = parsed.value;
      i = parsed.next;
      continue;
    }
    if (arg === "--version" || arg.startsWith("--version=")) {
      const parsed = takeValue(argv, i, "--version");
      const version = Number(parsed.value);
      if (!Number.isInteger(version) || version <= 0) fail("--version 必须是正整数");
      options.version = version;
      i = parsed.next;
      continue;
    }
    if (arg.startsWith("--")) fail("未知参数 " + arg);
    if (!options.left) options.left = arg;
    else if (!options.right) options.right = arg;
    else fail("多余的位置参数 " + arg);
  }
  return options;
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const message = body && typeof body === "object" ? body.message || body.error || response.statusText : String(body);
    throw new Error(`HTTP ${response.status} ${url}：${message}`);
  }
  return body;
}

async function login(options, baseUrl, tenant) {
  if (!options.username || !options.password) {
    fail("缺少凭据：传 --token，或 --username / --password（也可用 LCP_USERNAME / LCP_PASSWORD）");
  }
  const body = await requestJson(baseUrl + "/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenant, username: options.username, password: options.password })
  });
  if (!body?.token) throw new Error("登录响应没有 token");
  return body.token;
}

async function fetchOnline(options, baseUrl, tenant) {
  const token = options.token || await login(options, baseUrl, tenant);
  const headers = { Authorization: "Bearer " + token, Accept: "application/json" };
  const appBase = `${baseUrl}/api/v1/platform/apps/${encodeURIComponent(options.online)}/versions`;
  let detail;
  if (options.version) {
    detail = await requestJson(`${appBase}/${options.version}`, { headers });
  } else {
    const page = await requestJson(`${appBase}?page=1&size=1`, { headers });
    const latest = page?.items?.[0];
    if (!latest) throw new Error("该应用还没有发布版本");
    detail = await requestJson(`${appBase}/${latest.version_no}`, { headers });
  }
  if (!detail?.bundle) throw new Error("版本详情缺少 bundle");
  return {
    raw: detail.bundle,
    label: `online:${options.online}@v${detail.version_no}`,
    kind: "online",
    version: detail.version_no,
    message: detail.message ?? null,
    created_at: detail.created_at ?? null,
    content_checksum: detail.content_checksum ?? contentChecksum(detail.bundle)
  };
}

function summaryLine(summary) {
  return `新增 ${summary.added} · 删除 ${summary.removed} · 修改 ${summary.changed} · 共 ${summary.total}`;
}

function short(value) {
  if (value === undefined) return "(缺失)";
  const text = typeof value === "string" ? JSON.stringify(value) : JSON.stringify(value);
  if (text == null) return "null";
  return text.length > 180 ? text.slice(0, 177) + "..." : text;
}

function printResult(result, options) {
  console.log("\n==================== 版本对比 ====================");
  console.log(`  左  ${result.left.label}`);
  console.log(`      ${result.left.content_checksum ?? "(无摘要)"}`);
  console.log(`  右  ${result.right.label}`);
  console.log(`      ${result.right.content_checksum ?? "(无摘要)"}`);
  const equivalent = !result.identical && result.summary.total === 0;
  console.log(`  结果 ${result.identical ? "内容一致" : equivalent ? "内容等价（仅数组顺序不同）" : summaryLine(result.summary)}`);
  if (result.right.version != null) console.log(`  在线版本 v${result.right.version} · ${result.right.message ?? ""}`);
  if (!result.identical && !options.summaryOnly) {
    for (const change of result.changes) {
      const scope = change.artifact_kind ? ` {${change.artifact_kind}${change.artifact_key ? ":" + change.artifact_key : ""}}` : "";
      console.log(`\n  [${change.kind}] ${change.path}${scope}`);
      if (change.kind !== "added") console.log(`    before: ${short(change.before)}`);
      if (change.kind !== "removed") console.log(`    after:  ${short(change.after)}`);
    }
    if (result.truncated) console.log("\n  （变更超过 200 条，已截断）");
  }
  console.log("");
}

async function main() {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
    return;
  }
  const options = parseArgs(process.argv.slice(2));
  if (!options.left) usage();
  if (!options.right && !options.online) usage();
  if (options.right && options.online) fail("--right 与 --online 只能选一个");

  const leftSource = readBundleSource(options.left);
  let rightSource;
  if (options.online) {
    const baseUrl = options.baseUrl.replace(/\/+$/, "");
    const localBundle = leftSource.raw?.bundle ?? leftSource.raw;
    const tenant = options.tenant || localBundle?.tenantId || "tenant_demo_school";
    try {
      rightSource = await fetchOnline(options, baseUrl, tenant);
    } catch (error) {
      fail(error.message);
    }
  } else {
    rightSource = readBundleSource(options.right);
    rightSource.label = `file:${path.basename(options.right)}`;
    rightSource.kind = rightSource.kind ?? "file";
    rightSource.content_checksum = contentChecksum(rightSource.raw);
  }

  const compare = compareBundles(leftSource.raw, rightSource.raw);
  const leftLabel = leftSource.kind === "zip"
    ? `export:${path.basename(options.left)}`
    : leftSource.kind === "directory"
      ? `directory:${path.basename(options.left)}`
      : `file:${path.basename(options.left)}`;
  const result = {
    left: {
      label: leftLabel,
      kind: leftSource.kind,
      content_checksum: compare.content_checksum.from
    },
    right: {
      label: rightSource.label,
      kind: rightSource.kind,
      content_checksum: compare.content_checksum.to,
      version: rightSource.version ?? null,
      message: rightSource.message ?? null,
      created_at: rightSource.created_at ?? null
    },
    identical: compare.identical,
    content_checksum: compare.content_checksum,
    summary: compare.summary,
    changes: compare.changes,
    truncated: compare.truncated
  };

  if (options.out) {
    fs.mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true });
    fs.writeFileSync(options.out, JSON.stringify(result, null, 2) + "\n", "utf8");
  }
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printResult(result, options);

  if (options.failOnDiff && result.summary.total > 0) process.exitCode = 1;
}

function runSelfTest() {
  const base = {
    protocolVersion: "0.1",
    tenantId: "tenant_test",
    app: { key: "demo", name: "演示" },
    artifacts: {
      dataSchemas: [{
        key: "core",
        entities: [
          { key: "beta", label: "B" },
          { key: "alpha", label: "A" }
        ]
      }]
    }
  };
  const cases = [];

  const reordered = {
    artifacts: base.artifacts,
    app: { name: "演示", key: "demo" },
    tenantId: "tenant_test",
    protocolVersion: "0.1",
    snapshot: { version: 99 }
  };
  let result = compareBundles(base, reordered);
  cases.push(["键顺序与 snapshot 不影响内容", result.identical && result.summary.total === 0]);

  const reorderedEntities = structuredClone(base);
  reorderedEntities.artifacts.dataSchemas[0].entities.reverse();
  result = compareBundles(base, reorderedEntities);
  cases.push(["数组按 key 配对后无字段变更", result.summary.total === 0 && result.changes.length === 0]);

  const renamed = structuredClone(base);
  renamed.app.name = "演示 2";
  result = compareBundles(base, renamed);
  cases.push([
    "字段变化定位到 app.name",
    !result.identical && result.changes.length === 1 && result.changes[0].path === "app.name" && result.changes[0].kind === "changed"
  ]);

  const added = structuredClone(base);
  added.artifacts.dataSchemas[0].entities.push({ key: "gamma", label: "G" });
  result = compareBundles(base, added);
  cases.push([
    "新增数组项归到 dataSchema",
    result.changes.length === 1 && result.changes[0].kind === "added" && result.changes[0].artifact_kind === "dataSchemas[core]"
  ]);

  const big = structuredClone(base);
  for (let index = 0; index < 210; index += 1) big["k" + index] = index;
  result = compareBundles(base, big);
  cases.push(["超过 200 条标记截断", result.truncated && result.changes.length === 200]);

  let failed = 0;
  for (const [name, passed] of cases) {
    console.log(`  [${passed ? "PASS" : "FAIL"}] ${name}`);
    if (!passed) failed += 1;
  }
  console.log(failed === 0 ? `全部 ${cases.length} 条通过。` : `${failed} 条失败。`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => fail(error.message));
