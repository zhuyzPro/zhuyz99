#!/usr/bin/env node

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const net = require("node:net");
const { URL } = require("node:url");
const { DatabaseSync } = require("node:sqlite");

const NODE_ENV = process.env.NODE_ENV || "development";
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 4899);
const ROOT_DIR = path.resolve(__dirname);
const ADMIN_DIR = path.join(ROOT_DIR, "admin");
const ADMIN_FILES = new Map([
  ["index.html", "text/html; charset=utf-8"],
  ["admin.css", "text/css; charset=utf-8"],
  ["admin.js", "application/javascript; charset=utf-8"],
  ["lucide-mini.js", "application/javascript; charset=utf-8"],
]);
const FRONTEND_DIR = path.resolve(ROOT_DIR, "..");
const FRONTEND_FILES = new Map([
  ["index.html", "text/html; charset=utf-8"],
  ["styles.css", "text/css; charset=utf-8"],
  ["app.js", "application/javascript; charset=utf-8"],
  ["lucide-mini.js", "application/javascript; charset=utf-8"],
  ["favicon.svg", "image/svg+xml; charset=utf-8"],
]);
const DB_PATH = process.env.DB_PATH || (NODE_ENV === "production"
  ? "/var/lib/wayfind-admin/wayfind.sqlite"
  : path.join(ROOT_DIR, "wayfind.sqlite"));
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const COOKIE_SECURE = process.env.COOKIE_SECURE !== "false";
const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_SESSION_TTL_MS = 5 * 60 * 1000;
const MAX_SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const DEFAULT_COOKIE_PATH = NODE_ENV === "production" ? "/wayfind-api/" : "/api/";

function configuredSessionSecret(value) {
  const secret = String(value || "");
  if (secret) return secret;
  if (NODE_ENV === "production") throw new Error("SESSION_SECRET must be set in production");
  return crypto.randomBytes(32).toString("hex");
}

function configuredCookiePath(value) {
  const cookiePath = String(value || DEFAULT_COOKIE_PATH).trim();
  if (!/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(cookiePath)) {
    throw new Error("COOKIE_PATH must be an absolute path ending in '/'");
  }
  return cookiePath;
}

function configuredOptionalCookiePath(value) {
  if (value === undefined || value === "") return "";
  return configuredCookiePath(value);
}

function configuredSessionTtl(value) {
  if (value === undefined || value === "") return DEFAULT_SESSION_TTL_MS;
  const ttl = Number(value);
  if (!Number.isSafeInteger(ttl) || ttl < MIN_SESSION_TTL_MS || ttl > MAX_SESSION_TTL_MS) {
    throw new Error(`SESSION_TTL_MS must be an integer between ${MIN_SESSION_TTL_MS} and ${MAX_SESSION_TTL_MS}`);
  }
  return ttl;
}

const SESSION_SECRET = configuredSessionSecret(process.env.SESSION_SECRET);
const COOKIE_PATH = configuredCookiePath(process.env.COOKIE_PATH);
const COOKIE_DIRECT_PATH = configuredOptionalCookiePath(process.env.COOKIE_DIRECT_PATH);
const COOKIE_DIRECT_SECURE = process.env.COOKIE_DIRECT_SECURE !== "false";
const SESSION_TTL_MS = configuredSessionTtl(process.env.SESSION_TTL_MS);
const SESSION_TTL_SECONDS = Math.floor(SESSION_TTL_MS / 1000);
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_GITHUB_RESPONSE_BYTES = 2 * 1024 * 1024;
const GITHUB_API_URL = process.env.GITHUB_API_URL || "https://api.github.com";
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || "zhuyzPro/zhuyz99";
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";
const GITHUB_FILE_PATH = process.env.GITHUB_FILE_PATH || "navigation-data.json";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const MAX_LOGIN_ATTEMPT_RECORDS = 10_000;
const MAX_SESSION_RECORDS = 10_000;
const ADMIN_ORIGINS = new Set([
  process.env.ADMIN_ORIGIN || "https://zhuyz.art",
  "http://127.0.0.1:4899",
  "http://localhost:4899",
]);
const PUBLIC_ORIGINS = new Set(
  [
    process.env.PUBLIC_ORIGINS,
    process.env.PUBLIC_ORIGIN,
    "https://zhuyzpro.github.io",
    "https://zhuyz.cloud",
    "http://127.0.0.1:4173",
    "http://localhost:4173",
  ]
    .flatMap((value) => String(value || "").split(","))
    .map((origin) => origin.trim())
    .filter(Boolean),
);

const DEFAULT_CATEGORIES = [
  { id: "relay", name: "中转站", description: "模型聚合、API 与中转服务" },
  { id: "other", name: "其他", description: "日常使用的工具与网站" },
];
const TONES = new Set(["coral", "teal", "yellow", "blue", "purple", "orange", "rose", "lime", "indigo"]);

let publishInProgress = false;

