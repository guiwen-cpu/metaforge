#!/usr/bin/env node
/**
 * LCP 出码引擎 · 第三步：DataSchema → Vue3 内置 CRUD 页面
 *
 *   node tools/gen-page.mjs [bundle.json ...]
 *
 * 不传参数时读取 examples/ 下所有 *.bundle.json。输出：codegen/<appKey>/web/。
 *
 * 与前后两步的分工：
 *   gen-entity 把 Schema 编译成物理形态（DDL / 行类型）——「数据长什么样」；
 *   gen-api    把 Schema 编译成接口形态（路由 / 查询 / 写入校验）——「数据怎么进出」；
 *   本文件把同一份 Schema 编译成页面形态（搜索 / 表格 / 弹窗表单 / 上传）——「人怎么用」。
 *   三者共用 gen-entity 的规划器与 gen-api 的查询契约，列名、筛选参数不会出现第二套口径。
 *
 * 本文件只拥有 codegen/<appKey>/web/；sql/ ts/ java/ 归 gen-entity，api/ 归 gen-api。
 *
 * 三条页面层约定（自检逐条断言）：
 *   1. sensitive 字段不进列表、不进编辑表单（BFF 只写不读，编辑省略即保持）；
 *   2. immutable 字段创建可填、编辑只读、不进提交体；
 *   3. 开启乐观锁的实体，提交体带 version，冲突由 BFF 返回 409。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createWriteStats, writeStatsText, writeTextIfChanged } from "./codegen-fs.mjs";

import {
  renderApp,
  PROBLEMS,
  NOTES,
  pascal,
  camel,
  textOf,
  primaryKeyOf
} from "./gen-entity.mjs";
import {
  filtersOf,
  sensitiveItemsOf,
  businessItems,
  permissionMatrixOf
} from "./gen-api.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT_ROOT = process.env.LCP_CODEGEN_OUT
  ? path.resolve(process.env.LCP_CODEGEN_OUT)
  : path.join(ROOT, "codegen");
const WEB_SUBDIR = "web";
const MANIFEST_NAME = "GENERATED.txt";
const MANIFEST_MARK = "# tools/gen-page.mjs 的产物清单";
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const STAT = { apps: 0, entities: 0, files: 0, fields: 0, columns: 0, filters: 0, uploads: 0 };

// ============================================================ 基础工具
const bad = (where, msg) => PROBLEMS.push({ where, msg });
const note = (where, msg) => NOTES.push({ level: "info", where, msg });
const warn = (where, msg) => NOTES.push({ level: "warn", where, msg });
const oneLine = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const labelOf = (fieldOrText) => {
  if (fieldOrText == null) return "";
  if (typeof fieldOrText === "string") return oneLine(fieldOrText);
  return oneLine(textOf(fieldOrText.label)) || String(fieldOrText.key ?? "");
};
const addIf = (obj, key, value) => {
  if (value !== undefined && value !== null && value !== "") obj[key] = value;
  return obj;
};
/** HTML 属性转义：标题、副标题会直接进生成的模板块 */
const escAttr = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const js = (value) => JSON.stringify(value, null, 2);

// ============================================================ 字段 → 控件
const WIDGET_BY_TYPE = {
  string: "input",
  text: "textarea",
  richText: "textarea",
  integer: "number",
  decimal: "number",
  boolean: "switch",
  date: "date",
  datetime: "datetime",
  time: "time",
  json: "json",
  enum: "select",
  ref: "ref",
  file: "upload",
  image: "upload",
  video: "upload",
  signature: "input",
  location: "input",
  array: "json",
  formula: "readonly"
};

const UI_WIDGET = {
  "el-input": "input",
  "el-input-number": "number",
  "el-switch": "switch",
  "el-select": "select",
  "el-radio-group": "radio",
  "el-checkbox-group": "checkbox",
  "el-date-picker": "date",
  "el-time-picker": "time",
  "x-upload": "upload",
  "x-select": "select",
  "x-status-tag": "select",
  "x-employee-picker": "ref",
  "x-user-picker": "ref",
  "x-dept-picker": "input",
  "x-json-editor": "json",
  "x-rich-text": "textarea",
  "x-signature": "input",
  "x-location": "input"
};

const UPLOAD_DEFAULTS = {
  image: { accept: ["jpg", "jpeg", "png", "webp"], maxSize: 10 * 1024 * 1024, maxCount: 6, listType: "picture-card" },
  video: { accept: ["mp4", "mov"], maxSize: 100 * 1024 * 1024, maxCount: 1, listType: "text" },
  document: { accept: ["pdf", "doc", "docx", "xls", "xlsx"], maxSize: 50 * 1024 * 1024, maxCount: 5, listType: "text" }
};

const LIST_EXCLUDED_TYPES = new Set(["text", "richText", "json", "signature", "location", "formula"]);

function uploadKindOf(field) {
  if (field.type === "image" || field.type === "video" || field.type === "file") {
    return field.type === "file" ? "document" : field.type;
  }
  if (field.type === "array") {
    const item = field.itemType?.type;
    if (item === "image" || item === "video" || item === "file") return item === "file" ? "document" : item;
  }
  return null;
}

function uploadSpecOf(field, uploadKind) {
  const hint = field.uiHints?.upload ?? {};
  const base = UPLOAD_DEFAULTS[uploadKind];
  const array = field.type === "array";
  const maxCount = Number(hint.maxCount ?? (array ? base.maxCount : 1));
  const spec = {
    kind: uploadKind,
    accept: (hint.accept ?? base.accept).map((x) => String(x).toLowerCase()),
    maxSize: Number(hint.maxSize ?? base.maxSize),
    maxCount: maxCount,
    multiple: hint.multiple === undefined ? array || maxCount > 1 : hint.multiple === true,
    listType: hint.listType === "picture-card" || hint.listType === "text" ? hint.listType : base.listType,
    preview: hint.preview === undefined ? uploadKind === "image" : hint.preview === true
  };
  if (hint.pathTemplate) spec.pathTemplate = String(hint.pathTemplate);
  return spec;
}

function widgetOf(field, uploadKind) {
  if (uploadKind) return "upload";
  if (field.type === "array") {
    const item = field.itemType?.type;
    if (item === "enum") return "checkbox";
    if (item === "ref") return "multiselect";
    if (item === "string" || item === "integer" || item === "decimal") return "tags";
    return "json";
  }
  const hinted = UI_WIDGET[field.uiHints?.widget];
  if (hinted) {
    if (hinted === "input" && (field.type === "text" || field.type === "richText" || Number(field.uiHints?.rows ?? 0) > 1)) {
      return "textarea";
    }
    return hinted;
  }
  return WIDGET_BY_TYPE[field.type] ?? "json";
}

// ============================================================ 枚举
function enumSourceOf(field, bundle) {
  const ref = field.enumRef?.key;
  if (ref) {
    const all = [];
    for (const ds of bundle.artifacts?.dataSchemas ?? []) for (const en of ds.enums ?? []) all.push(en);
    for (const en of bundle.artifacts?.enums ?? []) all.push(en);
    const hit = all.find((en) => en.key === ref);
    if (hit) {
      const values = [...(hit.values ?? [])].sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
      if (field.enumValues?.length) {
        const shared = new Set(values.map((v) => v.value));
        const missing = field.enumValues.map((v) => v.value).filter((v) => !shared.has(v));
        if (missing.length) {
          warn(`${field.key}`, `内联 enumValues 与共享枚举 ${ref} 不一致（多出 ${missing.join(", ")}），页面以共享枚举为准`);
        }
      }
      return { key: ref, values, shared: true };
    }
    warn(`${field.key}`, `enumRef "${ref}" 在 Bundle 里找不到定义，退回内联 enumValues`);
  }
  if (field.enumValues?.length) return { key: `${field.key}_inline`, values: field.enumValues, shared: false };
  return null;
}

function optionListOf(source) {
  return source.values.map((v) => {
    const option = { value: v.value, label: oneLine(textOf(v.label)) || String(v.value) };
    if (v.color) option.color = v.color;
    return option;
  });
}

// ============================================================ 字段 / 列 / 筛选规划
function fieldSpecOf(item, bundle) {
  const field = item.field ?? {};
  const uploadKind = uploadKindOf(field);
  const widget = widgetOf(field, uploadKind);
  const spec = {
    key: item.name,
    label: labelOf(field) || item.name,
    widget,
    span: Number(field.uiHints?.colSpan ?? (widget === "textarea" || widget === "upload" || widget === "json" ? 24 : 12)),
    required: field.required === true,
    readonly: field.immutable === true,
    sensitive: field.sensitive === true
  };
  addIf(spec, "placeholder", oneLine(field.uiHints?.placeholder));
  addIf(spec, "help", oneLine(field.uiHints?.help));
  if (widget === "textarea") spec.rows = Number(field.uiHints?.rows ?? 3);
  if (widget === "upload") spec.upload = uploadSpecOf(field, uploadKind);
  if (widget === "ref") addIf(spec, "refEntity", field.refEntity?.key ?? field.itemType?.refEntity?.key);
  if (widget === "select" || widget === "radio" || widget === "checkbox" || widget === "multiselect") {
    const source = enumSourceOf(field.type === "array" ? { ...field.itemType, key: field.key } : field, bundle);
    if (source) spec.options = optionListOf(source);
    else warn(`${item.name}`, `控件是 ${widget}，但字段没有 enumRef / enumValues，选项为空`);
  }
  for (const v of field.validators ?? []) {
    if (v.type === "minLength") spec.minLength = Number(v.value);
    else if (v.type === "maxLength") spec.maxLength = Number(v.value);
    else if (v.type === "range") {
      if (v.min !== undefined && v.min !== null) spec.min = Number(v.min);
      if (v.max !== undefined && v.max !== null) spec.max = Number(v.max);
    } else if (v.type === "pattern") spec.pattern = String(v.value);
    else if (v.type === "expr") warn(`${item.name}`, "validator=expr 无法映射为前端规则，交 BFF 规则引擎校验");
    else if (v.type === "fileMaxSize" || v.type === "fileAccept") {
      if (widget !== "upload") note(`${item.name}`, `validator=${v.type} 属于上传层约束，当前字段不是上传控件，已跳过`);
    } else if (v.type === "uniqueIn") note(`${item.name}`, "validator=uniqueIn 由 BFF / 数据库唯一索引保证，前端不预判");
    else warn(`${item.name}`, `未知 validator "${v.type}"，已跳过`);
  }
  if (field.defaultValue !== undefined && field.defaultValue !== null) spec.defaultValue = field.defaultValue;
  return spec;
}

function writableItemsOf(plan) {
  const primaryKey = primaryKeyOf(plan.entity);
  return businessItems(plan).filter((item) => item.name !== primaryKey);
}

function columnItemsOf(plan) {
  return businessItems(plan).filter((item) => {
    const field = item.field ?? {};
    return (
      item.name !== primaryKeyOf(plan.entity) &&
      field.sensitive !== true &&
      field.uiHints?.hideInList !== true &&
      !LIST_EXCLUDED_TYPES.has(field.type)
    );
  });
}

function columnSpecOf(item, bundle) {
  const field = item.field ?? {};
  const uploadKind = uploadKindOf(field);
  let format = "text";
  if (field.type === "enum") format = "enum";
  else if (field.type === "boolean") format = "boolean";
  else if (field.type === "date") format = "date";
  else if (field.type === "datetime") format = "datetime";
  else if (field.type === "integer" || field.type === "decimal") format = "number";
  else if (uploadKind) format = "files";
  const spec = { key: item.name, label: labelOf(field) || item.name, format };
  const width = Number(field.uiHints?.width ?? 0);
  if (width > 0) spec.width = width;
  else if (format === "enum") spec.width = 120;
  else if (format === "date") spec.width = 120;
  else if (format === "datetime") spec.width = 170;
  else if (format === "number") spec.width = 110;
  else if (format === "boolean") spec.width = 90;
  else if (format === "files") spec.width = 110;
  else spec.minWidth = 160;
  if (format === "number") {
    spec.align = "right";
    spec.digits = field.type === "decimal" ? Number(field.scale ?? 2) : 0;
  }
  if (field.sortable === true) spec.sortable = true;
  if (field.type === "text" || field.type === "richText") spec.truncate = true;
  if (format === "enum") {
    const source = enumSourceOf(field, bundle);
    if (source) spec.options = optionListOf(source);
  }
  return spec;
}

function columnsOf(plan, bundle) {
  const out = columnItemsOf(plan).map((item) => columnSpecWithRef(item, bundle));
  const createdAt = plan.entity.storage?.timestamps?.createdAt;
  if (createdAt && !out.some((column) => column.key === createdAt)) {
    out.push({ key: createdAt, label: "创建时间", format: "datetime", width: 170 });
  }
  return out;
}

