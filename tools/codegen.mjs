#!/usr/bin/env node
/**
 * LCP 出码引擎 · 统一入口
 *
 *   node tools/codegen.mjs examples/leave-approval.bundle.json
 *   node tools/codegen.mjs examples/leave-approval.bundle.json --out .tmp/codegen --dry-run
 *   node tools/codegen.mjs examples/leave-approval.bundle.json --export dist/leave_approval.zip
 *   node tools/codegen.mjs examples/leave-approval.bundle.json --app-key smoke_app --tenant tenant_smoke
 *
 * 依次执行 gen-entity → gen-api → gen-page → gen-project。四个生成器仍然各自负责
 * 一片产物；本文件只做参数解析、Bundle 覆盖和输出目录编排，避免把出码规则复制一遍。
 *
 * 参数：
 *   --out <dir>          输出根目录，默认 codegen/
 *   --dry-run            输出到临时目录，跑完整生成后打印清单并清理
 *   --keep-temp          dry-run 时保留临时目录
 *   --incremental        增量写入（默认）
 *   --no-incremental     强制全量写入
 *   --app-key <key>      覆盖 bundle.app.key
 *   --app-name <name>    覆盖 bundle.app.name
 *   --tenant <id>        覆盖 bundle.tenantId
 *   --clean              清理输出根目录下带 GENERATED.txt 的直属应用目录
 *   --export <path>      生成后打包为 zip；传目录时为每个应用各打一个 <appKey>.zip
 *   --json               只输出 JSON 结果，便于脚本消费
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { exportPackage } from "./codegen-export.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const STEPS = ["gen-entity.mjs", "gen-api.mjs", "gen-page.mjs", "gen-project.mjs"];
const MANIFEST_NAME = "GENERATED.txt";
const APP_KEY_RE = /^[a-z][a-z0-9_]*$/;

function fail(message) {
  console.error("codegen 失败：" + message);
  process.exit(1);
}

function usage() {
  console.error("用法：node tools/codegen.mjs [bundle.json ...] [--out dir] [--dry-run] [--no-incremental]");
  console.error("      [--app-key key] [--app-name name] [--tenant id] [--clean] [--export path] [--json]");
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
    out: path.join(ROOT, "codegen"),
    dryRun: false,
    keepTemp: false,
    incremental: process.env.LCP_CODEGEN_INCREMENTAL !== "false",
    appKey: null,
    appName: null,
    tenant: null,
    clean: false,
    export: null,
    json: false,
    inputs: []
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") usage();
    if (arg === "--dry-run") { options.dryRun = true; continue; }
    if (arg === "--keep-temp") { options.keepTemp = true; continue; }
    if (arg === "--incremental") { options.incremental = true; continue; }
    if (arg === "--no-incremental") { options.incremental = false; continue; }
    if (arg === "--clean") { options.clean = true; continue; }
    if (arg === "--json") { options.json = true; continue; }
    if (arg === "--export" || arg.startsWith("--export=")) {
      const parsed = takeValue(argv, i, "--export");
      options.export = path.resolve(parsed.value);
      i = parsed.next;
      continue;
    }
    if (arg === "--out" || arg.startsWith("--out=")) {
      const parsed = takeValue(argv, i, "--out");
      options.out = path.resolve(parsed.value);
      i = parsed.next;
      continue;
    }
    if (arg === "--app-key" || arg.startsWith("--app-key=")) {
      const parsed = takeValue(argv, i, "--app-key");
      options.appKey = parsed.value;
      i = parsed.next;
      continue;
    }
    if (arg === "--app-name" || arg.startsWith("--app-name=")) {
      const parsed = takeValue(argv, i, "--app-name");
      options.appName = parsed.value;
      i = parsed.next;
      continue;
    }
    if (arg === "--tenant" || arg.startsWith("--tenant=")) {
      const parsed = takeValue(argv, i, "--tenant");
      options.tenant = parsed.value;
      i = parsed.next;
      continue;
    }
    if (arg.startsWith("--")) fail("未知参数 " + arg);
    options.inputs.push(path.resolve(arg));
  }
  return options;
}

function defaultBundles() {
  const dir = path.join(ROOT, "examples");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(".bundle.json"))
    .sort()
    .map((name) => path.join(dir, name));
}

function readBundle(file) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  return { raw, bundle: raw.bundle ?? raw, wrapped: Boolean(raw.bundle) };
}

function overrideBundle(file, options, tempDir, index) {
  const data = readBundle(file);
  const bundle = data.bundle;
  if (!bundle || typeof bundle !== "object") fail(path.basename(file) + " 没有 bundle 对象");
  bundle.app ??= {};
  if (options.appKey) bundle.app.key = options.appKey;
  if (options.appName) bundle.app.name = options.appName;
  if (options.tenant) bundle.tenantId = options.tenant;
  const appKey = bundle.app?.key;
  if (!appKey) fail(path.basename(file) + " 的 bundle.app.key 不能为空");
  if (!APP_KEY_RE.test(appKey)) {
    fail(path.basename(file) + " 的 app.key=" + appKey + " 不合法（需匹配 " + APP_KEY_RE + "）");
  }
  data.raw = data.wrapped ? { ...data.raw, bundle } : bundle;
  const target = path.join(tempDir, `${index}-${appKey}.bundle.json`);
  fs.writeFileSync(target, JSON.stringify(data.raw, null, 2) + "\n", "utf8");
  return target;
}

function safeClean(outDir) {
  const resolved = path.resolve(outDir);
  const root = path.parse(resolved).root;
  if (resolved === root || resolved === path.resolve(ROOT)) fail("拒绝清理危险目录：" + resolved);
  if (!fs.existsSync(resolved)) return [];
  const removed = [];
  for (const entry of fs.readdirSync(resolved, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(resolved, entry.name);
    if (!fs.existsSync(path.join(dir, MANIFEST_NAME))) continue;
    fs.rmSync(dir, { recursive: true, force: true });
    removed.push(entry.name);
  }
  return removed;
}

function runStep(step, inputs, outDir, incremental) {
  const result = spawnSync(process.execPath, [path.join(HERE, step), ...inputs], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      LCP_CODEGEN_OUT: outDir,
      LCP_CODEGEN_INCREMENTAL: incremental ? "true" : "false"
    },
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) fail(step + " 启动失败：" + result.error.message);
  if (result.status !== 0) fail(step + " 退出码 " + result.status);
}

const SKIP_DIRS = new Set(["node_modules", "target", "dist", ".git"]);

function walkFiles(dir, base = dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(full, base));
    else if (entry.isFile()) files.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return files;
}

function buildExports(options, stepInputs, outDir) {
  if (!options.export) return [];
  const mappings = stepInputs.map((file) => {
    const raw = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
    const bundle = raw?.bundle ?? raw;
    const appKey = bundle?.app?.key;
    if (!appKey) fail("导出失败：Bundle 缺少 app.key");
    const appDir = path.join(outDir, appKey);
    if (!fs.existsSync(appDir)) fail("导出失败：找不到生成目录 " + appDir);
    return { file, raw, appKey, appDir };
  });
  const keys = new Set(mappings.map((item) => item.appKey));
  if (keys.size !== mappings.length) fail("导出失败：多个 Bundle 生成了同一个 app.key");

  const isZip = /\.zip$/i.test(options.export);
  if (isZip && mappings.length > 1) fail("导出到单个 zip 时只能包含一个应用；请传目录或逐个导出");
  if (!isZip) fs.mkdirSync(options.export, { recursive: true });

  return mappings.map((item) => {
    const outFile = isZip ? options.export : path.join(options.export, item.appKey + ".zip");
    return exportPackage({
      bundleFile: item.file,
      appDir: item.appDir,
      outFile,
      raw: item.raw
    });
  });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputs = options.inputs.length > 0 ? options.inputs : defaultBundles();
  if (inputs.length === 0) usage();
  for (const file of inputs) {
    if (!fs.existsSync(file)) fail("文件不存在：" + file);
  }
  if (inputs.length > 1 && (options.appKey || options.appName || options.tenant)) {
    fail("参数覆盖只支持单个 Bundle，避免多个应用生成同一路径");
  }

  const outDir = options.dryRun
    ? fs.mkdtempSync(path.join(os.tmpdir(), "lcp-codegen-"))
    : options.out;
  let tempBundleDir = null;
  const started = Date.now();

  try {
    if (!options.dryRun) fs.mkdirSync(outDir, { recursive: true });
    const cleaned = options.clean && !options.dryRun ? safeClean(outDir) : [];

    let stepInputs = inputs;
    if (options.appKey || options.appName || options.tenant) {
      tempBundleDir = fs.mkdtempSync(path.join(os.tmpdir(), "lcp-bundle-"));
      stepInputs = inputs.map((file, index) => overrideBundle(file, options, tempBundleDir, index));
    }

    for (const step of STEPS) {
      if (!options.json) console.log(`\n>>> ${step}`);
      runStep(step, stepInputs, outDir, options.incremental);
    }

    const files = walkFiles(outDir);
    const apps = fs.readdirSync(outDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(outDir, entry.name, MANIFEST_NAME)))
      .map((entry) => entry.name)
      .sort();
    const exported = buildExports(options, stepInputs, outDir);
    const summary = {
      out: outDir,
      dryRun: options.dryRun,
      incremental: options.incremental,
      cleaned,
      apps,
      exports: exported,
      files: files.length,
      bytes: files.reduce((total, rel) => total + fs.statSync(path.join(outDir, rel)).size, 0),
      elapsedMs: Date.now() - started
    };

    if (options.dryRun) {
      if (!options.json) {
        console.log("\n==================== dry-run 文件清单 ====================");
        for (const rel of files.slice().sort()) console.log("  " + rel);
      }
      if (options.keepTemp) {
        summary.keptTemp = outDir;
      } else {
        fs.rmSync(outDir, { recursive: true, force: true });
      }
    }

    if (options.cleaned) summary.cleaned = cleaned;
    if (options.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log("\n==================== codegen 汇总 ====================");
      console.log(`  输出 ${summary.out}`);
      console.log(`  应用 ${apps.length} 个：${apps.join(", ") || "(无)"}`);
      console.log(`  文件 ${summary.files} 个 · ${(summary.bytes / 1024).toFixed(1)} KB · 耗时 ${summary.elapsedMs} ms`);
      console.log(`  模式 ${options.incremental ? "增量" : "全量"}${options.dryRun ? " · dry-run" : ""}`);
      if (cleaned.length) console.log(`  已清理：${cleaned.join(", ")}`);
      for (const item of exported) {
        console.log(`  导出 ${item.file}（${item.entries} 个条目 · ${(item.bytes / 1024).toFixed(1)} KB）`);
      }
      console.log("");
    }
  } finally {
    if (tempBundleDir) fs.rmSync(tempBundleDir, { recursive: true, force: true });
  }
}

main();