const SEED_LINKS = [
  ["中转站", "OpenRouter", "OR", "coral", "推荐", "多模型统一入口，按需切换模型和供应商。", "模型聚合 · API", "https://openrouter.ai/"],
  ["中转站", "硅基流动", "硅", "teal", "常用", "国产模型与推理 API，适合快速接入测试。", "模型服务 · 国内", "https://cloud.siliconflow.cn/"],
  ["中转站", "Poe", "PO", "yellow", "常用", "集中使用不同模型和机器人，适合日常对话。", "多模型 · 对话", "https://poe.com/"],
  ["中转站", "Together AI", "TA", "blue", "API", "开源模型推理与微调服务，开发入口清晰。", "推理 · 开发", "https://api.together.xyz/"],
  ["中转站", "Replicate", "RP", "purple", "模型", "把社区模型变成 API，适合快速验证想法。", "模型托管 · API", "https://replicate.com/"],
  ["中转站", "Hugging Face", "HF", "yellow", "社区", "模型、数据集和 Spaces 的开放社区。", "开源 · 模型", "https://huggingface.co/"],
  ["其他", "GitHub", "GH", "purple", "代码", "仓库、Issue、Pull Request 和开源项目。", "开发 · 协作", "https://github.com/"],
  ["其他", "ChatGPT", "AI", "teal", "常用", "写作、分析与快速提问，从这里开始工作。", "对话 · 写作", "https://chatgpt.com/"],
  ["其他", "Claude", "CL", "coral", "常用", "长文本阅读和结构化思考，适合复杂任务。", "阅读 · 分析", "https://claude.ai/"],
  ["其他", "Perplexity", "PX", "blue", "检索", "带来源的网页搜索，把答案和出处放在一起。", "搜索 · 研究", "https://www.perplexity.ai/"],
  ["其他", "Figma", "FG", "coral", "设计", "界面、原型和组件库的协作工作台。", "UI · 原型", "https://www.figma.com/"],
  ["其他", "Notion", "N", "yellow", "工作台", "项目、笔记和资料库集中管理。", "笔记 · 项目", "https://www.notion.so/"],
  ["其他", "Vercel", "VC", "teal", "部署", "预览部署、日志和项目状态，一次看清。", "部署 · 项目", "https://vercel.com/dashboard"],
  ["其他", "少数派", "少", "blue", "中文", "工具、效率和数字生活的中文内容精选。", "效率 · 阅读", "https://sspai.com/"],
];

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    position INTEGER NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS links (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    mark TEXT NOT NULL,
    tone TEXT NOT NULL,
    status TEXT NOT NULL,
    description TEXT NOT NULL,
    note TEXT NOT NULL,
    admin_note TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL,
    position INTEGER NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS links_category_position ON links(category, position);
  CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions(expires_at);
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn("categories", "enabled", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("links", "enabled", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("links", "admin_note", "TEXT NOT NULL DEFAULT ''");

let lastUpdatedAtMilliseconds = 0;

function nextUpdatedAt() {
  // `updated_at` is also the optimistic-concurrency token. Keep it unique
  // even when two synchronous writes happen in the same clock millisecond.
  lastUpdatedAtMilliseconds = Math.max(Date.now(), lastUpdatedAtMilliseconds + 1);
  return new Date(lastUpdatedAtMilliseconds).toISOString();
}

function initializeNavigationData() {
  let transactionOpen = false;
  try {
    db.exec("BEGIN IMMEDIATE");
    transactionOpen = true;
    const initialized = db.prepare("SELECT value FROM settings WHERE key = ?").get("navigation_initialized_at");
    if (!initialized) {
      const categoryCount = Number(db.prepare("SELECT COUNT(*) AS count FROM categories").get().count);
      const linkCount = Number(db.prepare("SELECT COUNT(*) AS count FROM links").get().count);
      const now = nextUpdatedAt();

      if (categoryCount === 0 && linkCount === 0) {
        const insertCategory = db.prepare(`
          INSERT INTO categories (id, name, description, position, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        DEFAULT_CATEGORIES.forEach((category, position) => {
          insertCategory.run(category.id, category.name, category.description, position, now, now);
        });

        const insertLink = db.prepare(`
          INSERT INTO links (id, category, title, mark, tone, status, description, note, url, position, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const positions = new Map(DEFAULT_CATEGORIES.map((category) => [category.name, 0]));
        for (const [category, title, mark, tone, status, description, note, url] of SEED_LINKS) {
          insertLink.run(crypto.randomUUID(), category, title, mark, tone, status, description, note, url, positions.get(category), now, now);
          positions.set(category, positions.get(category) + 1);
        }
      }

      db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)")
        .run("navigation_initialized_at", now, now);
    }
    db.exec("COMMIT");
  } catch (error) {
    if (transactionOpen) db.exec("ROLLBACK");
    throw error;
  }
}

initializeNavigationData();

const loginAttempts = new Map();

function configuredPasswordHash() {
  if (ADMIN_PASSWORD_HASH) return ADMIN_PASSWORD_HASH;
  if (ADMIN_PASSWORD) return hashPassword(ADMIN_PASSWORD);
  throw new Error("Set ADMIN_PASSWORD_HASH or ADMIN_PASSWORD before starting the server");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

function hashPasswordAsync(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, 32, { N: 16384, r: 8, p: 1 }, (error, key) => {
      if (error) return reject(error);
      resolve(`scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`);
    });
  });
}

function verifyPassword(password, encoded) {
  try {
    const [algorithm, saltText, keyText, extra] = String(encoded).split("$");
    if (algorithm !== "scrypt" || !saltText || !keyText || extra !== undefined) return Promise.resolve(false);

    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(keyText, "base64url");
    if (salt.length === 0 || expected.length === 0) return Promise.resolve(false);

    return new Promise((resolve) => {
      crypto.scrypt(password, salt, expected.length, { N: 16384, r: 8, p: 1 }, (error, actual) => {
        resolve(!error && actual.length === expected.length && crypto.timingSafeEqual(actual, expected));
      });
    });
  } catch {
    return Promise.resolve(false);
  }
}

const storedPassword = db.prepare("SELECT value FROM settings WHERE key = ?").get("admin_password_hash");
let passwordHash = storedPassword?.value || configuredPasswordHash();
if (!storedPassword) {
  db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)").run("admin_password_hash", passwordHash, new Date().toISOString());
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  res.end(body);
}

function sendText(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "Referrer-Policy": "same-origin",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

function sendRequestError(res, error) {
  const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 ? error.status : 500;
  if (status === 500) console.error(error);
  if (res.headersSent || res.writableEnded) {
    res.destroy();
    return;
  }
  sendJson(res, status, { error: status === 500 ? "服务器暂时无法处理请求" : error.message });
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && PUBLIC_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type, X-CSRF-Token");
    res.setHeader("Vary", "Origin");
  }
}

function isAllowedAdminOrigin(req) {
  const origin = req.headers.origin;
  return typeof origin === "string" && ADMIN_ORIGINS.has(origin);
}

function parseCookies(header) {
  return String(header || "").split(";").reduce((cookies, item) => {
    const index = item.indexOf("=");
    if (index > 0) {
      const name = item.slice(0, index).trim();
      if (!name) return cookies;
      try {
        // Browsers list the most-specific cookie path first. Keep it when a
        // legacy root-path cookie shares the same name during migration.
        if (!Object.hasOwn(cookies, name)) cookies[name] = decodeURIComponent(item.slice(index + 1).trim());
      } catch {
        // Ignore malformed cookie values instead of failing the request.
      }
    }
    return cookies;
  }, Object.create(null));
}

function pruneLoginAttempts(now) {
  for (const [address, record] of loginAttempts) {
    if (record.resetAt <= now) loginAttempts.delete(address);
  }
  while (loginAttempts.size >= MAX_LOGIN_ATTEMPT_RECORDS) {
    loginAttempts.delete(loginAttempts.keys().next().value);
  }
}

function pruneExpiredSessions(now) {
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
  const count = Number(db.prepare("SELECT COUNT(*) AS count FROM sessions").get().count);
  const overflow = count - MAX_SESSION_RECORDS + 1;
  if (overflow > 0) {
    db.prepare("DELETE FROM sessions WHERE id IN (SELECT id FROM sessions ORDER BY created_at ASC LIMIT ?)").run(overflow);
  }
}

function clientAddress(req) {
  const socketAddress = req.socket.remoteAddress || "unknown";
  const isLoopback = socketAddress === "127.0.0.1" || socketAddress === "::1" || socketAddress === "::ffff:127.0.0.1";
  if (!isLoopback) return socketAddress;
  const realIp = req.headers["x-real-ip"];
  const candidate = Array.isArray(realIp) ? realIp[0] : String(realIp || "").trim();
  return net.isIP(candidate) ? candidate : socketAddress;
}

function signSession(id) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(id).digest("base64url");
}

