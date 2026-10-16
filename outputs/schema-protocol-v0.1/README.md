# LCP Schema Protocol · v0.1 协议总览

> MetaForge 的元数据地基。**控制平面、数据平面、运行时引擎共享同一份 Schema —— 不存第二份副本。**

三份子 Schema（`data` / `ui` / `logic`）描述「系统长什么样、怎么长」；组件契约描述「能装配哪些零件」；
`AppBundle` 把二者连同资产、权限、快照封成**一次发布的原子单元**。设计器产出它，校验器守它，
BFF 与运行时读它，出码引擎编译它，AI 生成它 —— 全部围绕同一份 Schema。

## 目录结构

```
schema-protocol-v0.1/
├─ schema/                      6 份 JSON Schema（协议本体，唯一真源）
│  ├─ common.schema.json        共享基元（18 个定义）
│  ├─ data.schema.json          数据模型（15 个定义）—— 数据平面结构
│  ├─ ui.schema.json            页面模型（25 个定义）—— 控制平面结构
│  ├─ logic.schema.json         动作/API/流程/规则（56 个定义）—— 行为
│  ├─ component.schema.json     统一组件契约（21 个定义）
│  ├─ bundle.schema.json        信封 + 发布单元（24 个定义）
│  └─ expression-registry.json  表达式注册表（97 函数 / 14 取值根 / 12 查询算子）
├─ registry/
│  ├─ type-mapping.json         FieldType 四向映射（PG / TS / Java / 渲染组件），19 个类型
│  └─ builtin-components.json   38 个内置组件的契约实例（运行时读，不内联进代码）
├─ ts/                          TypeScript 绑定（生成 + 2 个手写文件）
├─ java/                        Java 绑定（Maven 工程，含 Schema 与注册表资源副本）
├─ examples/                    参考 Bundle：请假审批（含 BPMN XML）
└─ tools/                       gen-ts.mjs / gen-java.mjs / validate.mjs
```

合计 `$defs` 159 个。两份注册表与 6 份 Schema 一起随 Java 包发布（`java/src/main/resources/lcp/`），
服务端校验器直接复用资源副本，**不允许另存两份以免漂移**。

## 一、分层模型：三个平面，一份 Schema

| 平面 | 组成 | 对 Schema 的权限 |
|---|---|---|
| 控制平面 | 可视化设计器、数据模型设计器、逻辑编排、元数据仓库、发布流水线 | **唯一写入方**。读写 Schema 文档，产出草稿与快照 |
| 数据平面 | 业务实体表、`jsonb` 扩展列、租户列 + RLS 行级隔离 | 只读**编译产物**（DDL / 列类型 / 校验谓词），不读 Schema 原文 |
| 运行时引擎 | 前端渲染器、BFF 聚合层、Flowable 工作流引擎、规则引擎、数据权限下推 | 只读**已发布快照**，拒绝草稿；不产生任何 Schema 变更 |

三条不可协商的约束：

1. **控制平面是唯一写入方。** 运行时若发现「需要改 Schema 才能跑」，那是协议缺口，要走版本升级，不能就地打补丁。
2. **数据平面读编译产物，不读 Schema。** 实体建表、列类型、索引由 `EntityStorage` + `registry/type-mapping.json` 一次性编译成 DDL；
   运行期只依赖 DDL 与映射表，因此 Schema 演进（新增可选字段、放宽约束）不触发数据平面停机。
3. **一次发布 = 一个原子快照。** `AppBundle.snapshot.version` 是唯一版本锚点，三份子 Schema、组件、资产、权限的版本在快照内强制对齐。

## 二、契约文件与引用方向

引用是**严格单向**的，`common` 在最低层：

```
common  ←  data / ui / logic / component  ←  bundle
```

- 四个业务契约文件之间**互不 `$ref`**，只能通过字符串引用互指：`ArtifactRef{kind,id,key,version}`。
  这样每份 Schema 都能被独立校验、独立 diff、独立回滚。
- `ArtifactRef.version` 缺省时解析到**所属快照内**该工件的版本 —— 这是「一次发布 = 一个原子快照」的实现基础；
  跨快照引用（`snapshotId`）只在模板市场导入 / 应用市场安装时允许，**运行时一律拒绝**（L1 强校验）。