function filterSpecsOf(plan, bundle) {
  const out = [];
  const searchables = columnItemsOf(plan).filter((item) => item.field?.searchable === true);
  if (searchables.length > 0) {
    out.push({
      key: "q",
      field: "q",
      label: "关键词",
      widget: "input",
      placeholder: "搜索 " + searchables.map((item) => labelOf(item.field)).join(" / ")
    });
  }
  for (const item of filtersOf(plan)) {
    const field = item.item.field ?? {};
    const base = labelOf(field) || item.item.name;
    const spec = {
      key: item.name,
      field: item.name,
      label: item.mode === "range" ? base + (item.name.endsWith("_from") ? "（起）" : "（止）") : base,
      widget: "input"
    };
    if (field.type === "enum") {
      spec.widget = "select";
      spec.placeholder = "全部";
      const source = enumSourceOf(field, bundle);
      if (source) spec.options = optionListOf(source);
    } else if (field.type === "boolean") {
      spec.widget = "select";
      spec.placeholder = "全部";
      spec.options = [{ value: true, label: "是" }, { value: false, label: "否" }];
    } else if (field.type === "date") {
      spec.widget = "date";
    } else if (field.type === "datetime") {
      spec.widget = "datetime";
    } else if (field.type === "integer" || field.type === "decimal") {
      spec.widget = "number";
    } else {
      spec.placeholder = "精确匹配";
    }
    out.push(spec);
  }
  return out;
}

function routeOf(entry, plan) {
  const entityPascal = pascal(plan.entity.key);
  return {
    path: plan.entity.key,
    name: pascal(entry.key) + entityPascal + "List",
    component: "../pages/" + entityPascal + "/index.vue",
    title: oneLine(textOf(plan.entity.name)) || plan.entity.key,
    entity: plan.entity.key
  };
}

// ============================================================ 渲染：工程骨架
function packageJsonOf(entry) {
  const pkg = {
    name: entry.key.replace(/_/g, "-") + "-web",
    private: true,
    version: "0.1.0",
    type: "module",
    scripts: {
      dev: "vite",
      build: "vue-tsc --noEmit && vite build",
      preview: "vite preview",
      typecheck: "vue-tsc --noEmit"
    },
    dependencies: {
      "ali-oss": "^6.23.0",
      axios: "^1.7.9",
      "element-plus": "^2.9.0",
      pinia: "^2.3.0",
      vue: "^3.5.13",
      "vue-router": "^4.5.0"
    },
    devDependencies: {
      "@types/ali-oss": "^6.23.3",
      "@types/node": "^22.10.2",
      "@vitejs/plugin-vue": "^5.2.1",
      autoprefixer: "^10.4.20",
      postcss: "^8.4.49",
      tailwindcss: "^3.4.17",
      typescript: "^5.7.2",
      vite: "^6.0.5",
      "vue-tsc": "^2.2.0"
    }
  };
  return JSON.stringify(pkg, null, 2) + "\n";
}

function viteConfigOf(entry) {
  return `import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET ?? "http://localhost:8080",
        changeOrigin: true
      }
    }
  }
});
`;
}

function tsconfigOf() {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        useDefineForClassFields: true,
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        jsx: "preserve",
        resolveJsonModule: true,
        isolatedModules: true,
        esModuleInterop: true,
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        skipLibCheck: true,
        noEmit: true,
        baseUrl: ".",
        paths: { "@/*": ["src/*"] },
        types: ["vite/client"]
      },
      include: ["src/**/*.ts", "src/**/*.d.ts", "src/**/*.vue"],
      references: [{ path: "./tsconfig.node.json" }]
    },
    null,
    2
  ) + "\n";
}

function tsconfigNodeOf() {
  return JSON.stringify(
    {
      compilerOptions: {
        composite: true,
        skipLibCheck: true,
        module: "ESNext",
        moduleResolution: "Bundler",
        allowSyntheticDefaultImports: true,
        types: ["node"]
      },
      include: ["vite.config.ts"]
    },
    null,
    2
  ) + "\n";
}

function tailwindConfigOf() {
  return `/** @type {import("tailwindcss").Config} */
export default {
  content: ["./index.html", "./src/**/*.{vue,ts}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        surface: "#f6f7fb"
      }
    }
  },
  plugins: []
};
`;
}

function postcssConfigOf() {
  return `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
`;
}

function indexHtmlOf(entry) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escAttr(entry.key)} · MetaForge</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`;
}

function mainTsOf() {
  return `import { createApp } from "vue";
import { createPinia } from "pinia";
import ElementPlus from "element-plus";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import "element-plus/dist/index.css";
import "./styles/index.css";
import App from "./App.vue";
import router from "./router";

createApp(App)
  .use(createPinia())
  .use(router)
  .use(ElementPlus, { locale: zhCn })
  .mount("#app");
`;
}

function appVueOf() {
  return `<template>
  <router-view />
</template>
`;
}

function envDtsOf() {
  return `/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_STS_URL?: string;
  readonly VITE_PROXY_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
`;
}

function stylesOf() {
  return `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: light;
  font-family: "Inter", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
}

body {
  margin: 0;
  background: #f6f7fb;
  color: #0f172a;
}

.lcp-card {
  @apply rounded-xl border border-slate-200 bg-white shadow-sm;
}

.lcp-muted {
  @apply text-sm text-slate-500;
}
`;
}

function notFoundVueOf() {
  return `<script setup lang="ts">
import { useRouter } from "vue-router";

const router = useRouter();
</script>

<template>
  <div class="flex h-full items-center justify-center p-10">
    <el-result icon="warning" title="页面不存在" sub-title="生成器没有为这个地址产出页面。">
      <template #extra>
        <el-button type="primary" @click="router.push('/')">回到首页</el-button>
      </template>
    </el-result>
  </div>
</template>
`;
}

function routerOf(entry, routes) {
  const routeLines = routes
    .map(
      (route) => `  {
    path: ${JSON.stringify(route.path)},
    name: ${JSON.stringify(route.name)},
    component: pages[${JSON.stringify(route.component)}],
    meta: { title: ${JSON.stringify(route.title)}, entity: ${JSON.stringify(route.entity)} }
  }`
    )
    .join(",\n");
  const fallback = routes.length > 0 ? "/" + routes[0].path : "/empty";
  const routeBlock =
    routeLines.length > 0
      ? `      { path: "", redirect: ${JSON.stringify(fallback)} },
${routeLines},
`
      : `      { path: "", redirect: ${JSON.stringify(fallback)} },
`;
  return `import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import AppLayout from "@/layouts/AppLayout.vue";
import Login from "@/views/Login.vue";
import NotFound from "@/views/NotFound.vue";
import { useSession } from "@/stores/session";

/** Vite 的 glob 键与 routeOf() 产出的相对路径一一对应，改页面目录时两边一起改。 */
const pages = import.meta.glob("../pages/*/index.vue");

const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "Login",
    component: Login,
    meta: { title: "登录", public: true }
  },
  {
    path: "/",
    component: AppLayout,
    children: [
${routeBlock}      { path: ":pathMatch(.*)*", name: "NotFound", component: NotFound }
    ]
  }
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 })
});

router.beforeEach(async (to) => {
  const session = useSession();
  await session.restore();
  const isPublic = (to.meta as { public?: boolean }).public === true;
  if (to.name === "Login" && session.isAuthenticated) {
    const redirect = typeof to.query.redirect === "string" ? to.query.redirect : "/";
    return redirect.startsWith("/") ? redirect : "/";
  }
  if (isPublic) return true;
  if (!session.isAuthenticated) {
    return { name: "Login", query: { redirect: to.fullPath } };
  }
  return true;
});

router.afterEach((to) => {
  const title = typeof to.meta.title === "string" ? to.meta.title : "";
  document.title = title ? title + " · MetaForge" : "MetaForge";
});

export default router;
`;
}

function layoutVueOf(entry, routes) {
  return `<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { APP_KEY, resourceRoutes } from "@/generated/schema";
import { useSession } from "@/stores/session";

const session = useSession();
const route = useRoute();
const router = useRouter();

const activePath = computed(() => "/" + String(route.path).split("/").filter(Boolean)[0]);
const tenantLabel = computed(() => session.tenantId || "未设置租户");
const identityLabel = computed(() => {
  const values = [session.user?.deptName, session.roles.join(" / ")].filter(Boolean);
  return values.join(" · ") || "无角色";
});

function signOut() {
  session.signOut();
  void router.push("/login");
}
</script>

<template>
  <el-container class="min-h-screen">
    <el-aside width="232px" class="border-r border-slate-200 bg-white">
      <div class="flex h-16 items-center gap-2 border-b border-slate-100 px-5">
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white">MF</div>
        <div class="leading-tight">
          <div class="text-sm font-semibold text-slate-900">MetaForge</div>
          <div class="text-[11px] uppercase tracking-wide text-slate-400">${escAttr(entry.key)}</div>
        </div>
      </div>
      <el-menu :default-active="activePath" router class="border-none px-2 py-3">
        <el-menu-item v-for="item in resourceRoutes" :key="item.path" :index="'/' + item.path">
          <span>{{ item.title }}</span>
        </el-menu-item>
      </el-menu>
      <div class="mx-3 mt-4 rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
        页面由 DataSchema 生成。列、筛选、表单字段与 BFF 的查询 / 写入契约同源。
      </div>
    </el-aside>

    <el-container>
      <el-header height="64px" class="flex items-center justify-between border-b border-slate-200 bg-white">
        <div class="flex items-center gap-3">
          <span class="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600">{{ APP_KEY }}</span>
          <el-tag size="small" type="info">租户 {{ tenantLabel }}</el-tag>
        </div>
        <div class="flex items-center gap-3">
          <div class="text-right leading-tight">
            <div class="text-sm font-medium text-slate-800">{{ session.user?.name ?? "未登录" }}</div>
            <div class="text-[11px] text-slate-400">{{ identityLabel }}</div>
          </div>
          <el-button size="small" plain @click="signOut">退出</el-button>
        </div>
      </el-header>

      <el-main class="p-6">
        <el-alert
          type="info"
          :closable="false"
          show-icon
          class="mb-4"
          title="前端权限只做按钮显隐"
          description="服务端 api/permissions.json 才是授权事实来源；前端拿不到权限时不会替代服务端校验。"
        />
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>
`;
}

// ============================================================ 渲染：Schema 快照
/** 列存 ref 需要额外带上被引用实体与展示字段，表格才能把 ULID 换成姓名。 */
function columnSpecWithRef(item, bundle) {
  const spec = columnSpecOf(item, bundle);
  const field = item.field ?? {};
  if (field.type === "ref") {
    spec.format = "ref";
    spec.refEntity = field.refEntity?.key ?? field.itemType?.refEntity?.key;
    spec.refField = typeof field.refField === "string" ? field.refField : field.refField?.key ?? "name";
    spec.minWidth = spec.minWidth ?? 180;
  }
  return spec;
}

/** 表单字段：创建可填 immutable；编辑把 immutable 变成只读；sensitive 只在创建时出现。 */
function formFieldsOf(plan, bundle, mode) {
  const out = [];
  for (const item of businessItems(plan)) {
    const field = item.field ?? {};
    if (item.name === primaryKeyOf(plan.entity)) continue;
    if (field.uiHints?.hideInForm === true) continue;
    if (mode === "edit" && field.sensitive === true) continue;
    const spec = fieldSpecOf(item, bundle);
    spec.readonly = mode === "edit" && field.immutable === true;
    if (spec.widget === "ref") {
      spec.refEntity = field.refEntity?.key ?? field.itemType?.refEntity?.key;
      spec.refField = typeof field.refField === "string" ? field.refField : field.refField?.key ?? "name";
    }
    out.push(spec);
  }
  return out;
}

function resourceOf(entry, plan, bundle) {
  const entity = plan.entity;
  const columns = columnsOf(plan, bundle);
  const filters = filterSpecsOf(plan, bundle);
  const createFields = formFieldsOf(plan, bundle, "create");
  const editFields = formFieldsOf(plan, bundle, "edit");
  const updateKeys = editFields.filter((field) => !field.readonly).map((field) => field.key);
  const sensitiveFields = sensitiveItemsOf(plan).map((item) => item.name);
  const title = oneLine(textOf(entity.name)) || entity.key;
  const subtitle =
    oneLine(textOf(entity.description)) ||
    oneLine(textOf(entity.semantic?.intent)) ||
    `${columns.length} 列 · ${createFields.length} 个表单字段`;
  return {
    key: entity.key,
    entity: entity.key,
    title,
    subtitle,
    base: `/api/v1/${entry.key}/${entity.key}`,
    primaryKey: primaryKeyOf(entity),
    titleField: entity.titleField ?? primaryKeyOf(entity),
    optimisticLock: entity.storage?.optimisticLock === true,
    softDelete: entity.storage?.softDelete?.enabled === true,
    columns,
    filters,
    createFields,
    editFields,
    updateKeys,
    sensitiveFields
  };
}

function schemaTsOf(entry, resources, routes) {
  const resourceBody = resources
    .map((resource) => `  ${JSON.stringify(resource.key)}: ${js(resource)}`)
    .join(",\n");
  return `/**
 * 本文件由 tools/gen-page.mjs 生成，勿手改。
 * 它是 DataSchema 的页面形态：列、筛选、表单字段、上传约束与 BFF 契约同源。
 */
export type FieldWidget =
  | "input"
  | "textarea"
  | "number"
  | "switch"
  | "select"
  | "radio"
  | "checkbox"
  | "multiselect"
  | "tags"
  | "date"
  | "datetime"
  | "time"
  | "json"
  | "ref"
  | "upload"
  | "readonly";

export interface OptionItem {
  value: string | number | boolean;
  label: string;
  color?: string;
}