function createSession(username) {
  const now = Date.now();
  pruneExpiredSessions(now);
  const id = crypto.randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO sessions (id, username, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(id, username, now + SESSION_TTL_MS, now);
  return `${id}.${signSession(id)}`;
}

function getSession(req) {
  const token = parseCookies(req.headers.cookie).wayfind_session;
  if (typeof token !== "string") return null;
  const [id, signature, ...rest] = token.split(".");
  if (!id || !signature || rest.length > 0) return null;
  const expectedSignature = Buffer.from(signSession(id), "base64url");
  const actualSignature = Buffer.from(signature, "base64url");
  if (actualSignature.length !== expectedSignature.length || !crypto.timingSafeEqual(actualSignature, expectedSignature)) return null;
  const session = db.prepare("SELECT id, username, expires_at AS expiresAt FROM sessions WHERE id = ?").get(id);
  const now = Date.now();
  if (!session || Number(session.expiresAt) <= now) {
    if (session) db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    return null;
  }
  const expiresAt = now + SESSION_TTL_MS;
  db.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?").run(expiresAt, id);
  return { id, username: session.username, expiresAt };
}

function sessionCookie(token, cookiePath = COOKIE_PATH, secureEnabled = COOKIE_SECURE) {
  const secure = secureEnabled ? "; Secure" : "";
  return `wayfind_session=${encodeURIComponent(token)}; Path=${cookiePath}; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

function clearSessionCookie(cookiePath = COOKIE_PATH, secureEnabled = COOKIE_SECURE) {
  const secure = secureEnabled ? "; Secure" : "";
  return `wayfind_session=; Path=${cookiePath}; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function sessionCookies(token) {
  const cookies = [sessionCookie(token)];
  if (COOKIE_DIRECT_PATH && COOKIE_DIRECT_PATH !== COOKIE_PATH) {
    cookies.push(sessionCookie(token, COOKIE_DIRECT_PATH, COOKIE_DIRECT_SECURE));
  }
  // Old deployments used Path=/. Clear that broad cookie while issuing the
  // scoped replacement so existing logins migrate without a forced logout.
  if (COOKIE_PATH !== "/") cookies.push(clearSessionCookie("/"));
  return cookies;
}

function clearedSessionCookies() {
  const cookies = [clearSessionCookie()];
  if (COOKIE_DIRECT_PATH && COOKIE_DIRECT_PATH !== COOKIE_PATH) {
    cookies.push(clearSessionCookie(COOKIE_DIRECT_PATH, COOKIE_DIRECT_SECURE));
  }
  if (COOKIE_PATH !== "/") cookies.push(clearSessionCookie("/"));
  return cookies;
}

function requireSession(req, res) {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { error: "登录已失效，请重新登录" }, { "Set-Cookie": clearedSessionCookies() });
    return null;
  }
  // Refresh the browser cookie while the account is actively being used.
  res.setHeader("Set-Cookie", sessionCookies(`${session.id}.${signSession(session.id)}`));
  return session;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    req.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        fail(Object.assign(new Error("请求内容过大"), { status: 413 }));
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          throw Object.assign(new Error("请求体必须是 JSON 对象"), { status: 400 });
        }
        settled = true;
        resolve(body);
      } catch (error) {
        fail(error?.status ? error : Object.assign(new Error("请求不是有效 JSON"), { status: 400 }));
      }
    });
    req.on("error", fail);
  });
}

