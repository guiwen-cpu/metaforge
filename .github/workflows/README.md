# GitHub Actions 工作流关系

三个工作流按分支拆分，职责不重叠：`ci.yml` 只做门禁，`staging.yml` 负责 `dev` 预发，`release.yml` 负责 `main` 生产。

## 总览

| 工作流 | 触发 | 主要职责 | 产物 / 动作 |
|---|---|---|---|
| `ci.yml` | 所有 PR；push `dev` / `main` | 协议校验、出码器自检、示例前端构建、BFF 打包、compose / shell 契约校验 | 无产物，不部署 |
| `staging.yml` | push `dev`；手动 `workflow_dispatch` | 预发校验 → 构建镜像 → 自动部署 | GHCR `:staging` / `:sha-<commit>` |
| `release.yml` | push `main` | 生产校验 → 构建镜像 → 自动部署 | GHCR `:prod` / `:sha-<commit>` |

## 流程图

```text
PR / push dev|main
        │
        ▼
   ci.yml（仅校验，无镜像）

push dev ───────────────► staging.yml
                          validate
                             │ needs
                             ▼
                          images ──► GHCR web/bff :staging, :sha-<commit>
                             │ needs
                             ▼
                          deploy ──► SSH /opt/metaforge
                                     └─ deploy/release.sh staging（TAG=sha-<commit>）

push main ──────────────► release.yml
                          validate
                             │ needs
                             ▼
                          images ──► GHCR web/bff :prod, :sha-<commit>
                             │ needs
                             ▼
                          deploy ──► SSH /opt/metaforge
                                     └─ deploy/release.sh prod（TAG=sha-<commit>）
```

## 关键关系

- **工作流之间没有 `needs`。** GitHub Actions 不能用一个工作流 `needs` 另一个工作流，所以 `staging.yml` / `release.yml` 各自保留 `validate` job，不依赖 `ci.yml` 的运行结果。`ci.yml` 失败不会自动阻止发布流水线启动，这是重复校验的原因。
- **`ci.yml` 只做门禁。** 不登录 GHCR、不构建镜像、不接触主机；适合在 PR 上快速反馈。
- **`staging.yml` 跟随 `dev`。** `:staging` 是可变指针，部署时使用 `:sha-<commit>` 固定到本次构建；目标机对齐 `dev`。
- **`release.yml` 跟随 `main`。** 推送主干即发布生产，不再依赖 `v*` 标签；`:prod` 是可变指针，部署同样使用 `:sha-<commit>`，目标机对齐 `main`。
- **部署动作统一收敛在 `deploy/release.sh`。** 两个部署 job 只负责 SSH 登录、对齐分支和传入 `TAG`；真正的 `pull → migrate → up` 由脚本完成，避免两套部署逻辑漂移。
- **环境隔离靠 Compose 项目名与覆盖层。** 脚本使用 `-p metaforge-<env>` 和 `compose.<env>.yaml`；staging / prod 的数据卷、容器、网络互不影响。

## 并发控制

| 工作流 | concurrency group | cancel-in-progress | 效果 |
|---|---|---|---|
| `ci.yml` | `ci-${{ github.ref }}` | `true` | 同一 PR / 分支只保留最新校验，旧运行取消 |
| `staging.yml` | `deploy-staging` | `false` | 预发发布串行，不打断进行中的部署 |
| `release.yml` | `deploy-production` | `false` | 生产发布串行，不打断进行中的部署 |

- `cancel-in-progress: false` 表示当前运行不会被取消；GitHub 只保留一个待运行项，因此快速连续推送时，中间提交可能被最新一次替换。当前部署完成后会继续执行最新的待运行任务。
- 如果每个提交都必须单独部署，请逐个推送，或对历史提交使用 Actions 的 “Re-run all jobs”。

## 共享依赖

| 路径 | 被谁使用 | 作用 |
|---|---|---|
| `tools/validate.mjs` | `ci.yml`、`staging.yml`、`release.yml` | Schema / registry / 示例 bundle 一致性校验 |
| `bff/pom.xml` | `ci.yml`、`staging.yml`、`release.yml` | BFF 打包；当前均跳过单测 |
| `codegen/leave_approval/web` | `ci.yml` | 出码示例前端构建 |
| `deploy/web/Dockerfile` | `staging.yml`、`release.yml` | 设计器 + `/demo/` 的 Nginx 镜像 |
| `deploy/bff/Dockerfile` | `staging.yml`、`release.yml` | JRE 21 运行镜像 |
| `deploy/compose*.yaml`、`.env*.example` | `ci.yml`（校验）、部署主机（运行） | 环境组合与变量契约 |
| `deploy/release.sh` | `staging.yml`、`release.yml` | 目标机发布入口：`pull → migrate → up` |
| `deploy/.env.staging`、`deploy/.env.prod` | 部署主机 | 真实密码与可选默认 `TAG`；不入 Git |

## 仓库配置

| 名称 | 类型 | 用途 |
|---|---|---|
| `STAGING_HOST` / `STAGING_USER` / `STAGING_SSH_KEY` | Secrets | 预发主机登录 |
| `PROD_HOST` / `PROD_USER` / `PROD_SSH_KEY` | Secrets | 生产主机登录 |
| `GITHUB_TOKEN` | 自动注入 | 登录 GHCR 并推送镜像 |
| `staging` / `production` | Environments | 存放环境级密钥，可配置人工审批与保护规则 |

> 推送即部署，不再使用 `DEPLOY_*_ENABLED` 开关。请先确保目标机已有 `deploy/.env.staging` / `deploy/.env.prod`，并配置好对应 Secrets；需要人工卡点时，在 Environment 中配置保护规则。

## 典型发布顺序

1. 功能分支提 PR：`ci.yml` 校验。
2. 合并/推送到 `dev`：`staging.yml` 构建 `:staging` / `:sha-*` 并自动部署预发。
3. 在预发验收。
4. 合并到 `main`：`release.yml` 构建 `:prod` / `:sha-*` 并自动部署生产。
5. 回滚：重新运行旧提交对应的 `release.yml`，或在目标机执行 `TAG=sha-<旧提交> sh deploy/release.sh prod`。

## 维护提示

- 新增校验项时，优先同时更新 `ci.yml` 与两个发布工作流的 `validate`，避免门禁与发布口径不一致。
- 修改 `deploy/release.sh`、Compose 覆盖层或环境变量后，`ci.yml` 的 `compose` job 会先发现契约问题。
- `concurrency` 已按环境分组：预发与生产各自串行，CI 同分支只保留最新一次；新增部署环境时记得使用独立的 group。
- `:prod` 只是便于识别的可变指针；生产部署和回滚都应使用 `:sha-<commit>`。