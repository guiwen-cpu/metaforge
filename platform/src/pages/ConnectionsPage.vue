<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { connectionsApi } from "@/api/connections";
import { errorMessage } from "@/lib/http";
import type {
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
const connectionForm = reactive({
  key: "",
  name: "",
  kind: "rest",
  baseUrl: "",
  enabled: true,
  timeoutMs: 10000,
  headersText: "[]",
  authText: "{\n  \type\: \none\\n}"
});

const secretOpen = ref(false);
const secretEditing = ref<string | null>(null);
const secretForm = reactive({
  key: "",
  name: "",
  description: "",
  value: ""
});

const configuredSecrets = computed(() => new Set(secrets.value.map((item) => item.key)));

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
  return auth.type;
}

function secretMissing(config: ConnectionConfig) {
  const auth = config.auth;
  if (!auth) return false;
  const refs = [auth.tokenRef, auth.valueRef, auth.usernameRef, auth.passwordRef]
    .filter((item): item is string => Boolean(item))
    .map((item) => item.replace(/^secret:/i, ""));
  return refs.some((key) => !configuredSecrets.value.has(key));
}

function resetConnectionForm() {
  connectionForm.key = "";
  connectionForm.name = "";
  connectionForm.kind = "rest";
  connectionForm.baseUrl = "";
  connectionForm.enabled = true;
  connectionForm.timeoutMs = 10000;
  connectionForm.headersText = "[]";
  connectionForm.authText = "{\n  \type\: \none\\n}";
}

function openConnection(row?: ConnectionView) {
  connectionEditing.value = row?.id ?? null;
  if (!row) {
    resetConnectionForm();
  } else {
    connectionForm.key = row.key;
    connectionForm.name = row.name;
    connectionForm.kind = row.kind;
    connectionForm.baseUrl = row.base_url ?? "";
    connectionForm.enabled = row.enabled;
    connectionForm.timeoutMs = row.config?.timeoutMs ?? 10000;
    connectionForm.headersText = JSON.stringify(row.config?.headers ?? [], null, 2);
    connectionForm.authText = JSON.stringify(row.config?.auth ?? { type: "none" }, null, 2);
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

function buildConfig(): ConnectionConfig {
  const headers = parseJson(connectionForm.headersText, "公共请求头");
  if (headers !== null && !Array.isArray(headers)) {
    throw new Error("公共请求头必须是数组");
  }
  const auth = parseJson(connectionForm.authText, "鉴权 auth");
  if (auth !== null && (typeof auth !== "object" || Array.isArray(auth))) {
    throw new Error("鉴权 auth 必须是对象");
  }
  return {
    timeoutMs: connectionForm.timeoutMs,
    ...(Array.isArray(headers) && headers.length
      ? { headers: headers as ConnectionHeader[] }
      : {}),
    ...(auth ? { auth: auth as ConnectionAuth } : {})
  };
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
    base_url: connectionForm.baseUrl.trim(),
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
    if (error !== "cancel") ElMessage.error(errorMessage(error));
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
    if (error !== "cancel") ElMessage.error(errorMessage(error));
  }
}
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-5">
    <section class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-[20px] font-semibold tracking-tight text-slate-800">集成连接</h1>
        <p class="mt-1 text-[12px] text-slate-500">
          连接器维护外部地址与默认鉴权；密钥库只保存加密值，Bundle 内只出现引用 key。
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
            <div class="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-xl text-indigo-500">⇄</div>
            <h2 class="mt-3 text-[14px] font-semibold text-slate-700">还没有连接器</h2>
            <p class="mt-1 text-[11.5px] text-slate-500">先建密钥，再为 REST 接口配置 baseUrl 与默认鉴权。</p>
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
                <p class="mt-1.5 break-all font-mono text-[11px] text-slate-500">{{ row.base_url || "未设置 baseUrl（由 API 提供）" }}</p>
                <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-slate-400">
                  <span>超时 {{ row.config?.timeoutMs ?? 10000 }}ms</span>
                  <span>{{ connectionAuthLabel(row.config) }}</span>
                  <span>公共头 {{ row.config?.headers?.length ?? 0 }}</span>
                  <span>更新 {{ formatTime(row.updated_at) }}</span>
                  <span v-if="secretMissing(row.config)" class="text-amber-600">引用的密钥尚未创建</span>
                </div>
              </div>
              <div class="flex shrink-0 gap-1">
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
            <el-table-column label="版本" width="76">
              <template #default="{ row }">v{{ row.key_version }}</template>
            </el-table-column>
            <el-table-column label="最近轮换" width="165">
              <template #default="{ row }">{{ formatTime(row.rotated_at) }}</template>
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

    <el-dialog v-model="connectionOpen" :title="connectionEditing ? '编辑连接器' : '新建连接器'" width="620px">
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
        <div class="col-span-2">
          <p class="mb-1 text-[11px] font-medium text-slate-500">Base URL</p>
          <el-input v-model="connectionForm.baseUrl" placeholder="https://api.example.edu" />
        </div>
        <div class="col-span-2">
          <p class="mb-1 text-[11px] font-medium text-slate-500">公共请求头 JSON</p>
          <el-input v-model="connectionForm.headersText" type="textarea" :rows="4" class="font-mono" />
          <p class="mt-1 text-[10.5px] text-slate-400">例如 [{"name":"Accept","value":"application/json"}]。鉴权头请走 auth，不写 Authorization。</p>
        </div>
        <div class="col-span-2">
          <p class="mb-1 text-[11px] font-medium text-slate-500">默认鉴权 auth JSON</p>
          <el-input v-model="connectionForm.authText" type="textarea" :rows="6" class="font-mono" />
          <p class="mt-1 text-[10.5px] text-slate-400">
            支持 none / tenant / bearer / apiKey / basic；凭证示例 {"type":"bearer","tokenRef":"secret:vendor_token"}。
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
