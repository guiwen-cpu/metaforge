# 出码工具

## 统一出码

```powershell
node tools/codegen.mjs examples/leave-approval.bundle.json
node tools/codegen.mjs examples/leave-approval.bundle.json --out .tmp/codegen --dry-run
node tools/codegen.mjs examples/leave-approval.bundle.json --app-key smoke_app --app-name 冒烟应用 --tenant tenant_smoke
```

依次执行 `gen-entity → gen-api → gen-page → gen-project`。四个生成器都读取
`LCP_CODEGEN_OUT`，默认增量写入：内容相同就不碰文件；`--no-incremental` 或
`LCP_CODEGEN_INCREMENTAL=false` 可强制全量。

- `--out <dir>`：输出根目录，默认 `codegen/`
- `--dry-run`：在系统临时目录跑完整生成，只打印清单；`--keep-temp` 可保留现场
- `--clean`：只清理输出根目录下带 `GENERATED.txt` 的直属应用目录
- `--app-key` / `--app-name` / `--tenant`：覆盖 Bundle，只支持单个输入
- `--json`：输出机器可读摘要

## 导出包

```powershell
node tools/codegen.mjs examples/leave-approval.bundle.json --export dist/leave_approval.zip
```

包内结构：

```
bundle.json           导出的元数据
MANIFEST.json         内容摘要 + 逐文件 SHA-256
README.md             包说明与对比命令
generated/            出码产物（排除 node_modules / target / dist）
```

`--export` 传目录时为每个应用各生成一个 `<appKey>.zip`；传 `.zip` 时只能包含一个应用。

## 与在线版本对比

```powershell
# 账号密码登录（本地默认租户可从 Bundle 推断）
node tools/version-diff.mjs --export dist/leave_approval.zip --online <appId> --version 9 `
  --tenant tenant_demo_school --username alice --password alice123

# 复用已有 JWT
$env:LCP_TOKEN = "<jwt>"
node tools/version-diff.mjs --export dist/leave_approval.zip --online <appId>

# 两个本地包 / Bundle 对比
node tools/version-diff.mjs --left dist/a.zip --right examples/leave-approval.bundle.json --json
```

对比口径与平台 `GET /platform/apps/{id}/versions/{from}/diff/{to}` 一致：去掉
`snapshot`，对象排序后算内容摘要，数组优先按 `key` / `id` / `name` 配对，最多 200 条变更。
`--fail-on-diff` 在内容不一致时返回退出码 1，`--out <file>` 可落盘完整 JSON。

自检：

```powershell
node tools/version-diff.mjs --self-test
```

## 产物归属

- `gen-entity`：`sql/`、`ts/`、`java/`、顶层清单
- `gen-api`：`api/`
- `gen-page`：`web/`
- `gen-project`：`server/`、Compose、Nginx、`sql/95_force_rls.sql` 等组装文件，清单为 `PROJECT.txt`

生成器只清理自己清单内的文件；`sql/95_force_rls.sql` 由 `gen-project` 拥有，实体生成器会跳过。
