// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.registry;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * L3 校验器与两个生成器（gen-ts / gen-java）共用本表，是「新增一个 FieldType 必须四处齐改」里那四处中的三处（PG、TS、Java）加组件契约的标准答案。新增类型必须在 DataSchema.FieldType 枚举、本表、gen-ts、gen-java 同时更新，L3 校验会强制比对。
 * 字段类型映射表，由 registry/type-mapping.json 生成。
 * 这是「建表 DDL / TypeScript 类型 / Java DTO / 设计器控件 / AI 语义」五处共用的单一来源，
 * 任何一处想改某个字段类型的落库方式，都要改注册表再重新生成，不要在业务代码里写死。
 */
public final class FieldTypeMapping {
    /** 协议版本。Schema / Bundle / 注册表三者必须一致，L1 校验会比对。 */
    public static final String PROTOCOL_VERSION = "0.1";

    /** 字段类型全集，与 Schema 的 data.FieldType 一一对应。 */
    public static final List<String> FIELD_TYPES = List.<String>of("string", "text", "richText", "integer", "decimal", "boolean", "date", "datetime", "time", "json", "enum", "ref", "file", "image", "video", "array", "signature", "location", "formula");

    /** 全部映射条目。 */
    public static final List<Entry> ENTRIES = List.of(
        new Entry("string", "varchar", 255, "text", true, true, true, null, null, null, null, null, null, "string", null, null, null, null, "String", List.<String>of(), null, null, null, "x-input", true, null, null, "短文本：姓名、编号、标题"),
        new Entry("text", "text", null, "text", false, false, true, null, null, null, null, null, null, "string", null, null, null, null, "String", List.<String>of(), null, null, null, "x-textarea", false, null, null, "长文本：说明、理由、备注"),
        new Entry("richText", "text", null, "text", false, false, true, null, null, null, null, null, null, "string", "HTML 片段，渲染前必须经白名单净化", null, null, null, "String", List.<String>of(), null, null, null, "x-rich-text", false, null, null, "富文本：公告正文、制度说明"),
        new Entry("integer", "integer", null, "integer", true, true, null, null, null, null, null, null, null, "number", null, null, null, null, "Integer", List.<String>of(), null, null, null, "x-number", true, null, null, "整数：数量、天数、排序号"),
        new Entry("decimal", "numeric", null, "numeric", true, true, null, 18, 4, null, null, null, null, "number", "金额/精度敏感场景由出码引擎替换为字符串十进制以规避浮点误差", null, null, null, "BigDecimal", List.<String>of("java.math.BigDecimal"), null, null, null, "x-number", true, null, null, "小数：金额、工时、分数"),
        new Entry("boolean", "boolean", null, "boolean", true, false, null, null, null, null, null, null, null, "boolean", null, null, null, null, "Boolean", List.<String>of(), null, null, null, "x-switch", true, null, null, "是/否：是否紧急、是否启用"),
        new Entry("date", "date", null, "text", true, true, null, null, null, "yyyy-MM-dd", null, null, null, "string", null, "yyyy-MM-dd", null, null, "LocalDate", List.<String>of("java.time.LocalDate"), "yyyy-MM-dd", null, null, "x-date-picker", true, Map.<String, Object>of("type", "date", "valueFormat", "YYYY-MM-DD"), null, "日期：生日、入职日"),
        new Entry("datetime", "timestamptz", null, "text", true, true, null, null, null, "ISO8601", null, null, null, "string", null, "ISO8601", null, null, "OffsetDateTime", List.<String>of("java.time.OffsetDateTime"), "ISO8601", null, null, "x-date-picker", true, Map.<String, Object>of("type", "datetime", "valueFormat", "YYYY-MM-DDTHH:mm:ssZ"), null, "时间点：开始时间、提交时间；一律带时区存储，展示按用户时区"),
        new Entry("time", "time", null, "text", true, false, null, null, null, "HH:mm:ss", null, null, null, "string", null, "HH:mm:ss", null, null, "LocalTime", List.<String>of("java.time.LocalTime"), null, null, null, "x-date-picker", false, Map.<String, Object>of("type", "time", "valueFormat", "HH:mm:ss"), null, "时刻：上课时间、值班时段"),
        new Entry("json", "jsonb", null, "jsonb", true, false, null, null, null, null, "GIN", null, null, "unknown", null, null, null, null, "JsonNode", List.<String>of("com.fasterxml.jackson.databind.JsonNode"), null, null, null, "x-json-editor", false, null, null, "结构化扩展数据：动态问卷答案、外部系统原始报文"),
        new Entry("enum", "varchar", 64, "text", true, true, null, null, null, null, null, null, null, "string", null, null, true, null, "String", List.<String>of(), null, "出码引擎可生成 Java enum 并在 Jackson 层做值校验；默认生成 String + @LcpEnumRef 注解", null, "x-select", true, null, null, "枚举：状态、类型。存字符串而非 PG enum 类型，避免加值要 DDL"),
        new Entry("ref", "varchar", 32, "text", true, true, null, null, null, null, null, null, null, "string", "被引用实体的主键", null, null, null, "String", List.<String>of(), null, null, null, "x-select", true, Map.<String, Object>of("remote", true), null, "外键引用：部门 ID、员工 ID。是否生成真实 FK 约束由 Field.refConstraint 决定，默认不生成以允许软关联"),
        new Entry("file", "varchar", 512, "text", false, false, null, null, null, null, null, null, null, "string", "OSS objectKey；也可为 AssetRef 对象", null, null, null, "String", List.<String>of(), null, null, null, "x-upload", false, Map.<String, Object>of("kind", "document", "multiple", true), null, "办公文档：pdf/docx/xlsx/pptx"),
        new Entry("image", "varchar", 512, "text", false, false, null, null, null, null, null, null, null, "string", null, null, null, null, "String", List.<String>of(), null, null, null, "x-upload", false, Map.<String, Object>of("kind", "image", "multiple", true, "listType", "picture-card"), null, "图片：证件照、诊断证明。缩略图走 OSS 图片处理参数，不落本地"),
        new Entry("video", "varchar", 512, "text", false, false, null, null, null, null, null, null, null, "string", null, null, null, null, "String", List.<String>of(), null, null, null, "x-upload", false, Map.<String, Object>of("kind", "video", "multiple", false, "listType", "text"), null, "视频：赛事证明。必须校验时长与大小，播放走 OSS 签名 URL"),
        new Entry("array", "jsonb", null, "jsonb", true, false, null, null, null, null, "GIN", null, null, "T[]", "元素类型由 Field.itemType 决定", null, null, null, "List<T>", List.<String>of("java.util.List"), null, "元素类型由 Field.itemType 决定", null, "x-checkbox-group", false, null, "itemType", "数组：多附件、多标签、多选项。元素为 image/file 时控件解析会下钻到 itemType"),
        new Entry("signature", "varchar", 512, "text", false, false, null, null, null, null, null, null, null, "string", null, null, null, null, "String", List.<String>of(), null, null, null, "x-signature", false, null, null, "手写签名：存 OSS 上的 PNG objectKey，不存 base64"),
        new Entry("location", "jsonb", null, "jsonb", true, false, null, null, null, null, "GIN", null, null, "{ lng: number; lat: number; address?: string; name?: string }", null, null, null, null, "JsonNode", List.<String>of("com.fasterxml.jackson.databind.JsonNode"), null, null, null, "x-location", false, null, null, "地理位置：定位打卡、场地。需要地理检索时由出码引擎改为 PostGIS geometry"),
        new Entry("formula", null, null, null, false, false, null, null, null, null, null, false, "派生字段：默认不落库，由运行时按 Field.formula 计算；若声明 storage=column 且 EntityStorage.generatedColumns=true，出码引擎生成 GENERATED ALWAYS AS ... STORED 列", "unknown", "类型由 formula 表达式推断", null, null, true, "Object", List.<String>of(), null, null, true, "x-text", true, Map.<String, Object>of("readonly", true), null, "计算字段：金额小计、工作日天数（简单场景；复杂算法仍应用 CodeStep）")
    );

