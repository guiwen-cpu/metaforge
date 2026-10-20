#!/usr/bin/env node
/**
 * LCP 出码引擎 · 完整工程组装
 *
 *   node tools/gen-project.mjs examples/leave-approval.bundle.json
 *
 * 在 codegen/<appKey>/ 下补齐可独立启动的 Spring Boot 服务、鉴权、
 * 租户事务、Docker Compose、Web 反向代理与强制 RLS 迁移。
 * 前端、CRUD、DDL 仍由 gen-entity / gen-api / gen-page 生成；本文件只做组装。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWriteStats, writeStatsText, writeTextIfChanged } from "./codegen-fs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT_ROOT = process.env.LCP_CODEGEN_OUT
  ? path.resolve(process.env.LCP_CODEGEN_OUT)
  : path.join(ROOT, "codegen");
const MANIFEST_NAME = "PROJECT.txt";
const MANIFEST_MARK = "# tools/gen-project.mjs 的产物清单";

const bad = (where, msg) => {
  throw new Error(where + "：" + msg);
};

const appPackageOf = (key) => {
  let pkg = String(key).toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (/^[0-9]/.test(pkg)) pkg = "a_" + pkg;
  return pkg;
};

const javaString = (value) => '"' + String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
const yamlString = (value) => JSON.stringify(String(value));

function loadBundle(file) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return raw.bundle ?? raw;
}

function entitiesOf(bundle) {
  const schemas = bundle.artifacts?.dataSchemas ?? [];
  const entities = [];
  for (const schema of schemas) {
    for (const entity of schema.entities ?? []) {
      entities.push({
        key: entity.key,
        table: entity.tableName ?? entity.key,
        primaryKey: entity.storage?.primaryKey ?? "id"
      });
    }
  }
  return entities;
}

function roleKeysOf(bundle) {
  return (bundle.artifacts?.roles ?? [])
    .map((role) => role.key)
    .filter((key) => typeof key === "string" && key.length > 0);
}

function roleNameOf(bundle, key) {
  const role = (bundle.artifacts?.roles ?? []).find((item) => item.key === key);
  return role?.name ?? key;
}

function renderApplication(pkg) {
  return `package dev.lcp.generated.${pkg};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/** 独立出码工程的启动类。扫描 generated 包下的 CRUD、鉴权与租户事务。 */
@SpringBootApplication
public class GeneratedApplication {

  public static void main(String[] args) {
    SpringApplication.run(GeneratedApplication.class, args);
  }
}
`;
}

function renderTenantContext() {
  return `package dev.lcp.generated.PKG.server;

/** 单次 HTTP 请求内的租户与用户上下文；由 TenantSessionFilter 写入并清理。 */
public final class TenantContext {

  private static final ThreadLocal<String> TENANT = new ThreadLocal<>();
  private static final ThreadLocal<String> USER = new ThreadLocal<>();

  private TenantContext() {}

  public static void set(String tenantId, String userId) {
    TENANT.set(tenantId);
    USER.set(userId);
  }

  public static String tenantId() {
    return TENANT.get();
  }

  public static String userId() {
    return USER.get();
  }

  public static void clear() {
    TENANT.remove();
    USER.remove();
  }
}
`;
}

function renderRequestPrincipal(pkg) {
  return `package dev.lcp.generated.${pkg}.server;

import dev.lcp.generated.${pkg}.api.support.LcpPrincipal;
import org.springframework.stereotype.Component;
import org.springframework.web.context.annotation.RequestScope;

/** 把请求线程上的上下文适配成生成 CRUD 依赖的 LcpPrincipal。 */
@Component
@RequestScope
public class RequestPrincipal implements LcpPrincipal {

  @Override
  public String tenantId() {
    String tenant = TenantContext.tenantId();
    if (tenant == null || tenant.isBlank()) {
      throw new IllegalStateException("缺少租户上下文");
    }
    return tenant;
  }

  @Override
  public String userId() {
    String user = TenantContext.userId();
    return user == null || user.isBlank() ? "anonymous" : user;
  }
}
`;
}

function renderTokenService(pkg) {
  return `package dev.lcp.generated.${pkg}.server;

import jakarta.annotation.PostConstruct;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** 独立工程的最小 HMAC 令牌：payload = tenant|user|exp，签名使用服务端密钥。 */
@Component
public class AuthTokenService {

  private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();
  private static final Base64.Decoder DECODER = Base64.getUrlDecoder();

  private final String secret;