- 二进制与文本资产（BPMN XML、图片、视频、Word 模板、导出代码）一律走 `AssetRef`：
  必填 `{assetId, key, kind, version}`，BPMN 作为独立资产版本化（`Flow.bpmnRef`），
  因此流程可单独回滚、可 diff，且**不污染业务表结构**。

四份契约的分工：

| 文件 | 回答的问题 | 顶层容器 |
|---|---|---|
| `data` | 数据长什么样：实体、字段、枚举、关系、索引、端点 | `{ dataSchema: DataSchema }` |
| `ui` | 界面长什么样：页面、路由、渲染树、数据源、状态、弹窗、事件 | `{ uiSchema: UISchema }` |
| `logic` | 系统怎么动：动作、步骤链、API、审批流、业务规则 | `{ logicSchema: LogicSchema }` |
| `component` | 能装配哪些零件：props / slots / events / capabilities / 数据契约 | `{ component: ComponentContract }` |
| `bundle` | 发布什么：信封 + 快照 + 工件清单 + 资产 + 权限 + 发布配置 | `{ bundle: AppBundle }` |

## 三、表达式 DSL

**唯一解释器语义，前后端 + Flowable + 规则引擎 + 数据权限下推共用一份注册表**
（`schema/expression-registry.json`）。任何一端私自定义函数视为缺陷。

基础形态 —— 只有 5 个头键、3 个修饰键：

| 头键 | 语义 | 修饰键 |
|---|---|---|
| `$lit` | 任意 JSON 字面量，原样返回 | — |
| `$ref` | 取值路径，首段必须是已注册的取值根 | — |
| `$fn` | 函数调用，函数名必须存在于注册表 | `$args` |
| `$tpl` | 字符串拼接，数组元素为字符串或子表达式（**不做字符串解析**） | — |
| `$if` | 条件表达式 | `$then`（必填）、`$else` |

**歧义规则（必须记牢）**：一个对象**仅当**它恰好含一个 `$` 开头的键、且该键是已知算子时，才被当成表达式。
所以要写一个带 `$` 键的普通对象字面量，必须包一层：`{"$lit": {"$x": 1}}`。

对称地，判定入口有两个（手写在 `ts/expr.ts`，校验器与运行时共用同一套判定）：
- `isExpr` 宽松（命中头键即算）—— 运行时求值器用，向后兼容优先；
- `isStrictExpr` 严格（连修饰键也要合法）—— L1 校验用，把错写的表达式当错误拦截。

**取值根（14 个）**：`$user` `$tenant` `$env` `$now` `$page` `$route` `$form` `$row` `$rows`
`$data` `$process` `$ctx` `$component` `$res`。`$ref` 的正则与 `valueRoots` 一一对应，未注册的根 L3 直接报错。

**读路径 vs 写路径**：读用带 `$` 根的路径（`$page.state.keyword`）；写用**相对路径**
（`AssignStep.target = "state.keyword"`）。这条不对称是刻意的 —— 写入目标必须能被静态定位到声明处，否则状态会被写飞。

**作用域时效**：`$ctx.result` 只在**紧邻的下一步**有效，下一步执行即被覆盖。跨步骤传值必须显式 `AssignStep`。

**JsonPath 不是 Expr**：`common.JsonPath` 是纯声明式定位（`$.data.rows`、`$.data[0].id`），
用于行集 / 总数 / 错误信息 / 出参映射。它**不参与运算**，因此不允许出现函数或取值根。需要计算就用 `Expr`。

**查询算子（12 个）**：`eq` `ne` `like` `startsWith` `in` `between` `gt` `gte` `lt` `lte` `isNull` `notNull`。

## 四、版本、快照与回滚

- `common.Version` 单调递增。**回滚 = 以历史快照的内容重新发布为新版本，version 继续递增、不覆盖历史。**
- `Snapshot` 必填 `{snapshotId, version, createdAt, author, status}`：
  - `status`: `draft` → `published` → (`archived` / `deprecated`)
  - `basedOn` 指父快照（首版缺省），`rollbackOf` 记录本快照从哪个历史快照回滚而来 —— 回滚链可追溯。
  - `message` **发布必填**：没有变更说明，版本管理形同虚设。
  - `changeSummary[]`（`ChangeEntry`）是结构化变更摘要，`breaking: true` 的条目**需人工确认才能发布**。
