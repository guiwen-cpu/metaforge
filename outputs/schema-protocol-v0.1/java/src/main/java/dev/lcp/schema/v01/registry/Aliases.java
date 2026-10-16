// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.registry;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 别名表：41 个纯 $ref 定义在 Java 侧不生成类（Java 没有类型别名），字段类型直接落到终点。
 * schemaKey 的格式是 <文件名>.<定义名>，不是 Java 类名 —— 别把两者混着用。
 * 出码引擎与 AI 提示词靠这张表做「Schema 定义 -> Java 类型」的反查。
 */
public final class Aliases {
    /** 一条别名：schemaKey 是 <文件名>.<定义名>，endKey 是一路穿透后落到的 Schema 键，javaType 是终点 Java 类型。 */
    public record Alias(String schemaKey, String endKey, String javaType) {}

    public static final List<Alias> ENTRIES = List.of(
        new Alias("data.Semantic", "common.Semantic", "CommonSemantic"),
        new Alias("ui.Semantic", "common.Semantic", "CommonSemantic"),
        new Alias("logic.Id", "common.Id", "String"),
        new Alias("logic.Key", "common.Key", "String"),
        new Alias("logic.Name", "common.Name", "String"),
        new Alias("logic.Text", "common.Text", "CommonText"),
        new Alias("logic.Description", "common.Description", "String"),
        new Alias("logic.Scope", "common.Scope", "CommonScope"),
        new Alias("logic.Version", "common.Version", "Integer"),
        new Alias("logic.Expr", "common.Expr", "CommonExpr"),
        new Alias("logic.Value", "common.Value", "JsonNode"),
        new Alias("logic.Access", "common.Access", "CommonAccess"),
        new Alias("logic.Semantic", "common.Semantic", "CommonSemantic"),
        new Alias("logic.ArtifactRef", "common.ArtifactRef", "CommonArtifactRef"),
        new Alias("logic.AssetRef", "common.AssetRef", "CommonAssetRef"),
        new Alias("logic.Ident", "common.Ident", "String"),
        new Alias("logic.HttpToken", "common.HttpToken", "String"),
        new Alias("logic.JsonPath", "common.JsonPath", "String"),
        new Alias("component.Id", "common.Id", "String"),
        new Alias("component.Key", "common.Key", "String"),
        new Alias("component.Text", "common.Text", "CommonText"),
        new Alias("component.Description", "common.Description", "String"),
        new Alias("component.Version", "common.Version", "Integer"),
        new Alias("component.Expr", "common.Expr", "CommonExpr"),
        new Alias("component.Value", "common.Value", "JsonNode"),
        new Alias("component.Semantic", "common.Semantic", "CommonSemantic"),
        new Alias("component.ArtifactRef", "common.ArtifactRef", "CommonArtifactRef"),
        new Alias("component.SandboxPolicy", "logic.SandboxPolicy", "LogicSandboxPolicy"),
        new Alias("component.NodeStyle", "ui.NodeStyle", "UiNodeStyle"),
        new Alias("bundle.Id", "common.Id", "String"),
        new Alias("bundle.Key", "common.Key", "String"),
        new Alias("bundle.Name", "common.Name", "String"),
        new Alias("bundle.Text", "common.Text", "CommonText"),
        new Alias("bundle.Description", "common.Description", "String"),
        new Alias("bundle.Scope", "common.Scope", "CommonScope"),
        new Alias("bundle.Version", "common.Version", "Integer"),
        new Alias("bundle.Expr", "common.Expr", "CommonExpr"),
        new Alias("bundle.Checksum", "common.Checksum", "CommonChecksum"),
        new Alias("bundle.AssetRef", "common.AssetRef", "CommonAssetRef"),
        new Alias("bundle.Semantic", "common.Semantic", "CommonSemantic"),
        new Alias("bundle.Value", "common.Value", "JsonNode")
    );

    private static final Map<String, Alias> BY_KEY = buildIndex();

    private static Map<String, Alias> buildIndex() {
        Map<String, Alias> index = new LinkedHashMap<>();
        for (Alias alias : ENTRIES) index.put(alias.schemaKey(), alias);
        return Collections.unmodifiableMap(index);
    }

    /** 按 schemaKey 取别名；不是别名则返回 null。 */
    public static Alias of(String schemaKey) {
        return BY_KEY.get(schemaKey);
    }

    /** 按 schemaKey 取终点 Java 类型名；不是别名则返回 null。 */
    public static String javaTypeOf(String schemaKey) {
        Alias alias = BY_KEY.get(schemaKey);
        return alias == null ? null : alias.javaType();
    }

    /** 反查：哪些 schemaKey 落到了同一个 Java 类型（出码时用来判断“这几个定义其实是一个类型”）。 */
    public static List<String> schemaKeysFor(String javaType) {
        List<String> out = new ArrayList<>();
        for (Alias alias : ENTRIES) {
            if (alias.javaType().equals(javaType)) out.add(alias.schemaKey());
        }
        return Collections.unmodifiableList(out);
    }

    private Aliases() {}
}