  public AuthTokenService(@Value("\${lcp.demo.token-secret:change-me-in-production}") String secret) {
    this.secret = secret;
  }

  @PostConstruct
  void ensureSecret() {
    if (secret == null || secret.length() < 16) {
      throw new IllegalStateException("lcp.demo.token-secret 至少 16 个字符");
    }
  }

  public String issue(String tenantId, String userId, Instant expiresAt) {
    String payload = tenantId + "|" + userId + "|" + expiresAt.getEpochSecond();
    String encoded = ENCODER.encodeToString(payload.getBytes(StandardCharsets.UTF_8));
    return encoded + "." + ENCODER.encodeToString(sign(encoded));
  }

  public Session verify(String token) {
    if (token == null) return null;
    int dot = token.indexOf('.');
    if (dot <= 0) return null;
    String encoded = token.substring(0, dot);
    String signature = token.substring(dot + 1);
    byte[] expected = sign(encoded);
    byte[] actual;
    try {
      actual = DECODER.decode(signature);
    } catch (IllegalArgumentException ex) {
      return null;
    }
    if (!MessageDigest.isEqual(expected, actual)) return null;
    String payload;
    try {
      payload = new String(DECODER.decode(encoded), StandardCharsets.UTF_8);
    } catch (IllegalArgumentException ex) {
      return null;
    }
    String[] parts = payload.split("\\\\|", -1);
    if (parts.length != 3 || parts[0].isBlank() || parts[1].isBlank()) return null;
    long expires;
    try {
      expires = Long.parseLong(parts[2]);
    } catch (NumberFormatException ex) {
      return null;
    }
    if (Instant.now().getEpochSecond() >= expires) return null;
    return new Session(parts[0], parts[1], Instant.ofEpochSecond(expires));
  }