- `AppBundle.checksums` 是「工件路径 → 校验和」映射，用于完整性校验与**「内容未变不重复发布」**判定。
- `PublishConfig` 控制发布策略：`targets[]`（`web` / `mobile` / `miniprogram` / `wecom` / `dingtalk` / `desktop`）、
  `environments[]`、`requireApproval`（发到 prod 需二级审批）、`migrationStrategy`（`auto` / `strict` / `manual` / `none`）、
  `allowDestructive`（**默认禁止**自动 `DROP COLUMN` / `DROP TABLE`）、`backupBefore`、`rollbackWindowHours`（超窗需走数据补偿流程）。
- 元数据版本管理的最小单元是**工件**，回滚粒度因此可以细到「只回滚这个页面」，也可以粗到「整包回退」。
- 重命名保护：`UINode.id` / 所有 `Id` 是 ULID（Crockford Base32，全局唯一、单调递增、永不重用），
  **绝不用 `key` 代替 `id`** —— id 是 diff、版本对比、AI 定点修改、埋点定位的共同锚点；`key` 是给人看的、可以改的。

## 五、校验流水线 L1 ~ L4

```
node tools/validate.mjs [bundle.json ...]     # 不传参数则校验 examples/ 下全部 bundle
$env:LCP_JSON='1'                             # 机器可读模式：每行一条 JSON 诊断
```

退出码：`0` = 无 error（warn 不算失败）、`1` = 存在 error、`2` = 运行期异常。

| 层 | 名称 | 检查内容 |
|---|---|---|
| L1 | 结构 | 自带极简 JSON Schema 校验器（零依赖）校验 Bundle 信封与各子工件：类型、枚举、`const`、`pattern`、必填、`additionalProperties=false`、`oneOf` 唯一命中 |
| L2 | 语义 | 引用可解析、组件存在、字段存在、事件已声明、状态已声明、枚举可解析、角色已声明、`dependsOn` 同级数据源存在 |
| L3 | 映射 | FieldType 四向映射表完整性、`storage=column` 字段的类型族兼容、`taskKey` 与 BPMN `userTask` 对齐、表达式函数/取值根/查询算子必须在注册表内、`protocolVersion` 一致、菜单 key 不重复、Step 判别值不冲突 |
| L4 | 策略 | 沙箱越界、嵌套事务（`TransactionStep` 嵌套在已开启事务内直接拒绝）、破坏性 DDL、外部依赖缺超时、非幂等写接口 |

**去重说明**：同一处结构违规会被两个视角各报一次 —— L1 的信封层校验产生 `$.bundle.*` 指针，
子工件单独校验又产生 `$.*` 指针。报告前把 `$.bundle.` 归一化后按
`level|check|where|message` 去重，并保留「工件视角」的指针（它更贴近用户实际编辑的位置），
所以最终报告里同一个问题**只出现一次**。

参考 Bundle（`examples/leave-approval.bundle.json`）当前校验结果：**0 error / 1 warn**。
该 warn 是 `leave_approval` 流程上第二个监听器未限定 `taskKey`（将对所有节点生效），属已知项。

## 六、组件契约驱动五方

`component.schema.json` 是「统一组件契约」，被五方同时消费 —— 这是它作为核心地基的意义：

| 消费方 | 读契约的哪部分 |
|---|---|
| 设计器物料面板 | `group` / `icon` / `kind` / `deprecated` / `since` |
| 设计器属性面板 | `props[]`（`type` 决定控件、`bindable` 决定是否出现「绑定/表达式」开关、`when` 决定联动显隐、`advanced` 决定折叠） |
| 画布约束 | `container` / `acceptChildren` / `canBeChildOf` / `minChildren` / `maxChildren` |
| 运行时渲染分派 | `runtime` / `slots` / `events` / `actions` / `capabilities` / `data` |
| 出码引擎 | `props`（序列化器）、`slots`/`events`（模板生成）、`fieldBindings`（import 与默认映射） |
| AI 生成 | `props[].label` + `semantic` + `fieldBindings` 作为可选组件与参数的系统提示 |

