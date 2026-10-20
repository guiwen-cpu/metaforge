<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { connectionsApi } from "@/api/connections";
import { errorMessage } from "@/lib/http";
import type {
  ConnectionAuditView,
  ConnectionAuth,
  ConnectionConfig,
  ConnectionHeader,
  ConnectionPayload,
  ConnectionView,
  SecretPayload,
  SecretView
} from "@/types/connection";

const loading = ref(false);
const saving = ref(false);
const activeTab = ref("connections");
const connections = ref<ConnectionView[]>([]);
const secrets = ref<SecretView[]>([]);

const connectionOpen = ref(false);
const connectionEditing = ref<string | null>(null);
const defaultAuthText = '{\n  "type": "none"\n}';
const connectionForm = reactive({
  key: "",
  name: "",
  kind: "rest",
  baseUrl: "",
  enabled: true,
  timeoutMs: 10000,
  headersText: "[]",
  authText: defaultAuthText,
  extraText: "{}"
});

const auditOpen = ref(false);
const auditLoading = ref(false);
const auditConnection = ref<ConnectionView | null>(null);
const auditRows = ref<ConnectionAuditView[]>([]);

const secretOpen = ref(false);
const secretEditing = ref<string | null>(null);
const secretForm = reactive({
  key: "",
  name: "",
  description: "",
  value: ""
});

const configuredSecrets = computed(() => new Set(secrets.value.map((item) => item.key)));
const supportsAuth = computed(() => connectionForm.kind === "rest" || connectionForm.kind === "graphql" || connectionForm.kind === "soap");
const supportsBaseUrl = computed(() => connectionForm.kind !== "database" && connectionForm.kind !== "internal");

async function load() {
  loading.value = true;
  try {
    const [connectionRows, secretRows] = await Promise.all([
      connectionsApi.listConnections(),
      connectionsApi.listSecrets()
    ]);
    connections.value = connectionRows;
    secrets.value = secretRows;
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function formatTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

function connectionAuthLabel(config: ConnectionConfig) {
  const auth = config.auth;
  if (!auth || !auth.type || auth.type === "none") return "无鉴权";
  if (auth.type === "tenant") return "租户头";
  if (auth.type === "bearer") return `Bearer · ${auth.tokenRef ?? "缺少引用"}`;
  if (auth.type === "apiKey") return `API Key · ${auth.in ?? "header"} · ${auth.valueRef ?? "缺少引用"}`;
  if (auth.type === "basic") return `Basic · ${auth.usernameRef ?? "缺少引用"}`;
  if (auth.type === "oauth2") {
    const grant = auth.grant === "authorizationCode" ? "刷新令牌" : auth.grant === "password" ? "密码模式" : "客户端凭证";
    return `OAuth2 · ${grant}`;
  }
  if (auth.type === "signature") {
    return `签名 · ${auth.algorithm === "md5" ? "MD5" : "HMAC-SHA256"} · ${auth.headerName ?? "X-Signature"}`;
  }
  return auth.type;
}

function authRefs(auth?: ConnectionAuth | null) {
  if (!auth) return [];
  return [auth.tokenRef, auth.valueRef, auth.usernameRef, auth.passwordRef, auth.secretRef,
    auth.clientIdRef, auth.clientSecretRef, auth.refreshTokenRef]
    .filter((item): item is string => Boolean(item))
    .map((item) => item.replace(/^secret:/i, ""));
}

function secretMissing(config: ConnectionConfig) {
  return authRefs(config.auth).some((key) => !configuredSecrets.value.has(key));
}

function resetConnectionForm() {
  connectionForm.key = "";
  connectionForm.name = "";
  connectionForm.kind = "rest";
  connectionForm.baseUrl = "";
  connectionForm.enabled = true;
  connectionForm.timeoutMs = 10000;
  connectionForm.headersText = "[]";
  connectionForm.authText = defaultAuthText;
  connectionForm.extraText = "{}";
}

function openConnection(row?: ConnectionView) {
  connectionEditing.value = row?.id ?? null;
  if (!row) {
    resetConnectionForm();
  } else {
    const { timeoutMs, headers, auth, ...rest } = row.config ?? {};
    connectionForm.key = row.key;
    connectionForm.name = row.name;
    connectionForm.kind = row.kind;
    connectionForm.baseUrl = row.base_url ?? "";
    connectionForm.enabled = row.enabled;
    connectionForm.timeoutMs = timeoutMs ?? 10000;
    connectionForm.headersText = JSON.stringify(headers ?? [], null, 2);
    connectionForm.authText = JSON.stringify(auth ?? { type: "none" }, null, 2);
    connectionForm.extraText = JSON.stringify(rest, null, 2);
  }
  connectionOpen.value = true;
}
function parseJson(text: string, label: string): unknown {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} 不是合法 JSON`);
  }
}

function parseObject(text: string, label: string): Record<string, unknown> {
  const value = parseJson(text, label);
  if (value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象`);
  }
  return value as Record<string, unknown>;
}