export interface UploadSpec {
  kind: "image" | "video" | "document";
  accept: string[];
  maxSize: number;
  maxCount: number;
  multiple: boolean;
  listType: "picture-card" | "text";
  preview: boolean;
  pathTemplate?: string;
}

export interface FieldSpec {
  key: string;
  label: string;
  widget: FieldWidget;
  span: number;
  required: boolean;
  readonly: boolean;
  sensitive: boolean;
  placeholder?: string;
  help?: string;
  rows?: number;
  upload?: UploadSpec;
  refEntity?: string;
  refField?: string;
  options?: OptionItem[];
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  defaultValue?: unknown;
}

export type ColumnFormat =
  | "text"
  | "enum"
  | "boolean"
  | "date"
  | "datetime"
  | "number"
  | "files"
  | "ref";

export interface ColumnSpec {
  key: string;
  label: string;
  format: ColumnFormat;
  width?: number;
  minWidth?: number;
  align?: "left" | "right";
  digits?: number;
  sortable?: boolean;
  truncate?: boolean;
  options?: OptionItem[];
  refEntity?: string;
  refField?: string;
}

export interface FilterSpec {
  key: string;
  field: string;
  label: string;
  widget: "input" | "select" | "date" | "datetime" | "number";
  placeholder?: string;
  options?: OptionItem[];
}

export interface ResourceSpec {
  key: string;
  entity: string;
  title: string;
  subtitle: string;
  base: string;
  primaryKey: string;
  titleField: string;
  optimisticLock: boolean;
  softDelete: boolean;
  columns: ColumnSpec[];
  filters: FilterSpec[];
  /** 创建表单：immutable 字段可填，sensitive 字段只在这里出现。 */
  createFields: FieldSpec[];
  /** 编辑表单：immutable 只读，sensitive 不出现（提交时省略，服务端保持原值）。 */
  editFields: FieldSpec[];
  /** 更新提交白名单：只读字段不进请求体。 */
  updateKeys: string[];
  /** 只写不读的字段清单，用于页面提示。 */
  sensitiveFields: string[];
}

export const APP_KEY = ${JSON.stringify(entry.key)};
export const API_BASE = "/api/v1";
export const baseOf = (entity: string): string => API_BASE + "/" + APP_KEY + "/" + entity;

export const resources: Record<string, ResourceSpec> = {
${resourceBody}
};

export interface ResourceRoute {
  path: string;
  name: string;
  component: string;
  title: string;
  entity: string;
}

export const resourceRoutes: ResourceRoute[] = ${js(routes)};

export const resourceByEntity = (entity: string): ResourceSpec | undefined =>
  Object.values(resources).find((item) => item.entity === entity);
`;
}

// ============================================================ 渲染：权限快照
function permissionsTsOf(bundle, resources) {
  const matrix = permissionMatrixOf(bundle);
  const roles = (bundle.artifacts?.roles ?? []).map((role) => ({
    key: role.key,
    name: oneLine(textOf(role.name)) || role.key,
    dataScope: role.dataScope ?? "self",
    description: oneLine(textOf(role.description)),
    inheritFrom: role.inheritFrom ?? []
  }));
  const whitelist = {};
  for (const grant of bundle.artifacts?.permissions ?? []) {
    if (grant.resourceType !== "entity") continue;
    if (!Array.isArray(grant.fields) || grant.fields.length === 0) continue;
    const entry = whitelist[grant.resource] ?? (whitelist[grant.resource] = {});
    entry[grant.roleKey] = [...grant.fields];
  }
  const resourceKeys = [...new Set([...Object.keys(matrix), ...resources.map((resource) => resource.key)])].sort();
  const missing = resourceKeys.filter((key) => !matrix[key]);
  if (missing.length > 0) {
    note("permissions", `${missing.join(", ")} 没有实体级授权记录，前端按「未列出的资源不限制」处理；服务端仍是事实来源`);
  }
  return `/**
 * 本文件由 tools/gen-page.mjs 生成，勿手改。
 * 前端权限只做按钮显隐，服务端 api/permissions.json 才是授权事实来源。
 */
export type Action = "create" | "read" | "update" | "delete" | "export";

export interface RoleInfo {
  key: string;
  name: string;
  dataScope: string;
  description: string;
  inheritFrom: string[];
}

export interface ResourcePermission {
  create?: string[];
  read?: string[];
  update?: string[];
  delete?: string[];
  export?: string[];
}

export const ROLES: RoleInfo[] = ${js(roles)};

export const RESOURCE_PERMISSIONS: Record<string, ResourcePermission> = ${js(matrix)};

/** 授权里声明的字段白名单（roleKey → 字段数组）。当前只做快照，不参与页面渲染。 */
export const FIELD_WHITELIST: Record<string, Record<string, string[]>> = ${js(whitelist)};

/**
 * 未在 permissions 里出现的实体：前端不做限制，避免「配置缺失 = 页面不可用」。
 * 这不等于放行 —— 真正的校验在 BFF；这里只影响按钮是否显示。
 */
export const UNLISTED_RESOURCES_ARE_OPEN = true;

export const PERMISSION_NOTE =
  "前端权限快照来自 AppBundle.artifacts.permissions；BFF 的 api/permissions.json 是授权事实来源。";

export function resourceKeysWithGrants(): string[] {
  return Object.keys(RESOURCE_PERMISSIONS).sort();
}
`;
}

// ============================================================ 渲染：运行时库
function httpTsOf() {
  return `import axios, { AxiosError, type AxiosRequestConfig } from "axios";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isVersionConflict(): boolean {
    return this.code === "version_conflict" || this.code === "version_required";
  }
}

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE ?? "",
  timeout: 20000
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem("lcp.token");
  if (token) {
    config.headers.Authorization = "Bearer " + token;
  }
  const tenantId = localStorage.getItem("lcp.tenant");
  if (tenantId) {
    config.headers["X-Tenant-Id"] = tenantId;
  }
  return config;
});

interface ErrorBody {
  code?: string;
  message?: string;
  details?: unknown;
}

function normalize(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const axiosError = error as AxiosError<ErrorBody>;
  const status = axiosError.response?.status ?? 0;
  const body = axiosError.response?.data;
  const code = body?.code ?? (status === 0 ? "network_error" : "http_" + status);
  const message = body?.message ?? axiosError.message ?? "请求失败";
  return new ApiError(status, code, message, body?.details);
}

export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  try {
    const response = await http.request<T>(config);
    return response.data;
  } catch (error) {
    throw normalize(error);
  }
}
`;
}

function formatTsOf() {
  return `import type { ColumnSpec, OptionItem } from "@/generated/schema";

const pad = (value: number): string => (value < 10 ? "0" + value : String(value));

export function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

export function formatDate(value: unknown, withTime = false): string {
  if (isEmpty(value)) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const day = date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  if (!withTime) return day;
  return day + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
}

export function formatNumber(value: unknown, digits = 0): string {
  if (isEmpty(value)) return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return number.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

export function optionItem(options: OptionItem[] | undefined, value: unknown): OptionItem | undefined {
  if (!options) return undefined;
  return options.find((item) => String(item.value) === String(value));
}

export function optionLabel(options: OptionItem[] | undefined, value: unknown): string {
  if (isEmpty(value)) return "—";
  return optionItem(options, value)?.label ?? String(value);
}

export function toList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isEmpty(value)) return [];
  return [value];
}

export function fileCount(value: unknown): number {
  return toList(value).length;
}

export function fileUrl(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const item = value as { url?: unknown; objectKey?: unknown };
    return String(item.url ?? item.objectKey ?? "");
  }
  return "";
}

export function fileName(value: unknown): string {
  const url = fileUrl(value);
  if (!url) return "";
  const clean = url.split("?")[0];
  const name = clean.substring(clean.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(name) || "附件";
  } catch {
    return name || "附件";
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value = value / 1024;
    index += 1;
  }
  return (index === 0 ? value : value.toFixed(1)) + " " + units[index];
}

export function cellText(column: ColumnSpec, value: unknown): string {
  switch (column.format) {
    case "enum":
      return optionLabel(column.options, value);
    case "boolean":
      return value === true ? "是" : value === false ? "否" : "—";
    case "date":
      return formatDate(value, false);
    case "datetime":
      return formatDate(value, true);
    case "number":
      return formatNumber(value, column.digits ?? 0);
    case "files":
      return fileCount(value) + " 个附件";
    default:
      return isEmpty(value) ? "—" : String(value);
  }
}

export function tagTypeOf(column: ColumnSpec, value: unknown): "primary" | "success" | "warning" | "danger" | "info" {
  const color = optionItem(column.options, value)?.color;
  if (color === "primary" || color === "success" || color === "warning" || color === "danger" || color === "info") {
    return color;
  }
  return "info";
}

export function tagStyleOf(column: ColumnSpec, value: unknown): Record<string, string> {
  const color = optionItem(column.options, value)?.color;
  if (color && color.startsWith("#")) {
    return { color, borderColor: color, backgroundColor: color + "1a" };
  }
  return {};
}
`;
}

function loginVueOf(entry) {
  const appName = JSON.stringify(entry.bundle?.app?.name ?? entry.key);
  return `<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ApiError } from "@/lib/http";
import { useSession } from "@/stores/session";

const APP_NAME = ${appName};
const session = useSession();
const route = useRoute();
const router = useRouter();

const form = reactive({
  tenant: session.tenantId,
  username: "",
  password: ""
});
const submitting = ref(false);
const error = ref("");

async function submit() {
  error.value = "";
  if (!form.tenant.trim() || !form.username.trim() || !form.password) {
    error.value = "请填写租户、用户名与密码";
    return;
  }
  submitting.value = true;
  try {
    await session.login(form.tenant.trim(), form.username.trim(), form.password);
    const redirect = typeof route.query.redirect === "string" && route.query.redirect.startsWith("/")
      ? route.query.redirect
      : "/";
    await router.replace(redirect);
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : "登录失败，请稍后重试";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
    <div class="w-full max-w-[420px]">
      <div class="mb-6 flex items-center gap-3 text-white">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-sm font-semibold text-slate-900">MF</div>
        <div class="leading-tight">
          <div class="text-base font-semibold">{{ APP_NAME }}</div>
          <div class="text-[11px] uppercase tracking-[0.2em] text-slate-400">MetaForge</div>
        </div>
      </div>
      <div class="rounded-2xl bg-white p-7 shadow-2xl shadow-slate-950/40">
        <h1 class="text-xl font-semibold text-slate-900">登录</h1>
        <p class="mt-1 text-[12px] leading-relaxed text-slate-500">使用平台身份中心账号登录；角色与部门权限由服务端下发。</p>
        <el-alert v-if="error" type="error" :closable="false" show-icon class="mt-4" :title="error" />
        <el-form label-position="top" class="mt-5" @submit.prevent="submit">
          <el-form-item label="租户">
            <el-input v-model="form.tenant" autocomplete="organization" placeholder="tenant_demo_school" />
          </el-form-item>
          <el-form-item label="用户名">
            <el-input v-model="form.username" autocomplete="username" placeholder="请输入用户名" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="form.password" type="password" show-password autocomplete="current-password" placeholder="请输入密码" />
          </el-form-item>
          <el-button type="primary" native-type="submit" :loading="submitting" class="mt-1 !w-full">登录</el-button>
        </el-form>
        <p class="mt-4 text-[11px] leading-relaxed text-slate-400">没有账号或忘记密码，请联系租户管理员。连续失败会触发临时锁定。</p>
      </div>
    </div>
  </div>
</template>
`;
}

function sessionTsOf(entry) {
  const defaultTenant = JSON.stringify(entry.bundle?.tenantId ?? "demo");
  return `import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import { request } from "@/lib/http";

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  roles: string[];
  deptId?: string;
  deptName?: string;
  avatar?: string;
}

interface IdentityUser {
  id: string;
  username: string;
  display_name: string;
  dept_id?: string | null;
  dept_name?: string | null;
  role_keys?: string[];
  roles?: Array<{ role_key: string }>;
}

interface LoginResponse {
  token: string;
  expires_at: string;
  user: IdentityUser;
}

const TOKEN_KEY = "lcp.token";
const TENANT_KEY = "lcp.tenant";
const USER_KEY = "lcp.user";
const DEFAULT_TENANT = ${defaultTenant};

function readUser(): SessionUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SessionUser;
    if (!parsed || typeof parsed.id !== "string") return null;
    return { ...parsed, roles: Array.isArray(parsed.roles) ? parsed.roles : [] };
  } catch {
    return null;
  }
}

function toSessionUser(profile: IdentityUser): SessionUser {
  const roles = profile.role_keys ?? profile.roles?.map((role) => role.role_key) ?? [];
  return {
    id: profile.id,
    username: profile.username,
    name: profile.display_name,
    roles,
    deptId: profile.dept_id ?? undefined,
    deptName: profile.dept_name ?? undefined
  };
}