  private byte[] sign(String payload) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      return mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
    } catch (Exception ex) {
      throw new IllegalStateException("令牌签名失败", ex);
    }
  }

  public record Session(String tenantId, String userId, Instant expiresAt) {}
}
`;
}

function renderAuthController(pkg, tenantId, roles, defaultPassword) {
  const roleEntries = roles.map((role) => `Map.entry(${javaString(role.key)}, ${javaString(role.name)})`).join(",\n        ");
  return `package dev.lcp.generated.${pkg}.server;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * 独立工程的演示身份入口。账号由 Bundle 角色生成，密码统一走环境变量；
 * 生产部署应换成身份中心 / SSO，业务 CRUD 不需要改动。
 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

  private static final Map<String, String> ROLES = Map.ofEntries(
        ${roleEntries}
  );

  private final AuthTokenService tokens;
  private final String expectedTenant;
  private final String password;
  private final long ttlHours;

  public AuthController(
      AuthTokenService tokens,
      @Value("\${lcp.demo.tenant:${tenantId}}") String expectedTenant,
      @Value("\${lcp.demo.password:${defaultPassword}}") String password,
      @Value("\${lcp.demo.token-ttl-hours:12}") long ttlHours) {
    this.tokens = tokens;
    this.expectedTenant = expectedTenant;
    this.password = password;
    this.ttlHours = ttlHours;
  }

  @PostMapping("/login")
  public Map<String, Object> login(@RequestBody LoginRequest body) {
    if (body == null || body.tenant() == null || !expectedTenant.equals(body.tenant().trim())) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "租户或账号不正确");
    }
    String username = body.username() == null ? "" : body.username().trim();
    boolean known = "admin".equals(username) || ROLES.containsKey(username);
    boolean matched = body.password() != null
        && MessageDigest.isEqual(
            password.getBytes(StandardCharsets.UTF_8),
            body.password().getBytes(StandardCharsets.UTF_8));
    if (!known || !matched) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "租户或账号不正确");
    }
    Instant expiry = Instant.now().plus(ttlHours, ChronoUnit.HOURS);
    String token = tokens.issue(expectedTenant, username, expiry);
    return Map.of(
        "token", token,
        "expires_at", OffsetDateTime.now().plusHours(ttlHours).toString(),
        "user", userOf(username));
  }

  @GetMapping("/me")
  public Map<String, Object> me() {
    String user = TenantContext.userId();
    if (user == null || user.isBlank()) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "未登录");
    }
    return userOf(user);
  }

  private Map<String, Object> userOf(String username) {
    boolean admin = "admin".equals(username);
    List<String> roles = admin ? new ArrayList<>(ROLES.keySet()) : List.of(username);
    List<Map<String, String>> roleViews = new ArrayList<>();
    for (String role : roles) {
      roleViews.add(Map.of("role_key", role, "role_name", ROLES.getOrDefault(role, "管理员")));
    }
    Map<String, Object> user = new LinkedHashMap<>();
    user.put("id", username);
    user.put("username", username);
    user.put("display_name", admin ? "演示管理员" : ROLES.getOrDefault(username, username));
    user.put("dept_id", null);
    user.put("dept_name", admin ? "平台演示" : "演示部门");
    user.put("role_keys", roles);
    user.put("roles", roleViews);
    return user;
  }

  public record LoginRequest(String tenant, String username, String password) {}
}
`;
}

function renderFilter(pkg) {
  return `package dev.lcp.generated.${pkg}.server;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** 解析 Bearer 令牌；本地联调可用 X-Tenant-Id / X-User-Id，其余 API 一律 401。 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TenantSessionFilter extends OncePerRequestFilter {

  private final AuthTokenService tokens;
  private final boolean allowDevHeaders;

  public TenantSessionFilter(
      AuthTokenService tokens,
      @Value("\${lcp.demo.dev-headers:true}") boolean allowDevHeaders) {
    this.tokens = tokens;
    this.allowDevHeaders = allowDevHeaders;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    String path = request.getRequestURI();
    if (!path.startsWith("/api/")) {
      chain.doFilter(request, response);
      return;
    }
    boolean authPath = path.startsWith("/api/v1/auth/");
    String authorization = request.getHeader("Authorization");
    String token = authorization != null && authorization.startsWith("Bearer ")
        ? authorization.substring(7).trim()
        : null;
    AuthTokenService.Session session = tokens.verify(token);
    if (session != null) {
      TenantContext.set(session.tenantId(), session.userId());
    } else if (allowDevHeaders) {
      String tenant = request.getHeader("X-Tenant-Id");
      String user = request.getHeader("X-User-Id");
      if (tenant != null && !tenant.isBlank()) {
        TenantContext.set(tenant.trim(), user == null || user.isBlank() ? "dev" : user.trim());
      }
    }
    try {
      if (authPath) {
        chain.doFilter(request, response);
        return;
      }
      if (TenantContext.tenantId() == null) {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType("application/json");
        response.getWriter().write("{\\"code\\":\\"unauthorized\\",\\"message\\":\\"请先登录\\"}");
        return;
      }
      chain.doFilter(request, response);
    } finally {
      TenantContext.clear();
    }
  }
}
`;
}

function renderTenantAspect(pkg) {
  return `package dev.lcp.generated.${pkg}.server;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/** 每个 Controller 调用一个事务，并在事务内设置 lcp.tenant_id 供 RLS 使用。 */
@Aspect
@Component
public class TenantTransactionAspect {

  private final TransactionTemplate transactions;
  private final JdbcTemplate jdbc;

  public TenantTransactionAspect(TransactionTemplate transactions, JdbcTemplate jdbc) {
    this.transactions = transactions;
    this.jdbc = jdbc;
  }

  @Around("within(dev.lcp.generated..*) && @within(org.springframework.web.bind.annotation.RestController)")
  public Object around(ProceedingJoinPoint joinPoint) throws Throwable {
    String tenant = TenantContext.tenantId();
    if (tenant == null || tenant.isBlank()) return joinPoint.proceed();
    return transactions.execute(status -> {
      jdbc.queryForObject("select set_config('lcp.tenant_id', ?, true)", String.class, tenant);
      try {
        return joinPoint.proceed();
      } catch (RuntimeException | Error ex) {
        throw ex;
      } catch (Throwable ex) {
        throw new IllegalStateException(ex);
      }
    });
  }
}
`;
}

function renderPom(appKey, pkg) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.5</version>
    <relativePath/>
  </parent>
  <groupId>dev.lcp.generated</groupId>
  <artifactId>${appKey}-server</artifactId>
  <version>0.1.0</version>
  <name>${appKey} generated server</name>
  <properties>
    <java.version>21</java.version>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    <build-helper.version>3.6.0</build-helper.version>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-jdbc</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-validation</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-actuator</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-aop</artifactId>
    </dependency>
    <dependency>
      <groupId>org.postgresql</groupId>
      <artifactId>postgresql</artifactId>
      <scope>runtime</scope>
    </dependency>
  </dependencies>
  <build>
    <finalName>${pkg}-server</finalName>
    <plugins>
      <plugin>
        <groupId>org.codehaus.mojo</groupId>
        <artifactId>build-helper-maven-plugin</artifactId>
        <version>\${build-helper.version}</version>
        <executions>
          <execution>
            <id>add-generated-api-sources</id>
            <phase>generate-sources</phase>
            <goals>
              <goal>add-source</goal>
            </goals>
            <configuration>
              <sources>
                <source>\${project.basedir}/../api/src/main/java</source>
              </sources>
            </configuration>
          </execution>
        </executions>
      </plugin>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
      </plugin>
    </plugins>
  </build>
</project>
`;
}

