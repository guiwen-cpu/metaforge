import { reactive, ref } from "vue";
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
