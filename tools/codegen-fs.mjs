import fs from "node:fs";
import path from "node:path";

/**
 * 增量写入：内容相同就不碰文件。
 *
 * 生成器仍然完整计算产物，只有落盘这一步做比较；这样既能保留确定性输出，
 * 又不会让每次出码都把整棵树标记成已修改。设置 LCP_CODEGEN_INCREMENTAL=false
 * 可以退回全量写入，便于排查文件系统或编码问题。
 */
export function createWriteStats() {
  return { changed: 0, unchanged: 0 };
}

export function writeTextIfChanged(file, text, stats, options = {}) {
  const incremental = process.env.LCP_CODEGEN_INCREMENTAL !== "false";
  if (incremental && fs.existsSync(file)) {
    try {
      if (fs.readFileSync(file, "utf8") === text) {
        stats.unchanged += 1;
        return false;
      }
    } catch {
      // 读取失败按变更处理，交给正常写入给出明确错误。
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
  stats.changed += 1;
  if (options.label) console.log(`  ${options.label} ${path.relative(process.cwd(), file)}`);
  return true;
}

export function writeStatsText(stats) {
  return `变更 ${stats.changed} 个 · 未变 ${stats.unchanged} 个`;
}