export const useSession = defineStore("session", () => {
  const token = ref<string>(localStorage.getItem(TOKEN_KEY) ?? "");
  const tenantId = ref<string>(localStorage.getItem(TENANT_KEY) || DEFAULT_TENANT);
  const user = ref<SessionUser | null>(readUser());
  const restored = ref(false);

  const roles = computed<string[]>(() => user.value?.roles ?? []);
  const isAuthenticated = computed<boolean>(() => token.value !== "" && user.value !== null);

  function signIn(next: { token?: string; tenantId?: string; user: SessionUser }): void {
    if (next.token !== undefined) token.value = next.token;
    if (next.tenantId) tenantId.value = next.tenantId;
    user.value = next.user;
  }

  function signOut(): void {
    token.value = "";
    user.value = null;
  }

  async function login(tenant: string, username: string, password: string): Promise<void> {
    const result = await request<LoginResponse>({
      method: "POST",
      url: "/api/v1/auth/login",
      data: { tenant, username, password }
    });
    signIn({ token: result.token, tenantId: tenant, user: toSessionUser(result.user) });
    restored.value = true;
  }

  /** 页面刷新后用 Bearer 令牌恢复会话；令牌失效时清空本地状态并回到登录页。 */
  async function restore(): Promise<boolean> {
    if (restored.value) return isAuthenticated.value;
    if (!token.value) {
      restored.value = true;
      return false;
    }
    try {
      const profile = await request<IdentityUser>({ url: "/api/v1/auth/me" });
      user.value = toSessionUser(profile);
      return true;
    } catch {
      signOut();
      return false;
    } finally {
      restored.value = true;
    }
  }

  watch(
    [token, tenantId, user],
    () => {
      if (token.value) localStorage.setItem(TOKEN_KEY, token.value);
      else localStorage.removeItem(TOKEN_KEY);
      localStorage.setItem(TENANT_KEY, tenantId.value);
      if (user.value) localStorage.setItem(USER_KEY, JSON.stringify(user.value));
      else localStorage.removeItem(USER_KEY);
    },
    { deep: true, flush: "sync" }
  );

  return { token, tenantId, user, roles, isAuthenticated, restored, signIn, signOut, login, restore };
});
`;
}
function accessTsOf() {
  return `import { RESOURCE_PERMISSIONS, UNLISTED_RESOURCES_ARE_OPEN, type Action } from "@/generated/permissions";
import { useSession } from "@/stores/session";

export function hasAnyRole(granted: string[] | undefined, roles: string[]): boolean {
  if (!granted || granted.length === 0) return false;
  return granted.some((role) => roles.includes(role));
}

/** 按钮级判定。未列出的资源默认放行（服务端仍是事实来源）；列出的资源按 actions 收紧。 */
export function can(resourceKey: string, action: Action): boolean {
  const grant = RESOURCE_PERMISSIONS[resourceKey];
  if (!grant) return UNLISTED_RESOURCES_ARE_OPEN;
  return hasAnyRole(grant[action], useSession().roles);
}

export function allowedActions(resourceKey: string): Action[] {
  const actions: Action[] = ["create", "read", "update", "delete"];
  return actions.filter((action) => can(resourceKey, action));
}
`;
}

function idTsOf() {
  return `const ALPHABET = "${CROCKFORD}";

function randomChars(count: number): string {
  const bytes = new Uint8Array(count);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < count; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  let out = "";
  for (let index = 0; index < count; index += 1) {
    out += ALPHABET[bytes[index] % 32];
  }
  return out;
}

function encodeTime(now: number): string {
  let value = Math.floor(now);
  let out = "";
  for (let index = 0; index < 10; index += 1) {
    const mod = value % 32;
    out = ALPHABET[mod] + out;
    value = (value - mod) / 32;
  }
  return out;
}

/** 26 位 Crockford Base32 ULID，与后端 idType=ulid 对齐。 */
export function ulid(now: number = Date.now()): string {
  return encodeTime(now) + randomChars(16);
}

export function extOf(name: string): string {
  const index = name.lastIndexOf(".");
  if (index < 0 || index === name.length - 1) return "bin";
  return name.slice(index + 1).toLowerCase();
}

export function safeFileName(name: string): string {
  const cleaned = name.replace(/[^\\w.\\-\\u4e00-\\u9fa5]/g, "_");
  return cleaned.slice(-80) || "file";
}
`;
}

function ossTsOf(entry) {
  const defaultTenant = JSON.stringify(entry.bundle?.tenantId ?? "demo");
  return `import OSS from "ali-oss";
import type { UploadSpec } from "@/generated/schema";
import { APP_KEY } from "@/generated/schema";
import { request } from "./http";
import { extOf, safeFileName, ulid } from "./id";

const DEFAULT_TENANT = ${defaultTenant};

export interface OssCredentials {
  accessKeyId: string;
  accessKeySecret: string;
  securityToken: string;
  region: string;
  bucket: string;
  endpoint?: string;
  prefix?: string;
}

export type StsProvider = () => Promise<OssCredentials>;

export interface UploadContext {
  entity?: string;
  field?: string;
}

export interface UploadedFile {
  url: string;
  objectKey: string;
  name: string;
  size: number;
  type: string;
  kind: string;
}

let stsProvider: StsProvider | null = null;

/** 平台接入点：把 STS 获取方式注入进来，避免把 AccessKey 打进前端包。 */
export function setStsProvider(next: StsProvider | null): void {
  stsProvider = next;
}

async function credentials(): Promise<OssCredentials> {
  if (stsProvider) return stsProvider();
  return request<OssCredentials>({
    url: import.meta.env.VITE_STS_URL ?? "/api/v1/platform/oss/sts",
    method: "GET"
  });
}

function pad(value: number): string {
  return value < 10 ? "0" + value : String(value);
}

function applyTemplate(template: string, context: Record<string, string>): string {
  return template.replace(/\\{(\\w+)\\}/g, (_match: string, name: string) => context[name] ?? "");
}

export async function uploadToOss(
  file: File,
  spec: UploadSpec,
  context: UploadContext = {},
  onProgress?: (percent: number) => void
): Promise<UploadedFile> {
  const sts = await credentials();
  const client = new OSS({
    region: sts.region,
    accessKeyId: sts.accessKeyId,
    accessKeySecret: sts.accessKeySecret,
    stsToken: sts.securityToken,
    bucket: sts.bucket,
    endpoint: sts.endpoint,
    secure: true
  });

  const now = new Date();
  const ext = extOf(file.name);
  const key = applyTemplate(spec.pathTemplate ?? "{yyyy}/{MM}/{ulid}.{ext}", {
    tenant: localStorage.getItem("lcp.tenant") || DEFAULT_TENANT,
    app: APP_KEY,
    entity: context.entity ?? "common",
    field: context.field ?? "files",
    yyyy: String(now.getFullYear()),
    MM: pad(now.getMonth() + 1),
    dd: pad(now.getDate()),
    HH: pad(now.getHours()),
    mm: pad(now.getMinutes()),
    ss: pad(now.getSeconds()),
    ulid: ulid(),
    ext,
    name: safeFileName(file.name)
  });

  const objectKey = (sts.prefix ? sts.prefix.replace(/\\/$/, "") + "/" : "") + key.replace(/^\\/+/, "");
  const result = await client.multipartUpload(objectKey, file, {
    progress: (value: number) => onProgress?.(Math.round(value * 100))
  });
  const typed = result as unknown as { url?: string; res?: { requestUrls?: string[] } };
  const url =
    typed.url ??
    typed.res?.requestUrls?.[0] ??
    client.signatureUrl(objectKey, { expires: 60 * 60 * 24 * 7 });

  return {
    url,
    objectKey,
    name: file.name,
    size: file.size,
    type: file.type,
    kind: spec.kind
  };
}
`;
}

function refsTsOf() {
  return `import { reactive } from "vue";
import { baseOf, resourceByEntity } from "@/generated/schema";
import { request } from "./http";

const cache = reactive<Record<string, string>>({});
const pending = new Map<string, Promise<string>>();

export function refKey(entity: string, id: string): string {
  return entity + ":" + id;
}

export function refLabel(entity: string, id: string): string {
  if (!id) return "";
  return cache[refKey(entity, id)] ?? id;
}

export async function resolveRefLabel(entity: string, id: string, labelField: string): Promise<string> {
  if (!entity || !id) return "";
  const key = refKey(entity, id);
  const cached = cache[key];
  if (cached) return cached;
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  const task = request<Record<string, unknown>>({
    url: baseOf(entity) + "/" + encodeURIComponent(id),
    method: "GET"
  })
    .then((row) => {
      const label = String(row[labelField] ?? row.name ?? row.title ?? row.label ?? id);
      cache[key] = label;
      return label;
    })
    .catch(() => {
      cache[key] = id;
      return id;
    })
    .finally(() => {
      pending.delete(key);
    });

  pending.set(key, task);
  return task;
}

export interface RefOption {
  value: string;
  label: string;
}

export async function searchRefOptions(entity: string, keyword: string): Promise<RefOption[]> {
  const resource = resourceByEntity(entity);
  const primaryKey = resource?.primaryKey ?? "id";
  const labelField = resource?.titleField ?? "name";
  const result = await request<{ items?: Record<string, unknown>[] }>({
    url: baseOf(entity),
    method: "GET",
    params: { page: 1, size: 30, q: keyword || undefined }
  });
  return (result.items ?? []).map((row) => {
    const value = String(row[primaryKey] ?? row.id ?? "");
    return { value, label: String(row[labelField] ?? row.name ?? value) };
  });
}
`;
}

function useCrudPageTsOf() {
  return `import { reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import type { ResourceSpec } from "@/generated/schema";
import { ApiError, request } from "./http";

export interface PageResult {
  items: Record<string, unknown>[];
  total: number;
  page: number;
  size: number;
  pages?: number;
}

export interface SortPayload {
  prop?: string;
  order?: "ascending" | "descending" | null;
}

export function useCrudPage(resource: ResourceSpec) {
  const rows = ref<Record<string, unknown>[]>([]);
  const total = ref(0);
  const page = ref(1);
  const size = ref(20);
  const sort = ref("");
  const order = ref<"asc" | "desc">("desc");
  const loading = ref(false);
  const error = ref<ApiError | null>(null);
  const filters = reactive<Record<string, any>>({});

  for (const filter of resource.filters) {
    if (!(filter.key in filters)) filters[filter.key] = undefined;
  }

  function queryParams(): Record<string, unknown> {
    const params: Record<string, unknown> = { page: page.value, size: size.value };
    if (sort.value) {
      params.sort = sort.value;
      params.order = order.value;
    }
    for (const [key, value] of Object.entries(filters)) {
      if (value === "" || value === null || value === undefined) continue;
      params[key] = value instanceof Date ? value.toISOString() : value;
    }
    return params;
  }

  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const result = await request<PageResult>({
        url: resource.base,
        method: "GET",
        params: queryParams()
      });
      rows.value = result.items ?? [];
      total.value = result.total ?? 0;
      if (typeof result.size === "number" && result.size > 0) size.value = result.size;
    } catch (reason) {
      const apiError = reason instanceof ApiError ? reason : new ApiError(0, "unknown", String(reason));
      error.value = apiError;
      ElMessage.error(apiError.message);
    } finally {
      loading.value = false;
    }
  }

  function search(): void {
    page.value = 1;
    void load();
  }

  function reset(): void {
    for (const key of Object.keys(filters)) filters[key] = undefined;
    sort.value = "";
    order.value = "desc";
    page.value = 1;
    void load();
  }

  function onSortChange(payload: SortPayload): void {
    if (!payload.prop || !payload.order) {
      sort.value = "";
      order.value = "desc";
    } else {
      sort.value = payload.prop;
      order.value = payload.order === "ascending" ? "asc" : "desc";
    }
    void load();
  }

  function fetchOne(id: string): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>({
      url: resource.base + "/" + encodeURIComponent(id),
      method: "GET"
    });
  }

  function create(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>({
      url: resource.base,
      method: "POST",
      data: payload
    });
  }

  function update(id: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>({
      url: resource.base + "/" + encodeURIComponent(id),
      method: "PUT",
      data: payload
    });
  }

  function remove(id: string): Promise<void> {
    return request<void>({
      url: resource.base + "/" + encodeURIComponent(id),
      method: "DELETE"
    });
  }

  return {
    rows,
    total,
    page,
    size,
    sort,
    order,
    loading,
    error,
    filters,
    load,
    search,
    reset,
    onSortChange,
    fetchOne,
    create,
    update,
    remove
  };
}
`;
}

// ============================================================ 渲染：通用组件
function dynamicFieldVueOf() {
  return `<script setup lang="ts">
import { computed, ref } from "vue";
import type { FieldSpec } from "@/generated/schema";
import RefSelect from "./RefSelect.vue";
import UploadField from "./UploadField.vue";

const props = defineProps<{
  field: FieldSpec;
  modelValue: unknown;
  disabled?: boolean;
  entity?: string;
}>();

const emit = defineEmits<{ "update:modelValue": [unknown] }>();

const value = computed({
  get: () => props.modelValue,
  set: (next: unknown) => emit("update:modelValue", next)
});

const listValue = computed<any[]>({
  get: () => (Array.isArray(props.modelValue) ? props.modelValue : []),
  set: (next: any[]) => emit("update:modelValue", next)
});

const numberValue = computed<number | undefined>(() => {
  const raw = props.modelValue;
  if (raw === null || raw === undefined || raw === "") return undefined;
  const number = Number(raw);
  return Number.isFinite(number) ? number : undefined;
});

