<script setup lang="ts">
import { computed } from "vue";
import type { DataEntity, DataField, DataSchema } from "@/types/dataModel";
import type { UINode, UISchema } from "@/types/uiModel";
import { componentOf, findEntity, isBuiltinComponent, textOf } from "@/lib/uiModel";
import SandboxFrame from "@/components/component/SandboxFrame.vue";

defineOptions({ name: "UiNodeRenderer" });

const props = defineProps<{
  node: UINode;
  page: UISchema;
  schemas: DataSchema[];
  selectedId?: string | null;
}>();

const emit = defineEmits<{ select: [id: string] }>();

const def = computed(() => componentOf(props.node.component));
const isCustomComponent = computed(
  () => !!def.value && !isBuiltinComponent(props.node.component)
);
const selected = computed(() => props.selectedId === props.node.id);
const nodeProps = computed<Record<string, unknown>>(() => props.node.props ?? {});
const entity = computed<DataEntity | null>(() => findEntity(props.schemas, nodeProps.value.entityRef));
const label = computed(
  () =>
    textOf(nodeProps.value.text) ||
    textOf(nodeProps.value.title) ||
    textOf(def.value?.title) ||
    props.node.component
);

function pick(event: MouseEvent) {
  event.stopPropagation();
  emit("select", props.node.id);
}

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const pageTitle = computed(() => textOf(nodeProps.value.title) || textOf(props.page.title));
const pageSubtitle = computed(() => textOf(nodeProps.value.subtitle));

const rowGutter = computed(() => toNumber(nodeProps.value.gutter, 16));

function colStyle(node: UINode): Record<string, string> {
  const span = toNumber(node.props?.span, 24);
  const offset = toNumber(node.props?.offset, 0);
  return {
    width: `calc(${(span / 24) * 100}% - ${rowGutter.value}px)`,
    marginLeft: offset ? `${(offset / 24) * 100}%` : ""
  };
}

function sampleValue(field: DataField, rowIndex: number): unknown {
  switch (field.type) {
    case "string":
      return ["张老师", "李同学", "王主任"][rowIndex % 3];
    case "text":
      return "这是一段示例说明文字，用于预览文本域的展示效果。";
    case "richText":
      return "富文本内容预览";
    case "integer":
    case "decimal":
      return [12, 24, 36][rowIndex % 3];
    case "boolean":
      return rowIndex % 2 === 0;
    case "date":
      return "2026-10-19";
    case "datetime":
      return "2026-10-19 09:30";
    case "time":
      return "09:30";
    case "enum":
      return field.enumValues?.[rowIndex % (field.enumValues.length || 1)]?.label ?? "待审批";
    case "ref":
      return "关联数据";
    case "file":
      return "材料.pdf";
    case "image":
      return "照片.jpg";
    case "video":
      return "视频.mp4";
    case "signature":
      return "已签名";
    case "location":
      return "教学楼 A 座";
    default:
      return "示例值";
  }
}

const sampleRows = computed<Record<string, unknown>[]>(() => {
  const current = entity.value;
  if (!current) return [];
  return [0, 1, 2].map((rowIndex) => {
    const row: Record<string, unknown> = {};
    for (const field of current.fields) row[field.key] = sampleValue(field, rowIndex);
    return row;
  });
});

function fieldOf(key: unknown): DataField | null {
  if (typeof key !== "string") return null;
  return entity.value?.fields.find((field) => field.key === key) ?? null;
}

function columnLabel(item: Record<string, unknown>): string {
  const field = fieldOf(item.field);
  return String(item.label ?? field?.label ?? item.field ?? "");
}

function columnWidth(item: Record<string, unknown>): string | number | undefined {
  const width = item.width;
  if (typeof width === "number") return width;
  if (typeof width === "string" && /^\d+$/.test(width)) return Number(width);
  return undefined;
}

function cellText(item: Record<string, unknown>, row: Record<string, unknown>): string {
  const field = fieldOf(item.field);
  const value = field ? row[field.key] : row[String(item.field)];
  if (value === undefined || value === null) return "—";
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value);
}