    private static final Map<String, Entry> BY_FIELD_TYPE = buildIndex();

    private static Map<String, Entry> buildIndex() {
        Map<String, Entry> index = new LinkedHashMap<>();
        for (Entry entry : ENTRIES) index.put(entry.fieldType(), entry);
        return Collections.unmodifiableMap(index);
    }

    /** 按字段类型取映射；未登记的类型返回 null（调用点负责把它变成校验错误）。 */
    public static Entry of(String fieldType) {
        return BY_FIELD_TYPE.get(fieldType);
    }

    private FieldTypeMapping() {}

    /** 单个字段类型的完整映射。字段名 = 组名 + 键名，例如 pg.base -> pgBase。 */
    public static final class Entry {
        private final String fieldType;
        private final String pgBase;
        private final Integer pgLength;
        private final String pgJsonb;
        private final Boolean pgIndexable;
        private final Boolean pgAggregatable;
        private final Boolean pgFullText;
        private final Integer pgPrecision;
        private final Integer pgScale;
        private final String pgJsonbFormat;
        private final String pgIndexableVia;
        private final Boolean pgStored;
        private final String pgNote;
        private final String tsType;
        private final String tsDoc;
        private final String tsFormat;
        private final Boolean tsUnionFromEnumRef;
        private final Boolean tsReadonly;
        private final String javaType;
        private final List<String> javaImports;
        private final String javaJacksonFormat;
        private final String javaDoc;
        private final Boolean javaTransient;
        private final String widgetName;
        private final Boolean widgetListRenderer;
        private final Map<String, Object> widgetProps;
        private final String widgetResolveVia;
        private final String semanticIntent;