const displayText = computed<string>(() => {
  const raw = props.modelValue;
  if (raw === null || raw === undefined) return "";
  if (Array.isArray(raw)) {
    return raw
      .map((item) => (item && typeof item === "object" ? JSON.stringify(item) : String(item)))
      .join("，");
  }
  if (typeof raw === "object") return JSON.stringify(raw);
  return String(raw);
});

const jsonDraft = ref(props.modelValue == null ? "" : JSON.stringify(props.modelValue, null, 2));
const jsonError = ref("");

function setValue(next: unknown): void {
  emit("update:modelValue", next);
}

function onJsonInput(text: string): void {
  jsonDraft.value = text;
  if (!text.trim()) {
    jsonError.value = "";
    emit("update:modelValue", null);
    return;
  }
  try {
    emit("update:modelValue", JSON.parse(text));
    jsonError.value = "";
  } catch {
    jsonError.value = "JSON 格式不合法，保存前请修正";
  }
}
</script>

<template>
  <div class="w-full">
    <el-input
      v-if="field.widget === 'readonly' || field.readonly"
      :model-value="displayText"
      disabled
    />

    <el-input
      v-else-if="field.widget === 'input'"
      v-model="value"
      :placeholder="field.placeholder"
      :disabled="disabled"
      clearable
    />

    <el-input
      v-else-if="field.widget === 'textarea'"
      v-model="value"
      type="textarea"
      :rows="field.rows ?? 3"
      :placeholder="field.placeholder"
      :disabled="disabled"
    />

    <el-input-number
      v-else-if="field.widget === 'number'"
      :model-value="numberValue"
      :min="field.min"
      :max="field.max"
      :disabled="disabled"
      class="w-full"
      @update:model-value="setValue"
    />

    <el-switch
      v-else-if="field.widget === 'switch'"
      :model-value="value === true"
      :disabled="disabled"
      @update:model-value="setValue"
    />

    <el-select
      v-else-if="field.widget === 'select'"
      v-model="value"
      :placeholder="field.placeholder ?? '请选择'"
      :disabled="disabled"
      clearable
      class="w-full"
    >
      <el-option
        v-for="option in field.options ?? []"
        :key="String(option.value)"
        :label="option.label"
        :value="option.value"
      />
    </el-select>

    <el-radio-group
      v-else-if="field.widget === 'radio'"
      v-model="value"
      :disabled="disabled"
    >
      <el-radio
        v-for="option in field.options ?? []"
        :key="String(option.value)"
        :value="option.value"
      >
        {{ option.label }}
      </el-radio>
    </el-radio-group>

    <el-checkbox-group
      v-else-if="field.widget === 'checkbox'"
      v-model="listValue"
      :disabled="disabled"
    >
      <el-checkbox
        v-for="option in field.options ?? []"
        :key="String(option.value)"
        :value="option.value"
      >
        {{ option.label }}
      </el-checkbox>
    </el-checkbox-group>

    <el-select
      v-else-if="field.widget === 'multiselect'"
      v-model="listValue"
      multiple
      clearable
      :placeholder="field.placeholder ?? '可多选'"
      :disabled="disabled"
      class="w-full"
    >
      <el-option
        v-for="option in field.options ?? []"
        :key="String(option.value)"
        :label="option.label"
        :value="option.value"
      />
    </el-select>

    <el-select
      v-else-if="field.widget === 'tags'"
      v-model="listValue"
      multiple
      filterable
      allow-create
      default-first-option
      :placeholder="field.placeholder ?? '输入后回车添加'"
      :disabled="disabled"
      class="w-full"
    />

    <el-date-picker
      v-else-if="field.widget === 'date'"
      v-model="value"
      type="date"
      value-format="YYYY-MM-DD"
      :placeholder="field.placeholder ?? '选择日期'"
      :disabled="disabled"
      class="w-full"
    />

    <el-date-picker
      v-else-if="field.widget === 'datetime'"
      v-model="value"
      type="datetime"
      value-format="YYYY-MM-DDTHH:mm:ssZ"
      :placeholder="field.placeholder ?? '选择时间'"
      :disabled="disabled"
      class="w-full"
    />

    <el-time-picker
      v-else-if="field.widget === 'time'"
      v-model="value"
      value-format="HH:mm:ss"
      :placeholder="field.placeholder ?? '选择时间'"
      :disabled="disabled"
      class="w-full"
    />

    <RefSelect
      v-else-if="field.widget === 'ref'"
      :model-value="typeof value === 'string' ? value : null"
      :entity="field.refEntity ?? ''"
      :label-field="field.refField ?? 'name'"
      :disabled="disabled"
      @update:model-value="setValue"
    />

    <UploadField
      v-else-if="field.widget === 'upload'"
      :model-value="value"
      :spec="field.upload!"
      :disabled="disabled"
      :entity="entity ?? ''"
      :field-key="field.key"
      @update:model-value="setValue"
    />

    <div v-else-if="field.widget === 'json'">
      <el-input
        type="textarea"
        :rows="field.rows ?? 6"
        :model-value="jsonDraft"
        :disabled="disabled"
        @update:model-value="onJsonInput"
      />
      <p v-if="jsonError" class="mt-1 text-xs text-red-500">{{ jsonError }}</p>
    </div>

    <el-input
      v-else
      v-model="value"
      :placeholder="field.placeholder"
      :disabled="disabled"
    />

    <p v-if="field.help" class="mt-1 text-xs text-slate-400">{{ field.help }}</p>
    <p v-if="field.sensitive" class="mt-1 text-xs text-amber-600">
      敏感字段：只写不读，保存后不会回显。
    </p>
  </div>
</template>
`;
}

function uploadFieldVueOf() {
  return `<script setup lang="ts">
import { computed, ref } from "vue";
import { ElMessage, type UploadRequestOptions } from "element-plus";
import type { UploadSpec } from "@/generated/schema";
import { fileName, fileUrl, formatBytes } from "@/lib/format";
import { uploadToOss } from "@/lib/oss";

const props = defineProps<{
  modelValue: unknown;
  spec: UploadSpec;
  disabled?: boolean;
  entity?: string;
  fieldKey?: string;
}>();

const emit = defineEmits<{ "update:modelValue": [unknown] }>();

interface UploadItem {
  url: string;
  name: string;
}

interface UploadError extends Error {
  status: number;
  method: string;
  url: string;
}

const items = computed<UploadItem[]>(() => {
  const raw = Array.isArray(props.modelValue)
    ? props.modelValue
    : props.modelValue === null || props.modelValue === undefined || props.modelValue === ""
      ? []
      : [props.modelValue];
  return raw
    .map((entry) => ({ url: fileUrl(entry), name: fileName(entry) }))
    .filter((entry) => !!entry.url);
});

const uploading = ref(false);
const percent = ref(0);
const errorText = ref("");

const acceptAttr = computed(() => props.spec.accept.map((ext) => "." + ext).join(","));
const canAddMore = computed(() => props.disabled !== true && items.value.length < props.spec.maxCount);

function commit(url: string): void {
  if (props.spec.multiple) {
    emit("update:modelValue", [...items.value.map((item) => item.url), url]);
  } else {
    emit("update:modelValue", url);
  }
}

function removeAt(index: number): void {
  const next = items.value.map((item) => item.url).filter((_url, position) => position !== index);
  emit("update:modelValue", props.spec.multiple ? next : next[0] ?? null);
}

function validate(file: File): string {
  const lower = file.name.toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";
  if (ext && !props.spec.accept.includes(ext)) {
    return "仅支持 " + props.spec.accept.join(" / ");
  }
  if (file.size > props.spec.maxSize) {
    return "文件超过 " + formatBytes(props.spec.maxSize);
  }
  return "";
}

function toUploadError(reason: unknown): UploadError {
  const base = reason instanceof Error ? reason : new Error(String(reason));
  return Object.assign(base, { status: 0, method: "POST", url: "" }) as UploadError;
}

async function customUpload(options: UploadRequestOptions): Promise<void> {
  const file = options.file as File;
  const problem = validate(file);
  if (problem) {
    errorText.value = problem;
    options.onError(toUploadError(problem));
    ElMessage.error(problem);
    return;
  }

  uploading.value = true;
  percent.value = 0;
  errorText.value = "";
  try {
    const uploaded = await uploadToOss(
      file,
      props.spec,
      { entity: props.entity, field: props.fieldKey },
      (value) => {
        percent.value = value;
        options.onProgress({ percent: value } as never);
      }
    );
    commit(uploaded.url);
    options.onSuccess(uploaded as never);
    ElMessage.success("上传完成");
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason);
    errorText.value = message;
    options.onError(toUploadError(reason));
    ElMessage.error(message);
  } finally {
    uploading.value = false;
  }
}
</script>

<template>
  <div class="w-full">
    <div class="flex flex-wrap items-start gap-3">
      <div
        v-for="(item, index) in items"
        :key="item.url + index"
        class="relative rounded-lg border border-slate-200 bg-slate-50 p-2"
      >
        <el-image
          v-if="spec.kind === 'image'"
          :src="item.url"
          fit="cover"
          class="h-20 w-20 rounded"
          :preview-src-list="[item.url]"
          preview-teleported
        />
        <video
          v-else-if="spec.kind === 'video'"
          :src="item.url"
          controls
          class="h-24 w-40 rounded bg-black"
        />
        <a
          v-else
          :href="item.url"
          target="_blank"
          rel="noreferrer"
          class="flex h-20 w-40 flex-col justify-center gap-1 px-2 text-xs text-slate-600"
        >
          <span class="truncate font-medium">{{ item.name }}</span>
          <span class="text-[11px] text-slate-400">点击下载 / 预览</span>
        </a>
        <el-button
          v-if="!disabled"
          class="absolute -right-2 -top-2"
          size="small"
          circle
          type="danger"
          @click="removeAt(index)"
        >
          ×
        </el-button>
      </div>

      <el-upload
        v-if="canAddMore"
        :show-file-list="false"
        :http-request="customUpload"
        :accept="acceptAttr"
        :multiple="spec.multiple"
        :disabled="uploading"
      >
        <el-button :loading="uploading" plain>
          {{ uploading ? "上传中 " + percent + "%" : "上传文件" }}
        </el-button>
      </el-upload>
    </div>

    <p class="mt-2 text-[11px] text-slate-400">
      支持 {{ spec.accept.join(" / ") }}，单个不超过 {{ formatBytes(spec.maxSize) }}，最多
      {{ spec.maxCount }} 个。
    </p>
    <p v-if="errorText" class="mt-1 text-xs text-red-500">{{ errorText }}</p>
  </div>
</template>
`;
}

function refSelectVueOf() {
  return `<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { baseOf, resourceByEntity } from "@/generated/schema";
import { request } from "@/lib/http";
import { searchRefOptions, type RefOption } from "@/lib/refs";