function renderApplicationYaml(appKey, tenantId, defaultPassword) {
  return `server:
  port: 8080
  shutdown: graceful

spring:
  datasource:
    url: \${SPRING_DATASOURCE_URL:jdbc:postgresql://localhost:5433/${appKey}}
    username: \${SPRING_DATASOURCE_USERNAME:${appKey}}
    password: \${SPRING_DATASOURCE_PASSWORD:${appKey}-local-pass}
    hikari:
      maximum-pool-size: 10
  jackson:
    default-property-inclusion: non_null
    serialization:
      write-dates-as-timestamps: false

management:
  endpoints:
    web:
      exposure:
        include: health,info
  endpoint:
    health:
      probes:
        enabled: true

lcp:
  demo:
    tenant: ${tenantId}
    password: ${defaultPassword}
    token-secret: \${LCP_DEMO_TOKEN_SECRET:${appKey}-demo-token-secret-change-me}
    token-ttl-hours: \${LCP_DEMO_TOKEN_TTL_HOURS:12}
    dev-headers: \${LCP_DEMO_DEV_HEADERS:true}
`;
}

function renderServerDockerfile(pkg) {
  return `FROM maven:3.9-eclipse-temurin-21-alpine AS build
WORKDIR /src
COPY server/pom.xml server/pom.xml
RUN mvn -q -f server/pom.xml -B dependency:go-offline
COPY api api
COPY server/src server/src
RUN mvn -q -f server/pom.xml -B -DskipTests package

FROM eclipse-temurin:21-jre-alpine
RUN adduser -D -H -u 10002 app
WORKDIR /app
COPY --from=build /src/server/target/${pkg}-server.jar app.jar
USER app
EXPOSE 8080
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -Duser.timezone=Asia/Shanghai"
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
`;
}

function renderWebDockerfile() {
  return `FROM node:22-alpine AS build
WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
ARG VITE_API_BASE=""
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
`;
}

function renderNginx() {
  return `server {
  listen 8080;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  location = /healthz {
    access_log off;
    default_type text/plain;
    return 200 "ok\\n";
  }

  location /api/ {
    proxy_pass http://server:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
`;
}

function renderCompose(appKey, tenantId) {
  return `name: ${appKey}-standalone

services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${appKey}
      POSTGRES_USER: ${appKey}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-${appKey}-local-pass}
      TZ: Asia/Shanghai
    ports:
      - "\${DB_PORT:-5433}:5432"
    volumes:
      - db_data:/var/lib/postgresql/data
      - ./sql:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${appKey} -d ${appKey}"]
      interval: 5s
      timeout: 3s
      retries: 20
    restart: unless-stopped

  server:
    build:
      context: .
      dockerfile: server/Dockerfile
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://db:5432/${appKey}
      SPRING_DATASOURCE_USERNAME: ${appKey}
      SPRING_DATASOURCE_PASSWORD: \${POSTGRES_PASSWORD:-${appKey}-local-pass}
      LCP_DEMO_TENANT: ${tenantId}
      LCP_DEMO_PASSWORD: \${LCP_DEMO_PASSWORD:-demo123}
      LCP_DEMO_TOKEN_SECRET: \${LCP_DEMO_TOKEN_SECRET:-${appKey}-demo-token-secret-change-me}
      LCP_DEMO_DEV_HEADERS: \${LCP_DEMO_DEV_HEADERS:-true}
      TZ: Asia/Shanghai
    ports:
      - "\${SERVER_PORT:-8090}:8080"
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:8080/actuator/health | grep -q '\\"status\\":\\"UP\\"'"]
      interval: 10s
      timeout: 3s
      retries: 18
      start_period: 30s
    restart: unless-stopped

  web:
    build:
      context: .
      dockerfile: Dockerfile.web
    ports:
      - "\${WEB_PORT:-8091}:8080"
    depends_on:
      server:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:8080/healthz | grep -q ok"]
      interval: 10s
      timeout: 3s
      retries: 6
    restart: unless-stopped

volumes:
  db_data: {}
`;
}

