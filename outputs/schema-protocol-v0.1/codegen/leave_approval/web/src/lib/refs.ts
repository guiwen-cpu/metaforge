import { reactive } from "vue";
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