        private Entry(String fieldType, String pgBase, Integer pgLength, String pgJsonb, Boolean pgIndexable, Boolean pgAggregatable, Boolean pgFullText, Integer pgPrecision, Integer pgScale, String pgJsonbFormat, String pgIndexableVia, Boolean pgStored, String pgNote, String tsType, String tsDoc, String tsFormat, Boolean tsUnionFromEnumRef, Boolean tsReadonly, String javaType, List<String> javaImports, String javaJacksonFormat, String javaDoc, Boolean javaTransient, String widgetName, Boolean widgetListRenderer, Map<String, Object> widgetProps, String widgetResolveVia, String semanticIntent) {
            this.fieldType = fieldType;
            this.pgBase = pgBase;
            this.pgLength = pgLength;
            this.pgJsonb = pgJsonb;
            this.pgIndexable = pgIndexable;
            this.pgAggregatable = pgAggregatable;
            this.pgFullText = pgFullText;
            this.pgPrecision = pgPrecision;
            this.pgScale = pgScale;
            this.pgJsonbFormat = pgJsonbFormat;
            this.pgIndexableVia = pgIndexableVia;
            this.pgStored = pgStored;
            this.pgNote = pgNote;
            this.tsType = tsType;
            this.tsDoc = tsDoc;
            this.tsFormat = tsFormat;
            this.tsUnionFromEnumRef = tsUnionFromEnumRef;
            this.tsReadonly = tsReadonly;
            this.javaType = javaType;
            this.javaImports = javaImports;
            this.javaJacksonFormat = javaJacksonFormat;
            this.javaDoc = javaDoc;
            this.javaTransient = javaTransient;
            this.widgetName = widgetName;
            this.widgetListRenderer = widgetListRenderer;
            this.widgetProps = widgetProps;
            this.widgetResolveVia = widgetResolveVia;
            this.semanticIntent = semanticIntent;
        }

        public String fieldType() {
            return fieldType;
        }

        public String pgBase() {
            return pgBase;
        }

        public Integer pgLength() {
            return pgLength;
        }

        public String pgJsonb() {
            return pgJsonb;
        }

        public Boolean pgIndexable() {
            return pgIndexable;
        }

        public Boolean pgAggregatable() {
            return pgAggregatable;
        }

        public Boolean pgFullText() {
            return pgFullText;
        }

        public Integer pgPrecision() {
            return pgPrecision;
        }

        public Integer pgScale() {
            return pgScale;
        }

        public String pgJsonbFormat() {
            return pgJsonbFormat;
        }

        public String pgIndexableVia() {
            return pgIndexableVia;
        }

        public Boolean pgStored() {
            return pgStored;
        }

        public String pgNote() {
            return pgNote;
        }

        public String tsType() {
            return tsType;
        }

        public String tsDoc() {
            return tsDoc;
        }

        public String tsFormat() {
            return tsFormat;
        }

        public Boolean tsUnionFromEnumRef() {
            return tsUnionFromEnumRef;
        }

        public Boolean tsReadonly() {
            return tsReadonly;
        }

        public String javaType() {
            return javaType;
        }

        public List<String> javaImports() {
            return javaImports;
        }

        public String javaJacksonFormat() {
            return javaJacksonFormat;
        }

        public String javaDoc() {
            return javaDoc;
        }

        public Boolean javaTransient() {
            return javaTransient;
        }

        public String widgetName() {
            return widgetName;
        }

        public Boolean widgetListRenderer() {
            return widgetListRenderer;
        }

        public Map<String, Object> widgetProps() {
            return widgetProps;
        }

        public String widgetResolveVia() {
            return widgetResolveVia;
        }

        public String semanticIntent() {
            return semanticIntent;
        }
    }
}