function renderForceRls(entities) {
  const lines = [
    "-- 由 tools/gen-project.mjs 生成，勿手改。",
    "-- 独立工程使用同一个数据库用户建表与运行，因此必须 FORCE RLS；",
    "-- 租户变量由 server 的 TenantTransactionAspect 在每个请求事务内设置。",
    ""
  ];
  for (const entity of entities) {
    lines.push(`alter table "${entity.table}" force row level security;`);
  }
  return lines.join("\n") + "\n";
}

function renderRunDoc(bundle, appKey, roles, entities) {
  const name = bundle.app?.name ?? appKey;
  const tenantId = bundle.tenantId ?? "tenant_demo_school";
  const roleList = ["admin（全部角色）", ...roles.map((role) => `${role.key}（${role.name}）`)].join("、");
  const tableList = entities.map((entity) => "`" + entity.table + "`").join("、");
  return `# ${name} · 独立出码工程

本目录由 \`tools/gen-project.mjs\` 组装，包含前端、Spring Boot CRUD 服务、
PostgreSQL 迁移脚本与 Docker Compose。业务 Schema 变更后按顺序重跑：

\`\`\`powershell
node tools/gen-entity.mjs examples/leave-approval.bundle.json
node tools/gen-api.mjs examples/leave-approval.bundle.json
node tools/gen-page.mjs examples/leave-approval.bundle.json
node tools/gen-project.mjs examples/leave-approval.bundle.json
\`\`\`

## 一键启动

\`\`\`powershell
docker compose up -d --build
\`\`\`

- Web：http://localhost:8091
- API：http://localhost:8090
- 健康检查：http://localhost:8090/actuator/health
- PostgreSQL：localhost:5433

## 演示账号

租户固定为 \`${tenantId}\`，密码默认 \`demo123\`（\`LCP_DEMO_PASSWORD\` 可覆盖）。
账号：${roleList}。

账号由 Bundle 角色生成，只用于独立工程联调；接入正式身份中心后替换
\`AuthController\` 与令牌校验即可，生成 CRUD 无需改动。

## 数据与迁移

- 首次启动由 PostgreSQL 执行 \`sql/\` 下的脚本：扩展、逐表 DDL、RLS。
- \`sql/95_force_rls.sql\` 强制表 owner 也受 RLS 约束；服务端每个请求事务内设置 \`lcp.tenant_id\`。
- 表：${tableList}。
- 迁移脚本使用 \`create index concurrently\`，必须像 \`docker-entrypoint-initdb.d\` 一样逐文件、非事务执行。

## 本地开发

\`\`\`powershell
# 只起数据库
docker compose up -d db

# 启动后端
cd server
mvn spring-boot:run

# 启动前端（Vite 代理到 8080）
cd ../web
npm run dev
\`\`\`

## 安全边界

- 演示令牌是 HMAC 签名的无状态令牌，密钥来自 \`LCP_DEMO_TOKEN_SECRET\`，生产必须替换。
- \`LCP_DEMO_DEV_HEADERS=true\` 允许 \`X-Tenant-Id\` / \`X-User-Id\` 兜底；生产必须关闭。
- CRUD 表名、列名与排序白名单来自生成期常量，请求参数不参与 SQL 标识符拼接。
`;
}

function manifestText(files) {
  const rels = [...files.keys()].sort();
  return [
    MANIFEST_MARK + "。每行一个路径（相对应用目录）。",
    "# 下一轮只删除本清单里有、下一轮不再产出的文件；api/、web/、sql/ 的其余产物不归本生成器所有。",
    `# 产物数：${rels.length}（不含本清单）`,
    ...rels,
    ""
  ].join("\n");
}