const props = defineProps<{
  modelValue: string | null;
  entity: string;
  labelField: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{ "update:modelValue": [string | null] }>();

const options = ref<RefOption[]>([]);
const loading = ref(false);

async function load(keyword = ""): Promise<void> {
  if (!props.entity) return;
  loading.value = true;
  try {
    options.value = await searchRefOptions(props.entity, keyword);
  } catch {
    options.value = [];
  } finally {
    loading.value = false;
  }
}

async function ensureCurrent(): Promise<void> {
  const id = props.modelValue;
  if (!id || options.value.some((option) => option.value === id)) return;
  const resource = resourceByEntity(props.entity);
  try {
    const row = await request<Record<string, unknown>>({
      url: baseOf(props.entity) + "/" + encodeURIComponent(id),
      method: "GET"
    });
    const label = String(row[props.labelField] ?? row.name ?? row.title ?? id);
    options.value = [{ value: id, label }, ...options.value];
  } catch {
    options.value = [{ value: id, label: id }, ...options.value];
  }
}

function onChange(next: string | null | undefined): void {
  emit("update:modelValue", next ?? null);
}

function onVisible(visible: boolean): void {
  if (visible) void load();
}

onMounted(async () => {
  await load();
  await ensureCurrent();
});

watch(
  () => props.modelValue,
  () => {
    void ensureCurrent();
  }
);
</script>

<template>
  <el-select
    :model-value="modelValue ?? undefined"
    filterable
    remote
    clearable
    :remote-method="load"
    :loading="loading"
    :disabled="disabled"
    placeholder="搜索并选择"
    class="w-full"
    @update:model-value="onChange"
    @visible-change="onVisible"
  >
    <el-option
      v-for="option in options"
      :key="option.value"
      :label="option.label"
      :value="option.value"
    />
  </el-select>
</template>
`;
}

function resourcePageVueOf() {
  return `<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from "element-plus";
import type { ColumnSpec, FieldSpec, ResourceSpec } from "@/generated/schema";
import { can } from "@/lib/access";
import { ApiError } from "@/lib/http";
import { cellText, optionLabel, tagStyleOf, tagTypeOf } from "@/lib/format";
import { refLabel, resolveRefLabel } from "@/lib/refs";
import { useCrudPage } from "@/lib/useCrudPage";
import DynamicField from "./DynamicField.vue";

const props = defineProps<{ resource: ResourceSpec }>();

const {
  rows,
  total,
  page,
  size,
  loading,
  filters,
  load,
  search,
  reset,
  onSortChange,
  fetchOne,
  create,
  update,
  remove
} = useCrudPage(props.resource);

const canCreate = computed(() => can(props.resource.key, "create"));
const canUpdate = computed(() => can(props.resource.key, "update"));
const canDelete = computed(() => can(props.resource.key, "delete"));
const actionWidth = computed(() => (canUpdate.value && canDelete.value ? 140 : canUpdate.value || canDelete.value ? 90 : 0));

const dialogVisible = ref(false);
const dialogMode = ref<"create" | "edit">("create");
const dialogTitle = computed(() => (dialogMode.value === "create" ? "新建" : "编辑") + props.resource.title);
const saving = ref(false);
const formRef = ref<FormInstance>();
const model = reactive<Record<string, unknown>>({});
const currentId = ref("");
const currentVersion = ref<number | null>(null);

const fields = computed<FieldSpec[]>(() =>
  dialogMode.value === "create" ? props.resource.createFields : props.resource.editFields
);

const rules = computed<FormRules>(() => {
  const out: FormRules = {};
  const target = out as Record<string, unknown>;
  for (const field of fields.value) {
    const list: Record<string, unknown>[] = [];
    if (field.required) {
      list.push({
        required: true,
        message: "请填写" + field.label,
        trigger: field.widget === "input" || field.widget === "textarea" ? "blur" : "change"
      });
    }
    if (field.minLength) {
      list.push({ min: field.minLength, message: field.label + "至少 " + field.minLength + " 个字符", trigger: "blur" });
    }
    if (field.maxLength) {
      list.push({ max: field.maxLength, message: field.label + "最多 " + field.maxLength + " 个字符", trigger: "blur" });
    }
    if (field.min !== undefined || field.max !== undefined) {
      const parts: string[] = [];
      if (field.min !== undefined) parts.push("不小于 " + field.min);
      if (field.max !== undefined) parts.push("不大于 " + field.max);
      list.push({ type: "number", message: field.label + parts.join("，"), trigger: "change" });
    }
    if (field.pattern) {
      list.push({ pattern: new RegExp(field.pattern), message: field.label + "格式不正确", trigger: "blur" });
    }
    if (list.length > 0) target[field.key] = list;
  }
  return out;
});

function emptyValueOf(field: FieldSpec): unknown {
  if (field.defaultValue !== undefined) return field.defaultValue;
  if (field.widget === "checkbox" || field.widget === "multiselect" || field.widget === "tags") return [];
  return undefined;
}

function resetModel(nextFields: FieldSpec[], source?: Record<string, unknown>): void {
  for (const key of Object.keys(model)) delete model[key];
  for (const field of nextFields) {
    const raw = source?.[field.key];
    model[field.key] = raw === undefined ? emptyValueOf(field) : raw;
  }
}

async function openCreate(): Promise<void> {
  dialogMode.value = "create";
  currentId.value = "";
  currentVersion.value = null;
  resetModel(props.resource.createFields);
  dialogVisible.value = true;
  await nextTick();
  formRef.value?.clearValidate();
}

async function openEdit(row: Record<string, unknown>): Promise<void> {
  const id = String(row[props.resource.primaryKey] ?? "");
  if (!id) {
    ElMessage.error("当前行缺少主键，无法编辑");
    return;
  }
  try {
    const full = await fetchOne(id);
    dialogMode.value = "edit";
    currentId.value = id;
    currentVersion.value = typeof full.version === "number" ? full.version : null;
    resetModel(props.resource.editFields, full);
    dialogVisible.value = true;
    await nextTick();
    formRef.value?.clearValidate();
  } catch (reason) {
    const error = reason instanceof ApiError ? reason : new ApiError(0, "unknown", String(reason));
    ElMessage.error(error.message);
  }
}

function payloadOf(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields.value) {
    if (dialogMode.value === "edit" && field.readonly) continue;
    const value = model[field.key];
    if (value === undefined) continue;
    out[field.key] = value;
  }
  if (dialogMode.value === "edit" && props.resource.optimisticLock) {
    out.version = currentVersion.value;
  }
  return out;
}

function validationText(error: ApiError): string {
  const details = Array.isArray(error.details) ? error.details : [];
  const parts = details.map((detail) => {
    if (detail && typeof detail === "object") {
      const item = detail as { field?: string; message?: string };
      return (item.field ? item.field + "：" : "") + (item.message ?? "");
    }
    return String(detail);
  });
  return parts.filter(Boolean).join("；") || error.message;
}

function handleWriteError(reason: unknown): void {
  const error = reason instanceof ApiError ? reason : new ApiError(0, "unknown", String(reason));
  if (error.isVersionConflict) {
    void ElMessageBox.alert("这条数据已被其他人修改。请刷新列表后重新编辑。", "版本冲突", {
      type: "warning"
    })
      .then(() => {
        dialogVisible.value = false;
        void load();
      })
      .catch(() => undefined);
    return;
  }
  if (error.code === "validation_failed") {
    ElMessage.error(validationText(error));
    return;
  }
  ElMessage.error(error.message || "保存失败");
}

async function submit(): Promise<void> {
  if (formRef.value) {
    const valid = await formRef.value.validate().catch(() => false);
    if (!valid) return;
  }
  saving.value = true;
  try {
    if (dialogMode.value === "create") {
      await create(payloadOf());
      ElMessage.success("已创建");
    } else {
      await update(currentId.value, payloadOf());
      ElMessage.success("已保存");
    }
    dialogVisible.value = false;
    await load();
  } catch (reason) {
    handleWriteError(reason);
  } finally {
    saving.value = false;
  }
}

async function removeRow(row: Record<string, unknown>): Promise<void> {
  const id = String(row[props.resource.primaryKey] ?? "");
  if (!id) return;
  try {
    await ElMessageBox.confirm("删除「" + rowLabel(row) + "」后不会出现在列表里。", "确认删除", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消"
    });
  } catch {
    return;
  }
  try {
    await remove(id);
    ElMessage.success("已删除");
    if (rows.value.length === 1 && page.value > 1) page.value -= 1;
    await load();
  } catch (reason) {
    const error = reason instanceof ApiError ? reason : new ApiError(0, "unknown", String(reason));
    ElMessage.error(error.message);
  }
}

function rowLabel(row: Record<string, unknown>): string {
  const raw = row[props.resource.titleField];
  if (raw !== undefined && raw !== null && raw !== "") return String(raw);
  const first = props.resource.columns[0];
  if (first) return cellText(first, row[first.key]);
  return String(row[props.resource.primaryKey] ?? "");
}

const refColumns = computed<ColumnSpec[]>(() =>
  props.resource.columns.filter((column) => column.format === "ref" && !!column.refEntity)
);

async function resolveRefs(): Promise<void> {
  const jobs: Promise<string>[] = [];
  for (const column of refColumns.value) {
    for (const row of rows.value) {
      const id = row[column.key];
      if (typeof id === "string" && id) {
        jobs.push(resolveRefLabel(column.refEntity ?? "", id, column.refField ?? "name"));
      }
    }
  }
  if (jobs.length > 0) await Promise.all(jobs);
}

watch(rows, () => {
  void resolveRefs();
});

function onPageChange(): void {
  void load();
}

function onSizeChange(): void {
  page.value = 1;
  void load();
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="space-y-4">
    <section class="lcp-card p-5">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-xl font-semibold text-slate-900">{{ resource.title }}</h1>
            <el-tag v-if="resource.optimisticLock" size="small" type="warning">乐观锁</el-tag>
            <el-tag v-if="resource.softDelete" size="small" type="info">软删除</el-tag>
            <el-tag v-if="resource.sensitiveFields.length > 0" size="small" type="danger">
              敏感字段 {{ resource.sensitiveFields.length }}
            </el-tag>
          </div>
          <p class="mt-1 text-sm text-slate-500">{{ resource.subtitle }}</p>
          <p class="mt-2 font-mono text-[11px] text-slate-400">{{ resource.base }}</p>
        </div>
        <div class="flex items-center gap-2">
          <el-button plain @click="load">刷新</el-button>
          <el-button v-if="canCreate" type="primary" @click="openCreate">新建</el-button>
        </div>
      </div>
    </section>

    <section v-if="resource.filters.length > 0" class="lcp-card p-4">
      <el-form :inline="true" @submit.prevent>
        <el-form-item v-for="filter in resource.filters" :key="filter.key" :label="filter.label">
          <el-input
            v-if="filter.widget === 'input'"
            v-model="filters[filter.key]"
            clearable
            :placeholder="filter.placeholder ?? '精确匹配'"
            class="w-48"
            @keyup.enter="search"
          />
          <el-select
            v-else-if="filter.widget === 'select'"
            v-model="filters[filter.key]"
            clearable
            :placeholder="filter.placeholder ?? '全部'"
            class="w-40"
          >
            <el-option
              v-for="option in filter.options ?? []"
              :key="String(option.value)"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <el-date-picker
            v-else-if="filter.widget === 'date'"
            v-model="filters[filter.key]"
            type="date"
            value-format="YYYY-MM-DD"
            :placeholder="filter.placeholder ?? '选择日期'"
            class="w-40"
          />
          <el-date-picker
            v-else-if="filter.widget === 'datetime'"
            v-model="filters[filter.key]"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ssZ"
            :placeholder="filter.placeholder ?? '选择时间'"
            class="w-56"
          />
          <el-input-number
            v-else-if="filter.widget === 'number'"
            v-model="filters[filter.key]"
            :controls="false"
            placeholder="数值"
            class="w-32"
          />
          <el-input v-else v-model="filters[filter.key]" class="w-40" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="search">查询</el-button>
          <el-button @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </section>

    <section class="lcp-card p-4">
      <el-table
        v-loading="loading"
        :data="rows"
        :row-key="resource.primaryKey"
        stripe
        @sort-change="onSortChange"
      >
        <el-table-column
          v-for="column in resource.columns"
          :key="column.key"
          :prop="column.key"
          :label="column.label"
          :width="column.width"
          :min-width="column.minWidth"
          :align="column.align ?? 'left'"
          :sortable="column.sortable ? 'custom' : false"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <el-tag
              v-if="column.format === 'enum'"
              size="small"
              :type="tagTypeOf(column, row[column.key])"
              :style="tagStyleOf(column, row[column.key])"
            >
              {{ optionLabel(column.options, row[column.key]) }}
            </el-tag>
            <span v-else-if="column.format === 'ref'">
              {{ refLabel(column.refEntity ?? '', String(row[column.key] ?? '')) || '—' }}
            </span>
            <span v-else>{{ cellText(column, row[column.key]) }}</span>
          </template>
        </el-table-column>

        <el-table-column v-if="actionWidth > 0" label="操作" fixed="right" :width="actionWidth">
          <template #default="{ row }">
            <el-button v-if="canUpdate" link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="canDelete" link type="danger" @click="removeRow(row)">删除</el-button>
          </template>
        </el-table-column>

        <template #empty>
          <el-empty description="没有匹配的数据" />
        </template>
      </el-table>

      <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span class="lcp-muted">共 {{ total }} 条 · 第 {{ page }} 页</span>
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="size"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="sizes, prev, pager, next"
          background
          @current-change="onPageChange"
          @size-change="onSizeChange"
        />
      </div>
    </section>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="760px"
      destroy-on-close
      append-to-body
    >
      <el-form ref="formRef" :model="model" :rules="rules" label-position="top">
        <el-row :gutter="16">
          <el-col v-for="field in fields" :key="field.key" :span="field.span">
            <el-form-item :label="field.label" :prop="field.key">
              <DynamicField v-model="model[field.key]" :field="field" :entity="resource.entity" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <p v-if="resource.sensitiveFields.length > 0" class="mt-2 text-xs text-amber-600">
        敏感字段（{{ resource.sensitiveFields.join("、") }}）只在创建时填写；编辑不会回显，也不会覆盖原值。
      </p>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
`;
}

// ============================================================ 渲染：页面壳 / README
function pageVueOf(resource) {
  return `<script setup lang="ts">
import ResourcePage from "@/components/ResourcePage.vue";
import { resources } from "@/generated/schema";

const resource = resources[${JSON.stringify(resource.key)}];
</script>

<template>
  <ResourcePage :resource="resource" />
</template>
`;
}

function readmeOf(entry, resources, skipped) {
  const rows = resources
    .map(
      (resource) =>
        `| \`${resource.key}\` | ${resource.title} | \`${resource.base}\` | ${resource.columns.length} | ${resource.createFields.length} | ${resource.updateKeys.length} |`
    )
    .join("\n");
  const uploads = [];
  for (const resource of resources) {
    for (const field of [...resource.createFields, ...resource.editFields]) {
      if (field.widget !== "upload" || !field.upload) continue;
      uploads.push(
        `| \`${resource.key}.${field.key}\` | ${field.label} | ${field.upload.kind} | ${field.upload.accept.join(" / ")} | ${formatBytesText(field.upload.maxSize)} | ${field.upload.maxCount} |`
      );
    }
  }
  const uploadTable = uploads.length > 0 ? uploads.join("\n") : "| — | 本应用没有上传字段 | — | — | — | — |";
  const skippedText = skipped.length > 0 ? skipped.map((key) => "`" + key + "`").join("、") : "无";
  return `# ${entry.key} · Web 页面（生成物）

本目录由 \`tools/gen-page.mjs\` 从 \`AppBundle\` 生成，**勿手改生成文件**。它把同一份 DataSchema
编译成页面形态：列表列、搜索条件、创建 / 编辑表单、上传约束、权限按钮快照，与
\`../api/\`（接口形态）、\`../sql/\`（物理形态）同源。

## 快速开始

\`\`\`bash
npm install
npm run dev        # http://localhost:5174
npm run typecheck  # vue-tsc --noEmit
npm run build
\`\`\`

后端默认代理到 \`http://localhost:8080\`，可用环境变量覆盖：

\`\`\`bash
VITE_PROXY_TARGET=http://localhost:8080 npm run dev
VITE_API_BASE=            # 部署到同域时留空；跨域时填 BFF 地址
VITE_STS_URL=/api/v1/platform/oss/sts
\`\`\`

## 页面与接口

| 实体 | 页面标题 | BFF 基址 | 列 | 创建字段 | 更新字段 |
| --- | --- | --- | --- | --- | --- |
${rows}

每个资源复用同一套 \`ResourcePage\` 引擎：

- \`GET {base}?page=&size=&sort=&order=&q=&<filter>\` → \`{ items, total, page, size, pages }\`
- \`GET {base}/{id}\`
- \`POST {base}\` → 201
- \`PUT {base}/{id}\` → 200；列整体替换，JSONB 浅合并
- \`DELETE {base}/{id}\` → 204

筛选参数与 \`../api/src/main/java/**/dto/*Query.java\` 的字段名严格一致（snake_case，区间用
\`_from\` / \`_to\`）。排序字段来自 Schema 的 \`sortable\` 白名单。

## 三条页面约定

1. **sensitive 字段只写不读。** 列表列与编辑表单都不出现；创建表单可以填写，保存后不再回显。
   更新请求里省略该键，BFF 的 JSONB 浅合并会保留原值。
2. **immutable 字段创建可填、编辑只读。** 编辑时 \`readonly=true\`，且不进入 \`updateKeys\`。
3. **乐观锁。** \`optimisticLock=true\` 的实体在 \`PUT\` 请求体里带 \`version\`；BFF 返回 409
   \`version_conflict\` 时页面提示刷新后重试。

## 上传（阿里云 OSS 直传）

上传字段通过 \`ali-oss\` 使用 STS 临时凭证直传，AccessKey 不进前端包。

\`\`\`ts
// 平台需要提供（默认 GET /api/v1/platform/oss/sts）
interface OssCredentials {
  accessKeyId: string;
  accessKeySecret: string;
  securityToken: string;
  region: string;
  bucket: string;
  endpoint?: string;
  prefix?: string;
}
\`\`\`

也可以在 \`main.ts\` 里注入：

\`\`\`ts
import { setStsProvider } from "@/lib/oss";
setStsProvider(async () => {
  const response = await fetch("/your/sts/endpoint", { credentials: "include" });
  return response.json();
});
\`\`\`

| 字段 | 标签 | 类型 | 允许扩展名 | 单文件上限 | 数量 |
| --- | --- | --- | --- | --- | --- |
${uploadTable}

对象键按 Schema 的 \`uiHints.upload.pathTemplate\` 生成（\`{tenant}/{app}/.../{yyyy}/{MM}/{ulid}.{ext}\`）。
私有桶返回 7 天签名 URL；生产环境建议改成「存 objectKey、展示时换签名 URL」。

## 权限

\`src/generated/permissions.ts\` 是 Bundle 授权记录的**快照**，只用于按钮显隐。
服务端 \`../api/permissions.json\` 才是授权事实来源，前端不做任何替代校验。
未在 permissions 中出现的实体按「不限制」处理，避免配置缺失导致页面不可用。

## 登录与会话

生成项目不再自动创建演示会话。\`/login\` 会调用平台身份接口取得 JWT，后续请求统一带
\`Authorization: Bearer <token>\`；页面刷新时通过 \`GET /api/v1/auth/me\` 恢复用户、角色与部门。

- \`POST /api/v1/auth/login\`：\`{ tenant, username, password }\` → \`{ token, expires_at, user }\`
- \`GET /api/v1/auth/me\`：返回当前用户与 \`role_keys\` / \`dept_id\` / \`dept_name\`
- 路由守卫：未登录访问业务页面跳转 \`/login?redirect=<原地址>\`；令牌失效自动清空并回登录页
- 会话键：\`lcp.token\` / \`lcp.tenant\` / \`lcp.user\`；退出登录只清本地令牌

默认租户来自 Bundle 的 \`tenantId\`，登录页仍可修改；生产多租户部署应固定租户或从域名推导。


## 生成边界

- 本步骤只生成**实体驱动的标准 CRUD 页面**；\`uiSchemas\` 里的自由布局由后续「页面设计器渲染器」消费。
- 登录走平台 JWT 身份接口，角色与部门来自服务端；接入 SSO 时可替换 \`stores/session.ts\` 的登录入口。
- \`GENERATED.txt\` 是产物清单：下一轮只删除「上一轮清单里有、这一轮不再产出」的文件，\`node_modules\`、
  手写扩展组件不会被误删。
- 生成器本身不执行依赖安装；首次使用请先 \`npm install\`，再跑 \`npm run typecheck\` / \`npm run build\`。
- 未生成页面的实体：${skippedText}。
`;
}

