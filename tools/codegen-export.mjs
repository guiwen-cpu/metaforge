import fs from "node:fs";
import path from "node:path";
import { contentChecksum, fullChecksum, sha256 } from "./bundle-content.mjs";
import { readZip, writeZip } from "./zip.mjs";

const SKIP_DIRS = new Set(["node_modules", "target", "dist", ".git", ".idea"]);

function walk(root, base = root) {
  const files = [];
  if (!fs.existsSync(root)) return files;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walk(full, base));
    else if (entry.isFile()) files.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return files;
}

function readManifest(appDir, relative, prefix = "") {
  const file = path.join(appDir, relative);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => prefix + line);
}

/**
 * 只收集四个生成器清单里声明过的文件，避免把 package-lock.json、构建缓存或手写文件带进包。
 * 旧产物没有 PROJECT.txt 时退回全目录扫描，但继续排除构建目录与锁文件。
 */
export function collectOwnedFiles(appDir) {
  const owned = new Set([
    ...readManifest(appDir, "GENERATED.txt"),
    ...readManifest(appDir, "api/GENERATED.txt", "api/"),
    "api/GENERATED.txt",
    ...readManifest(appDir, "web/GENERATED.txt", "web/"),
    "web/GENERATED.txt"
  ]);
  if (fs.existsSync(path.join(appDir, "PROJECT.txt"))) {
    owned.add("PROJECT.txt");
    for (const rel of readManifest(appDir, "PROJECT.txt")) owned.add(rel);
  } else {
    for (const rel of walk(appDir)) {
      if (/(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/.test(rel)) continue;
      owned.add(rel);
    }
  }
  return [...owned].filter((rel) => fs.existsSync(path.join(appDir, rel))).sort();
}

function bundleMeta(raw) {
  const bundle = raw?.bundle ?? raw;
  return {
    key: bundle?.app?.key ?? null,
    name: bundle?.app?.name ?? null,
    id: bundle?.app?.id ?? null,
    tenantId: bundle?.tenantId ?? null,
    protocolVersion: bundle?.protocolVersion ?? null
  };
}

/**
 * 把一份 Bundle 与它的出码产物打成一个可移交的 zip。
 * 包内固定包含 bundle.json、MANIFEST.json、README.md 与 generated/ 目录。
 */
export function exportPackage({ bundleFile, appDir, outFile, raw }) {
  const bundleText = fs.readFileSync(bundleFile, "utf8");
  const rawBundle = raw ?? JSON.parse(bundleText);
  const meta = bundleMeta(rawBundle);
  const files = collectOwnedFiles(appDir);
  const generated = files.map((rel) => {
    const data = fs.readFileSync(path.join(appDir, rel));
    return { path: `generated/${rel}`, sha256: sha256(data), bytes: data.length, data };
  });

  const manifest = {
    formatVersion: 1,
    tool: "tools/codegen.mjs",
    generatedAt: new Date().toISOString(),
    app: { key: meta.key, name: meta.name, id: meta.id },
    tenantId: meta.tenantId,
    protocolVersion: meta.protocolVersion,
    contentChecksum: contentChecksum(rawBundle),
    fullChecksum: fullChecksum(rawBundle),
    files: [
      { path: "bundle.json", sha256: sha256(bundleText), bytes: Buffer.byteLength(bundleText) },
      ...generated.map(({ path: file, sha256: hash, bytes }) => ({ path: file, sha256: hash, bytes }))
    ]
  };

  const readme = [
    `# ${meta.name ?? meta.key ?? "LCP"} 导出包`,
    "",
    "- `bundle.json`：导出的元数据 Bundle，可用于出码、归档或重新导入。",
    "- `MANIFEST.json`：内容摘要与逐文件 SHA-256，便于校验包是否被改动。",
    "- `generated/`：本次出码产物（已排除 node_modules / target / dist）。",
    "",
    "对比在线版本：",
    "```powershell",
    `node tools/version-diff.mjs --export ${path.basename(outFile)} --online <appId> --version <n> --tenant ${meta.tenantId ?? "<tenant>"}`,
    "```",
    ""
  ].join("\n");

  const entries = [
    { name: "bundle.json", data: bundleText },
    { name: "MANIFEST.json", data: JSON.stringify(manifest, null, 2) + "\n" },
    { name: "README.md", data: readme },
    ...generated.map(({ path: file, data }) => ({ name: file, data }))
  ].sort((left, right) => left.name.localeCompare(right.name));
  writeZip(outFile, entries);

  return {
    file: outFile,
    app: meta,
    entries: entries.length,
    generatedFiles: generated.length,
    bytes: fs.statSync(outFile).size,
    contentChecksum: manifest.contentChecksum
  };
}

function isZip(file) {
  return fs.existsSync(file) && fs.statSync(file).isFile() && /\.zip$/i.test(file);
}

/** 读取导出包 / 普通 bundle.json 的元数据；目录包读取根下的 bundle.json。 */
export function readBundleSource(file) {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) throw new Error("文件不存在：" + file);
  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    const bundleFile = path.join(resolved, "bundle.json");
    if (!fs.existsSync(bundleFile)) throw new Error("目录里没有 bundle.json：" + file);
    return { raw: JSON.parse(fs.readFileSync(bundleFile, "utf8").replace(/^\uFEFF/, "")), source: bundleFile, kind: "directory" };
  }
  if (isZip(resolved)) {
    const entries = readZip(resolved);
    let data = entries.get("bundle.json");
    if (!data) {
      const found = [...entries.keys()].find((name) => name.endsWith("/bundle.json"));
      if (found) data = entries.get(found);
    }
    if (!data) throw new Error("导出包里没有 bundle.json：" + file);
    return { raw: JSON.parse(data.toString("utf8").replace(/^\uFEFF/, "")), source: resolved, kind: "zip" };
  }
  if (!/\.json$/i.test(resolved)) throw new Error("只支持 .zip、目录或 .json：" + file);
  return { raw: JSON.parse(fs.readFileSync(resolved, "utf8").replace(/^\uFEFF/, "")), source: resolved, kind: "json" };
}