function readManifest(appDir) {
  const file = path.join(appDir, MANIFEST_NAME);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function removeStale(appDir, keep) {
  const removed = [];
  for (const rel of readManifest(appDir)) {
    if (keep.has(rel) || rel === MANIFEST_NAME) continue;
    const full = path.join(appDir, rel);
    if (!fs.existsSync(full)) continue;
    fs.rmSync(full, { force: true });
    removed.push(rel);
  }
  return removed;
}

function pruneEmptyDirs(root) {
  if (!fs.existsSync(root)) return;
  const dirs = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
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

function writeFiles(appDir, files, stats) {
  for (const [rel, text] of files) {
    const target = path.join(appDir, rel);
    writeTextIfChanged(target, text, stats);
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("gen-project：请传 bundle 路径。");
    process.exit(2);
  }
  const stats = createWriteStats();
  for (const file of args) {
    if (!fs.existsSync(file)) bad(file, "文件不存在");
    const bundle = loadBundle(file);
    const appKey = bundle.app?.key;
    if (!appKey) bad(file, "bundle.app.key 不能为空");
    const pkg = appPackageOf(appKey);
    const tenantId = bundle.tenantId ?? "tenant_demo_school";
    const roles = roleKeysOf(bundle).map((key) => ({ key, name: roleNameOf(bundle, key) }));
    if (roles.length === 0) bad(file, "Bundle 至少需要一个角色，独立工程用它生成演示账号");
    const entities = entitiesOf(bundle);
    if (entities.length === 0) bad(file, "Bundle 没有 DataSchema 实体，无法生成 CRUD 工程");
    const apiDir = path.join(OUT_ROOT, appKey, "api", "src", "main", "java");
    const webDir = path.join(OUT_ROOT, appKey, "web");
    const sqlDir = path.join(OUT_ROOT, appKey, "sql");
    if (!fs.existsSync(apiDir)) bad(appKey, "缺少 api 源码：先跑 gen-api");
    if (!fs.existsSync(webDir)) bad(appKey, "缺少 web 源码：先跑 gen-page");
    if (!fs.existsSync(sqlDir)) bad(appKey, "缺少 sql：先跑 gen-entity");

    const serverDir = path.join(OUT_ROOT, appKey, "server");
    const files = new Map();
    files.set(`server/pom.xml`, renderPom(appKey, pkg));
    files.set(`server/Dockerfile`, renderServerDockerfile(pkg));
    files.set(`server/src/main/resources/application.yml`, renderApplicationYaml(appKey, tenantId, "demo123"));
    files.set(`server/src/main/java/dev/lcp/generated/${pkg}/GeneratedApplication.java`, renderApplication(pkg));
    files.set(`server/src/main/java/dev/lcp/generated/${pkg}/server/TenantContext.java`, renderTenantContext().replaceAll("PKG", pkg));
    files.set(`server/src/main/java/dev/lcp/generated/${pkg}/server/RequestPrincipal.java`, renderRequestPrincipal(pkg));
    files.set(`server/src/main/java/dev/lcp/generated/${pkg}/server/AuthTokenService.java`, renderTokenService(pkg));
    files.set(`server/src/main/java/dev/lcp/generated/${pkg}/server/AuthController.java`, renderAuthController(pkg, tenantId, roles, "demo123"));
    files.set(`server/src/main/java/dev/lcp/generated/${pkg}/server/TenantSessionFilter.java`, renderFilter(pkg));
    files.set(`server/src/main/java/dev/lcp/generated/${pkg}/server/TenantTransactionAspect.java`, renderTenantAspect(pkg));
    files.set(`Dockerfile.web`, renderWebDockerfile());
    files.set(`.dockerignore`, [
      "web/node_modules",
      "web/dist",
      "server/target",
      "*.log",
      ".git",
      ""
    ].join("\n"));
    files.set(`nginx.conf`, renderNginx());
    files.set(`docker-compose.yml`, renderCompose(appKey, tenantId));
    files.set(`sql/95_force_rls.sql`, renderForceRls(entities));
    files.set(`RUN.md`, renderRunDoc(bundle, appKey, roles, entities));
    const appDir = path.join(OUT_ROOT, appKey);
    const removed = removeStale(appDir, new Set(files.keys()));
    writeFiles(appDir, files, stats);
    writeTextIfChanged(path.join(appDir, MANIFEST_NAME), manifestText(files), stats);
    pruneEmptyDirs(appDir);
    console.log(`gen-project 完成 → ${path.join(OUT_ROOT, appKey)}`);
    console.log(`  服务端 ${serverDir}`);
    console.log(`  Compose ${path.join(OUT_ROOT, appKey, "docker-compose.yml")}`);
    console.log(`  实体 ${entities.length} 个 · 演示账号 ${roles.length + 1} 个`);
    if (removed.length) console.log(`  清理过期文件 ${removed.length} 个`);
  }
  console.log(`  增量写入：${writeStatsText(stats)}`);
}

try {
  main();
} catch (err) {
  console.error("gen-project 失败：" + err.message);
  process.exit(1);
}
