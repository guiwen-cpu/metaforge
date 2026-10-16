# LCP Schema Protocol v0.1 · TypeScript 类型包

由 `tools/gen-ts.mjs` 从 6 份 Schema + 2 份注册表生成，**生成文件请勿手工修改**。

```bash
node tools/gen-ts.mjs        # 重新生成 types.ts / guards.ts / registry.ts / index.ts / README.md
```

## 文件职责

| 文件 | 来源 | 说明 |
|---|---|---|
| `types.ts` | 生成 | 6 个命名空间全部 `$defs` 的类型定义 |
| `guards.ts` | 生成 | 判别联合的运行时守卫与判别器 |
| `registry.ts` | 生成 | 枚举字面量、FieldType 四向映射、表达式注册表 |
| `index.ts` | 生成 | barrel |
| `expr.ts` | 手写 | `common.Expr` 的 5 分支模型 + 构造器 + 遍历器 |
| `text.ts` | 手写 | `common.Text` 的多语言读写 |

## 生成规则（改 Schema 前先读）

1. 类型名 = 命名空间前缀 + PascalCase；名字已以该前缀开头则不重复加前缀。
2. `$defs` 里的纯别名（只有 `$ref`）生成 `type A = B` 并标 `@alias`，保持 Schema 与类型 1:1。
3. 可选性：`required` 且无 `default` 必填；否则加 `?` 并补 `| null`。
4. 分支 `properties.type.const` 全为字符串的 `oneOf` 生成具名成员 interface + 判别联合。
5. 带 `required` 约束的 `anyOf`（至少提供一个）生成 `Base & ({a} | {b})`，不降级成全可选。
6. 内联对象生成具名嵌套 interface，名字 = 宿主类型 + 属性路径，紧跟宿主定义输出。
7. `patternProperties`（`^x-`）生成 `[key: string]: unknown` 索引签名。

## 枚举清单（`registry.ts` 的 `*_VALUES`）

| 类型 | 项数 | 值 |
|---|---|---|
| `CommonScope` | 3 | "system", "tenant", "app" |
| `CommonBreakpointKey` | 5 | "xs", "sm", "md", "lg", "xl" |
| `DataFieldType` | 19 | "string", "text", "richText", "integer", "decimal", "boolean", "date", "datetime", "time", "json", "enum", "ref", "file", "image", "video", "array", "signature", "location", "formula" |
| `UiPageKind` | 9 | "list", "form", "detail", "dashboard", "approval", "report", "custom", "login", "error" |
| `ComponentKind` | 8 | "layout", "container", "field", "display", "action", "data", "chart", "advanced" |
| `ComponentPropType` | 33 | "string", "number", "integer", "boolean", "text", "json", "enum", "color", "icon", "cssLength", "url", "dateFormat", "fileAccept", "expr", "slot", "node", "nodeList", "style", "actionRef", "pageRef", "entityRef", "dataSourceRef", "fieldRef", "eventRef", "fieldList", "columnList", "searchFieldList", "optionList", "buttonList", "ruleList", "assignee", "validatorList", "stepList" |

## 表达式 DSL 要点

- 头键只有 5 个：`$lit` / `$ref` / `$fn` / `$tpl` / `$if`；修饰键只有 `$fn.$args`、`$if.$then`、`$if.$else`。
- 歧义规则：对象仅当恰好含一个头键、且其余键都是该头键的合法修饰键时才是表达式。
  要写带 `$` 键的对象字面量必须包一层：`{ "$lit": { "$x": 1 } }`。
- `isExpr` 宽松（命中头键即算，运行时求值器用）；`isStrictExpr` 严格（修饰键也要合法，L1 校验用）。
- 读路径带 `$` 根（`$page.state.x`），写路径是相对路径（`state.x`）。
- `$ctx.result` 只在紧邻下一步有效，下一步执行即被覆盖。

## 与其它工件的关系

- `registry/builtin-components.json` 是数据，不内联进本包；前端直接 import JSON，
  用 `BuiltinComponentsFile` 做形状断言。
- `schema/expression-registry.json` 是表达式语义的唯一权威；本包只做类型化再导出。
- 生成的类型是**元数据**的类型，不是业务实体的类型。业务实体类型由出码引擎读
  `FIELD_TYPE_MAPPING` 生成，二者不要混用。
