import OSS from "ali-oss";
import type { UploadSpec } from "@/generated/schema";
import { APP_KEY } from "@/generated/schema";
import { request } from "./http";
import { extOf, safeFileName, ulid } from "./id";

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
  return template.replace(/\{(\w+)\}/g, (_match: string, name: string) => context[name] ?? "");
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
    tenant: localStorage.getItem("lcp.tenant") ?? "demo",
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

  const objectKey = (sts.prefix ? sts.prefix.replace(/\/$/, "") + "/" : "") + key.replace(/^\/+/, "");
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
