# 历史构建与修补脚本

这里的脚本来自早期的 `work/` 草稿区，**不是日常工具链的一部分**。
当前仓库中的 `schema/`、`registry/`、`examples/leave-approval.bundle.json` 是**事实来源**；
这些脚本只保留用于追溯“文件是怎么一步步形成的”。

| 脚本 | 作用 |
|---|---|
| `legacy/build-registry.mjs` | 生成 `registry/builtin-components.json` 的基础版（不含后续 bindable / itemProps 修补） |
| `legacy/build-example.mjs` | 以外部 BPMN 文件为准增量维护 `examples/leave-approval.bundle.json` |
| `legacy/fix-schema.mjs` | 给 schema / registry 补 `bindable` 等字段 |
| `legacy/patch-*.mjs` | 给组件属性补 `itemProps`、给表达式注册表补算子与约定 |
| `legacy/resolve.mjs` / `verify-fix.mjs` / `clean.mjs` | 早期调试脚本 |

**不要直接重跑这些脚本并提交结果**，除非你确认它们与当前事实来源的差异。
日常入口请回到仓库根目录的 `tools/validate.mjs` 与 `tools/gen-*.mjs`。
