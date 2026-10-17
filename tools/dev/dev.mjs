#!/usr/bin/env node
/** 一条命令启动本地 Mock BFF + 生成的示例前端（仅开发用）。 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const web = join(root, "codegen", "leave_approval", "web");
const vite = join(web, "node_modules", "vite", "bin", "vite.js");

if (!existsSync(vite)) {
  console.error("前端依赖未安装，请先执行：");
  console.error("  npm install --prefix codegen/leave_approval/web");
  process.exit(1);
}

const children = [];
let closing = false;

function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill();
  }
  setTimeout(() => process.exit(code), 200);
}

function run(name, args, options = {}) {
  const child = spawn(process.execPath, args, { stdio: "inherit", ...options });
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) console.error(`[${name}] 异常退出，code=${code}`);
    shutdown(code ?? 0);
  });
  children.push(child);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

run("mock", [join(here, "mock-bff.mjs")]);
run("web", [vite], { cwd: web });