function textField(value, name, { required = true, max = 240 } = {}) {
  if (value === undefined || value === null) {
    if (required) throw Object.assign(new Error(`${name}不能为空`), { status: 400 });
    return "";
  }
  if (typeof value !== "string") throw Object.assign(new Error(`${name}必须是文本`), { status: 400 });
  const text = value.trim();
  if (required && !text) throw Object.assign(new Error(`${name}不能为空`), { status: 400 });
  if (text.length > max) throw Object.assign(new Error(`${name}不能超过${max}个字符`), { status: 400 });
  return text;
}

function enabledField(value) {
  if (typeof value !== "boolean") throw Object.assign(new Error("启用状态必须是布尔值"), { status: 400 });
  return value;
}

function updatedAtField(value) {
  return textField(value, "版本信息", { max: 96 });
}

function staleUpdateError() {
  return Object.assign(new Error("内容已被其他会话更新，请刷新后重试"), { status: 409 });
}

function requireSingleChange(result) {
  if (Number(result.changes) !== 1) throw staleUpdateError();
}

function toCategory(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    position: row.position,
    enabled: Number(row.enabled) === 1,
    updatedAt: row.updated_at ?? row.updatedAt,
  };
}

function getCategories() {
  return db.prepare("SELECT id, name, description, position, enabled, updated_at FROM categories ORDER BY position, name COLLATE NOCASE").all().map(toCategory);
}

function getPublicCategories() {
  return db.prepare("SELECT id, name, description, position, enabled, updated_at FROM categories WHERE enabled = 1 ORDER BY position, name COLLATE NOCASE").all().map(toCategory);
}

function getCategory(id) {
  const row = db.prepare("SELECT id, name, description, position, enabled, updated_at FROM categories WHERE id = ?").get(id);
  return row ? toCategory(row) : null;
}

function getCategoryNames() {
  return new Set(getCategories().map((category) => category.name));
}

function normalizeLink(input, existing = {}) {
  const category = textField(input.category ?? existing.category, "分类", { max: 40 });
  const url = textField(input.url ?? existing.url, "地址", { max: 2048 });
  let parsed;
  try { parsed = new URL(url); } catch { throw Object.assign(new Error("地址格式不正确"), { status: 400 }); }
  if (!["http:", "https:"].includes(parsed.protocol)) throw Object.assign(new Error("地址只能使用 http 或 https"), { status: 400 });
  if (parsed.username || parsed.password) throw Object.assign(new Error("地址不能包含账号或密码"), { status: 400 });
  if (!getCategoryNames().has(category)) throw Object.assign(new Error("分类不存在，请先新增分类"), { status: 400 });
  const tone = textField(input.tone ?? existing.tone ?? "teal", "色调", { max: 12 });
  if (!TONES.has(tone)) throw Object.assign(new Error("色调不受支持"), { status: 400 });
  return {
    category,
    title: textField(input.title ?? existing.title, "名称", { max: 80 }),
    mark: textField(input.mark ?? existing.mark, "缩写", { max: 12 }),
    tone,
    status: textField(input.status ?? existing.status, "状态", { max: 24 }),
    description: textField(input.description ?? existing.description, "简介", { max: 240 }),
    note: textField(input.note ?? existing.note, "说明", { max: 80 }),
    adminNote: textField(input.adminNote ?? existing.adminNote, "后台备注", { required: false, max: 500 }),
    url: parsed.toString(),
  };
}

function toLink(row) {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    mark: row.mark,
    tone: row.tone,
    status: row.status,
    description: row.description,
    note: row.note,
    adminNote: row.admin_note ?? row.adminNote ?? "",
    url: row.url,
    position: row.position,
    enabled: Number(row.enabled) === 1,
    updatedAt: row.updated_at,
  };
}

function getAllLinks() {
  return db.prepare("SELECT links.* FROM links LEFT JOIN categories ON categories.name = links.category ORDER BY categories.position, links.position, links.title COLLATE NOCASE").all().map(toLink);
}

function getPublicLinks() {
  return db.prepare("SELECT links.id, links.category, links.title, links.mark, links.tone, links.status, links.description, links.note, links.url, links.position, links.enabled, links.updated_at FROM links INNER JOIN categories ON categories.name = links.category WHERE links.enabled = 1 AND categories.enabled = 1 ORDER BY categories.position, links.position, links.title COLLATE NOCASE").all().map(toPublicLink);
}

function toPublicLink(row) {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    mark: row.mark,
    tone: row.tone,
    status: row.status,
    description: row.description,
    note: row.note,
    url: row.url,
    position: row.position,
    updatedAt: row.updated_at,
  };
}

function publicNavigationSnapshot() {
  return {
    categories: getPublicCategories(),
    links: getPublicLinks(),
  };
}

function validateGitHubPublishConfig() {
  if (!GITHUB_TOKEN) {
    throw Object.assign(new Error("服务器尚未配置 GitHub 发布凭据"), { status: 503 });
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(GITHUB_REPOSITORY)) {
    throw Object.assign(new Error("GitHub 仓库配置不正确"), { status: 500 });
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(GITHUB_FILE_PATH)
    || GITHUB_FILE_PATH.startsWith("/")
    || GITHUB_FILE_PATH.endsWith("/")
    || GITHUB_FILE_PATH.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw Object.assign(new Error("GitHub 发布文件路径配置不正确"), { status: 500 });
  }
  if (!/^[^\r\n]{1,200}$/.test(GITHUB_BRANCH)) {
    throw Object.assign(new Error("GitHub 分支配置不正确"), { status: 500 });
  }
  let apiBase;
  try {
    apiBase = new URL(GITHUB_API_URL);
  } catch {
    throw Object.assign(new Error("GitHub API 地址配置不正确"), { status: 500 });
  }
  if (!["http:", "https:"].includes(apiBase.protocol)) {
    throw Object.assign(new Error("GitHub API 地址配置不正确"), { status: 500 });
  }
}

