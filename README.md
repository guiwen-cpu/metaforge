# metaforge

通用型低代码开发平台。面向学校教务信息化系统与公司办公系统的**元数据驱动**低代码平台：
可视化搭建 + 少量代码扩展，快速交付管理系统。

## 当前进度

| 模块 | 状态 |
|---|---|
| 统一 Schema 协议（6 份 JSON Schema + 2 份注册表） | 完成 |
| L1~L4 校验流水线 `tools/validate.mjs` | 完成 |
| TS / Java 双端类型绑定（生成器） | 已生成，未经编译验证 |
| 可视化页面设计器、数据模型设计器 | 规划中 |
| 逻辑编排引擎、审批流页面 | 规划中 |
| 出码引擎（DDL / 实体 / 前端工程） | 规划中 |
| AI 辅助生成、模板市场 | 规划中 |

## 目录

- `outputs/schema-protocol-v0.1/` —— 协议层交付物，**入口文档见同目录下的 `README.md`**
  - `schema/` 6 份 JSON Schema（159 个 `$defs`）+ 表达式注册表
  - `registry/` FieldType 四向映射（19 个类型）、38 个内置组件契约
  - `ts/` TypeScript 绑定（204 个导出类型）
  - `java/` Java 绑定（Maven 工程，265 个文件，含随包发布的 Schema 资源副本）
  - `tools/` `validate.mjs`（L1~L4）、`gen-ts.mjs`、`gen-java.mjs`
  - `examples/` 请假审批参考 Bundle（含 BPMN 20 XML）
- `work/` —— 草稿区与元数据构建脚本（`build-registry.mjs`、`build-example.mjs`、`fix-schema.mjs`）
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

```bash
cd outputs/schema-protocol-v0.1

node tools/validate.mjs     # L1~L4 校验（期望 0 error / 1 warn）
node tools/gen-ts.mjs       # 重新生成 ts/
node tools/gen-java.mjs     # 重新生成 java/
```

要求 Node >= 18，零第三方依赖。

## 已知边界

- `java/` 与 `ts/` 的产物**未经编译验证**（构建环境无 JDK、无 tsc）。首次 `mvn -q compile` /
  `tsc --noEmit` 之前不要假定它能编译通过；报错请改生成器，不要改产物。
- 校验器当前残留 1 条 warn：`leave_approval` 流程的第二个监听器未限定 `taskKey`，将对所有节点生效。

协议细节（分层模型、表达式 DSL、快照与回滚、校验流水线、组件契约、沙箱、扩展指南）见
`outputs/schema-protocol-v0.1/README.md`。