function buildConfig(): ConnectionConfig {
  const extras = parseObject(connectionForm.extraText, "其他配置");
  for (const reserved of ["timeoutMs", "headers", "auth"]) {
    if (reserved in extras) {
      throw new Error(`其他配置中不要重复填写 ${reserved}`);
    }
  }
  if (connectionForm.kind === "database" && !String(extras.jdbcUrl ?? "").trim()) {
    throw new Error("database 连接器必须填写 jdbcUrl");
  }
  const config: ConnectionConfig = { timeoutMs: connectionForm.timeoutMs, ...extras };
  if (!supportsAuth.value) {
    return config;
  }
  const headers = parseJson(connectionForm.headersText, "公共请求头");
  if (headers !== null && !Array.isArray(headers)) {
    throw new Error("公共请求头必须是数组");
  }
  const auth = parseJson(connectionForm.authText, "鉴权 auth");
  if (auth !== null && (typeof auth !== "object" || Array.isArray(auth))) {
    throw new Error("鉴权 auth 必须是对象");
  }
  if (Array.isArray(headers) && headers.length) {
    config.headers = headers as ConnectionHeader[];
  }
  if (auth) {
    config.auth = auth as ConnectionAuth;
  }
  return config;
}

async function saveConnection() {
  if (!connectionForm.name.trim()) {
    ElMessage.warning("请填写连接器名称");
    return;
  }
  if (!connectionEditing.value && !/^[a-z][a-z0-9_]{0,63}$/.test(connectionForm.key.trim())) {
    ElMessage.warning("连接器 key 需为小写字母开头的 1-64 位小写字母、数字或下划线");
    return;
  }
  let config: ConnectionConfig;
  try {
    config = buildConfig();
  } catch (error) {
    ElMessage.warning(errorMessage(error));
    return;
  }
  const payload: ConnectionPayload = {
    name: connectionForm.name.trim(),
    kind: connectionForm.kind,
    base_url: supportsBaseUrl.value ? connectionForm.baseUrl.trim() || null : null,
    config,
    enabled: connectionForm.enabled
  };
  saving.value = true;
  try {
    if (connectionEditing.value) {
      await connectionsApi.updateConnection(connectionEditing.value, payload);
    } else {
      await connectionsApi.createConnection({ ...payload, key: connectionForm.key.trim() });
    }
    connectionOpen.value = false;
    ElMessage.success("连接器已保存");
    await load();
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    saving.value = false;
  }
}

async function removeConnection(row: ConnectionView) {
  try {
    await ElMessageBox.confirm(
      `删除连接器「${row.name}」后，引用它的 API 会返回 CONNECTION_NOT_FOUND。确认删除？`,
      "删除连接器",
      { type: "warning" }
    );
    await connectionsApi.deleteConnection(row.id);
    ElMessage.success("连接器已删除");
    await load();
  } catch (error) {
    if (error !== "cancel" && error !== "close") ElMessage.error(errorMessage(error));
  }
}

function auditActionLabel(action: string) {
  if (action === "create") return "创建";
  if (action === "update") return "修改";
  if (action === "delete") return "删除";
  return action;
}

function formatAudit(value: Record<string, unknown> | null) {
  return value ? JSON.stringify(value, null, 2) : "—";
}

async function openAudits(row: ConnectionView) {
  auditConnection.value = row;
  auditRows.value = [];
  auditOpen.value = true;
  auditLoading.value = true;
  try {
    auditRows.value = await connectionsApi.listConnectionAudits(row.id);
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    auditLoading.value = false;
  }
}