function githubContentsUrl() {
  const repositoryPath = GITHUB_REPOSITORY.split("/").map(encodeURIComponent).join("/");
  const filePath = GITHUB_FILE_PATH.split("/").map(encodeURIComponent).join("/");
  const base = GITHUB_API_URL.endsWith("/") ? GITHUB_API_URL : `${GITHUB_API_URL}/`;
  return new URL(`repos/${repositoryPath}/contents/${filePath}`, base);
}

async function githubRequest(url, options = {}, allowedStatuses = []) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_GITHUB_RESPONSE_BYTES) {
      throw Object.assign(new Error("GitHub 响应内容过大"), { status: 502 });
    }
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_GITHUB_RESPONSE_BYTES) {
      throw Object.assign(new Error("GitHub 响应内容过大"), { status: 502 });
    }
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!response.ok && !allowedStatuses.includes(response.status)) {
      const detail = typeof data?.message === "string" ? data.message : `HTTP ${response.status}`;
      const error = Object.assign(new Error(`GitHub 发布失败：${detail}`), { status: response.status === 409 ? 409 : 502 });
      throw error;
    }
    return { status: response.status, data };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw Object.assign(new Error("连接 GitHub 超时，请稍后重试"), { status: 504 });
    }
    if (!error?.status && error?.name === "TypeError") {
      throw Object.assign(new Error("无法连接 GitHub，请检查服务器网络"), { status: 502 });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function decodeGitHubContent(value) {
  if (typeof value !== "string") return null;
  try {
    return Buffer.from(value.replace(/\s/g, ""), "base64").toString("utf8");
  } catch {
    return null;
  }
}

async function publishNavigationSnapshot() {
  validateGitHubPublishConfig();
  if (publishInProgress) {
    throw Object.assign(new Error("已有发布任务正在进行，请稍后再试"), { status: 409 });
  }
  publishInProgress = true;
  try {
    const snapshot = publicNavigationSnapshot();
    const content = `${JSON.stringify(snapshot, null, 2)}\n`;
    const fileUrl = githubContentsUrl();
    const lookupUrl = new URL(fileUrl);
    lookupUrl.searchParams.set("ref", GITHUB_BRANCH);
    const existing = await githubRequest(lookupUrl, {}, [404]);
    const existingContent = decodeGitHubContent(existing.data?.content);
    if (existing.status === 200 && existingContent === content) {
      return { ok: true, changed: false, publishedAt: new Date().toISOString(), repository: GITHUB_REPOSITORY, branch: GITHUB_BRANCH, path: GITHUB_FILE_PATH };
    }

    const payload = {
      message: "Update navigation data",
      content: Buffer.from(content, "utf8").toString("base64"),
      branch: GITHUB_BRANCH,
    };
    if (existing.status === 200 && typeof existing.data?.sha === "string" && existing.data.sha) payload.sha = existing.data.sha;
    const result = await githubRequest(fileUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, [200, 201]);
    const commit = result.data?.commit;
    return {
      ok: true,
      changed: true,
      publishedAt: new Date().toISOString(),
      repository: GITHUB_REPOSITORY,
      branch: GITHUB_BRANCH,
      path: GITHUB_FILE_PATH,
      commitSha: typeof commit?.sha === "string" ? commit.sha : undefined,
      commitUrl: typeof commit?.html_url === "string" ? commit.html_url : undefined,
    };
  } finally {
    publishInProgress = false;
  }
}

function getLink(id) {
  const row = db.prepare("SELECT * FROM links WHERE id = ?").get(id);
  return row ? toLink(row) : null;
}

function nextPosition(category) {
  const row = db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS position FROM links WHERE category = ?").get(category);
  return Number(row.position);
}

function handleLogin(req, res) {
  if (!isAllowedAdminOrigin(req)) return sendJson(res, 403, { error: "来源不被允许" });
  const address = clientAddress(req);
  const now = Date.now();
  pruneLoginAttempts(now);
  const record = loginAttempts.get(address) || { count: 0, resetAt: now + 15 * 60 * 1000 };
  if (record.resetAt <= now) { record.count = 0; record.resetAt = now + 15 * 60 * 1000; }
  if (record.count >= 10) return sendJson(res, 429, { error: "尝试次数过多，请稍后再试" });
  return readJson(req).then(async (body) => {
    record.count += 1;
    loginAttempts.set(address, record);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (username !== ADMIN_USERNAME || !(await verifyPassword(password, passwordHash))) return sendJson(res, 401, { error: "用户名或密码不正确" });
    loginAttempts.delete(address);
    sendJson(res, 200, { ok: true, username }, { "Set-Cookie": sessionCookies(createSession(username)) });
  }).catch((error) => sendRequestError(res, error));
}

function handlePasswordChange(req, res) {
  if (!isAllowedAdminOrigin(req)) return sendJson(res, 403, { error: "来源不被允许" });
  return readJson(req).then(async (body) => {
    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");
    const confirmPassword = String(body.confirmPassword || "");
    const currentPasswordHash = passwordHash;
    if (!(await verifyPassword(currentPassword, currentPasswordHash))) throw Object.assign(new Error("当前密码不正确"), { status: 400 });
    if (newPassword.length < 12) throw Object.assign(new Error("新密码至少需要 12 个字符"), { status: 400 });
    if (newPassword.length > 200) throw Object.assign(new Error("新密码不能超过 200 个字符"), { status: 400 });
    if (newPassword !== confirmPassword) throw Object.assign(new Error("两次输入的新密码不一致"), { status: 400 });

    const nextPasswordHash = await hashPasswordAsync(newPassword);
    let transactionOpen = false;
    try {
      db.exec("BEGIN IMMEDIATE");
      transactionOpen = true;
      const update = db.prepare("UPDATE settings SET value = ?, updated_at = ? WHERE key = ? AND value = ?")
        .run(nextPasswordHash, nextUpdatedAt(), "admin_password_hash", currentPasswordHash);
      if (Number(update.changes) !== 1) {
        throw Object.assign(new Error("密码已被其他会话修改，请重新登录"), { status: 409 });
      }
      db.prepare("DELETE FROM sessions").run();
      db.exec("COMMIT");
      transactionOpen = false;
    } catch (error) {
      if (transactionOpen) db.exec("ROLLBACK");
      throw error;
    }
    passwordHash = nextPasswordHash;
    return sendJson(res, 200, { ok: true, reauthenticate: true }, { "Set-Cookie": clearedSessionCookies() });
  }).catch((error) => sendRequestError(res, error));
}

function handleReorder(req, res) {
  if (!isAllowedAdminOrigin(req)) return sendJson(res, 403, { error: "来源不被允许" });
  return readJson(req).then((body) => {
    const categoryId = textField(body.categoryId, "分类标识", { max: 80 });
    const categoryUpdatedAt = updatedAtField(body.categoryUpdatedAt);
    if (!Array.isArray(body.items) || body.items.length === 0) throw Object.assign(new Error("排序数据不正确"), { status: 400 });
    const requested = body.items.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw Object.assign(new Error("排序数据不正确"), { status: 400 });
      return { id: textField(item.id, "入口标识", { max: 80 }), updatedAt: updatedAtField(item.updatedAt) };
    });
    const requestedVersions = new Map(requested.map((item) => [item.id, item.updatedAt]));
    if (requestedVersions.size !== requested.length) throw Object.assign(new Error("排序数据包含重复入口"), { status: 400 });

    let transactionOpen = false;
    try {
      db.exec("BEGIN IMMEDIATE");
      transactionOpen = true;
      const category = db.prepare("SELECT name FROM categories WHERE id = ? AND updated_at = ?").get(categoryId, categoryUpdatedAt);
      if (!category) {
        const exists = db.prepare("SELECT id FROM categories WHERE id = ?").get(categoryId);
        if (!exists) throw Object.assign(new Error("分类不存在"), { status: 404 });
        throw staleUpdateError();
      }
      const current = db.prepare("SELECT id, updated_at FROM links WHERE category = ? ORDER BY position").all(category.name);
      if (current.length !== requested.length || !current.every((row) => requestedVersions.get(row.id) === row.updated_at)) throw staleUpdateError();
      const update = db.prepare("UPDATE links SET position = ?, updated_at = ? WHERE id = ? AND updated_at = ?");
      requested.forEach((item, index) => requireSingleChange(update.run(index, nextUpdatedAt(), item.id, item.updatedAt)));
      db.exec("COMMIT");
      transactionOpen = false;
    } catch (error) {
      if (transactionOpen) db.exec("ROLLBACK");
      throw error;
    }
    sendJson(res, 200, { ok: true, links: getAllLinks() });
  }).catch((error) => sendRequestError(res, error));
}

