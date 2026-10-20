import type { Component } from "vue";
import type { ComponentDef } from "@/types/uiModel";

export type SriAlgorithm = "sha256" | "sha384" | "sha512";

export interface IntegrityToken {
  algorithm: SriAlgorithm;
  digest: string;
}

export interface LoadedRemoteComponent {
  component: Component;
  meta: RemoteModuleMeta | null;
  url: string;
}

export interface RemoteModuleMeta {
  name?: string;
  version?: number | string;
  [key: string]: unknown;
}

export interface RemoteModuleContext {
  def: ComponentDef;
  props: Record<string, unknown>;
  emit(name: string, payload?: unknown): void;
  resize(height: number): void;
  notify(message: string, type?: "success" | "warning" | "error" | "info"): void;
  evaluate(value: unknown, scope?: Record<string, unknown>): unknown;
  runHandler(name: string, event?: Record<string, unknown>): Promise<void>;
  getState(): Record<string, unknown>;
  setState(patch: Record<string, unknown>): void;
  data: Record<string, unknown>;
  user: Record<string, unknown>;
  view: Record<string, unknown>;
}

const SRI = /^(sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})$/;
const cache = new Map<string, Promise<LoadedRemoteComponent>>();

export class RemoteComponentError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RemoteComponentError";
    this.code = code;
  }
}

export function parseIntegrity(value: string): IntegrityToken[] {
  const tokens: IntegrityToken[] = [];
  for (const part of String(value ?? "").trim().split(/\s+/)) {
    if (!part) continue;
    if (!SRI.test(part)) {
      throw new RemoteComponentError("SRI_FORMAT", `integrity 格式非法：${part}`);
    }
    const [algorithm, digest] = part.split("-") as [SriAlgorithm, string];
    tokens.push({ algorithm, digest });
  }
  if (!tokens.length) {
    throw new RemoteComponentError("SRI_REQUIRED", "远程组件缺少 integrity");
  }
  return tokens;
}

async function digestOf(algorithm: SriAlgorithm, bytes: ArrayBuffer): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new RemoteComponentError("SRI_UNAVAILABLE", "当前浏览器不支持 WebCrypto，无法校验 SRI");
  }
  const digest = await crypto.subtle.digest(
    algorithm === "sha256" ? "SHA-256" : algorithm === "sha384" ? "SHA-384" : "SHA-512",
    bytes
  );
  const view = new Uint8Array(digest);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** 任一 integrity token 命中即通过，与浏览器 SRI 的多哈希语义一致。 */
export async function verifyIntegrity(bytes: ArrayBuffer, integrity: string): Promise<IntegrityToken> {
  const tokens = parseIntegrity(integrity);
  for (const token of tokens) {
    const actual = await digestOf(token.algorithm, bytes);
    if (actual === token.digest) return token;
  }
  throw new RemoteComponentError("SRI_MISMATCH", "远程组件内容与 integrity 不一致，已拒绝加载");
}

/** 发布件里的 source 必须显式包含 {version} 占位，避免缓存串版本。 */
export function resolveRemoteSource(component: ComponentDef): string {
  const source = String(component.source ?? "").trim();
  if (!source) {
    throw new RemoteComponentError("SOURCE_REQUIRED", "远程组件缺少 source");
  }
  if (!/^https:\/\//i.test(source)) {
    throw new RemoteComponentError("SOURCE_INSECURE", "远程组件只能从 https:// 地址加载");
  }
  const version = String(component.version ?? "");
  if (!version) {
    throw new RemoteComponentError("VERSION_REQUIRED", "远程组件缺少 version");
  }
  if (!source.includes("{version}")) {
    throw new RemoteComponentError(
      "VERSION_UNPINNED",
      "远程组件 source 必须包含 {version} 占位，发布时锁定模块版本"
    );
  }
  return source.replaceAll("{version}", encodeURIComponent(version));
}

function checkMeta(component: ComponentDef, meta: RemoteModuleMeta | null): void {
  if (!meta) return;
  if (meta.name !== undefined && String(meta.name) !== component.name) {
    throw new RemoteComponentError(
      "META_NAME_MISMATCH",
      `远程模块名称 ${String(meta.name)} 与组件名 ${component.name} 不一致`
    );
  }
  if (meta.version !== undefined && String(meta.version) !== String(component.version)) {
    throw new RemoteComponentError(
      "META_VERSION_MISMATCH",
      `远程模块版本 ${String(meta.version)} 与锁定版本 ${component.version} 不一致`
    );
  }
}

export function loadRemoteComponent(component: ComponentDef): Promise<LoadedRemoteComponent> {
  const url = resolveRemoteSource(component);
  const integrity = String(component.integrity ?? "").trim();
  parseIntegrity(integrity);
  const key = `${url}|${integrity}|${component.version}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const task = (async () => {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        cache: "force-cache",
        referrerPolicy: "no-referrer",
        integrity: undefined
      });
    } catch (cause) {
      throw new RemoteComponentError(
        "FETCH_FAILED",
        `远程组件下载失败：${cause instanceof Error ? cause.message : String(cause)}`
      );
    }
    if (!response.ok) {
      throw new RemoteComponentError("FETCH_FAILED", `远程组件下载失败（HTTP ${response.status}）`);
    }
    const bytes = await response.arrayBuffer();
    await verifyIntegrity(bytes, integrity);

    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: "text/javascript" }));
    let module: Record<string, unknown>;
    try {
      module = (await import(/* @vite-ignore */ blobUrl)) as Record<string, unknown>;
    } catch (cause) {
      throw new RemoteComponentError(
        "MODULE_INVALID",
        `远程组件模块无法执行：${cause instanceof Error ? cause.message : String(cause)}`
      );
    } finally {
      // 模块图已在 import 完成时求值，blob 可立即释放。
      URL.revokeObjectURL(blobUrl);
    }
    const exported = module.default ?? module.component;
    if (typeof exported !== "function" && (typeof exported !== "object" || exported === null)) {
      throw new RemoteComponentError("MODULE_CONTRACT", "远程组件必须默认导出 Vue 组件");
    }
    const meta = module.meta && typeof module.meta === "object" ? (module.meta as RemoteModuleMeta) : null;
    checkMeta(component, meta);
    return { component: exported as Component, meta, url };
  })();

  cache.set(key, task);
  task.catch(() => cache.delete(key));
  return task;
}

export function clearRemoteComponentCache(): void {
  cache.clear();
}
