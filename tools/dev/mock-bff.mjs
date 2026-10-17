#!/usr/bin/env node
/**
 * MetaForge 本地联调 Mock BFF（仅开发用，不是生产后端）。
 *
 * 只实现 codegen 产物需要的 CRUD 契约：分页、排序、q 搜索、区间筛选、
 * 乐观锁版本冲突、OSS STS 占位。数据放内存，进程退出即丢失。
 *
 *   node tools/dev/mock-bff.mjs            # http://localhost:8080
 *   MOCK_PORT=9090 node tools/dev/mock-bff.mjs
 */
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 8080);
const APP = "leave_approval";
const API_PREFIX = `/api/v1/${APP}/`;
const RESOURCES = new Set(["employee", "leave_request", "attachment"]);

let seq = 100;
const nextId = (prefix) => `${prefix}_${++seq}`;
const isoNow = () => new Date().toISOString();

const db = {
  employee: [
    {
      id: "emp_001",
      employee_no: "T2021007",
      name: "张伟",
      dept_id: "dept_teaching",
      dept_name: "教务处",
      position: "teacher",
      phone: "13800000001",
      id_card: "110101199003071234",
      hire_date: "2021-08-20",
      created_at: "2021-08-20T02:00:00.000Z",
      version: 1
    },
    {
      id: "emp_002",
      employee_no: "A2019003",
      name: "李静",
      dept_id: "dept_teaching",
      dept_name: "教务处",
      position: "admin",
      phone: "13800000002",
      id_card: "110101198811223456",
      hire_date: "2019-03-11",
      created_at: "2019-03-11T01:30:00.000Z",
      version: 1
    },
    {
      id: "emp_003",
      employee_no: "L2022051",
      name: "王强",
      dept_id: "dept_logistics",
      dept_name: "后勤处",
      position: "logistics",
      phone: "13800000003",
      id_card: "110101199507194321",
      hire_date: "2022-05-09",
      created_at: "2022-05-09T06:10:00.000Z",
      version: 1
    }
  ],
  leave_request: [
    {
      id: "lr_001",
      applicant_id: "emp_001",
      applicant_name: "张伟",
      dept_id: "dept_teaching",
      leave_type: "annual",
      start_at: "2026-03-02T01:00:00.000Z",
      end_at: "2026-03-04T09:00:00.000Z",
      days: 3,
      reason: "陪家人返乡",
      urgency: "normal",
      images: [],
      video_proof: [],
      documents: [],
      status: "pending",
      current_task: "dept_approval",
      approver_id: "emp_002",
      approved_at: null,
      created_at: "2026-02-25T03:20:00.000Z",
      version: 1
    },
    {
      id: "lr_002",
      applicant_id: "emp_003",
      applicant_name: "王强",
      dept_id: "dept_logistics",
      leave_type: "sick",
      start_at: "2026-02-18T00:30:00.000Z",
      end_at: "2026-02-19T09:30:00.000Z",
      days: 2,
      reason: "感冒发热，医院已开具病假条",
      urgency: "high",
      images: [],
      video_proof: [],
      documents: [
        {
          name: "诊断证明.pdf",
          objectKey: "demo/leave_approval/2026/02/diagnosis.pdf",
          size: 482133,
          mime: "application/pdf"
        }
      ],
      status: "approved",
      current_task: "",
      approver_id: "emp_002",
      approved_at: "2026-02-17T08:45:00.000Z",
      created_at: "2026-02-17T06:05:00.000Z",
      version: 2
    },
    {
      id: "lr_003",
      applicant_id: "emp_001",
      applicant_name: "张伟",
      dept_id: "dept_teaching",
      leave_type: "personal",
      start_at: "2026-01-12T02:00:00.000Z",
      end_at: "2026-01-12T10:00:00.000Z",
      days: 1,
      reason: "办理房产过户",
      urgency: "low",
      images: [],
      video_proof: [],
      documents: [],
      status: "rejected",
      current_task: "",
      approver_id: "emp_002",
      approved_at: "2026-01-11T09:10:00.000Z",
      created_at: "2026-01-10T07:40:00.000Z",
      version: 2
    }
  ],
  attachment: [
    {
      id: "att_001",
      biz_type: "leave_request",
      biz_id: "lr_002",
      file_name: "诊断证明.pdf",
      object_key: "demo/leave_approval/2026/02/diagnosis.pdf",
      mime: "application/pdf",
      size: 482133,
      kind: "document",
      checksum: "sha256-demo-001",
      created_at: "2026-02-17T06:06:00.000Z",
      version: 1
    }
  ]
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,authorization,x-tenant-id",
  "access-control-max-age": "600"
};

