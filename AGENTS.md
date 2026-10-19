# MetaForge · 工作约定

通用型低代码开发平台，面向学校教务与公司办公系统。可视化搭建 + 少量代码扩展。

## 先读什么

1. `PROGRESS.md` —— 当前进度、已完成模块、剩余路线图、下一步任务、环境与验证方式。
2. `PLATFORM.md` —— 控制平面 API、草稿/发布/版本/回滚数据流。
3. `PROTOCOL.md` —— Schema 协议与校验规则。
4. `schema/*.schema.json` —— 元数据唯一真源（bundle / data / ui / logic / component / common）。

新会话接手时，读完 1 即可恢复上下文，再按需读 2~4。

## 技术栈

- 前端：Vue3 + Vite + TypeScript + TailwindCSS + Element Plus + Pinia + Axios
- 后端：Java 21 + Spring Boot（BFF）+ Flowable + PostgreSQL（JSONB）+ Redis + 阿里云 OSS
- 设计器：`platform/`，控制平面 API 在 `/api/v1/platform/**`

## 目录

- `schema/` 协议 JSON Schema 与表达式注册表
- `registry/` 内置组件/表达式注册表
- `platform/` 低代码设计器（控制平面前端）
- `bff/` Spring Boot BFF（可启动）
- `java/` Schema 协议 Java 绑定
- `codegen/` 出码产物与示例应用
- `tools/` 校验、出码、开发脚本
- `deploy/` Docker Compose、Nginx、staging/prod 配置
- `ts/` 前端协议类型绑定

## 架构红线

1. **元数据驱动**：控制平面、数据平面、运行时共享同一份 Bundle。设计器不另造存储，新增产物放 `bundle.artifacts.*`。
2. **租户隔离**：所有业务表带 `tenant_id`；BFF 通过 RLS 会话变量执行；请求头 `X-Tenant-Id` / `X-User-Id`（生产由网关或 SSO 注入）。
3. **版本化**：元数据变更必须走草稿 → 发布 → 版本快照；支持 diff、回滚、恢复草稿。
4. **Schema 先行**：先改 `schema/*.schema.json`，再改双端类型与校验，最后改 UI。
5. **组件契约**：以 `schema/component.schema.json` 为准；平台扩展键统一 `x-` 前缀（如 `x-previewHtml`、`x-previewScript`）。
6. **前端不直连业务存储**：一律走 `platformApi` 或生成客户端。

## 常用命令

```powershell
# 前端
cd platform; npm run typecheck; npm run build

# 协议校验
node tools/validate.mjs

# 本地全栈
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
docker compose --env-file deploy/.env -f deploy/compose.yaml build web
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --force-recreate web

# Java
mvn -q -f java/pom.xml compile
mvn -q -f bff/pom.xml -DskipTests package

# Git
git diff --check
git add -A; git commit -m "..."; git push origin dev
```

环境注意事项：

- 必须使用 PowerShell；`bash` 会触发 WSL 报错。
- 根 `package.json` 是 `"type": "module"`，临时 Node 脚本用 `.mjs`。
- 写中文文件用 UTF-8 无 BOM（`[System.Text.UTF8Encoding]::new($false)`）。
- 长命令在 Windows 有长度上限，大文件分块 `WriteAllText` + `AppendAllText`。

## 验证方式

- 站点：`http://localhost:8080`
- CDP：`http://127.0.0.1:9222`（Node 22 自带 `WebSocket`，可写临时 `.mjs` 驱动）
- 演示应用与租户见 `PROGRESS.md` 的「环境快照」。
- 每个模块完成后的固定流程：`typecheck` → `build` → 重建 web 容器 → CDP 实测 → `git diff --check` → 提交并推送 `dev`。

## 代码风格

- Vue3 `<script setup lang="ts">`，Tailwind 原子类 + Element Plus。
- 领域逻辑放 `src/lib/*Model.ts`，页面只做编排与展示。
- 类型放 `src/types/*.ts`；跨页共享的纯函数优先放 `lib`。
- 中文界面文案；注释克制，只在非显然处解释「为什么」。
- 不新增依赖，除非现有能力确实无法覆盖。