function formatBytesText(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return (index === 0 ? value : value.toFixed(1)) + " " + units[index];
}

// ============================================================ 构建文件集
function buildFiles(entry) {
  const resources = [];
  const routes = [];
  const skipped = [];
  for (const plan of entry.plans) {
    if (writableItemsOf(plan).length === 0) {
      note(`${entry.key}.${plan.entity.key}`, "没有可写业务字段，跳过页面生成");
      skipped.push(plan.entity.key);
      continue;
    }
    resources.push(resourceOf(entry, plan, entry.bundle));
    routes.push(routeOf(entry, plan));
  }

  const files = new Map();
  files.set("package.json", packageJsonOf(entry));
  files.set("vite.config.ts", viteConfigOf(entry));
  files.set("tsconfig.json", tsconfigOf());
  files.set("tsconfig.node.json", tsconfigNodeOf());
  files.set("tailwind.config.js", tailwindConfigOf());
  files.set("postcss.config.js", postcssConfigOf());
  files.set("index.html", indexHtmlOf(entry));
  files.set("src/env.d.ts", envDtsOf());
  files.set("src/main.ts", mainTsOf());
  files.set("src/App.vue", appVueOf());
  files.set("src/styles/index.css", stylesOf());
  files.set("src/views/NotFound.vue", notFoundVueOf());
  files.set("src/views/Login.vue", loginVueOf(entry));
  files.set("src/router/index.ts", routerOf(entry, routes));
  files.set("src/layouts/AppLayout.vue", layoutVueOf(entry, routes));
  files.set("src/generated/schema.ts", schemaTsOf(entry, resources, routes));
  files.set("src/generated/permissions.ts", permissionsTsOf(entry.bundle, resources));
  files.set("src/lib/http.ts", httpTsOf());
  files.set("src/lib/format.ts", formatTsOf());
  files.set("src/stores/session.ts", sessionTsOf(entry));
  files.set("src/lib/access.ts", accessTsOf());
  files.set("src/lib/id.ts", idTsOf());
  files.set("src/lib/oss.ts", ossTsOf(entry));
  files.set("src/lib/refs.ts", refsTsOf());
  files.set("src/lib/useCrudPage.ts", useCrudPageTsOf());
  files.set("src/components/DynamicField.vue", dynamicFieldVueOf());
  files.set("src/components/UploadField.vue", uploadFieldVueOf());
  files.set("src/components/RefSelect.vue", refSelectVueOf());
  files.set("src/components/ResourcePage.vue", resourcePageVueOf());
  for (const resource of resources) {
    files.set(`src/pages/${pascal(resource.entity)}/index.vue`, pageVueOf(resource));
  }
  files.set("README.md", readmeOf(entry, resources, skipped));

  for (const [rel, text] of files) files.set(rel, normalizeText(text));
  return { files, resources, routes, skipped };
}

// ============================================================ 写盘
const OWNED_ROOT_FILES = new Set([
  "package.json",
  "vite.config.ts",
  "tsconfig.json",
  "tsconfig.node.json",
  "tailwind.config.js",
  "postcss.config.js",
  "index.html",
  "README.md",
  MANIFEST_NAME
]);

function normalizeText(text) {
  return String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n*$/, "\n");
}

function ownsWebPath(rel) {
  if (OWNED_ROOT_FILES.has(rel)) return true;
  if (!rel.startsWith("src/")) return false;
  return /\.(ts|vue|css|js|json|md)$/.test(rel);
}

function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

function readManifest(webDir) {
  const file = path.join(webDir, MANIFEST_NAME);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function manifestText(entry, files) {
  const lines = [
    MANIFEST_MARK + "。每行一个文件路径（相对本目录）。",
    "# app: " + entry.key,
    "# 下一轮只删除「本清单里有、下一轮不再产出」的生成文件；node_modules / dist / 手写文件不受影响。",
    ...[...files.keys()].sort()
  ];
  return lines.join("\n") + "\n";
}

function pruneEmptyDirs(root) {
  if (!fs.existsSync(root)) return;
  const dirs = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const full = path.join(dir, entry.name);
      dirs.push(full);
      walk(full);
    }
  };
  walk(root);
  for (const dir of dirs.sort((left, right) => right.length - left.length)) {
    if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  }
}

function writeWeb(entry, files, stats) {
  const webDir = path.join(OUT_ROOT, entry.key, WEB_SUBDIR);
  const previous = readManifest(webDir);
  const keep = new Set(files.keys());
  fs.mkdirSync(webDir, { recursive: true });

  for (const [rel, text] of files) {
    const full = path.join(webDir, rel);
    writeTextIfChanged(full, text, stats);
  }

  const removed = [];
  for (const rel of previous) {
    if (keep.has(rel) || !ownsWebPath(rel)) continue;
    const full = path.join(webDir, rel);
    if (fs.existsSync(full)) {
      fs.rmSync(full, { force: true });
      removed.push(rel);
    }
  }

  writeTextIfChanged(path.join(webDir, MANIFEST_NAME), manifestText(entry, files), stats);
  pruneEmptyDirs(webDir);
  return { webDir, removed };
}

// ============================================================ 自检
function checkProducts(entry, built) {
  const problems = [];
  const pageSource = built.files.get("src/components/ResourcePage.vue") ?? "";
  const uploadSource = built.files.get("src/components/UploadField.vue") ?? "";
  for (const plan of entry.plans) {
    const resource = built.resources.find((item) => item.key === plan.entity.key);
    if (!resource) continue;
    const where = `${entry.key}.${plan.entity.key}`;
    const sensitive = new Set(sensitiveItemsOf(plan).map((item) => item.name));

    for (const column of resource.columns) {
      if (sensitive.has(column.key)) problems.push(`${where}: 敏感字段 ${column.key} 出现在列表列`);
    }
    for (const field of resource.editFields) {
      if (sensitive.has(field.key)) problems.push(`${where}: 敏感字段 ${field.key} 出现在编辑表单`);
    }
    for (const item of businessItems(plan)) {
      if (item.field?.immutable !== true) continue;
      const edit = resource.editFields.find((field) => field.key === item.name);
      if (edit && !edit.readonly) problems.push(`${where}: immutable 字段 ${item.name} 在编辑表单里不是只读`);
      if (resource.updateKeys.includes(item.name)) problems.push(`${where}: immutable 字段 ${item.name} 进了更新提交白名单`);
    }
    if (resource.optimisticLock && !pageSource.includes("out.version = currentVersion.value")) {
      problems.push(`${where}: 乐观锁实体没有在提交体里带 version`);
    }

    const expected = filtersOf(plan).map((filter) => filter.name);
    const actual = resource.filters.filter((filter) => filter.key !== "q").map((filter) => filter.key);
    if (expected.join(",") !== actual.join(",")) {
      problems.push(`${where}: 页面筛选参数与 BFF 不一致（期望 ${expected.join(",") || "无"}，实际 ${actual.join(",") || "无"}）`);
    }

    for (const field of [...resource.createFields, ...resource.editFields]) {
      if (field.widget !== "upload") continue;
      const upload = field.upload;
      if (!upload || upload.accept.length === 0 || !(upload.maxSize > 0) || !(upload.maxCount > 0)) {
        problems.push(`${where}: 上传字段 ${field.key} 缺少 accept / maxSize / maxCount`);
        continue;
      }
      if (!uploadSource.includes("spec.maxSize") || !uploadSource.includes("spec.accept")) {
        problems.push(`${where}: 上传控件没有使用字段级约束`);
      }
    }

    const pageRel = `src/pages/${pascal(plan.entity.key)}/index.vue`;
    if (!built.files.has(pageRel)) problems.push(`${where}: 缺少页面 ${pageRel}`);
    if (!pageSource.includes("resource.sensitiveFields")) problems.push(`${where}: 页面没有提示敏感字段约束`);
  }
  return problems;
}

// ============================================================ 自测（--self-test）
const PROBE_STORAGE = {
  primaryKey: "id",
  idType: "ulid",
  tenantColumn: "tenant_id",
  jsonbColumn: "ext",
  optimisticLock: true,
  softDelete: { enabled: true },
  timestamps: { createdAt: "created_at", updatedAt: "updated_at", createdBy: "created_by", updatedBy: "updated_by" }
};

