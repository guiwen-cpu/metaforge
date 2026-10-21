import type { SandboxPolicy } from "@/types/uiModel";

export interface CodeRuntimeEvent {
  name: string;
  payload: unknown;
}

export interface CodeRuntimeResult {
  value: unknown;
  events: CodeRuntimeEvent[];
  logs: string[];
}

export interface CodeRuntimeRequest {
  source: string;
  entry?: string;
  input?: unknown;
  context?: Record<string, unknown>;
  policy?: SandboxPolicy;
  timeoutMs?: number;
  onEvent?: (event: CodeRuntimeEvent) => void;
}

const COMPILE_CACHE = new Map<string, string>();
const HOST_SOURCE = "metaforge-code-host";
const FRAME_SOURCE = "metaforge-code-sandbox";

let tsPromise: Promise<unknown> | null = null;

async function loadTypeScript(): Promise<Record<string, any>> {
  if (!tsPromise) tsPromise = import("typescript");
  const loaded = (await tsPromise) as Record<string, any>;
  return (loaded.default ?? loaded) as Record<string, any>;
}

/** 只做语法级转译，编译结果在 iframe 内以 script.textContent 注入，不使用 eval。 */
export async function compileCodeHook(source: string): Promise<string> {
  const cached = COMPILE_CACHE.get(source);
  if (cached !== undefined) return cached;
  if (!source.trim()) throw new Error("代码钩子源码为空");
  if (source.length > 200_000) throw new Error("代码钩子源码超过 200KB");
  const ts = await loadTypeScript();
  const result = ts.transpileModule(source, {
    fileName: "code-hook.ts",
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      isolatedModules: true,
      removeComments: false
    }
  });
  const errors = (result.diagnostics ?? []).filter(
    (item: any) => item.category === ts.DiagnosticCategory.Error
  );
  if (errors.length) {
    const message = ts.flattenDiagnosticMessageText(errors[0].messageText, " ");
    throw new Error(`TypeScript 编译失败：${message}`);
  }
  if (COMPILE_CACHE.size > 64) COMPILE_CACHE.clear();
  COMPILE_CACHE.set(source, result.outputText);
  return result.outputText as string;
}

function plain<T>(value: T): T {
  if (value === undefined) return value;
  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value)) as T;
    } catch {
      return value;
    }
  }
}

function policySignature(policy: SandboxPolicy | undefined): string {
  return JSON.stringify({
    network: !!policy?.network,
    hosts: [...(policy?.allowedHosts ?? [])].sort(),
    storage: !!policy?.storage,
    dom: !!policy?.dom,
    cookies: !!policy?.cookies,
    clipboard: !!policy?.clipboard,
    navigation: !!policy?.navigation,
    allowEval: !!policy?.allowEval
  });
}

function hostRule(raw: string): string {
  let value = raw.trim().toLowerCase();
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  value = value.split("/")[0] ?? "";
  if (!value.startsWith("*.")) value = value.replace(/:\d+$/, "");
  return value.replace(/[^a-z0-9.*:[\]-]/g, "");
}

function cspSources(rules: string[]): string[] {
  const out = new Set<string>();
  for (const raw of rules) {
    const value = raw.trim();
    if (!value) continue;
    if (/^https?:\/\//i.test(value)) {
      try { out.add(new URL(value).origin); } catch {}
      continue;
    }
    const host = hostRule(value);
    if (!host) continue;
    out.add(`https://${host}`);
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") out.add(`http://${host}`);
  }
  return [...out];
}

