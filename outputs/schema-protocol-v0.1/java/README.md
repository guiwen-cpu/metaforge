# LCP 元数据协议 0.1 · Java 绑定

由 `tools/gen-java.mjs` 从 `schema/*.schema.json` 与 `registry/*.json` 生成。**本目录任何文件都不要手改** ——
下一次生成会覆盖。要改契约请改 Schema / 注册表，然后重新跑生成器。

## 与 TypeScript 侧的关系

`ts/` 与 `java/` 是同一份 Schema 的两个绑定，类型名逐个相同（`LogicStepAssign` 在两端都叫 `LogicStepAssign`）。
这不是审美问题：AI 提示词、Code Connect 映射、出码引擎都靠这个名字把两端对上。三处例外：

- **别名与标量不生成类**。Java 没有类型别名，纯 `$ref` 定义与全部标量定义直接落到终点类型，
  反查表在 `registry/Aliases`。
- **`common.Expr` 在 Java 侧叫 `CommonExpr`**。TS 侧由手写的 `ts/expr.ts` 提供，Java 侧从 Schema 生成扁平类。
- **属性级内联枚举变成具名枚举类**（`enums/` 下）。TS 侧是字面量联合，Java 用枚举换类型安全。

## 目录

- `src/main/java/dev/lcp/schema/v01/dto` —— 元数据 DTO（判别联合是 interface + 成员类）
- `src/main/java/dev/lcp/schema/v01/enums` —— 枚举（$defs 级 + 属性级内联）
- `src/main/java/dev/lcp/schema/v01/registry` —— 字段类型映射、表达式注册表、内置组件、别名表
- `src/main/java/dev/lcp/schema/v01/document` —— 5 份文档型 Schema 的根容器
- `src/main/java/dev/lcp/schema/v01/support` —— `LcpObjectMapper` 与 `JsonbSupport`
- `src/main/resources/lcp` —— 6 份 Schema + 3 份注册表，随包发布，服务端校验器直接复用（不另存一份，免得漂移）

## 用法

```java
ObjectMapper mapper = LcpObjectMapper.shared();
DataSchemaDocument document = mapper.readValue(json, DataSchemaDocument.class);
String jsonb = JsonbSupport.write(mapper, document);   // 落 PostgreSQL 的 jsonb 列
```

- 读写 Schema DTO 一律走 `LcpObjectMapper.shared()`，不要各自 `new ObjectMapper()`：
  NON_NULL、时间格式（ISO-8601，不是纪元数字）、未知字段宽容这三条约定必须全链路一致。
- 落库走 `JsonbSupport`，不要自己拼 JSON 字符串；写库前先过 L1 校验。
- 本包只有元数据。业务表的 `tenant_id` 与行级权限不在 Schema 里，属于数据平面。

## 三种「Java 表达不了联合类型」的落地方式

1. **判别联合** -> `interface` + `@JsonTypeInfo(As.EXISTING_PROPERTY)` + `@JsonSubTypes`。判别值取**每个分支自己的 `const`**
   （`logic.ApiAuth` 各分支的判别键相同但取值不同，统一取第一个会写错）。成员类保留判别字段：带初值、不给 setter。
2. **扁平联合**（分支全是对象、又没有判别键）-> 合并字段进同一个类，用 `is<分支>()` 与 `head()` 判断命中的形态。
3. **透传包装**（含裸标量分支，当前只有 `common.Text`）-> `JsonNode` 原样收发，取值走 `asText()` / `i18n()`。

另外两处约定：`anyOf` 的「至少提供一组字段」落成 `@AssertTrue isConstraintSatisfied()`；
`x-` 扩展键落成 `@JsonAnyGetter` / `@JsonAnySetter`（读进 `LinkedHashMap`，不参与校验）。

## 关于「未经编译验证」

生成器跑在没有 JDK 的环境里，`pom.xml` 与全部 Java 源都没真正编译过。生成器的自检只覆盖：
括号配平、空类型/空赋值、`package` 与类名一致、引用完整性、类型名唯一、与 `ts/types.ts` 逐名对齐、枚举覆盖、资源存在性。
**首次跑 `mvn -q compile` 之前，不要假定它能编译通过；报错请改生成器，不要改产物。**

## 重新生成

```bash
node tools/gen-java.mjs
```

生成器按 `GENERATED.txt` 清理上一轮的过期产物（定义被删、别名改名留下的孤儿类），所以不要往这个目录放手工文件。