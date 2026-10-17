# MetaForge

通用型低代码开发平台。面向学校教务信息化系统与公司办公系统的**元数据驱动**低代码平台：
可视化搭建 + 少量代码扩展，快速交付管理系统。

## 当前进度

| 模块 | 状态 |
|---|---|
| 统一 Schema 协议（6 份 JSON Schema + 2 份注册表） | 完成 |
| L1~L4 校验流水线 `tools/validate.mjs` | 完成 |
| TS / Java 双端类型绑定 | 已生成；Java 尚未编译验证 |
| 出码 · 第一步：DataSchema → PG DDL + TS / Java 实体 | 完成 |
| 出码 · 第二步：DataSchema → BFF CRUD + TS 客户端 + 权限清单 | 完成 |
| 出码 · 第三步：DataSchema → Vue3 CRUD 页面 + OSS 直传 | 完成，前端已通过 typecheck / build |
| 可视化页面设计器、数据模型设计器 | 规划中 |
| 逻辑编排引擎、审批流页面、多端发布 | 规划中 |
| AI 辅助生成、模板市场 / 应用市场 | 规划中 |

## 目录

- `schema/` —— 6 份 JSON Schema（159 个 `$defs`）+ 表达式注册表
- `registry/` —— FieldType 四向映射（19 个类型）、38 个内置组件契约
- `ts/` —— TypeScript 协议绑定（204 个导出类型）
- `java/` —— Java 协议绑定（Maven 工程，含随包发布的 Schema 资源副本）
- `tools/` —— 校验器与出码引擎：`validate.mjs`、`gen-ts.mjs`、`gen-java.mjs`、`gen-entity.mjs`、`gen-api.mjs`、`gen-page.mjs`
  - `tools/dev/` —— 本地联调：`mock-bff.mjs`（内存 CRUD）与 `dev.mjs`（同时拉起 Mock 与示例前端）
  - `tools/archive/` —— 早期 bootstrap 与一次性修补脚本（仅追溯，不作为日常入口）
- `examples/` —— 请假审批参考 Bundle（含 BPMN 20 XML）；`probes/` 为校验探针
- `codegen/<appKey>/` —— 出码产物：`sql/`、`ts/`、`java/`、`api/`、`web/`（生成物，不要手改）
- `PROTOCOL.md` —— 协议总览：分层模型、表达式 DSL、快照与回滚、组件契约、沙箱、扩展指南
- `项目提示词.txt` —— 产品定位、技术栈与模块清单

## 技术栈

- 前端：Vue3 + Vite + TypeScript、Element Plus、Pinia、TailwindCSS，阿里云 OSS 直传（STS 临时凭证）
- 后端：Java + Spring Boot、Flowable（BPMN 工作流）、BFF 聚合层
- 数据：PostgreSQL（元数据 + 业务数据，善用 JSONB）、Redis（缓存 / 会话 / 分布式锁）

## 架构原则

- 元数据驱动：控制平面 + 数据平面 + 运行时引擎共享同一份 Schema
- 前后端通过统一 Schema 协议通信；所有业务表带租户标识
- 元数据变更版本化、可回滚；Schema 全量预留 `Semantic` 语义字段，为 AI 接入做准备

## 快速开始

要求 Node >= 18。校验器与生成器零第三方依赖，在仓库根目录执行：

```bash
npm run validate            # 等价于 node tools/validate.mjs
node tools/gen-ts.mjs       # 重新生成 ts/
node tools/gen-java.mjs     # 重新生成 java/

# 出码引擎（以请假审批 Bundle 为例）
node tools/gen-entity.mjs examples/leave-approval.bundle.json
node tools/gen-api.mjs    examples/leave-approval.bundle.json
node tools/gen-page.mjs   examples/leave-approval.bundle.json
```

## 本地运行示例前端

当前仓库包含协议库、出码引擎和一份生成的示例前端，平台主应用与 Spring Boot BFF 尚未落地。
本地可以直接把这份示例跑成可点击的 CRUD 页面：

```bash
# 首次：安装示例前端依赖
npm install --prefix codegen/leave_approval/web

# 启动 Mock BFF（:8080）+ 示例前端（:5174）
npm run dev
```

打开 http://localhost:5174 ，可以看到「人员 / 请假单 / 附件」三张表，支持分页、搜索、排序、
新增、编辑、删除，以及乐观锁版本冲突提示。

- `npm run mock`：只启动 Mock BFF；数据在内存中，重启即重置。
- `npm run dev:web`：只启动前端，默认把 `/api` 代理到 `http://localhost:8080`。
- 上传字段会调用 `/api/v1/platform/oss/sts`；Mock 返回 501，需接真实 BFF 的阿里云 STS 才能验证。
- Mock 只用于本地联调，不实现租户、权限、Flowable 与事务语义，不是生产后端。

## Java 侧

`java/` 目前是 Schema 协议的 Maven 库（Jackson DTO + 资源文件），不是可启动服务：

```bash
cd java
mvn -q compile
```

Spring Boot BFF、Flowable、PostgreSQL / Redis 运行时尚未落地；BFF 模块建立后再补充完整启动方式。

## 已知边界

- `java/` 与协议绑定的 `ts/` 产物尚未编译验证（当前环境无 JDK / Maven / 独立 tsc）；
  首次 `mvn -q compile` / `tsc --noEmit` 之前不要假定能通过，报错请改生成器。
- 第三步生成的前端已实测 `vue-tsc --noEmit` + `vite build` 通过；Java 产物仍未编译。
- 校验器当前残留 1 条 warn：`leave_approval` 流程的第二个监听器未限定 `taskKey`，将对所有节点生效。

协议细节见 `PROTOCOL.md`。