function handleAdminCategory(req, res) {
  if (!isAllowedAdminOrigin(req)) return sendJson(res, 403, { error: "来源不被允许" });
  return readJson(req).then((body) => {
    const name = textField(body.name, "分类名称", { max: 40 });
    const description = textField(body.description, "分类说明", { required: false, max: 120 }) || "自定义入口集合";
    const duplicate = db.prepare("SELECT id FROM categories WHERE name = ? COLLATE NOCASE").get(name);
    if (duplicate) throw Object.assign(new Error("这个分类已经存在"), { status: 409 });
    const now = nextUpdatedAt();
    const position = Number(db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS position FROM categories").get().position);
    const category = { id: `category-${crypto.randomUUID()}`, name, description, position, enabled: true, created_at: now, updated_at: now };
    db.prepare("INSERT INTO categories (id, name, description, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(category.id, category.name, category.description, category.position, category.created_at, category.updated_at);
    return sendJson(res, 201, { category: toCategory(category) });
  }).catch((error) => sendRequestError(res, error));
}

function handleAdminCategoryUpdate(req, res, id) {
  if (!isAllowedAdminOrigin(req)) return sendJson(res, 403, { error: "来源不被允许" });
  return readJson(req).then((body) => {
    const category = db.prepare("SELECT id, name, description, position, enabled, updated_at FROM categories WHERE id = ?").get(id);
    if (!category) return sendJson(res, 404, { error: "分类不存在" });
    const updatedAt = updatedAtField(body.updatedAt);

    const name = textField(body.name, "分类名称", { max: 40 });
    const description = textField(body.description, "分类说明", { required: false, max: 120 }) || "自定义入口集合";
    const duplicate = db.prepare("SELECT id FROM categories WHERE name = ? COLLATE NOCASE AND id != ?").get(name, id);
    if (duplicate) throw Object.assign(new Error("这个分类已经存在"), { status: 409 });

    let transactionOpen = false;
    try {
      db.exec("BEGIN IMMEDIATE");
      transactionOpen = true;
      const now = nextUpdatedAt();
      requireSingleChange(db.prepare("UPDATE categories SET name = ?, description = ?, updated_at = ? WHERE id = ? AND updated_at = ?")
        .run(name, description, now, id, updatedAt));
      if (name !== category.name) {
        db.prepare("UPDATE links SET category = ?, updated_at = ? WHERE category = ?").run(name, nextUpdatedAt(), category.name);
      }
      db.exec("COMMIT");
      transactionOpen = false;
    } catch (error) {
      if (transactionOpen) db.exec("ROLLBACK");
      throw error;
    }

    return sendJson(res, 200, {
      category: getCategory(id),
      links: getAllLinks(),
    });
  }).catch((error) => sendRequestError(res, error));
}

function handleAdminCategoryEnabled(req, res, id) {
  if (!isAllowedAdminOrigin(req)) return sendJson(res, 403, { error: "来源不被允许" });
  return readJson(req).then((body) => {
    const enabled = enabledField(body.enabled);
    const category = db.prepare("SELECT id FROM categories WHERE id = ?").get(id);
    if (!category) return sendJson(res, 404, { error: "分类不存在" });
    const updatedAt = updatedAtField(body.updatedAt);
    const now = nextUpdatedAt();
    requireSingleChange(db.prepare("UPDATE categories SET enabled = ?, updated_at = ? WHERE id = ? AND updated_at = ?")
      .run(enabled ? 1 : 0, now, id, updatedAt));
    return sendJson(res, 200, { category: getCategory(id) });
  }).catch((error) => sendRequestError(res, error));
}

function handleAdminCategoryDelete(req, res, id) {
  if (!isAllowedAdminOrigin(req)) return sendJson(res, 403, { error: "来源不被允许" });
  return readJson(req).then((body) => {
    const category = db.prepare("SELECT id, name, updated_at FROM categories WHERE id = ?").get(id);
    if (!category) return sendJson(res, 404, { error: "分类不存在" });
    const updatedAt = updatedAtField(body.updatedAt);
    const categories = getCategories();
    if (categories.length <= 1) return sendJson(res, 400, { error: "至少需要保留一个分类" });
    const count = Number(db.prepare("SELECT COUNT(*) AS count FROM links WHERE category = ?").get(category.name).count);
    const targetId = String(body.targetCategoryId || "").trim();
    const target = targetId ? categories.find((item) => item.id === targetId) : null;
    if (targetId && (!target || target.id === category.id)) return sendJson(res, 400, { error: "移动目标分类不正确" });
    if (count > 0 && !target) return sendJson(res, 409, { error: `该分类还有 ${count} 个入口，请选择要移动到的分类` });

    let transactionOpen = false;
    try {
      db.exec("BEGIN IMMEDIATE");
      transactionOpen = true;
      if (count > 0) {
        const startPosition = nextPosition(target.name);
        const update = db.prepare("UPDATE links SET category = ?, position = ?, updated_at = ? WHERE id = ?");
        const links = db.prepare("SELECT id FROM links WHERE category = ? ORDER BY position, title COLLATE NOCASE").all(category.name);
        links.forEach((link, index) => update.run(target.name, startPosition + index, nextUpdatedAt(), link.id));
      }
      requireSingleChange(db.prepare("DELETE FROM categories WHERE id = ? AND updated_at = ?").run(id, updatedAt));
      db.exec("COMMIT");
      transactionOpen = false;
    } catch (error) {
      if (transactionOpen) db.exec("ROLLBACK");
      throw error;
    }
    return sendJson(res, 200, { ok: true, categories: getCategories(), links: getAllLinks() });
  }).catch((error) => sendRequestError(res, error));
}

function handleAdminLink(req, res, method, id) {
  if (!isAllowedAdminOrigin(req)) return sendJson(res, 403, { error: "来源不被允许" });
  return readJson(req).then((body) => {
    if (method === "POST") {
      const link = normalizeLink(body);
      const now = nextUpdatedAt();
      const created = { id: crypto.randomUUID(), ...link, position: nextPosition(link.category), enabled: true, created_at: now, updated_at: now };
      db.prepare(`INSERT INTO links (id, category, title, mark, tone, status, description, note, admin_note, url, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(created.id, created.category, created.title, created.mark, created.tone, created.status, created.description, created.note, created.adminNote, created.url, created.position, created.created_at, created.updated_at);
      return sendJson(res, 201, { link: toLink(created) });
    }
    const existing = getLink(id);
    if (!existing) return sendJson(res, 404, { error: "入口不存在" });
    const updatedAt = updatedAtField(body.updatedAt);
    if (method === "DELETE") {
      requireSingleChange(db.prepare("DELETE FROM links WHERE id = ? AND updated_at = ?").run(id, updatedAt));
      return sendJson(res, 200, { ok: true });
    }
    const link = normalizeLink(body, existing);
    const now = nextUpdatedAt();
    const position = link.category === existing.category ? existing.position : nextPosition(link.category);
    requireSingleChange(db.prepare(`UPDATE links SET category = ?, title = ?, mark = ?, tone = ?, status = ?, description = ?, note = ?, admin_note = ?, url = ?, position = ?, updated_at = ? WHERE id = ? AND updated_at = ?`)
      .run(link.category, link.title, link.mark, link.tone, link.status, link.description, link.note, link.adminNote, link.url, position, now, id, updatedAt));
    return sendJson(res, 200, { link: getLink(id) });
  }).catch((error) => sendRequestError(res, error));
}

function handleAdminLinkEnabled(req, res, id) {
  if (!isAllowedAdminOrigin(req)) return sendJson(res, 403, { error: "来源不被允许" });
  return readJson(req).then((body) => {
    const enabled = enabledField(body.enabled);
    const existing = getLink(id);
    if (!existing) return sendJson(res, 404, { error: "入口不存在" });
    const updatedAt = updatedAtField(body.updatedAt);
    const now = nextUpdatedAt();
    requireSingleChange(db.prepare("UPDATE links SET enabled = ?, updated_at = ? WHERE id = ? AND updated_at = ?")
      .run(enabled ? 1 : 0, now, id, updatedAt));
    return sendJson(res, 200, { link: getLink(id) });
  }).catch((error) => sendRequestError(res, error));
}

function serveAdminFile(req, res, pathname) {
  const relative = pathname === "/admin/" ? "index.html" : pathname.slice("/admin/".length);
  const contentType = ADMIN_FILES.get(relative);
  if (!contentType) return sendText(res, 404, "Not found\n");
  const file = path.join(ADMIN_DIR, relative);
  try {
    const body = fs.readFileSync(file);
    sendText(res, 200, body, contentType);
  } catch { sendText(res, 404, "Not found\n"); }
}

function serveFrontendFile(req, res, pathname) {
  const relative = pathname === "/preview/" ? "index.html" : pathname.slice("/preview/".length);
  const contentType = FRONTEND_FILES.get(relative);
  if (!contentType) return sendText(res, 404, "Not found\n");
  const file = path.join(FRONTEND_DIR, relative);
  try {
    const body = fs.readFileSync(file);
    sendText(res, 200, body, contentType);
  } catch { sendText(res, 404, "Not found\n"); }
}

const server = http.createServer((req, res) => {
  try {
    const requestUrl = new URL(req.url || "/", "http://localhost");
    const pathname = requestUrl.pathname;
  if (pathname.startsWith("/api/")) applyCors(req, res);
  if (req.method === "OPTIONS" && pathname.startsWith("/api/")) return res.writeHead(204).end();
  if (pathname === "/api/health" && req.method === "GET") return sendJson(res, 200, { ok: true, service: "wayfind-admin" });
  if (pathname === "/api/public/links" && req.method === "GET") return sendJson(res, 200, { categories: getPublicCategories(), links: getPublicLinks() });
  if (pathname === "/api/auth/login" && req.method === "POST") return handleLogin(req, res);
  if (pathname === "/api/auth/password" && req.method === "POST") {
    const session = requireSession(req, res);
    if (!session) return;
    return handlePasswordChange(req, res);
  }
  if (pathname === "/api/auth/logout" && req.method === "POST") {
    if (!isAllowedAdminOrigin(req)) return sendJson(res, 403, { error: "来源不被允许" });
    const session = getSession(req);
    if (session) db.prepare("DELETE FROM sessions WHERE id = ?").run(session.id);
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": clearedSessionCookies() });
  }
  if (pathname === "/api/auth/session" && req.method === "GET") {
    const session = getSession(req);
    if (session) res.setHeader("Set-Cookie", sessionCookies(`${session.id}.${signSession(session.id)}`));
    return sendJson(res, 200, session ? { authenticated: true, username: session.username } : { authenticated: false }, session ? {} : { "Set-Cookie": clearedSessionCookies() });
  }
  if (pathname === "/api/admin/links" && req.method === "GET") {
    if (!requireSession(req, res)) return;
    return sendJson(res, 200, { categories: getCategories(), links: getAllLinks() });
  }
  if (pathname === "/api/admin/categories" && req.method === "POST") {
    if (!requireSession(req, res)) return;
    return handleAdminCategory(req, res);
  }
  const categoryEnabledMatch = pathname.match(/^\/api\/admin\/categories\/([^/]+)\/enabled$/);
  if (categoryEnabledMatch && req.method === "PATCH") {
    if (!requireSession(req, res)) return;
    return handleAdminCategoryEnabled(req, res, categoryEnabledMatch[1]);
  }
  const categoryMatch = pathname.match(/^\/api\/admin\/categories\/([^/]+)$/);
  if (categoryMatch && req.method === "PUT") {
    if (!requireSession(req, res)) return;
    return handleAdminCategoryUpdate(req, res, categoryMatch[1]);
  }
  if (categoryMatch && req.method === "DELETE") {
    if (!requireSession(req, res)) return;
    return handleAdminCategoryDelete(req, res, categoryMatch[1]);
  }
  if (pathname === "/api/admin/links" && req.method === "POST") {
    if (!requireSession(req, res)) return;
    return handleAdminLink(req, res, "POST");
  }
  const linkEnabledMatch = pathname.match(/^\/api\/admin\/links\/([^/]+)\/enabled$/);
  if (linkEnabledMatch && req.method === "PATCH") {
    if (!requireSession(req, res)) return;
    return handleAdminLinkEnabled(req, res, linkEnabledMatch[1]);
  }
  const linkMatch = pathname.match(/^\/api\/admin\/links\/([^/]+)$/);
  if (linkMatch && ["PUT", "DELETE"].includes(req.method)) {
    if (!requireSession(req, res)) return;
    return req.method === "DELETE" ? handleAdminLink(req, res, "DELETE", linkMatch[1]) : handleAdminLink(req, res, "PUT", linkMatch[1]);
  }
  if (pathname === "/api/admin/reorder" && req.method === "POST") {
    if (!requireSession(req, res)) return;
    return handleReorder(req, res);
  }
  if (pathname === "/api/admin/publish" && req.method === "POST") {
    if (!requireSession(req, res)) return;
    return publishNavigationSnapshot()
      .then((result) => sendJson(res, 200, result))
      .catch((error) => sendRequestError(res, error));
  }
  if (pathname === "/preview" && req.method === "GET") {
    res.writeHead(301, { Location: "/preview/" });
    return res.end();
  }
  if (pathname === "/preview/navigation-data.json" && req.method === "GET") {
    return sendJson(res, 200, publicNavigationSnapshot());
  }
  if (pathname.startsWith("/preview/") && req.method === "GET") return serveFrontendFile(req, res, pathname);
  if (pathname === "/admin" && req.method === "GET") {
    res.writeHead(301, { Location: "/admin/" });
    return res.end();
  }
  if (pathname.startsWith("/admin/") && req.method === "GET") return serveAdminFile(req, res, pathname);
  sendText(res, 404, "Not found\n");
  } catch (error) {
    sendRequestError(res, error);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`wayfind-admin listening on http://${HOST}:${PORT}`);
});

function close() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