function openSecret(row?: SecretView) {
  secretEditing.value = row?.id ?? null;
  secretForm.key = row?.key ?? "";
  secretForm.name = row?.name ?? "";
  secretForm.description = row?.description ?? "";
  secretForm.value = "";
  secretOpen.value = true;
}

async function saveSecret() {
  if (!secretForm.name.trim()) {
    ElMessage.warning("请填写密钥名称");
    return;
  }
  if (!secretEditing.value && !/^[a-z][a-z0-9_]{0,63}$/.test(secretForm.key.trim())) {
    ElMessage.warning("密钥 key 需为小写字母开头的 1-64 位小写字母、数字或下划线");
    return;
  }
  if (!secretEditing.value && !secretForm.value) {
    ElMessage.warning("请填写密钥值");
    return;
  }
  const payload: SecretPayload = {
    name: secretForm.name.trim(),
    description: secretForm.description.trim(),
    ...(secretForm.value ? { value: secretForm.value } : {})
  };
  saving.value = true;
  try {
    if (secretEditing.value) {
      await connectionsApi.updateSecret(secretEditing.value, payload);
    } else {
      await connectionsApi.createSecret({ ...payload, key: secretForm.key.trim() });
    }
    secretOpen.value = false;
    ElMessage.success(secretEditing.value ? "密钥已更新" : "密钥已保存");
    await load();
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    saving.value = false;
  }
}