function send(res, status, body, headers = {}) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...CORS,
    ...headers
  });
  res.end(payload);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2 * 1024 * 1024) {
        reject(new Error("payload_too_large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

function compare(a, b) {
  if (a === undefined || a === null || a === "") return -1;
  if (typeof a === "number" || typeof b === "number") {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  }
  return String(a).localeCompare(String(b));
}

function matchesFilter(row, key, value) {
  if (key.endsWith("_from")) return compare(row[key.slice(0, -5)], value) >= 0;
  if (key.endsWith("_to")) return compare(row[key.slice(0, -3)], value) <= 0;
  if (row[key] === undefined) return false;
  return String(row[key]).toLowerCase() === String(value).toLowerCase();
}

function matchesKeyword(row, keyword) {
  if (!keyword) return true;
  const needle = keyword.toLowerCase();
  return Object.values(row).some((value) => {
    if (typeof value === "string") return value.toLowerCase().includes(needle);
    if (typeof value === "number") return String(value).includes(needle);
    return false;
  });
}

function listRows(table, url) {
  const params = url.searchParams;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const size = Math.min(100, Math.max(1, Number(params.get("size")) || 20));
  const sort = params.get("sort");
  const order = params.get("order") === "asc" ? 1 : -1;
  const keyword = params.get("q") ?? "";

  let rows = table.filter((row) => matchesKeyword(row, keyword));
  for (const [key, value] of params.entries()) {
    if (["page", "size", "sort", "order", "q"].includes(key)) continue;
    if (value === "") continue;
    rows = rows.filter((row) => matchesFilter(row, key, value));
  }
  if (sort) rows = [...rows].sort((a, b) => compare(a[sort], b[sort]) * order);

  const total = rows.length;
  const start = (page - 1) * size;
  return {
    items: rows.slice(start, start + size),
    total,
    page,
    size,
    pages: Math.max(1, Math.ceil(total / size))
  };
}

async function handle(req, res) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const { pathname } = url;
  res.on("finish", () => {
    console.log(`${req.method} ${pathname}${url.search} -> ${res.statusCode}`);
  });

  if (req.method === "OPTIONS") return send(res, 204);

  if (pathname === "/health") {
    return send(res, 200, { ok: true, app: APP, resources: [...RESOURCES] });
  }

  if (pathname === "/api/v1/platform/oss/sts") {
    return send(res, 501, {
      code: "not_configured",
      message: "本地 Mock 未接入阿里云 STS；上传能力请在真实 BFF 配置 OSS 后验证。"
    });
  }

  if (!pathname.startsWith(API_PREFIX)) {
    return send(res, 404, { code: "not_found", message: `未知路由：${pathname}` });
  }

  const segments = pathname.slice(API_PREFIX.length).split("/").filter(Boolean);
  const [resource, id] = segments;
  if (segments.length > 2 || !RESOURCES.has(resource)) {
    return send(res, 404, { code: "not_found", message: `未知资源：${resource ?? ""}` });
  }
  const table = db[resource];

  if (req.method === "GET" && !id) {
    return send(res, 200, listRows(table, url));
  }

  if (req.method === "GET" && id) {
    const row = table.find((item) => item.id === id);
    if (!row) return send(res, 404, { code: "not_found", message: `记录不存在：${id}` });
    return send(res, 200, row);
  }

  if (req.method === "POST" && !id) {
    const body = await readJson(req);
    const timestamp = isoNow();
    const row = {
      ...body,
      id: typeof body.id === "string" && body.id ? body.id : nextId(resource),
      version: 1,
      created_at: body.created_at ?? timestamp,
      updated_at: timestamp
    };
    table.unshift(row);
    return send(res, 201, row);
  }

  if (req.method === "PUT" && id) {
    const index = table.findIndex((item) => item.id === id);
    if (index < 0) return send(res, 404, { code: "not_found", message: `记录不存在：${id}` });
    const body = await readJson(req);
    const current = table[index];
    if (typeof body.version === "number" && body.version !== current.version) {
      return send(res, 409, {
        code: "version_conflict",
        message: "这条数据已被其他人修改，请刷新后重试。",
        details: { currentVersion: current.version }
      });
    }
    const next = {
      ...current,
      ...body,
      id: current.id,
      version: (current.version ?? 1) + 1,
      created_at: current.created_at,
      updated_at: isoNow()
    };
    table[index] = next;
    return send(res, 200, next);
  }

  if (req.method === "DELETE" && id) {
    const index = table.findIndex((item) => item.id === id);
    if (index < 0) return send(res, 404, { code: "not_found", message: `记录不存在：${id}` });
    table.splice(index, 1);
    return send(res, 204);
  }

  return send(res, 405, { code: "method_not_allowed", message: `${req.method} 不支持` }, { allow: "GET,POST,PUT,DELETE,OPTIONS" });
}

const server = createServer((req, res) => {
  handle(req, res).catch((error) => {
    const code = error instanceof Error ? error.message : String(error);
    const status = code === "invalid_json" ? 400 : code === "payload_too_large" ? 413 : 500;
    send(res, status, { code, message: status === 400 ? "请求体不是合法 JSON" : code });
  });
});

server.listen(PORT, () => {
  console.log(`MetaForge Mock BFF 已启动：http://localhost:${PORT}`);
  console.log(`  health: http://localhost:${PORT}/health`);
  console.log(`  资源: ${[...RESOURCES].join(" / ")}`);
  console.log("  仅本地联调用；数据保存在内存，重启即重置。");
});