几条硬约束：
- `UINode.component` 必须能解析到平台内建组件名，或包内存在同名 `ComponentContract`（L2 校验）。
- `UINode.props` 里每个 prop 是否允许表达式，由该 prop 的 `bindable` 决定；`bindable: false` 的位置出现 `Expr` 会被 L2 拒绝。
- `UINode.handlers` 的键必须是契约 `events[]` 中声明的事件名；`UINode.children` 仅在 `container: true` 时允许。
- `FieldBindings`（`forFieldTypes` / `forFormats` / `forPageKinds` / `priority` / `listRenderer`）是**「内置 CRUD 模板能自动工作」的原因**：
  设计器从实体一键生成表单/列表页时按此表选组件，出码引擎读同一张表。
- 平台内建组件**不入包**（`Artifacts.components` 只放租户自定义组件契约），内建清单由 `registry/builtin-components.json` 提供。

## 七、沙箱与代码扩展点

`SandboxPolicy` 是自定义组件与自定义代码**共用**的一套策略模型，**默认全拒，需要什么显式开什么**：

| 字段 | 含义 |
|---|---|
| `network` | 允许 `fetch` / `XHR`；**为真时必须同时声明 `allowedHosts`** |
| `allowedHosts` | 域名白名单，支持 `*.example.com` |
| `storage` | 允许 `localStorage` / `sessionStorage` |
| `dom` | 允许访问宿主 DOM；沙箱组件默认 `false` |
| `allowedModules` | 允许 `import` 的模块白名单，如 `['lodash-es','dayjs']` |

组件侧由 `ComponentContract.runtime` 分档：`builtin`（平台内建，可信）、
`remote`（动态加载的租户 JS 包）、`sandbox`（**iframe 隔离执行**）。
`remote` / `sandbox` 必须同时提供 `source` 与 `integrity`（如 `sha384-...`）—— 确保远程组件未被篡改。

代码扩展点是 `CodeStep`，它**强制声明 `inputs` / `outputs`** —— 这既是沙箱契约，也是 AI 生成与人工审查的边界：
- `ts` 源码在**沙箱 iframe / Worker** 内执行，必须导出默认函数 `(input) => output`；
- `java` 在**服务端受限类加载器**内执行。

与 `code` 步骤相对的是 `CustomStep`：引用**平台已审核通过**的处理器（如 `edu.generateStudentNo`），
可在沙箱外运行、可用平台内部服务。两者的区别是「谁来担保这段代码」。

## 八、代码生成（TS / Java 双端绑定）

```bash
node tools/validate.mjs     # 校验协议与示例 Bundle
node tools/gen-ts.mjs       # → ts/  types.ts guards.ts registry.ts index.ts README.md
node tools/gen-java.mjs     # → java/  src/main/java/**  +  resources/lcp/**  +  pom.xml  +  README.md
```

- 两端是**同一份 Schema 的两个绑定，类型名逐个相同**（`LogicStepAssign` 在 TS 与 Java 都叫 `LogicStepAssign`）。
  这不是审美问题：AI 提示词、Code Connect 映射、出码引擎都靠这个名字把两端对上。
  唯三例外：① 纯 `$ref` 别名与标量在 Java 侧不生成类（反查表在 `registry/Aliases`）；
  ② `common.Expr` 在 Java 侧叫 `CommonExpr`；③ 属性级内联枚举在 Java 侧变成具名枚举类。
- 两个生成器都**自带自检**并在末尾执行，失败即非零退出：括号配平、空类型/空赋值、引用完整性、
  `package` 与类名一致、类型简单名唯一、与 `ts/types.ts` 导出逐名对齐、枚举覆盖、资源存在性。
- 生成产物**不要手改**。`gen-java.mjs` 按 `java/GENERATED.txt` 清理上一轮的过期产物（定义被删、别名改名留下的孤儿类），
  所以也不要在生成目录里放手工文件。要改契约就改 Schema / 注册表，然后重跑生成器。

> **边界声明（重要）**：生成器跑在**没有 JDK 也没有 TypeScript 编译器**的环境里，
> `pom.xml` 与全部 Java 源、TS 源**都没有真正编译过**。自检只覆盖上一条列出的结构性不变量，
> **不等于可编译**。首次 `mvn -q compile` / `tsc --noEmit` 之前不要假定它能通过；
> 报错请**改生成器**，不要改产物。

## 九、扩展指南

### 9.1 新增一个 FieldType（四处齐改）

