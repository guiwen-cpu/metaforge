package dev.lcp.bff.runtime.engine;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;

class ExpressionEngineTest {

  private final ObjectMapper json = new ObjectMapper();
  private final ExpressionEngine engine =
      new ExpressionEngine(new ExpressionCatalog(json), json, List.of());

  private JsonNode parse(String raw) {
    try {
      return json.readTree(raw);
    } catch (Exception ex) {
      throw new IllegalStateException(ex);
    }
  }

  private JsonNode eval(String raw) {
    return engine.eval(parse(raw), engine.newScope());
  }

  @Test
  void literalReferenceTemplateAndConditional() {
    assertThat(eval("""
        {"$lit": {"a": 1}}
        """).path("a").asInt()).isEqualTo(1);

    ExpressionEngine.Scope scope = engine.newScope();
    scope.put("form", parse("""
        {"name": "张三"}
        """));
    assertThat(engine.eval(parse("""
        {"$tpl": ["你好，", {"$ref": "$form.name"}, "！"]}
        """), scope).asText()).isEqualTo("你好，张三！");

    assertThat(eval("""
        {"$if": {"$fn": "gt", "$args": [{"$lit": 2}, {"$lit": 1}]},
         "$then": {"$lit": "yes"}, "$else": {"$lit": "no"}}
        """).asText()).isEqualTo("yes");
  }

  @Test
  void arithmeticUsesDecimalSemantics() {
    assertThat(engine.stringify(eval("""
        {"$fn": "add", "$args": [{"$lit": 0.1}, {"$lit": 0.2}]}
        """))).isEqualTo("0.3");
    assertThat(eval("""
        {"$fn": "div", "$args": [{"$lit": 1}, {"$lit": 0}]}
        """).isNull()).isTrue();
    assertThat(eval("""
        {"$fn": "round", "$args": [{"$lit": 2.345}, {"$lit": 2}]}
        """).decimalValue().toPlainString()).isEqualTo("2.35");
    assertThat(eval("""
        {"$fn": "sum", "$args": [{"$lit": [1, 2, 3]}]}
        """).asInt()).isEqualTo(6);
  }

  @Test
  void deepEqualityIgnoresKeyOrderAndNumericScale() {
    assertThat(eval("""
        {"$fn": "eq", "$args": [
          {"$lit": {"a": 1, "b": [2, 3]}},
          {"$lit": {"b": [2, 3], "a": 1.0}}
        ]}
        """).asBoolean()).isTrue();
    assertThat(eval("""
        {"$fn": "in", "$args": [{"$lit": 2}, {"$lit": [1, 2.0, 3]}]}
        """).asBoolean()).isTrue();
    assertThat(eval("""
        {"$fn": "like", "$args": [{"$lit": "Leave-2026"}, {"$lit": "leave-%"}]}
        """).asBoolean()).isTrue();
  }

  @Test
  void filterAndMapExposeItemAndIndex() {
    JsonNode filtered = eval("""
        {"$fn": "filter", "$args": [
          {"$lit": [{"n": 1}, {"n": 2}, {"n": 3}]},
          {"$fn": "gt", "$args": [{"$ref": "$item.n"}, {"$lit": 1}]}
        ]}
        """);
    assertThat(filtered).hasSize(2);
    assertThat(filtered.get(0).path("n").asInt()).isEqualTo(2);

    JsonNode mapped = eval("""
        {"$fn": "map", "$args": [
          {"$lit": [10, 20]},
          {"$fn": "mul", "$args": [{"$ref": "$item"}, {"$ref": "$index"}]}
        ]}
        """);
    assertThat(mapped.get(0).asInt()).isEqualTo(0);
    assertThat(mapped.get(1).asInt()).isEqualTo(20);
  }

  @Test
  void shortCircuitSkipsInvalidBranches() {
    assertThat(eval("""
        {"$fn": "and", "$args": [
          {"$lit": false},
          {"$fn": "no_such_function", "$args": []}
        ]}
        """).asBoolean()).isFalse();
    assertThat(eval("""
        {"$fn": "if", "$args": [
          {"$lit": true}, {"$lit": "ok"},
          {"$fn": "no_such_function", "$args": []}
        ]}
        """).asText()).isEqualTo("ok");
  }

  @Test
  void rejectsUnknownFunctionAndWrongArity() {
    assertThatThrownBy(() -> eval("""
        {"$fn": "no_such_function", "$args": []}
        """)).isInstanceOfSatisfying(ExpressionException.class,
        ex -> assertThat(ex.code()).isEqualTo("unknown_function"));

    assertThatThrownBy(() -> eval("""
        {"$fn": "eq", "$args": [{"$lit": 1}]}
        """)).isInstanceOfSatisfying(ExpressionException.class,
        ex -> assertThat(ex.code()).isEqualTo("bad_arity"));

    assertThatThrownBy(() -> eval("""
        {"$ref": "$foo.bar"}
        """)).isInstanceOfSatisfying(ExpressionException.class,
        ex -> assertThat(ex.code()).isEqualTo("unknown_root"));
  }

