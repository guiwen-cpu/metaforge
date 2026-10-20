import type { RuntimeMenuItem, RuntimeNavigation, RuntimePageLink } from "@/types/runtime";

/** 匹配发布件声明的运行时路由，支持 `:param` 与可选的 `:param?`。 */
export function matchRoute(
  pattern: string | null | undefined,
  path: string
): Record<string, string> | null {
  if (!pattern) return null;
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = path.split("/").filter(Boolean);
  const params: Record<string, string> = {};
  let index = 0;
  for (const part of patternParts) {
    const optional = part.endsWith("?");
    const token = optional ? part.slice(0, -1) : part;
    if (token.startsWith(":")) {
      if (index < pathParts.length) {
        try {
          params[token.slice(1)] = decodeURIComponent(pathParts[index]);
        } catch {
          params[token.slice(1)] = pathParts[index];
        }
        index++;
        continue;
      }
      if (optional) continue;
      return null;
    }
    if (pathParts[index] !== token) return null;
    index++;
  }
  return index === pathParts.length ? params : null;
}

export function routeMatches(pattern: string | null | undefined, path: string): boolean {
  return matchRoute(pattern, path) !== null;
}

export function findMenu(items: RuntimeMenuItem[], path: string): RuntimeMenuItem | null {
  for (const item of items) {
    if (item.path === path) return item;
    const child = findMenu(item.children ?? [], path);
    if (child) return child;
  }
  return null;
}

export function collectFirstPath(items: RuntimeMenuItem[]): string {
  for (const item of items) {
    if (item.path) return item.path;
    const child = collectFirstPath(item.children ?? []);
    if (child) return child;
  }
  return "";
}

export function flattenMenu(items: RuntimeMenuItem[]): RuntimeMenuItem[] {
  const out: RuntimeMenuItem[] = [];
  for (const item of items) {
    out.push(item);
    out.push(...flattenMenu(item.children ?? []));
  }
  return out;
}

export function resolvePageLink(
  navigation: RuntimeNavigation | null | undefined,
  path: string
): RuntimePageLink | null {
  if (!navigation || !path) return null;
  const menu = findMenu(navigation.menus ?? [], path);
  if (menu?.page_key) {
    return (navigation.pages ?? []).find((item) => item.key === menu.page_key) ?? null;
  }
  return (
    (navigation.pages ?? []).find((item) => item.path === path) ??
    (navigation.pages ?? []).find((item) => routeMatches(item.path, path)) ??
    null
  );
}

export function buildRoutePath(
  link: RuntimePageLink,
  params: Record<string, unknown> = {}
): string {
  const pattern = link.path ?? "";
  const parts = pattern
    .split("/")
    .filter(Boolean)
    .map((part) => {
      const optional = part.endsWith("?");
      const token = optional ? part.slice(0, -1) : part;
      if (!token.startsWith(":")) return part;
      const raw = params[token.slice(1)];
      if (raw === undefined || raw === null || raw === "") return optional ? "" : token;
      return encodeURIComponent(String(raw));
    })
    .filter(Boolean);
  return `/${parts.join("/")}`;
}

export function hasUnresolvedParams(path: string): boolean {
  return /:([A-Za-z_][A-Za-z0-9_]*)\??\/?$/.test(path);
}

export function runtimePathFromParts(parts: string | string[] | undefined): string {
  const list = Array.isArray(parts) ? parts : String(parts ?? "").split("/");
  const path = list.filter(Boolean).join("/");
  return path ? `/${path}` : "";
}