function listOfProp(key: string): Record<string, unknown>[] {
  const value = nodeProps.value[key];
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

const searchItems = computed(() => listOfProp("searchFieldList"));
const formItems = computed(() => listOfProp("fieldList"));
const columns = computed(() => listOfProp("columnList"));
const descriptionItems = computed(() => listOfProp("fieldList"));
const actionButtons = computed(() => listOfProp("buttons"));
const searchExtraNodes = computed(() => [
  ...(props.node.children ?? []),
  ...(props.node.slots?.default ?? [])
]);

function optionLabel(item: Record<string, unknown>): string {
  return String(item.label ?? item.text ?? item.value ?? item.key ?? "");
}

function controlFor(item: Record<string, unknown>): string {
  const widget = typeof item.widget === "string" ? item.widget : "";
  if (widget) return widget;
  const field = fieldOf(item.field);
  if (!field) return "x-input";
  const map: Record<string, string> = {
    string: "x-input",
    text: "x-textarea",
    integer: "x-number",
    decimal: "x-number",
    boolean: "x-switch",
    enum: "x-select",
    date: "x-date-picker",
    datetime: "x-date-picker",
    file: "x-upload",
    image: "x-upload",
    video: "x-upload"
  };
  return map[field.type] ?? "x-input";
}

function placeholderOf(item: Record<string, unknown>): string {
  if (typeof item.placeholder === "string") return item.placeholder;
  const field = fieldOf(item.field);
  return field ? `请输入${field.label}` : "请输入";
}

const tabs = computed(() => {
  const items = nodeProps.value.items;
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => {
    if (typeof item === "string") return { key: item, label: item };
    const record = item as Record<string, unknown>;
    return { key: String(record.key ?? index), label: String(record.label ?? record.title ?? record.key ?? `页签 ${index + 1}`) };
  });
});

const timeline = [
  { title: "提交申请", person: "张老师", time: "10-18 09:12", color: "#6366f1" },
  { title: "部门负责人审批", person: "王主任 · 已通过", time: "10-18 11:40", color: "#22c55e" },
  { title: "教务复核", person: "李老师 · 处理中", time: "等待处理", color: "#f59e0b" }
];