  @Test
  void missingPathsReturnNullInsteadOfThrowing() {
    ExpressionEngine.Scope scope = engine.newScope();
    scope.put("row", parse("""
        {"id": "r1", "items": [{"id": "a"}]}
        """));
    assertThat(engine.eval(parse("""
        {"$ref": "$row.missing.deep"}
        """), scope).isNull()).isTrue();
    assertThat(engine.eval(parse("""
        {"$ref": "$row.items[9].id"}
        """), scope).isNull()).isTrue();
    assertThat(engine.eval(parse("""
        {"$ref": "$row.items[0].id"}
        """), scope).asText()).isEqualTo("a");
  }

  @Test
  void nowIsFrozenWithinOneActionChain() {
    ExpressionEngine.Scope scope = engine.newScope();
    JsonNode first = engine.eval(parse("""
        {"$ref": "$now"}
        """), scope);
    JsonNode second = engine.eval(parse("""
        {"$fn": "now", "$args": []}
        """), scope);
    assertThat(second.asText()).isEqualTo(first.asText());
  }

  @Test
  void dateFunctionsFollowCalendarSemantics() {
    assertThat(eval("""
        {"$fn": "dateAdd", "$args": [{"$lit": "2026-01-31"}, {"$lit": 1}, {"$lit": "month"}]}
        """).asText()).isEqualTo("2026-02-28");
    assertThat(eval("""
        {"$fn": "dateDiff", "$args": [
          {"$lit": "2026-01-01"}, {"$lit": "2026-03-01"}, {"$lit": "day"}
        ]}
        """).asInt()).isEqualTo(59);
    assertThat(eval("""
        {"$fn": "formatDate", "$args": [{"$lit": "2026-10-19"}, {"$lit": "yyyy/MM/dd"}]}
        """).asText()).isEqualTo("2026/10/19");
    assertThat(eval("""
        {"$fn": "startOf", "$args": [{"$lit": "2026-10-21"}, {"$lit": "week"}]}
        """).asText()).isEqualTo("2026-10-19");
  }

  @Test
  void securityFunctionsMaskAndHash() {
    assertThat(eval("""
        {"$fn": "maskPhone", "$args": [{"$lit": "13800138000"}]}
        """).asText()).isEqualTo("138****8000");
    assertThat(eval("""
        {"$fn": "maskIdCard", "$args": [{"$lit": "110101199003071234"}]}
        """).asText()).isEqualTo("110101********1234");
    assertThat(eval("""
        {"$fn": "maskEmail", "$args": [{"$lit": "alice@example.com"}]}
        """).asText()).isEqualTo("a***@example.com");
    assertThat(eval("""
        {"$fn": "maskName", "$args": [{"$lit": "张三"}]}
        """).asText()).isEqualTo("张*");
    assertThat(eval("""
        {"$fn": "hash", "$args": [{"$lit": "abc"}]}
        """).asText())
        .isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  }

  @Test
  void objectAndTypeFunctions() {
    assertThat(eval("""
        {"$fn": "get", "$args": [
          {"$lit": {"a": {"b": [{"c": 7}]}}}, {"$lit": "a.b[0].c"}
        ]}
        """).asInt()).isEqualTo(7);
    assertThat(eval("""
        {"$fn": "has", "$args": [{"$lit": {"a": null}}, {"$lit": "a"}]}
        """).asBoolean()).isTrue();
    assertThat(eval("""
        {"$fn": "toBool", "$args": [{"$lit": "0"}]}
        """).asBoolean()).isFalse();
    assertThat(eval("""
        {"$fn": "typeOf", "$args": [{"$lit": []}]}
        """).asText()).isEqualTo("array");
    assertThat(eval("""
        {"$fn": "merge", "$args": [{"$lit": {"a": 1}}, {"$lit": {"a": 2, "b": 3}}]}
        """).path("a").asInt()).isEqualTo(2);
  }

  @Test
  void jsonPathExtractsDeclarativePaths() {
    JsonNode root = parse("""
        {"data": {"rows": [{"id": "r1"}, {"id": "r2"}]}}
        """);
    assertThat(engine.jsonPath(root, "$.data.rows[1].id").asText()).isEqualTo("r2");
    assertThat(engine.jsonPath(root, "$.data.missing").isNull()).isTrue();
  }

}