| # | 位置 | 改什么 |
|---|---|---|
| 1 | `schema/data.schema.json` → `$defs.FieldType` | 加枚举值（当前 19 个） |
| 2 | `registry/type-mapping.json` → `types.<新类型>` | 补齐 `pg` / `ts` / `java` / `widget` / `semantic` 五个分块 |
| 3 | `tools/gen-ts.mjs` | 落 TS 类型与 `FIELD_TYPE_MAPPING` 再导出 |
| 4 | `tools/gen-java.mjs` | 落 Java 类型与 `FieldTypeMapping` |

`data.FieldType` 与 `data.ValueType.type` 指向**同一个枚举**，实现上通过
`VALUE_TYPE_VALUES = DATA_FIELD_TYPE_VALUES` 别名共用，**禁止复制字面量**。
漏改任何一处，L1（枚举越界）/ L3（映射表比对）会立刻失败。

`FieldType` 当前取值：`string` `text` `richText` `integer` `decimal` `boolean` `date` `datetime`
`time` `json` `enum` `ref` `file` `image` `video` `array` `signature` `location` `formula`。

### 9.2 新增一个表达式取值根或函数

改 `schema/expression-registry.json` 一处即可：`valueRoots[]` 或 `functions[]`。
改完必须同步 `common.Expr` 里 `$ref` 的 `pattern`（取值根）—— L3 会比对两者。
新增函数还要在两端求值器实现；**注册表是唯一的函数清单**，任何一端私自定义函数视为缺陷。

`functions[].pure = false` 的函数**禁止**出现在编译期下推位置（`Access.rowFilter` / `Index.where`）。

### 9.3 标识符类型选择表

五种字符串标识各司其职，选错了会在下游出连锁问题：

| 类型 | 形态 | 用在哪 | 能不能当 SQL 列名 |
|---|---|---|---|
| `Key` | `snake_case` | 元数据标识：实体、字段、动作、页面、角色、枚举。同父作用域内唯一 | **能**，直接做列名 |
| `Ident` | `camelCase` | 编程标识：动作/API 入参名、页面参数名、代码步骤的输入输出变量名、按钮键 | 不能（要落到 TS 变量名/对象属性） |
| `HttpToken` | RFC 7230 token | HTTP 头字段名，含连字符 | 不能 |
| `JsonPath` | `$.a.b[0]` | 声明式取值路径（行集/总数/错误信息/出参映射），只定位不运算 | 不能 |
| `Id` | ULID | 主键与一切可寻址实体的稳定锚点 | 能 |

**绝不用 `Key` 代替 `Id`**：`Key` 是给人看的、随业务改名；`Id` 是机器锚点，改名时 id 不变。

### 9.4 新增一个内置组件

在 `registry/builtin-components.json` 的 `components[]` 里加一条 `ComponentContract` 实例（当前 38 个），
并确认它落在 `fieldBindingRule` 的约束内。运行时从 classpath `/lcp/builtin-components.json` 加载，
**不内联进生成的代码**，所以这份 JSON 是唯一真源。

## 十、当前状态与边界

| 项 | 状态 |
|---|---|
| 6 份 Schema + 2 份注册表 | 已完成，`$defs` 合计 159 |
| 校验器 | 已完成，四层流水线，`examples/` 参考 Bundle **0 error / 1 warn** |
| TypeScript 绑定 | 已生成，204 个导出类型；`expr.ts` / `text.ts` 为手写 |
| Java 绑定 | 已生成，265 个（144 DTO / 98 枚举 / 4 注册表 / 5 文档根 / 2 支撑 / package-info + 9 份资源 / pom + README + 清单） |
| 编译验证 | **未做**（环境无 JDK、无 tsc、无网络），见第八节边界声明 |
| 内置组件注册表 | 38 个组件契约，`kind` 覆盖 layout / container / data / field / display / action / advanced |

**尚未落地**（协议已预留位置，属于平台建设阶段）：设计器画布、元数据仓库的版本表与快照表、
出码引擎（计划用 ts-morph）、AI 生成链路（走同一个校验器）、模板市场 / 应用市场。
协议层为它们预留的关键位：`Semantic`（语义描述层，面向 AI 生成与自然语言检索，运行时忽略）、
`Origin`（生成溯源，记录 layout 从何而来，使模板升级与 AI 重生成可幂等重放）、
`BundleMeta.ai` / `BundleMeta.marketplace`、`InstallParam`（安装参数化）。