function frameHtml(policy: SandboxPolicy): string {
  const network = !!policy.network;
  const hosts = (policy.allowedHosts ?? []).map(hostRule).filter(Boolean);
  const sources = cspSources(policy.allowedHosts ?? []);
  const connectSrc = network ? sources.join(" ") || "https:" : "'none'";
  const imgSrc = network ? `data: blob: ${sources.join(" ")}`.trim() : "data: blob:";
  const flags = JSON.stringify({
    network,
    hosts,
    storage: !!policy.storage,
    dom: !!policy.dom,
    cookies: !!policy.cookies,
    clipboard: !!policy.clipboard,
    navigation: !!policy.navigation,
    allowEval: !!policy.allowEval
  });
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src ${connectSrc}; img-src ${imgSrc}; font-src data:; form-action 'none'; base-uri 'none'">
</head>
<body>
<script>
(() => {
  const FLAGS = ${flags};
  let activeId = null;
  const post = (message) => parent.postMessage({ source: '${FRAME_SOURCE}', ...message }, '*');
  const deny = (feature) => { throw new Error(feature + ' 未在沙箱策略中开启'); };
  const hostAllowed = (hostname) => {
    const host = String(hostname || '').toLowerCase();
    return FLAGS.hosts.some((item) => {
      const rule = String(item || '').toLowerCase().trim();
      if (!rule) return false;
      if (rule.startsWith('*.')) return host === rule.slice(2) || host.endsWith(rule.slice(1));
      return host === rule;
    });
  };
  if (!FLAGS.network) {
    window.fetch = () => Promise.reject(new Error('network 未在沙箱策略中开启'));
    window.XMLHttpRequest = function () { throw new Error('network 未在沙箱策略中开启'); };
    window.WebSocket = function () { throw new Error('network 未在沙箱策略中开启'); };
  } else {
    const rawFetch = window.fetch ? window.fetch.bind(window) : null;
    window.fetch = (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input && input.url ? input.url : String(input), location.href);
      if (!hostAllowed(url.hostname)) return Promise.reject(new Error('目标域名不在 allowedHosts：' + url.hostname));
      return rawFetch ? rawFetch(input, init) : Promise.reject(new Error('fetch 不可用'));
    };
    const rawOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      const target = new URL(String(url), location.href);
      if (!hostAllowed(target.hostname)) throw new Error('目标域名不在 allowedHosts：' + target.hostname);
      return rawOpen.call(this, method, url, ...rest);
    };
  }
  if (!FLAGS.storage) {
    for (const key of ['localStorage', 'sessionStorage']) {
      try { Object.defineProperty(window, key, { configurable: true, get() { return deny(key); } }); } catch {}
    }
  }
  if (!FLAGS.cookies) {
    try {
      Object.defineProperty(document, 'cookie', { configurable: true, get() { return deny('cookies'); }, set() { deny('cookies'); } });
    } catch {}
  }
  if (!FLAGS.clipboard && navigator.clipboard) {
    try { Object.defineProperty(navigator, 'clipboard', { configurable: true, get() { return deny('clipboard'); } }); } catch {}
  }
  if (!FLAGS.navigation) {
    window.open = () => deny('navigation');
  }
  window.addEventListener('error', (event) => {
    post({ type: 'log', id: activeId, level: 'error', message: String(event.message || '运行错误') });
  });
  window.addEventListener('unhandledrejection', (event) => {
    post({ type: 'log', id: activeId, level: 'error', message: String(event.reason && event.reason.message || event.reason || '未处理的异步错误') });
  });
  const serialize = (value) => {
    try { return structuredClone(value); } catch {}
    try { return JSON.parse(JSON.stringify(value)); } catch { return String(value); }
  };
  const install = (code, id) => {
    const key = '__mf_hook_' + id;
    const script = document.createElement('script');
    script.textContent = '(function(){ const module = { exports: {} }; const exports = module.exports; const require = () => { throw new Error("require 不可用"); }; const __mfEval = (text) => { throw new Error("eval 未在沙箱策略中开启"); }; const __mfFunction = function () { throw new Error("Function 未在沙箱策略中开启"); }; (function(module, exports, require, eval, Function, document, window, localStorage, sessionStorage){0;\\n' + code + '\\n' + 'module.exports.__mfInstalled = true; })(module, module.exports, require, ' + (FLAGS.allowEval ? 'eval' : '__mfEval') + ', ' + (FLAGS.allowEval ? 'Function' : '__mfFunction') + ', ' + (FLAGS.dom ? 'document' : 'undefined') + ', ' + (FLAGS.dom ? 'window' : 'undefined') + ', ' + (FLAGS.storage ? 'localStorage' : 'undefined') + ', ' + (FLAGS.storage ? 'sessionStorage' : 'undefined') + '); globalThis["' + key + '"] = module.exports; })();';
    document.head.appendChild(script);
    script.remove();
    const exported = globalThis[key];
    delete globalThis[key];
    return exported;
  };
  window.addEventListener('message', async (event) => {
    const data = event.data;
    if (!data || data.source !== '${HOST_SOURCE}' || data.type !== 'run') return;
    activeId = data.id ?? null;
    const logs = [];
    const events = [];
    const emit = (name, payload) => {
      const item = { name: String(name || ''), payload: serialize(payload ?? null) };
      events.push(item);
      post({ type: 'event', id: data.id, name: item.name, payload: item.payload });
    };
    const log = (...args) => {
      const message = args.map((item) => typeof item === 'string' ? item : (() => { try { return JSON.stringify(item); } catch { return String(item); } })()).join(' ');
      logs.push(message);
      post({ type: 'log', id: data.id, level: 'debug', message });
    };
    try {
      const exported = install(data.code, data.id);
      const entry = data.entry && data.entry !== 'default' ? exported[data.entry] : (exported.default ?? exported);
      const fn = typeof entry === 'function' ? entry : (typeof exported === 'function' ? exported : null);
      if (!fn) throw new Error('代码钩子没有导出可调用函数（需要 export default）');
      const ctx = Object.assign({}, data.context || {});
      ctx.input = data.input;
      ctx.emit = emit;
      ctx.log = log;
      ctx.now = ctx.now || new Date().toISOString();
      const timeoutMs = Math.max(50, Math.min(60000, Number(data.timeoutMs) || 3000));
      const value = await Promise.race([
        Promise.resolve(fn(ctx, data.input)),
        new Promise((_, reject) => setTimeout(() => reject(new Error('代码执行超时（' + timeoutMs + 'ms）')), timeoutMs))
      ]);
      post({ type: 'result', id: data.id, value: serialize(value ?? null), events, logs });
      activeId = null;
    } catch (error) {
      post({ type: 'error', id: data.id, message: String(error && error.message || error || '代码执行失败'), events, logs });
      activeId = null;
    }
  });
  post({ type: 'ready' });
})();
</script>
</body>
</html>`;
}

interface PendingRun {
  resolve: (value: CodeRuntimeResult) => void;
  reject: (reason: Error) => void;
  timer: number;
  events: CodeRuntimeEvent[];
  logs: string[];
  onEvent?: (event: CodeRuntimeEvent) => void;
}

export class CodeRuntime {
  private frame: HTMLIFrameElement | null = null;
  private signature = "";
  private ready: Promise<void> | null = null;
  private sequence = 0;
  private pending = new Map<number, PendingRun>();
  private disposed = false;
  private readonly onMessage = (event: MessageEvent) => this.handleMessage(event);

  private ensureFrame(policy: SandboxPolicy): Promise<void> {
    const signature = policySignature(policy);
    if (this.frame && this.signature === signature) {
      return this.ready ?? Promise.resolve();
    }
    this.resetFrame();
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("referrerpolicy", "no-referrer");
    frame.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;";
    this.frame = frame;
    this.signature = signature;
    this.ready = new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("代码沙箱启动超时")), 5000);
      const listener = (event: MessageEvent) => {
        if (event.source !== frame.contentWindow) return;
        const data = event.data as Record<string, unknown> | null;
        if (!data || data.source !== FRAME_SOURCE || data.type !== "ready") return;
        window.clearTimeout(timeout);
        window.removeEventListener("message", listener);
        resolve();
      };
      window.addEventListener("message", listener);
      frame.addEventListener("error", () => {
        window.clearTimeout(timeout);
        reject(new Error("代码沙箱加载失败"));
      }, { once: true });
    });
    window.addEventListener("message", this.onMessage);
    frame.srcdoc = frameHtml(policy);
    document.body.appendChild(frame);
    return this.ready;
  }

  private resetFrame(): void {
    if (this.frame) this.frame.remove();
    this.frame = null;
    this.ready = null;
    this.signature = "";
  }

  private handleMessage(event: MessageEvent): void {
    if (!this.frame || event.source !== this.frame.contentWindow) return;
    const data = event.data as Record<string, unknown> | null;
    if (!data || data.source !== FRAME_SOURCE) return;
    if (data.type === "event") {
      const id = Number(data.id);
      const item = this.pending.get(id);
      if (!item) return;
      const name = String(data.name ?? "");
      const payload = data.payload ?? null;
      if (item.onEvent) {
        try { item.onEvent({ name, payload }); } catch {}
      }
      return;
    }
    if (data.type === "log") {
      const id = Number(data.id);
      const item = this.pending.get(id);
      if (!item) return;
      const message = String(data.message ?? "");
      if (!message) return;
      item.logs.push(message);
      return;
    }
    if (data.type !== "result" && data.type !== "error") return;
    const id = Number(data.id);
    const item = this.pending.get(id);
    if (!item) return;
    this.pending.delete(id);
    window.clearTimeout(item.timer);
    if (data.type === "error") {
      const events = Array.isArray(data.events) ? (data.events as CodeRuntimeEvent[]) : item.events;
      item.reject(Object.assign(new Error(String(data.message ?? "代码执行失败")), { events, logs: item.logs }));
      return;
    }
    const events = Array.isArray(data.events) ? (data.events as CodeRuntimeEvent[]) : item.events;
    item.resolve({ value: data.value ?? null, events, logs: item.logs });
  }

  async run(request: CodeRuntimeRequest): Promise<CodeRuntimeResult> {
    if (this.disposed) throw new Error("代码运行时已释放");
    const policy = request.policy ?? {};
    await this.ensureFrame(policy);
    const code = await compileCodeHook(request.source);
    const id = ++this.sequence;
    const timeoutMs = Math.max(50, Math.min(60000, request.timeoutMs ?? 3000));
    return new Promise<CodeRuntimeResult>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        this.resetFrame();
        reject(new Error(`代码执行超时（${timeoutMs}ms）`));
      }, timeoutMs + 800);
      this.pending.set(id, {
        resolve,
        reject,
        timer,
        events: [],
        logs: [],
        onEvent: request.onEvent
      });
      this.frame?.contentWindow?.postMessage({
        source: HOST_SOURCE,
        type: "run",
        id,
        code,
        entry: request.entry ?? "default",
        input: plain(request.input ?? null),
        context: plain(request.context ?? {}),
        timeoutMs
      }, "*");
    });
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener("message", this.onMessage);
    for (const item of this.pending.values()) {
      window.clearTimeout(item.timer);
      item.reject(new Error("代码运行时已释放"));
    }
    this.pending.clear();
    this.resetFrame();
  }
}