async function removeSecret(row: SecretView) {
  try {
    await ElMessageBox.confirm(
      `删除密钥「${row.name}」后，引用 ${row.key} 的连接器将无法发送请求。确认删除？`,
      "删除密钥",
      { type: "warning" }
    );
    await connectionsApi.deleteSecret(row.id);
    ElMessage.success("密钥已删除");
    await load();
  } catch (error) {
    if (error !== "cancel" && error !== "close") ElMessage.error(errorMessage(error));
  }
}
</script>
<template>
  <div class="mx-auto max-w-7xl space-y-5">
    <section class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-[20px] font-semibold tracking-tight text-slate-800">集成连接</h1>
        <p class="mt-1 text-[12px] text-slate-500">
          维护外部地址与默认鉴权；密钥库只保存加密值，Bundle 内只出现引用 key。
        </p>
      </div>
      <div class="flex gap-2">
        <el-button @click="load">刷新</el-button>
        <el-button v-if="activeTab === 'connections'" type="primary" @click="openConnection()">
          新建连接器
        </el-button>
        <el-button v-else type="primary" @click="openSecret()">新建密钥</el-button>
      </div>
    </section>

    <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11.5px] leading-relaxed text-amber-800">
      密钥值只写不读。轮换后旧密文立即被覆盖；主密钥丢失将无法解密已有密钥。生产环境默认拒绝私网与 HTTP。
    </div>

    <el-tabs v-model="activeTab" class="rounded-2xl border border-slate-200 bg-white px-5 py-4">
      <el-tab-pane label="连接器" name="connections">
        <div v-loading="loading" class="space-y-3">
          <div v-if="!connections.length" class="rounded-xl border border-dashed border-slate-300 px-6 py-14 text-center">
            <div class="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-xl text-indigo-500">⌘</div>
            <h2 class="mt-3 text-[14px] font-semibold text-slate-700">还没有连接器</h2>
            <p class="mt-1 text-[11.5px] text-slate-500">先建密钥，再配置 REST / GraphQL / SOAP / 数据库连接。</p>
          </div>
          <article
            v-for="row in connections"
            :key="row.id"
            class="rounded-xl border border-slate-200 px-4 py-3 transition hover:border-indigo-200 hover:shadow-sm"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-[13.5px] font-semibold text-slate-800">{{ row.name }}</span>
                  <span class="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10.5px] text-slate-600">{{ row.key }}</span>
                  <span class="rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600">{{ row.kind }}</span>
                  <span
                    class="rounded px-2 py-0.5 text-[10px] font-medium"
                    :class="row.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'"
                  >{{ row.enabled ? "启用" : "停用" }}</span>
                </div>
                <p class="mt-1.5 break-all font-mono text-[11px] text-slate-500">
                  {{ row.base_url || (row.kind === "database" ? row.config?.jdbcUrl || "未配置 jdbcUrl" : "未设置 baseUrl（由 API 提供）") }}
                </p>
                <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-slate-400">
                  <span>超时 {{ row.config?.timeoutMs ?? 10000 }}ms</span>
                  <span>{{ connectionAuthLabel(row.config) }}</span>
                  <span>公共头 {{ row.config?.headers?.length ?? 0 }}</span>
                  <span>更新 {{ formatTime(row.updated_at) }}</span>
                  <span v-if="secretMissing(row.config)" class="text-amber-600">引用的密钥尚未创建</span>
                </div>
              </div>
              <div class="flex shrink-0 flex-wrap gap-1">
                <el-button size="small" @click="openAudits(row)">审计</el-button>
                <el-button size="small" @click="openConnection(row)">编辑</el-button>
                <el-button size="small" type="danger" plain @click="removeConnection(row)">删除</el-button>
              </div>
            </div>
          </article>
        </div>
      </el-tab-pane>

      <el-tab-pane label="密钥" name="secrets">
        <div class="overflow-hidden rounded-xl border border-slate-200">
          <el-table :data="secrets" size="small" empty-text="还没有密钥">
            <el-table-column prop="key" label="Key" min-width="150">
              <template #default="{ row }"><span class="font-mono text-[11.5px]">{{ row.key }}</span></template>
            </el-table-column>
            <el-table-column prop="name" label="名称" min-width="130" />
            <el-table-column prop="description" label="说明" min-width="180" show-overflow-tooltip />
            <el-table-column label="状态" width="110">
              <template #default="{ row }">
                <span class="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                  {{ row.configured ? "已配置" : "未配置" }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="版本" width="80" prop="key_version" />
            <el-table-column label="更新时间" width="170">
              <template #default="{ row }">{{ formatTime(row.rotated_at || row.updated_at) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="openSecret(row)">编辑 / 轮换</el-button>
                <el-button link type="danger" size="small" @click="removeSecret(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>
    <el-dialog v-model="connectionOpen" :title="connectionEditing ? '编辑连接器' : '新建连接器'" width="680px">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <p class="mb-1 text-[11px] font-medium text-slate-500">Key</p>
          <el-input v-model="connectionForm.key" :disabled="!!connectionEditing" placeholder="school_api" />
        </div>
        <div>
          <p class="mb-1 text-[11px] font-medium text-slate-500">名称</p>
          <el-input v-model="connectionForm.name" placeholder="教务开放接口" />
        </div>
        <div>
          <p class="mb-1 text-[11px] font-medium text-slate-500">类型</p>
          <el-select v-model="connectionForm.kind" class="!w-full">
            <el-option v-for="kind in ['rest', 'graphql', 'soap', 'database', 'internal']" :key="kind" :label="kind" :value="kind" />
          </el-select>
        </div>
        <div>
          <p class="mb-1 text-[11px] font-medium text-slate-500">超时毫秒</p>
          <el-input-number v-model="connectionForm.timeoutMs" :min="1" :max="120000" controls-position="right" class="!w-full" />
        </div>
        <div v-if="supportsBaseUrl" class="col-span-2">
          <p class="mb-1 text-[11px] font-medium text-slate-500">Base URL</p>
          <el-input v-model="connectionForm.baseUrl" placeholder="https://api.example.edu" />
        </div>
        <div v-else class="col-span-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
          {{ connectionForm.kind === "database" ? "数据库连接地址写在下方「其他配置」的 jdbcUrl 中。" : "内部连接器不使用 baseUrl，由运行时按 connectionRef 解析。" }}
        </div>
        <div v-if="supportsAuth" class="col-span-2">
          <p class="mb-1 text-[11px] font-medium text-slate-500">公共请求头 JSON</p>
          <el-input v-model="connectionForm.headersText" type="textarea" :rows="4" class="font-mono" />
          <p class="mt-1 text-[10.5px] text-slate-400">
            例如 [{"name":"Accept","value":"application/json"}]。鉴权头请走 auth，不要手写 Authorization。
          </p>
        </div>
        <div v-if="supportsAuth" class="col-span-2">
          <p class="mb-1 text-[11px] font-medium text-slate-500">默认鉴权 auth JSON</p>
          <el-input v-model="connectionForm.authText" type="textarea" :rows="8" class="font-mono" />
          <p class="mt-1 text-[10.5px] leading-relaxed text-slate-400">
            支持 none / tenant / bearer / apiKey / basic / oauth2 / signature。OAuth2 需填写 grant、tokenUrl 及 clientIdRef、clientSecretRef 等密钥引用；签名需填写 algorithm、secretRef、headerName、template。
          </p>
        </div>
        <div class="col-span-2">
          <p class="mb-1 text-[11px] font-medium text-slate-500">其他配置 JSON</p>
          <el-input v-model="connectionForm.extraText" type="textarea" :rows="6" class="font-mono" />
          <p class="mt-1 text-[10.5px] leading-relaxed text-slate-400">
            database：jdbcUrl、driver、usernameRef、passwordRef、maxRows、queryTimeoutSec；soap：soapAction；平台扩展字段可用 x- 前缀。
          </p>
          <p v-if="connectionForm.kind === 'database'" class="mt-1 text-[10.5px] text-amber-600">
            数据库连接器仅允许 PostgreSQL、只读 SELECT / WITH，禁止查询参数与多语句。
          </p>
        </div>
        <div class="col-span-2 flex items-center gap-2">
          <el-switch v-model="connectionForm.enabled" />
          <span class="text-[12px] text-slate-600">启用连接器</span>
        </div>
      </div>
      <template #footer>
        <el-button @click="connectionOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveConnection">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="auditOpen" :title="`审计 · ${auditConnection?.name ?? ''}`" width="860px">
      <div v-loading="auditLoading" class="min-h-[160px]">
        <div v-if="!auditLoading && !auditRows.length" class="rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center text-[12px] text-slate-500">
          暂无审计记录
        </div>
        <div v-else class="space-y-3">
          <article v-for="row in auditRows" :key="row.id" class="rounded-xl border border-slate-200 px-4 py-3">
            <div class="flex flex-wrap items-center gap-3 text-[11.5px]">
              <span class="rounded bg-indigo-50 px-2 py-0.5 font-medium text-indigo-600">{{ auditActionLabel(row.action) }}</span>
              <span class="text-slate-700">{{ row.actor }}</span>
              <span class="font-mono text-[10.5px] text-slate-400">{{ row.connection_key }}</span>
              <span class="ml-auto text-slate-400">{{ formatTime(row.created_at) }}</span>
            </div>
            <div class="mt-2 grid gap-2 md:grid-cols-2">
              <div>
                <p class="mb-1 text-[10.5px] font-medium text-slate-400">变更前</p>
                <pre class="max-h-52 overflow-auto rounded-lg bg-slate-50 p-2 text-[10.5px] leading-relaxed text-slate-600">{{ formatAudit(row.before) }}</pre>
              </div>
              <div>
                <p class="mb-1 text-[10.5px] font-medium text-slate-400">变更后</p>
                <pre class="max-h-52 overflow-auto rounded-lg bg-slate-50 p-2 text-[10.5px] leading-relaxed text-slate-600">{{ formatAudit(row.after) }}</pre>
              </div>
            </div>
          </article>
        </div>
      </div>
    </el-dialog>

    <el-dialog v-model="secretOpen" :title="secretEditing ? '编辑密钥 / 轮换' : '新建密钥'" width="520px">
      <div class="space-y-3">
        <div>
          <p class="mb-1 text-[11px] font-medium text-slate-500">Key</p>
          <el-input v-model="secretForm.key" :disabled="!!secretEditing" placeholder="gov_open_api_key" />
        </div>
        <div>
          <p class="mb-1 text-[11px] font-medium text-slate-500">名称</p>
          <el-input v-model="secretForm.name" placeholder="教育开放平台密钥" />
        </div>
        <div>
          <p class="mb-1 text-[11px] font-medium text-slate-500">说明</p>
          <el-input v-model="secretForm.description" type="textarea" :rows="2" />
        </div>
        <div>
          <p class="mb-1 text-[11px] font-medium text-slate-500">密钥值</p>
          <el-input
            v-model="secretForm.value"
            type="password"
            show-password
            autocomplete="new-password"
            :placeholder="secretEditing ? '留空则仅更新元数据；填写即轮换' : '只能写入，保存后不可查看'"
          />
          <p class="mt-1 text-[10.5px] text-slate-400">接口永不返回明文或密文；轮换会覆盖旧值并提升版本号。</p>
        </div>
      </div>
      <template #footer>
        <el-button @click="secretOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveSecret">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