const taskRows = [
  { title: "张老师的请假申请", node: "部门负责人审批", arrived: "10-18 09:20" },
  { title: "李同学的补考申请", node: "教务复核", arrived: "10-18 10:05" },
  { title: "王主任的出差申请", node: "校长审批", arrived: "10-17 16:30" }
];
</script>
<template>
  <div
    class="ui-node group/node"
    :class="selected ? 'ui-selected' : ''"
    :style="node.component === 'x-col' ? colStyle(node) : undefined"
    :data-label="`${label} · ${node.component}`"
    @click="pick"
  >
    <template v-if="node.component === 'x-page'">
      <div class="rounded-xl bg-white px-5 py-4">
        <div v-if="pageTitle" class="mb-4 border-b border-slate-100 pb-3">
          <h2 class="text-[20px] font-semibold tracking-tight text-slate-900">{{ pageTitle }}</h2>
          <p v-if="pageSubtitle" class="mt-1 text-[12px] text-slate-400">{{ pageSubtitle }}</p>
        </div>
        <div class="space-y-4">
          <UiNodeRenderer
            v-for="child in node.children"
            :key="child.id"
            :node="child"
            :page="page"
            :schemas="schemas"
            :selected-id="selectedId"
            @select="emit('select', $event)"
          />
        </div>
      </div>
    </template>

    <template v-else-if="node.component === 'x-card'">
      <div class="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div
          v-if="textOf(nodeProps.title) || textOf(nodeProps.extra)"
          class="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5"
        >
          <span class="text-[13px] font-medium text-slate-800">{{ textOf(nodeProps.title) }}</span>
          <span class="text-[11px] text-slate-400">{{ textOf(nodeProps.extra) }}</span>
        </div>
        <div class="space-y-3 p-4">
          <UiNodeRenderer
            v-for="child in node.children"
            :key="child.id"
            :node="child"
            :page="page"
            :schemas="schemas"
            :selected-id="selectedId"
            @select="emit('select', $event)"
          />
          <p v-if="!node.children?.length" class="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-[11.5px] text-slate-400">
            卡片内容区 · 从左侧添加组件
          </p>
        </div>
      </div>
    </template>

    <template v-else-if="node.component === 'x-row'">
      <div class="flex flex-wrap items-stretch" :style="{ gap: rowGutter + 'px' }">
        <UiNodeRenderer
          v-for="child in node.children"
          :key="child.id"
          :node="child"
          :page="page"
          :schemas="schemas"
          :selected-id="selectedId"
          @select="emit('select', $event)"
        />
      </div>
    </template>

    <template v-else-if="node.component === 'x-col'">
      <div class="h-full space-y-3">
        <UiNodeRenderer
          v-for="child in node.children"
          :key="child.id"
          :node="child"
          :page="page"
          :schemas="schemas"
          :selected-id="selectedId"
          @select="emit('select', $event)"
        />
      </div>
    </template>

    <template v-else-if="node.component === 'x-toolbar'">
      <div class="flex items-center justify-between gap-3">
        <UiNodeRenderer
          v-for="child in node.children"
          :key="child.id"
          :node="child"
          :page="page"
          :schemas="schemas"
          :selected-id="selectedId"
          @select="emit('select', $event)"
        />
      </div>
    </template>

    <template v-else-if="node.component === 'x-search-form'">
      <div class="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
        <div
          class="grid gap-3"
          :style="{ gridTemplateColumns: `repeat(${toNumber(nodeProps.fieldsPerRow, 4)}, minmax(0, 1fr))` }"
        >
          <div v-for="(item, index) in searchItems" :key="index" class="flex items-center gap-2">
            <span class="w-[70px] shrink-0 text-right text-[11.5px] text-slate-500">{{ columnLabel(item) }}</span>
            <el-input v-if="controlFor(item) === 'x-input'" :placeholder="placeholderOf(item)" disabled size="small" />
            <el-select v-else-if="controlFor(item) === 'x-select'" placeholder="请选择" disabled size="small" class="w-full" />
            <el-date-picker
              v-else-if="controlFor(item) === 'x-date-picker'"
              type="date"
              disabled
              size="small"
              placeholder="选择日期"
              class="!w-full"
            />
            <el-input v-else :placeholder="placeholderOf(item)" disabled size="small" />
          </div>
          <div v-for="child in searchExtraNodes" :key="child.id" class="min-w-0">
            <UiNodeRenderer
              :node="child"
              :page="page"
              :schemas="schemas"
              :selected-id="selectedId"
              @select="emit('select', $event)"
            />
          </div>
        </div>
        <div class="mt-3 flex items-center justify-end gap-2">
          <el-button size="small">查询</el-button>
          <el-button size="small" plain>重置</el-button>
          <UiNodeRenderer
            v-for="child in node.slots?.right"
            :key="child.id"
            :node="child"
            :page="page"
            :schemas="schemas"
            :selected-id="selectedId"
            @select="emit('select', $event)"
          />
        </div>
      </div>
    </template>

    <template v-else-if="node.component === 'x-table'">
      <el-table :data="sampleRows" size="small" border stripe style="width: 100%">
        <el-table-column v-if="nodeProps.selection === 'multiple'" type="selection" width="42" />
        <el-table-column v-if="nodeProps.showIndex" type="index" width="48" label="#" />
        <el-table-column
          v-for="(item, index) in columns"
          :key="index"
          :label="columnLabel(item)"
          :width="columnWidth(item)"
          :align="item.align === 'right' ? 'right' : 'left'"
        >
          <template #default="{ row }">
            <div v-if="item.widget === 'x-row-actions' || item.field === 'actions'" class="flex gap-1">
              <el-button
                v-for="(button, buttonIndex) in (Array.isArray(item.buttons) ? item.buttons.slice(0, 3) : [])"
                :key="buttonIndex"
                link
                size="small"
                :type="(button as Record<string, unknown>).danger ? 'danger' : 'primary'"
              >
                {{ (button as Record<string, unknown>).label ?? (button as Record<string, unknown>).text }}
              </el-button>
            </div>
            <el-tag
              v-else-if="fieldOf(item.field)?.type === 'enum' || item.widget === 'x-enum-text' || item.widget === 'x-status-tag'"
              size="small"
              type="info"
            >
              {{ cellText(item, row) }}
            </el-tag>
            <span v-else>{{ cellText(item, row) }}</span>
          </template>
        </el-table-column>
        <el-table-column v-if="!columns.length" label="提示">
          <template #default>
            <span class="text-[12px] text-slate-400">尚未配置表格列</span>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <template v-else-if="node.component === 'x-pagination'">
      <div class="flex justify-end py-1">
        <el-pagination background layout="total, sizes, prev, pager, next" :total="48" :page-size="10" />
      </div>
    </template>

    <template v-else-if="node.component === 'x-form'">
      <div>
        <div
          class="grid gap-x-4 gap-y-4"
          :style="{ gridTemplateColumns: `repeat(${toNumber(nodeProps.columnsPerRow, 2)}, minmax(0, 1fr))` }"
        >
          <div
            v-for="(item, index) in formItems"
            :key="index"
            :class="toNumber(item.span, 12) >= 24 ? 'col-span-full' : ''"
          >
            <label class="mb-1 block text-[11.5px] text-slate-600">
              {{ columnLabel(item) }}
              <span v-if="item.required" class="ml-0.5 text-rose-500">*</span>
            </label>
            <el-input v-if="controlFor(item) === 'x-input'" :placeholder="placeholderOf(item)" disabled />
            <el-input
              v-else-if="controlFor(item) === 'x-textarea'"
              type="textarea"
              :rows="3"
              :placeholder="placeholderOf(item)"
              disabled
            />
            <el-input-number v-else-if="controlFor(item) === 'x-number'" disabled class="!w-full" />
            <el-switch v-else-if="controlFor(item) === 'x-switch'" disabled />
            <el-select v-else-if="controlFor(item) === 'x-select'" placeholder="请选择" disabled class="w-full" />
            <el-date-picker
              v-else-if="controlFor(item) === 'x-date-picker'"
              type="date"
              disabled
              placeholder="选择日期"
              class="!w-full"
            />
            <div
              v-else-if="controlFor(item) === 'x-upload'"
              class="rounded-lg border border-dashed border-slate-300 bg-slate-50/50 px-3 py-5 text-center text-[11px] text-slate-400"
            >
              点击或拖拽文件到此处上传
            </div>
            <el-input v-else :placeholder="placeholderOf(item)" disabled />
          </div>
        </div>
        <div v-if="nodeProps.showActions !== false" class="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
          <el-button size="small">重置</el-button>
          <el-button size="small" type="primary">{{ textOf(nodeProps.submitText) || "保存" }}</el-button>
        </div>
      </div>
    </template>

    <template v-else-if="node.component === 'x-form-item'">
      <div>
        <label class="mb-1 block text-[11.5px] text-slate-600">
          {{ textOf(nodeProps.label) }}
          <span v-if="nodeProps.required" class="ml-0.5 text-rose-500">*</span>
        </label>
        <UiNodeRenderer
          v-for="child in node.children"
          :key="child.id"
          :node="child"
          :page="page"
          :schemas="schemas"
          :selected-id="selectedId"
          @select="emit('select', $event)"
        />
      </div>
    </template>

    <template v-else-if="node.component === 'x-descriptions'">
      <el-descriptions :column="toNumber(nodeProps.column, 2)" border size="small">
        <el-descriptions-item
          v-for="(item, index) in descriptionItems"
          :key="index"
          :label="columnLabel(item)"
        >
          {{ fieldOf(item.field) ? sampleRows[0]?.[fieldOf(item.field)!.key] : "—" }}
        </el-descriptions-item>
        <el-descriptions-item v-if="!descriptionItems.length" label="提示">
          尚未配置展示字段
        </el-descriptions-item>
      </el-descriptions>
    </template>

    <template v-else-if="node.component === 'x-tabs'">
      <div class="rounded-lg border border-slate-200 bg-white">
        <div class="flex gap-4 border-b border-slate-100 px-3">
          <span
            v-for="(tab, index) in (tabs.length ? tabs : [{ key: 'default', label: '页签 1' }])"
            :key="tab.key"
            class="border-b-2 py-2 text-[12px]"
            :class="index === 0 ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-400'"
          >
            {{ tab.label }}
          </span>
        </div>
        <div class="space-y-3 p-3">
          <UiNodeRenderer
            v-for="child in node.children"
            :key="child.id"
            :node="child"
            :page="page"
            :schemas="schemas"
            :selected-id="selectedId"
            @select="emit('select', $event)"
          />
        </div>
      </div>
    </template>

    <template v-else-if="node.component === 'x-dialog'">
      <div class="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 px-4 py-5 text-center">
        <p class="text-[12.5px] font-medium text-indigo-700">弹窗 · {{ textOf(nodeProps.title) || "未命名弹窗" }}</p>
        <p class="mt-1 text-[11px] text-indigo-400">设计态不展开，运行时由动作 openDialog 触发</p>
      </div>
    </template>

    <template v-else-if="node.component === 'x-text'">
      <span
        :style="{
          fontSize: textOf(nodeProps.size) || undefined,
          color: nodeProps.type === 'primary' ? '#4f46e5' : nodeProps.type === 'info' ? '#94a3b8' : undefined
        }"
      >
        {{ textOf(nodeProps.content) || "文本内容" }}
      </span>
    </template>

    <template v-else-if="node.component === 'x-enum-text'">
      <el-tag size="small" type="info">{{ textOf(nodeProps.value) || "枚举值" }}</el-tag>
    </template>

    <template v-else-if="node.component === 'x-status-tag'">
      <el-tag size="small" type="warning" effect="light">审批中</el-tag>
    </template>

    <template v-else-if="node.component === 'x-btn'">
      <el-button
        size="small"
        :type="(nodeProps.type as 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'default') || 'default'"
        :plain="!!nodeProps.plain"
      >
        {{ textOf(nodeProps.text) || "按钮" }}
      </el-button>
    </template>

    <template v-else-if="node.component === 'x-row-actions'">
      <div class="flex gap-1">
        <el-button v-for="(button, index) in actionButtons.slice(0, 4)" :key="index" link size="small" type="primary">
          {{ optionLabel(button) }}
        </el-button>
        <span v-if="!actionButtons.length" class="text-[11.5px] text-slate-400">行操作按钮</span>
      </div>
    </template>

    <template v-else-if="node.component === 'x-approval-timeline'">
      <el-timeline class="!pl-1">
        <el-timeline-item
          v-for="(item, index) in timeline"
          :key="index"
          :color="item.color"
          :timestamp="item.time"
          size="normal"
        >
          <p class="text-[12.5px] font-medium text-slate-700">{{ item.title }}</p>
          <p class="text-[11px] text-slate-400">{{ item.person }}</p>
        </el-timeline-item>
      </el-timeline>
    </template>

    <template v-else-if="node.component === 'x-approval-actions'">
      <div class="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
        <span class="mr-auto text-[11.5px] text-slate-400">审批操作</span>
        <el-button size="small" type="success">同意</el-button>
        <el-button size="small" type="danger" plain>驳回</el-button>
        <el-button size="small" plain>转交</el-button>
      </div>
    </template>

    <template v-else-if="node.component === 'x-task-list'">
      <el-table :data="taskRows" size="small" border>
        <el-table-column prop="title" label="事项" />
        <el-table-column prop="node" label="当前节点" width="130" />
        <el-table-column prop="arrived" label="到达时间" width="110" />
        <el-table-column label="操作" width="80">
          <template #default>
            <el-button link size="small" type="primary">办理</el-button>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <template v-else-if="node.component === 'x-process-form'">
      <div class="rounded-lg border border-slate-200 bg-white p-3">
        <p class="mb-3 text-[11.5px] text-slate-400">按当前任务节点渲染可编辑字段</p>
        <div class="grid grid-cols-2 gap-3">
          <div v-for="field in (entity?.fields ?? []).slice(0, 4)" :key="field.id">
            <label class="mb-1 block text-[11.5px] text-slate-600">{{ field.label }}</label>
            <el-input :placeholder="`请输入${field.label}`" disabled />
          </div>
        </div>
      </div>
    </template>

    <template v-else-if="node.component === 'x-attachment-list'">
      <div class="divide-y divide-slate-100 rounded-lg border border-slate-200">
        <div v-for="name in ['请假申请表.pdf', '诊断证明.jpg']" :key="name" class="flex items-center justify-between px-3 py-2">
          <span class="text-[12px] text-slate-600">{{ name }}</span>
          <el-button link size="small" type="primary">下载</el-button>
        </div>
      </div>
    </template>

    <template v-else-if="node.component === 'x-upload'">
      <div class="rounded-lg border border-dashed border-slate-300 bg-slate-50/50 px-4 py-6 text-center">
        <p class="text-[12px] text-slate-500">上传文件 / 图片 / 视频</p>
        <p class="mt-1 text-[10.5px] text-slate-400">OSS 客户端直传 · STS 临时凭证</p>
      </div>
    </template>

    <template v-else-if="node.component === 'x-dept-picker' || node.component === 'x-employee-picker'">
      <el-select :placeholder="node.component === 'x-dept-picker' ? '选择部门' : '选择人员'" disabled class="w-full" />
    </template>

    <template v-else-if="node.component === 'x-signature' || node.component === 'x-location'">
      <div class="grid h-24 place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50/60 text-[11.5px] text-slate-400">
        {{ node.component === "x-signature" ? "手写签名区域" : "地图选点区域" }}
      </div>
    </template>

    <template v-else-if="node.component === 'x-input' || node.component === 'x-textarea' || node.component === 'x-number'">
      <el-input
        v-if="node.component === 'x-input'"
        :placeholder="textOf(nodeProps.placeholder) || '请输入'"
        disabled
      />
      <el-input v-else-if="node.component === 'x-textarea'" type="textarea" :rows="3" disabled placeholder="请输入" />
      <el-input-number v-else disabled class="!w-full" />
    </template>

    <template v-else-if="node.component === 'x-switch'">
      <el-switch disabled />
    </template>

    <template v-else-if="node.component === 'x-select'">
      <el-select placeholder="请选择" disabled class="w-full" />
    </template>

    <template v-else-if="node.component === 'x-date-picker'">
      <el-date-picker type="date" disabled placeholder="选择日期" class="!w-full" />
    </template>

    <template v-else-if="node.component === 'x-radio-group' || node.component === 'x-checkbox-group'">
      <div class="flex gap-4 text-[12px] text-slate-500">
        <span>选项一</span><span>选项二</span>
      </div>
    </template>

    <template v-else-if="node.component === 'x-json-editor'">
      <pre class="rounded-lg bg-slate-900 p-3 text-[10.5px] text-slate-300">{ "key": "value" }</pre>
    </template>

    <template v-else-if="isCustomComponent && def">
      <div class="rounded-xl border border-indigo-100 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div class="mb-1.5 flex items-center justify-between gap-2 px-1">
          <span class="truncate text-[10.5px] font-medium text-indigo-600">{{ textOf(def.title) || def.name }}</span>
          <span class="shrink-0 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[9px] font-medium text-indigo-500">沙箱</span>
        </div>
        <SandboxFrame
          :component="def"
          :override-props="nodeProps"
          :min-height="60"
          :max-height="420"
          :title="label"
        />
        <div
          v-if="node.children?.length"
          class="mt-2 space-y-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-2"
        >
          <UiNodeRenderer
            v-for="child in node.children"
            :key="child.id"
            :node="child"
            :page="page"
            :schemas="schemas"
            :selected-id="selectedId"
            @select="emit('select', $event)"
          />
        </div>
      </div>
    </template>

    <template v-else>
      <div class="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-3 py-4 text-center">
        <p class="text-[11.5px] font-medium text-slate-500">{{ node.component }}</p>
        <p class="mt-0.5 text-[10.5px] text-slate-400">该组件的预览尚未实现，运行时按组件契约渲染</p>
        <div class="mt-2 space-y-2">
          <UiNodeRenderer
            v-for="child in node.children"
            :key="child.id"
            :node="child"
            :page="page"
            :schemas="schemas"
            :selected-id="selectedId"
            @select="emit('select', $event)"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ui-node {
  position: relative;
  border-radius: 8px;
  transition: box-shadow 0.15s ease;
}
.ui-node:hover {
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.55);
}
.ui-node.ui-selected {
  box-shadow: 0 0 0 2px rgba(56, 132, 255, 0.9);
  border-radius: 8px;
}
.ui-node::after {
  content: attr(data-label);
  position: absolute;
  top: -16px;
  left: 0;
  z-index: 30;
  display: none;
  border-radius: 3px;
  background: rgba(15, 23, 42, 0.9);
  padding: 1px 5px;
  font-size: 10px;
  line-height: 1.4;
  color: #e2e8f0;
  white-space: nowrap;
  pointer-events: none;
}
.ui-node:hover::after {
  display: block;
}

/* 预览态控件是 disabled 的，让点击穿透到画布节点以便选中 */
.ui-node :deep(.el-input),
.ui-node :deep(.el-textarea),
.ui-node :deep(.el-input-number),
.ui-node :deep(.el-select),
.ui-node :deep(.el-date-editor),
.ui-node :deep(.el-switch),
.ui-node :deep(.el-radio-group),
.ui-node :deep(.el-checkbox-group) {
  pointer-events: none;
}
</style>
