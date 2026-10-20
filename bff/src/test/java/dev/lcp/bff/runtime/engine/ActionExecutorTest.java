package dev.lcp.bff.runtime.engine;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.lcp.bff.runtime.PublishedBundleService;
import dev.lcp.bff.runtime.PublishedBundleService.PublishedBundle;
import dev.lcp.bff.runtime.dto.RuntimeRequests.ExecuteActionRequest;
import dev.lcp.bff.runtime.dto.RuntimeViews.ActionExecutionResult;
import dev.lcp.bff.tenant.TenantContext;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ActionExecutorTest {

  private final ObjectMapper json = new ObjectMapper();
  private final ExpressionEngine expressions =
      new ExpressionEngine(new ExpressionCatalog(json), json, List.of());
  private final FakeGateway gateway = new FakeGateway(json);
  private final RecordingTransactionRunner transactionRunner = new RecordingTransactionRunner();
  private final ActionExecutor executor =
      new ActionExecutor(new PublishedBundleService(null, null), expressions, json, null, null, null,
          gateway, transactionRunner);

  @BeforeEach
  void setUp() {
    TenantContext.set("tenant_demo_school", "alice");
  }

  @AfterEach
  void tearDown() {
    TenantContext.clear();
  }

  private JsonNode parse(String raw) {
    try {
      return json.readTree(raw);
    } catch (Exception ex) {
      throw new IllegalStateException(ex);
    }
  }

  private PublishedBundle bundle(String actionsAndApis) {
    JsonNode content = parse("""
        {"artifacts": {"logicSchemas": [%s]}}
        """.formatted(actionsAndApis));
    return new PublishedBundle(UUID.randomUUID(), "demo", "演示应用", 1, content);
  }

  @Test
  void executesAssignmentsBranchLoopCallActionAndEmit() {
    PublishedBundle bundle = bundle("""
        {
          "key": "logic", "actions": [
            {
              "key": "sub", "steps": [
                {"id": "s1", "type": "assign", "target": "vars.subValue",
                 "value": {"$tpl": ["sub-", {"$ref": "$ctx.params.code"}]}}
              ]
            },
            {
              "key": "main", "params": [
                {"key": "code", "type": "string", "required": true}
              ],
              "steps": [
                {"id": "a1", "type": "assign", "target": "state.count", "value": {"$lit": 1}},
                {"id": "a2", "type": "assign", "target": "state.list.0.name",
                 "value": {"$lit": "first"}},
                {"id": "a3", "type": "assign", "target": "form.days",
                 "value": {"$fn": "add", "$args": [{"$ref": "$form.base"}, {"$lit": 1}]}},
                {"id": "a4", "type": "assign", "target": "vars.merged", "merge": true,
                 "value": {"$lit": {"a": 1}}},
                {"id": "a5", "type": "assign", "target": "vars.merged", "merge": true,
                 "value": {"$lit": {"b": 2}}},
                {"id": "b1", "type": "branch", "cases": [
                  {"name": "matched", "when": {"$fn": "eq", "$args": [{"$ref": "$form.days"}, {"$lit": 3}]},
                   "then": [{"id": "b1a", "type": "assign", "target": "state.path",
                             "value": {"$lit": "ok"}}]},
                  {"name": "fallback", "when": {"$lit": true},
                   "then": [{"id": "b1b", "type": "assign", "target": "state.path",
                             "value": {"$lit": "bad"}}]}
                ]},
                {"id": "l1", "type": "loop", "over": {"$ref": "$rows"},
                 "itemName": "row", "indexName": "idx", "collect": "vars.picked",
                 "steps": [{"id": "l1a", "type": "assign", "target": "vars.last",
                            "value": {"$ref": "$ctx.vars.row.name"}}]},
                {"id": "c1", "type": "callAction", "actionRef": {"key": "sub"},
                 "params": {"code": {"$ref": "$ctx.params.code"}}, "assignTo": "state.sub"},
                {"id": "e1", "type": "emit", "event": "demo:changed",
                 "payload": {"count": {"$ref": "$page.state.count"}}}
              ]
            }
          ]
        }
        """);

    ExecuteActionRequest request = new ExecuteActionRequest(
        Map.of("code", "A-1"),
        Map.of(
            "form", Map.of("base", 2),
            "rows", List.of(Map.of("name", "x"), Map.of("name", "y"))),
        Map.of());

    ActionExecutionResult result = executor.execute(bundle, "main", request);

    assertThat(result.status()).isEqualTo("completed");
    assertThat(result.result().path("event").asText()).isEqualTo("demo:changed");
    assertThat(result.vars().path("merged").path("a").asInt()).isEqualTo(1);
    assertThat(result.vars().path("merged").path("b").asInt()).isEqualTo(2);
    assertThat(result.vars().path("picked").size()).isEqualTo(2);
    assertThat(result.vars().path("subValue").asText()).isEqualTo("sub-A-1");
    assertThat(result.trace()).hasSize(9);
    assertThat(result.trace().get(1).result().asText()).isEqualTo("first");
    assertThat(result.trace().get(5).children().get(0).label()).isEqualTo("matched");
    assertThat(result.trace().get(6).children()).hasSize(2);
    assertThat(result.events()).hasSize(1);
    assertThat(result.events().get(0).path("event").asText()).isEqualTo("demo:changed");
  }

  @Test
  void mapsMockApiResponseAndWritesResultPath() {
    PublishedBundle bundle = bundle("""
        {
          "key": "logic",
          "actions": [
            {
              "key": "load", "steps": [
                {"id": "api", "type": "apiCall", "apiRef": {"key": "api_echo"},
                 "resultPath": "all", "assignTo": "vars.items"}
              ]
            }
          ],
          "apis": [
            {
              "id": "api-1", "key": "api_echo", "name": "回显", "kind": "rest",
              "method": "GET", "path": "/echo",
              "mock": {"enabled": true, "data": {
                "code": 0,
                "data": {"items": [{"id": 1, "name": "A"}, {"id": 2, "name": "B"}], "total": 2}
              }},
              "response": {
                "successWhen": {"$fn": "eq", "$args": [{"$ref": "$res.body.code"}, {"$lit": 0}]},
                "mapping": {
                  "first": "$.data.items[0].name",
                  "all": {"$ref": "$res.body.data.items"},
                  "total": {"$ref": "$res.body.data.total"}
                }
              }
            }
          ]
        }
        """);

    ActionExecutionResult result = executor.execute(
        bundle, "load", new ExecuteActionRequest(Map.of(), Map.of(), Map.of()));

    assertThat(result.status()).isEqualTo("completed");
    assertThat(result.vars().path("items").size()).isEqualTo(2);
    assertThat(result.vars().path("items").get(1).path("name").asText()).isEqualTo("B");
    assertThat(result.trace().get(0).result().get(0).path("name").asText()).isEqualTo("A");
    assertThat(result.trace().get(0).result().size()).isEqualTo(2);
  }

  @Test
  void onErrorHandlesFailAndKeepsTrace() {
    PublishedBundle bundle = bundle("""
        {
          "key": "logic", "actions": [
            {
              "key": "guard", "steps": [
                {"id": "f1", "type": "fail", "code": "RULE_BLOCKED", "message": "不满足规则",
                 "onError": [
                   {"id": "h1", "type": "assign", "target": "vars.recovered", "value": {"$lit": true}}
                 ]}
              ]
            }
          ]
        }
        """);

    ActionExecutionResult result = executor.execute(
        bundle, "guard", new ExecuteActionRequest(Map.of(), Map.of(), Map.of()));

    assertThat(result.status()).isEqualTo("completed");
    assertThat(result.vars().path("recovered").asBoolean()).isTrue();
    assertThat(result.trace().get(0).status()).isEqualTo("failed");
    assertThat(result.trace().get(0).message()).isEqualTo("不满足规则");
  }

  @Test
  void invokesInternalApisThroughGatewayAndMapsResponse() {
    gateway.internalResponse = parse("""
        {"code": 0, "data": {"id": "L1", "version": 2}}
        """);
    PublishedBundle bundle = bundle("""
        {
          "key": "logic",
          "actions": [
            {"key": "save", "steps": [
              {"id": "api", "type": "apiCall", "apiRef": {"key": "api_internal"},
               "params": {"entity": "leave_request", "data": {"status": "pending"}},
               "assignTo": "vars.saved"}
            ]}
          ],
          "apis": [
            {"id": "api-1", "key": "api_internal", "name": "内部保存",
             "kind": "internal", "method": "POST", "path": "/bff/entity/{entity}/save",
             "request": {"path": [{"key": "entity", "required": true}]},
             "response": {
               "successWhen": {"$fn": "eq", "$args": [{"$ref": "$res.body.code"}, {"$lit": 0}]},
               "mapping": {"id": "$.data.id", "version": "$.data.version"}
             }}
          ]
        }
        """);

    ActionExecutionResult result = executor.execute(
        bundle, "save", new ExecuteActionRequest(Map.of(), Map.of(), Map.of()));

    assertThat(result.status()).isEqualTo("completed");
    assertThat(result.vars().path("saved").path("id").asText()).isEqualTo("L1");
    assertThat(result.vars().path("saved").path("version").asInt()).isEqualTo(2);
    assertThat(gateway.internalMethod).isEqualTo("POST");
    assertThat(gateway.internalPath).isEqualTo("/bff/entity/{entity}/save");
    assertThat(gateway.internalPathValues).containsEntry("entity", "leave_request");
    assertThat(gateway.internalParams.path("data").path("status").asText()).isEqualTo("pending");
  }

  @Test
  void unwrapsSingleItemMappingForGetApi() {
    gateway.internalResponse = parse("""
        {"code": 0, "data": {"id": "L1", "applicant_id": "alice", "status": "pending"}}
        """);
    PublishedBundle bundle = bundle("""
        {
          "key": "logic", "actions": [
            {"key": "load", "steps": [
              {"id": "api", "type": "apiCall", "apiRef": {"key": "api_get"},
               "params": {"id": "L1"}, "assignTo": "vars.leave"}
            ]}
          ],
          "apis": [
            {"id": "api-1", "key": "api_get", "kind": "internal", "method": "GET",
             "path": "/bff/entity/{entity}/get",
             "request": {"path": [{"key": "entity", "defaultValue": "leave_request"}]},
             "response": {
               "successWhen": {"$fn": "eq", "$args": [{"$ref": "$res.body.code"}, {"$lit": 0}]},
               "mapping": {"item": "$.data"}
             }}
          ]
        }
        """);

    ActionExecutionResult result = executor.execute(
        bundle, "load", new ExecuteActionRequest(Map.of(), Map.of(), Map.of()));

    assertThat(result.status()).isEqualTo("completed");
    assertThat(result.vars().path("leave").path("applicant_id").asText()).isEqualTo("alice");
    assertThat(result.vars().path("leave").path("status").asText()).isEqualTo("pending");
  }

  @Test
  void mapsRowsPathAndTotalPathWithoutMapping() {
    PublishedBundle bundle = bundle("""
        {
          "key": "logic", "actions": [
            {"key": "scan", "steps": [
              {"id": "api", "type": "apiCall", "apiRef": {"key": "api_stale"},
               "assignTo": "vars.stale"}
            ]}
          ],
          "apis": [
            {"id": "api-1", "key": "api_stale", "kind": "rest", "method": "POST",
             "path": "/findStale",
             "mock": {"enabled": true, "data": {
               "code": 0, "data": {"rows": [{"id": "L1"}, {"id": "L2"}], "total": 2}
             }},
             "response": {
               "successWhen": {"$fn": "eq", "$args": [{"$ref": "$res.body.code"}, {"$lit": 0}]},
               "rowsPath": "$.data.rows", "totalPath": "$.data.total"
             }}
          ]
        }
        """);

    ActionExecutionResult result = executor.execute(
        bundle, "scan", new ExecuteActionRequest(Map.of(), Map.of(), Map.of()));

    assertThat(result.status()).isEqualTo("completed");
    assertThat(result.vars().path("stale").path("rows")).hasSize(2);
    assertThat(result.vars().path("stale").path("total").asInt()).isEqualTo(2);
  }

  @Test
  void calcWorkdaysSkipsHolidaysAndCountsMakeupWorkday() {
    PublishedBundle bundle = bundle("""
        {
          "key": "logic", "actions": [
            {"key": "calc", "steps": [
              {"id": "code", "type": "code", "entry": "calcWorkdays",
               "assignTo": "vars.workdays",
               "inputs": [
                 {"key": "start", "value": {"$ref": "$form.start_at"}},
                 {"key": "end", "value": {"$ref": "$form.end_at"}},
                 {"key": "leaveType", "value": {"$ref": "$form.leave_type"}},
                 {"key": "holidays", "value": {"$lit": [
                   {"date": "2026-10-23", "type": "holiday"},
                   {"date": "2026-10-24", "type": "workday"}
                 ]}}
               ]}
            ]}
          ]
        }
        """);

    ActionExecutionResult result = executor.execute(bundle, "calc", new ExecuteActionRequest(
        Map.of(), Map.of("form", Map.of(
            "start_at", "2026-10-22T09:00:00+08:00",
            "end_at", "2026-10-26T18:00:00+08:00",
            "leave_type", "annual")), Map.of()));

    assertThat(result.status()).isEqualTo("completed");
    assertThat(result.vars().path("workdays").path("days").asInt()).isEqualTo(3);
    JsonNode skipped = result.vars().path("workdays").path("skipped");
    assertThat(skipped.size()).isEqualTo(2);
    assertThat(skipped.get(0).asText()).isEqualTo("2026-10-23");
    assertThat(skipped.get(1).asText()).isEqualTo("2026-10-25");
    assertThat(result.vars().path("workdays").path("warnings").size()).isZero();
  }

  @Test
  void validateRejectsBlankRequiredFields() {
    PublishedBundle bundle = bundle("""
        {
          "key": "logic", "actions": [
            {"key": "check", "steps": [
              {"id": "v1", "type": "validate", "scope": "form",
               "fields": ["reason", "start_at"],
               "message": {"$lit": "请完善带 * 的必填项"}}
            ]}
          ]
        }
        """);

    ActionExecutionResult result = executor.execute(bundle, "check", new ExecuteActionRequest(
        Map.of(), Map.of("form", Map.of("reason", "  ", "start_at", "2026-10-22")), Map.of()));

    assertThat(result.status()).isEqualTo("failed");
    assertThat(result.error().code()).isEqualTo("VALIDATION_FAILED");
    assertThat(result.error().fields()).containsExactly("reason");
    assertThat(result.error().message()).contains("请完善带 * 的必填项").contains("reason");
  }

  @Test
  void startsFlowAndCompletesTaskThroughGateway() {
    PublishedBundle bundle = bundle("""
        {
          "key": "logic", "actions": [
            {"key": "submit", "steps": [
              {"id": "s1", "type": "assign", "target": "vars.savedId", "value": {"$lit": "L1"}},
              {"id": "f1", "type": "startFlow",
               "flowRef": {"key": "leave_approval"},
               "businessKey": {"$ref": "$ctx.vars.savedId"},
               "assignTo": "vars.processInstanceId",
               "variables": {"applicantId": {"$ref": "$form.applicant_id"}, "days": 3}},
              {"id": "t1", "type": "completeTask",
               "taskId": {"$ref": "$ctx.params.taskId"},
               "outcome": "approve",
               "comment": {"$ref": "$ctx.params.comment"},
               "variables": {"score": 88},
               "afterComplete": [
                 {"id": "a1", "type": "assign", "target": "vars.after", "value": {"$lit": true}}
               ]}
            ]}
          ]
        }
        """);

    ActionExecutionResult result = executor.execute(bundle, "submit", new ExecuteActionRequest(
        Map.of("taskId", "T1", "comment", "同意"),
        Map.of("form", Map.of("applicant_id", "alice")), Map.of()));

    assertThat(result.status()).isEqualTo("completed");
    assertThat(result.vars().path("processInstanceId").asText()).isEqualTo("PI-1");
    assertThat(result.vars().path("after").asBoolean()).isTrue();
    assertThat(gateway.startedFlowKey).isEqualTo("leave_approval");
    assertThat(gateway.startedBusinessKey).isEqualTo("L1");
    assertThat(gateway.startedVariables).containsEntry("applicantId", "alice");
    assertThat(gateway.completedTaskId).isEqualTo("T1");
    assertThat(gateway.completedOutcome).isEqualTo("approve");
    assertThat(gateway.completedComment).isEqualTo("同意");
    assertThat(gateway.completedVariables).containsEntry("score", 88);
  }

  @Test
  void evaluatesWritebackForSuccessfulAction() {
    PublishedBundle bundle = bundle("""
        {
          "key": "logic", "actions": [
            {
              "key": "submit", "steps": [
                {"id": "s1", "type": "assign", "target": "vars.decision", "value": {"$lit": "approved"}},
                {"id": "s2", "type": "assign", "target": "vars.score", "value": {"$lit": 88}}
              ],
              "writeback": {
                "variables": {
                  "decision": {"$ref": "$ctx.vars.decision"},
                  "score": {"$ref": "$ctx.vars.score"}
                },
                "business": {
                  "status": "approved",
                  "score": {"$ref": "$ctx.vars.score"}
                },
                "success": {
                  "outcome": "approve",
                  "comment": {"$tpl": ["决策：", {"$ref": "$ctx.vars.decision"}]}
                }
              }
            }
          ]
        }
        """);

    ActionExecutionResult result = executor.execute(
        bundle, "submit", new ExecuteActionRequest(Map.of(), Map.of(), Map.of()));

    assertThat(result.status()).isEqualTo("completed");
    JsonNode writeback = result.writeback();
    assertThat(writeback.path("variables").path("decision").asText()).isEqualTo("approved");
    assertThat(writeback.path("variables").path("score").asInt()).isEqualTo(88);
    assertThat(writeback.path("business").path("status").asText()).isEqualTo("approved");
    assertThat(writeback.path("business").path("score").asInt()).isEqualTo(88);
    assertThat(writeback.path("advance").path("outcome").asText()).isEqualTo("approve");
    assertThat(writeback.path("advance").path("comment").asText()).isEqualTo("决策：approved");
    assertThat(writeback.has("failure")).isFalse();
  }

  @Test
  void evaluatesFailureWritebackFromContextError() {
    PublishedBundle bundle = bundle("""
        {
          "key": "logic", "actions": [
            {
              "key": "transfer", "steps": [
                {"id": "f1", "type": "fail", "code": "BALANCE_LOW", "message": "余额不足"}
              ],
              "writeback": {
                "variables": {
                  "lastError": {"$ref": "$ctx.error.code"},
                  "lastMessage": {"$ref": "$ctx.error.message"}
                },
                "business": {"status": "rejected"},
                "failure": {
                  "outcome": "reject",
                  "comment": {"$tpl": ["失败：", {"$ref": "$ctx.error.message"}]}
                }
              }
            }
          ]
        }
        """);

    ActionExecutionResult result = executor.execute(
        bundle, "transfer", new ExecuteActionRequest(Map.of(), Map.of(), Map.of()));

    assertThat(result.status()).isEqualTo("failed");
    assertThat(result.error().code()).isEqualTo("BALANCE_LOW");
    JsonNode writeback = result.writeback();
    assertThat(writeback.path("variables").path("lastError").asText()).isEqualTo("BALANCE_LOW");
    assertThat(writeback.path("variables").path("lastMessage").asText()).isEqualTo("余额不足");
    assertThat(writeback.path("business").path("status").asText()).isEqualTo("rejected");
    assertThat(writeback.path("advance").path("outcome").asText()).isEqualTo("reject");
    assertThat(writeback.path("advance").path("comment").asText()).isEqualTo("失败：余额不足");
    assertThat(writeback.has("success")).isFalse();
  }

  @Test
  void runsTransactionStepInsideConfiguredSavepoint() {
    PublishedBundle bundle = bundle("""
        {
          "key": "logic", "actions": [
            {
              "key": "atomic", "steps": [
                {"id": "t1", "type": "transaction", "isolation": "serializable", "readOnly": true,
                 "steps": [
                   {"id": "t1a", "type": "assign", "target": "vars.saved",
                    "value": {"$lit": "yes"}}
                 ]}
              ]
            }
          ]
        }
        """);

    ActionExecutionResult result = executor.execute(
        bundle, "atomic", new ExecuteActionRequest(Map.of(), Map.of(), Map.of()));

    assertThat(result.status()).isEqualTo("completed");
    assertThat(result.vars().path("saved").asText()).isEqualTo("yes");
    assertThat(transactionRunner.calls).isEqualTo(1);
    assertThat(transactionRunner.isolation).isEqualTo("serializable");
    assertThat(transactionRunner.readOnly).isTrue();
  }

  @Test
  void runsParallelBranchesConcurrentlyWithIsolatedVarsAndOrderedEvents() {
    PublishedBundle bundle = bundle("""
        {
          "key": "logic", "actions": [
            {"key": "fanout", "steps": [
              {"id": "p1", "type": "parallel", "failFast": true, "branches": [
                {"name": "a", "steps": [
                  {"id": "a1", "type": "delay", "ms": 300},
                  {"id": "a2", "type": "assign", "target": "vars.x", "value": {"$lit": "a"}},
                  {"id": "a3", "type": "assign", "target": "vars.xa",
                   "value": {"$ref": "$ctx.vars.x"}},
                  {"id": "a4", "type": "emit", "event": "branch:a"}
                ]},
                {"name": "b", "steps": [
                  {"id": "b1", "type": "assign", "target": "vars.x", "value": {"$lit": "b"}},
                  {"id": "b2", "type": "delay", "ms": 300},
                  {"id": "b3", "type": "emit", "event": "branch:b"}
                ]}
              ]}
            ]}
          ]
        }
        """);

    long started = System.nanoTime();
    ActionExecutionResult result = executor.execute(
        bundle, "fanout", new ExecuteActionRequest(Map.of(), Map.of(), Map.of()));
    long elapsedMs = (System.nanoTime() - started) / 1_000_000L;

    assertThat(result.status()).isEqualTo("completed");
    assertThat(result.vars().path("xa").asText()).isEqualTo("a");
    assertThat(result.vars().path("x").asText()).isEqualTo("b");
    assertThat(result.events()).hasSize(2);
    assertThat(result.events().get(0).path("event").asText()).isEqualTo("branch:a");
    assertThat(result.events().get(1).path("event").asText()).isEqualTo("branch:b");
    assertThat(result.trace().get(0).children()).hasSize(2);
    assertThat(elapsedMs).isLessThan(550L);
  }

  @Test
  void parallelFailFastKeepsTraceAndCancelsRemainingBranches() {
    PublishedBundle bundle = bundle("""
        {
          "key": "logic", "actions": [
            {"key": "fanout", "steps": [
              {"id": "p1", "type": "parallel", "failFast": true, "branches": [
                {"name": "slow", "steps": [
                  {"id": "s1", "type": "delay", "ms": 2000},
                  {"id": "s2", "type": "assign", "target": "vars.slow", "value": {"$lit": true}}
                ]},
                {"name": "bad", "steps": [
                  {"id": "b1", "type": "fail", "code": "BAD_BRANCH",
                   "message": "分支失败", "rollback": false}
                ]}
              ]}
            ]}
          ]
        }
        """);

    long started = System.nanoTime();
    ActionExecutionResult result = executor.execute(
        bundle, "fanout", new ExecuteActionRequest(Map.of(), Map.of(), Map.of()));
    long elapsedMs = (System.nanoTime() - started) / 1_000_000L;

    assertThat(result.status()).isEqualTo("failed");
    assertThat(result.error().code()).isEqualTo("BAD_BRANCH");
    assertThat(result.trace().get(0).children()).hasSize(2);
    assertThat(result.trace().get(0).children().get(0).status()).isEqualTo("cancelled");
    assertThat(result.trace().get(0).children().get(1).status()).isEqualTo("failed");
    assertThat(elapsedMs).isLessThan(1000L);
  }

  @Test
  void parallelWithoutFailFastKeepsSuccessfulBranches() {
    PublishedBundle bundle = bundle("""
        {
          "key": "logic", "actions": [
            {"key": "soft", "steps": [
              {"id": "p1", "type": "parallel", "failFast": false, "branches": [
                {"name": "bad", "steps": [
                  {"id": "b1", "type": "fail", "code": "SOFT_FAIL",
                   "message": "可忽略失败", "rollback": false}
                ]},
                {"name": "good", "steps": [
                  {"id": "g1", "type": "assign", "target": "vars.ok", "value": {"$lit": true}},
                  {"id": "g2", "type": "emit", "event": "branch:good"}
                ]}
              ]}
            ]}
          ]
        }
        """);

    ActionExecutionResult result = executor.execute(
        bundle, "soft", new ExecuteActionRequest(Map.of(), Map.of(), Map.of()));

    assertThat(result.status()).isEqualTo("completed");
    assertThat(result.result().get(0).isNull()).isTrue();
    assertThat(result.result().get(1).path("event").asText()).isEqualTo("branch:good");
    assertThat(result.vars().path("ok").asBoolean()).isTrue();
    assertThat(result.events()).hasSize(1);
    assertThat(result.trace().get(0).children().get(0).status()).isEqualTo("failed");
    assertThat(result.trace().get(0).children().get(1).status()).isEqualTo("completed");
  }

  @Test
  void parallelTimeoutFailsTheStep() {
    PublishedBundle bundle = bundle("""
        {
          "key": "logic", "actions": [
            {"key": "slow", "steps": [
              {"id": "p1", "type": "parallel", "timeoutMs": 200, "branches": [
                {"name": "a", "steps": [{"id": "a1", "type": "delay", "ms": 2000}]},
                {"name": "b", "steps": [{"id": "b1", "type": "delay", "ms": 2000}]}
              ]}
            ]}
          ]
        }
        """);

    long started = System.nanoTime();
    ActionExecutionResult result = executor.execute(
        bundle, "slow", new ExecuteActionRequest(Map.of(), Map.of(), Map.of()));
    long elapsedMs = (System.nanoTime() - started) / 1_000_000L;

    assertThat(result.status()).isEqualTo("failed");
    assertThat(result.error().code()).isEqualTo("PARALLEL_TIMEOUT");
    assertThat(elapsedMs).isLessThan(1200L);
  }
  private static final class RecordingTransactionRunner implements RuntimeTransactionRunner {

    int calls;
    String isolation;
    boolean readOnly;

    @Override
    public JsonNode execute(String isolation, boolean readOnly, Supplier<JsonNode> work) {
      calls++;
      this.isolation = isolation;
      this.readOnly = readOnly;
      return work.get();
    }
  }
  private static final class FakeGateway implements RuntimeActionGateway {

    private final ObjectMapper json;
    JsonNode internalResponse;
    String internalApiKey;
    String internalMethod;
    String internalPath;
    Map<String, String> internalPathValues = Map.of();
    JsonNode internalParams;
    String startedFlowKey;
    String startedBusinessKey;
    Map<String, Object> startedVariables = Map.of();
    String completedTaskId;
    String completedOutcome;
    String completedComment;
    String completedNextAssignee;
    Map<String, Object> completedVariables = Map.of();

    FakeGateway(ObjectMapper json) {
      this.json = json;
      try {
        this.internalResponse = json.readTree("{\"code\":0,\"data\":{}}");
      } catch (Exception ex) {
        throw new IllegalStateException(ex);
      }
    }

    @Override
    public JsonNode invokeInternalApi(
        JsonNode bundle,
        String apiKey,
        String method,
        String pathTemplate,
        Map<String, String> pathValues,
        JsonNode params) {
      internalApiKey = apiKey;
      internalMethod = method;
      internalPath = pathTemplate;
      internalPathValues = pathValues;
      internalParams = params;
      return internalResponse;
    }

    @Override
    public String startFlow(
        UUID appId, String flowKey, String businessKey, Map<String, Object> variables) {
      startedFlowKey = flowKey;
      startedBusinessKey = businessKey;
      startedVariables = variables;
      return "PI-1";
    }

    @Override
    public JsonNode completeTask(
        UUID appId,
        String taskId,
        String outcome,
        String comment,
        String nextAssignee,
        Map<String, Object> variables) {
      completedTaskId = taskId;
      completedOutcome = outcome;
      completedComment = comment;
      completedNextAssignee = nextAssignee;
      completedVariables = variables;
      try {
        return json.readTree("{\"code\":0,\"data\":{\"taskId\":\"" + taskId + "\"}}");
      } catch (Exception ex) {
        throw new IllegalStateException(ex);
      }
    }
  }
}