const PROBE_ID = {
  id: "01SELFTEST0000000PAGE",
  key: "id",
  label: "主键",
  type: "string",
  storage: "column",
  columnType: "char(26)",
  required: true,
  immutable: true
};

function pageProbeBundle(appKey, fields, options = {}) {
  return {
    protocolVersion: "0.1",
    tenantId: "tenant_selftest",
    app: { key: appKey, name: appKey },
    artifacts: {
      dataSchemas: [
        {
          key: "selftest_page",
          scope: "system",
          version: 1,
          name: "页面自测模型",
          entities: [
            {
              id: "01SELFTEST0000000PAGE1",
              key: "probe",
              tableName: "probe_tbl",
              name: "自测实体",
              titleField: "name",
              storage: PROBE_STORAGE,
              fields,
              indexes: []
            }
          ]
        }
      ],
      roles: options.roles ?? [],
      permissions: options.permissions ?? []
    }
  };
}

function pageProbe(bundle) {
  const problemsBefore = PROBLEMS.length;
  const notesBefore = NOTES.length;
  const entry = renderApp(bundle, "(page-self-test)");
  const built = entry ? buildFiles(entry) : null;
  const result = {
    entry,
    built,
    problems: PROBLEMS.slice(problemsBefore),
    notes: NOTES.slice(notesBefore)
  };
  PROBLEMS.length = problemsBefore;
  NOTES.length = notesBefore;
  return result;
}

const PAGE_FIELD = (key, type, extra = {}) => ({
  id: "01SELFTEST00000" + key.toUpperCase().slice(0, 6).padEnd(6, "0"),
  key,
  label: key,
  type,
  storage: "column",
  ...extra
});

function pageSelfTestCases() {
  const baseFields = [
    PROBE_ID,
    PAGE_FIELD("name", "string", { required: true, searchable: true, sortable: true }),
    PAGE_FIELD("code", "string", { immutable: true }),
    {
      ...PAGE_FIELD("phone", "string", { storage: "jsonb", sensitive: true }),
      label: "手机号"
    },
    {
      ...PAGE_FIELD("photo", "image", {
        storage: "jsonb",
        uiHints: {
          widget: "x-upload",
          upload: {
            accept: ["jpg", "png"],
            maxSize: 10485760,
            maxCount: 3,
            multiple: true,
            pathTemplate: "{tenant}/{app}/probe/{yyyy}/{ulid}.{ext}"
          }
        }
      }),
      label: "照片"
    },
    {
      ...PAGE_FIELD("owner", "ref", {
        refEntity: { kind: "entity", key: "employee" },
        refField: "name"
      }),
      label: "负责人"
    },
    PAGE_FIELD("days", "decimal", { storage: "column", sortable: true, validators: [{ type: "range", min: 0.5, max: 90 }] })
  ];
  const permissions = [
    {
      roleKey: "student",
      resource: "probe",
      resourceType: "entity",
      actions: ["create", "read", "update", "delete"]
    }
  ];
  return [
    {
      name: "sensitive：不进列表 / 不进编辑表单 / 创建可填",
      bundle: pageProbeBundle("page_sensitive", baseFields, { permissions }),
      check: (result) => {
        const resource = result.built?.resources[0];
        if (!resource) return "没有生成资源";
        if (resource.columns.some((column) => column.key === "phone")) return "phone 出现在列表列";
        if (resource.editFields.some((field) => field.key === "phone")) return "phone 出现在编辑表单";
        if (!resource.createFields.some((field) => field.key === "phone")) return "phone 应该可以在创建时填写";
        return null;
      }
    },
    {
      name: "immutable：创建可填 / 编辑只读 / 不进更新提交",
      bundle: pageProbeBundle("page_immutable", baseFields, { permissions }),
      check: (result) => {
        const resource = result.built?.resources[0];
        if (!resource) return "没有生成资源";
        const create = resource.createFields.find((field) => field.key === "code");
        const edit = resource.editFields.find((field) => field.key === "code");
        if (!create || create.readonly) return "immutable 字段创建时应可填";
        if (!edit || !edit.readonly) return "immutable 字段编辑时应只读";
        if (resource.updateKeys.includes("code")) return "immutable 字段进了更新提交白名单";
        return null;
      }
    },
    {
      name: "乐观锁：提交体带 version",
      bundle: pageProbeBundle("page_lock", baseFields, { permissions }),
      check: (result) => {
        const resource = result.built?.resources[0];
        if (!resource?.optimisticLock) return "资源没有标记 optimisticLock";
        if (!result.built.files.get("src/components/ResourcePage.vue").includes("out.version = currentVersion.value")) {
          return "ResourcePage 没有在提交体里带 version";
        }
        return null;
      }
    },
    {
      name: "上传：accept / maxSize / maxCount 落到字段约束",
      bundle: pageProbeBundle("page_upload", baseFields, { permissions }),
      check: (result) => {
        const resource = result.built?.resources[0];
        const field = resource?.createFields.find((item) => item.key === "photo");
        if (!field || field.widget !== "upload") return "photo 没有生成上传控件";
        if (!field.upload) return "缺少 upload 规格";
        if (!field.upload.accept.includes("jpg")) return "accept 丢了 jpg";
        if (field.upload.maxSize !== 10485760) return "maxSize 没有按 Schema 落值";
        if (field.upload.maxCount !== 3) return "maxCount 没有按 Schema 落值";
        if (!field.upload.pathTemplate || !field.upload.pathTemplate.includes("{ulid}")) return "pathTemplate 丢了";
        return null;
      }
    },
    {
      name: "ref：列与表单都带上被引用实体 / 展示字段",
      bundle: pageProbeBundle("page_ref", baseFields, { permissions }),
      check: (result) => {
        const resource = result.built?.resources[0];
        if (!resource) return "没有生成资源";
        const column = resource.columns.find((item) => item.key === "owner");
        if (!column || column.format !== "ref") return "ref 列没有落成 format=ref";
        if (column.refEntity !== "employee" || column.refField !== "name") return "ref 列缺少 refEntity / refField";
        const field = resource.createFields.find((item) => item.key === "owner");
        if (!field || field.widget !== "ref") return "ref 表单控件没有生成";
        if (!result.built.files.get("src/components/RefSelect.vue").includes("searchRefOptions")) return "RefSelect 没有远程搜索";
        return null;
      }
    },
    {
      name: "筛选：页面参数与 BFF 的 Query 字段同口径",
      bundle: pageProbeBundle("page_filter", baseFields, { permissions }),
      check: (result) => {
        const resource = result.built?.resources[0];
        const keys = resource?.filters.map((filter) => filter.key) ?? [];
        const expected = ["q", "owner", "days_from", "days_to"];
        if (keys.join(",") !== expected.join(",")) return `筛选参数是 ${keys.join(",")}，期望 ${expected.join(",")}`;
        return null;
      }
    },
    {
      name: "权限：快照包含实体与角色",
      bundle: pageProbeBundle("page_perm", baseFields, { permissions }),
      check: (result) => {
        const text = result.built?.files.get("src/generated/permissions.ts") ?? "";
        if (!text.includes('"probe"')) return "权限快照没有 probe";
        if (!text.includes('"student"')) return "权限快照没有 student";
        if (!text.includes('"create"')) return "权限快照没有 create";
        return null;
      }
    },
    {
      name: "空实体：没有业务字段时跳过页面",
      bundle: pageProbeBundle("page_empty", [PROBE_ID], { permissions }),
      check: (result) => {
        if (!result.built) return "没有产出文件集";
        if (result.built.resources.length !== 0) return "空实体也生成了资源";
        if (result.built.files.has("src/pages/Probe/index.vue")) return "空实体也生成了页面";
        if (!result.notes.some((noteItem) => noteItem.msg.includes("跳过页面生成"))) return "没有记录跳过原因";
        return null;
      }
    },
    {
      name: "工程骨架：ali-oss 类型声明与上传错误类型",
      bundle: pageProbeBundle("page_scaffold", baseFields, { permissions }),
      check: (result) => {
        const pkg = result.built?.files.get("package.json") ?? "";
        if (!pkg.includes("@types/ali-oss")) return "package.json 缺少 @types/ali-oss";
        const upload = result.built?.files.get("src/components/UploadField.vue") ?? "";
        if (!upload.includes("interface UploadError")) return "UploadField 没有声明结构化上传错误类型";
        if (!upload.includes("toUploadError")) return "UploadField 没有收敛上传错误类型";
        return null;
      }
    },
    {
      name: "产物自检：结构问题为 0",
      bundle: pageProbeBundle("page_products", baseFields, { permissions }),
      check: (result) => {
        if (!result.entry || !result.built) return "没有产出";
        const problems = checkProducts(result.entry, result.built);
        return problems.length > 0 ? problems.join("；") : null;
      }
    }
  ];
}

function runSelfTest() {
  console.log("gen-page --self-test：用内存 Bundle 逐条逼出断言");
  let failed = 0;
  for (const item of pageSelfTestCases()) {
    let reason = null;
    try {
      const result = pageProbe(item.bundle);
      reason = result.entry ? item.check(result) : "没有产出（未知原因）";
    } catch (err) {
      reason = `断言抛错：${err.message}`;
    }
    if (reason) {
      failed += 1;
      console.log(`  [FAIL] ${item.name}\n         ${reason}`);
    } else {
      console.log(`  [PASS] ${item.name}`);
    }
  }
  const total = pageSelfTestCases().length;
  console.log(failed === 0 ? `\n全部 ${total} 条通过。` : `\n${failed} 条失败。`);
  process.exit(failed === 0 ? 0 : 1);
}

// ============================================================ 入口
function defaultBundles() {
  const dir = path.join(ROOT, "examples");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".bundle.json"))
    .sort()
    .map((name) => path.join(dir, name));
}

function loadBundle(file) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return raw.bundle ?? raw;
}

function printDiagnostics() {
  console.log("\n==================== gen-page 自检 ====================");
  console.log(`错误 ${PROBLEMS.length} 条。`);
  if (PROBLEMS.length > 0) {
    for (const problem of PROBLEMS) console.log(`  [error] ${problem.where} :: ${problem.msg}`);
  }
  const seen = new Set();
  const unique = NOTES.filter((item) => {
    const key = item.level + "|" + item.where + "|" + item.msg;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const warns = unique.filter((item) => item.level === "warn");
  const infos = unique.filter((item) => item.level !== "warn");
  console.log(`告警 ${warns.length} 条。`);
  for (const item of warns) console.log(`  [warn]  ${item.where} :: ${item.msg}`);
  console.log(`提示 ${infos.length} 条。`);
  for (const item of infos) console.log(`  [info]  ${item.where} :: ${item.msg}`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) {
    runSelfTest();
    return;
  }
  const inputs = args.length > 0 ? args : defaultBundles();
  if (inputs.length === 0) {
    console.error("gen-page：没有输入。传 bundle 路径，或在 examples/ 下放 *.bundle.json。");
    process.exit(2);
  }

  const summary = { apps: [], stats: createWriteStats() };
  for (const file of inputs) {
    let bundle;
    try {
      bundle = loadBundle(file);
    } catch (err) {
      bad(path.basename(file), `读取或解析失败：${err.message}`);
      continue;
    }
    const entry = renderApp(bundle, path.basename(file));
    if (!entry) continue;
    const built = buildFiles(entry);
    const problems = checkProducts(entry, built);
    if (problems.length > 0) {
      for (const problem of problems) bad(entry.key, problem);
      continue;
    }
    const written = writeWeb(entry, built.files, summary.stats);
    const uploads = built.resources.reduce(
      (total, resource) =>
        total + [...resource.createFields, ...resource.editFields].filter((field) => field.widget === "upload").length,
      0
    );
    STAT.apps += 1;
    STAT.entities += built.resources.length;
    STAT.files += built.files.size + 1;
    STAT.fields += built.resources.reduce((total, resource) => total + resource.createFields.length, 0);
    STAT.columns += built.resources.reduce((total, resource) => total + resource.columns.length, 0);
    STAT.filters += built.resources.reduce((total, resource) => total + resource.filters.length, 0);
    STAT.uploads = (STAT.uploads ?? 0) + uploads;
    summary.apps.push({
      key: entry.key,
      dir: written.webDir,
      files: built.files.size + 1,
      resources: built.resources.length,
      removed: written.removed,
      skipped: built.skipped
    });
  }

  printDiagnostics();
  console.log("\n==================== 产出 ====================");
  for (const app of summary.apps) {
    console.log(`  ${app.key}  →  ${app.dir}`);
    console.log(
      `    实体 ${app.resources} · 页面 ${app.resources} · 列 ${STAT.columns} · 筛选 ${STAT.filters} · 上传字段 ${STAT.uploads} · 文件 ${app.files} 个`
    );
    if (app.skipped.length > 0) console.log(`    跳过实体：${app.skipped.join(", ")}`);
    if (app.removed.length > 0) console.log(`    清理过期文件 ${app.removed.length} 个：${app.removed.join(", ")}`);
  }
  console.log(`  增量写入：${writeStatsText(summary.stats)}`);
  console.log("");

  if (PROBLEMS.length > 0) process.exitCode = 1;
}

main();
