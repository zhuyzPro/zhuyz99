#!/usr/bin/env node

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");
const { DatabaseSync } = require("node:sqlite");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 4899);
const ROOT_DIR = path.resolve(__dirname);
const ADMIN_DIR = path.join(ROOT_DIR, "admin");
const DB_PATH = process.env.DB_PATH || path.join(ROOT_DIR, "wayfind.sqlite");
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const COOKIE_SECURE = process.env.COOKIE_SECURE !== "false";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 1024 * 1024;
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
    url TEXT NOT NULL,
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS links_category_position ON links(category, position);
`);

const categoryInsert = db.prepare(`
  INSERT OR IGNORE INTO categories (id, name, description, position, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const categoryNow = new Date().toISOString();
DEFAULT_CATEGORIES.forEach((category, position) => {
  categoryInsert.run(category.id, category.name, category.description, position, categoryNow, categoryNow);
});

if (Number(db.prepare("SELECT COUNT(*) AS count FROM links").get().count) === 0) {
  const insert = db.prepare(`
    INSERT INTO links (id, category, title, mark, tone, status, description, note, url, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const now = new Date().toISOString();
  const positions = new Map(DEFAULT_CATEGORIES.map((category) => [category.name, 0]));
  for (const [category, title, mark, tone, status, description, note, url] of SEED_LINKS) {
    insert.run(crypto.randomUUID(), category, title, mark, tone, status, description, note, url, positions.get(category), now, now);
    positions.set(category, positions.get(category) + 1);
  }
}

const sessions = new Map();
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

function verifyPassword(password, encoded) {
  try {
    const [, saltText, keyText] = String(encoded).split("$");
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(keyText, "base64url");
    const actual = crypto.scryptSync(password, salt, expected.length, { N: 16384, r: 8, p: 1 });
    return expected.length > 0 && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

const PASSWORD_HASH = configuredPasswordHash();

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
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
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
  if (!origin) return true;
  const allowed = new Set([
    process.env.ADMIN_ORIGIN || "https://zhuyz.art",
    "http://127.0.0.1:4899",
    "http://localhost:4899",
  ]);
  return allowed.has(origin);
}

function parseCookies(header) {
  return String(header || "").split(";").reduce((cookies, item) => {
    const index = item.indexOf("=");
    if (index > 0) cookies[item.slice(0, index).trim()] = decodeURIComponent(item.slice(index + 1).trim());
    return cookies;
  }, {});
}

function signSession(id) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(id).digest("base64url");
}

function createSession(username) {
  const id = crypto.randomBytes(32).toString("base64url");
  sessions.set(id, { username, expiresAt: Date.now() + SESSION_TTL_MS });
  return `${id}.${signSession(id)}`;
}

function getSession(req) {
  const token = parseCookies(req.headers.cookie).wayfind_session;
  if (!token) return null;
  const [id, signature] = token.split(".");
  const expectedSignature = signSession(id);
  if (!id || !signature || signature.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return null;
  const session = sessions.get(id);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(id);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return { id, ...session };
}

function sessionCookie(token) {
  const secure = COOKIE_SECURE ? "; Secure" : "";
  return `wayfind_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure}`;
}

function clearSessionCookie() {
  return "wayfind_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

function requireSession(req, res) {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { error: "登录已失效，请重新登录" });
    return null;
  }
  return session;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("请求内容过大"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(Object.assign(new Error("请求不是有效 JSON"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function textField(value, name, { required = true, max = 240 } = {}) {
  const text = String(value ?? "").trim();
  if (required && !text) throw Object.assign(new Error(`${name}不能为空`), { status: 400 });
  if (text.length > max) throw Object.assign(new Error(`${name}不能超过${max}个字符`), { status: 400 });
  return text;
}

function getCategories() {
  return db.prepare("SELECT id, name, description, position FROM categories ORDER BY position, name COLLATE NOCASE").all();
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
    url: row.url,
    position: row.position,
    updatedAt: row.updated_at,
  };
}

function getAllLinks() {
  return db.prepare("SELECT links.* FROM links LEFT JOIN categories ON categories.name = links.category ORDER BY categories.position, links.position, links.title COLLATE NOCASE").all().map(toLink);
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
  const address = req.headers["x-real-ip"] || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const record = loginAttempts.get(address) || { count: 0, resetAt: now + 15 * 60 * 1000 };
  if (record.resetAt <= now) { record.count = 0; record.resetAt = now + 15 * 60 * 1000; }
  if (record.count >= 10) return sendJson(res, 429, { error: "尝试次数过多，请稍后再试" });
  return readJson(req).then((body) => {
    record.count += 1;
    loginAttempts.set(address, record);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (username !== ADMIN_USERNAME || !verifyPassword(password, PASSWORD_HASH)) return sendJson(res, 401, { error: "用户名或密码不正确" });
    loginAttempts.delete(address);
    sendJson(res, 200, { ok: true, username }, { "Set-Cookie": sessionCookie(createSession(username)) });
  }).catch((error) => sendJson(res, error.status || 400, { error: error.message }));
}

function handleReorder(req, res) {
  if (!isAllowedAdminOrigin(req)) return sendJson(res, 403, { error: "来源不被允许" });
  return readJson(req).then((body) => {
    const category = textField(body.category, "分类", { max: 40 });
    if (!getCategoryNames().has(category) || !Array.isArray(body.ids) || body.ids.length === 0) throw Object.assign(new Error("排序数据不正确"), { status: 400 });
    const current = db.prepare("SELECT id FROM links WHERE category = ? ORDER BY position").all(category).map((row) => row.id);
    if (current.length !== body.ids.length || new Set(current).size !== new Set(body.ids).size || !current.every((id) => body.ids.includes(id))) throw Object.assign(new Error("排序数据与当前分类不一致"), { status: 400 });
    db.exec("BEGIN");
    try {
      const update = db.prepare("UPDATE links SET position = ?, updated_at = ? WHERE id = ?");
      const now = new Date().toISOString();
      body.ids.forEach((id, index) => update.run(index, now, id));
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    sendJson(res, 200, { ok: true, links: getAllLinks() });
  }).catch((error) => sendJson(res, error.status || 400, { error: error.message }));
}

function handleAdminCategory(req, res) {
  if (!isAllowedAdminOrigin(req)) return sendJson(res, 403, { error: "来源不被允许" });
  return readJson(req).then((body) => {
    const name = textField(body.name, "分类名称", { max: 40 });
    const description = textField(body.description, "分类说明", { required: false, max: 120 }) || "自定义入口集合";
    const duplicate = db.prepare("SELECT id FROM categories WHERE name = ? COLLATE NOCASE").get(name);
    if (duplicate) throw Object.assign(new Error("这个分类已经存在"), { status: 409 });
    const now = new Date().toISOString();
    const position = Number(db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS position FROM categories").get().position);
    const category = { id: `category-${crypto.randomUUID()}`, name, description, position, created_at: now, updated_at: now };
    db.prepare("INSERT INTO categories (id, name, description, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(category.id, category.name, category.description, category.position, category.created_at, category.updated_at);
    return sendJson(res, 201, { category: { id: category.id, name: category.name, description: category.description, position: category.position } });
  }).catch((error) => sendJson(res, error.status || 400, { error: error.message }));
}

function handleAdminCategoryDelete(req, res, id) {
  if (!isAllowedAdminOrigin(req)) return sendJson(res, 403, { error: "来源不被允许" });
  return readJson(req).then((body) => {
    const category = db.prepare("SELECT id, name FROM categories WHERE id = ?").get(id);
    if (!category) return sendJson(res, 404, { error: "分类不存在" });
    const categories = getCategories();
    if (categories.length <= 1) return sendJson(res, 400, { error: "至少需要保留一个分类" });
    const count = Number(db.prepare("SELECT COUNT(*) AS count FROM links WHERE category = ?").get(category.name).count);
    const targetId = String(body.targetCategoryId || "").trim();
    const target = targetId ? categories.find((item) => item.id === targetId) : null;
    if (targetId && (!target || target.id === category.id)) return sendJson(res, 400, { error: "移动目标分类不正确" });
    if (count > 0 && !target) return sendJson(res, 409, { error: `该分类还有 ${count} 个入口，请选择要移动到的分类` });

    const now = new Date().toISOString();
    db.exec("BEGIN");
    try {
      if (count > 0) {
        const startPosition = nextPosition(target.name);
        const update = db.prepare("UPDATE links SET category = ?, position = ?, updated_at = ? WHERE id = ?");
        const links = db.prepare("SELECT id FROM links WHERE category = ? ORDER BY position, title COLLATE NOCASE").all(category.name);
        links.forEach((link, index) => update.run(target.name, startPosition + index, now, link.id));
      }
      db.prepare("DELETE FROM categories WHERE id = ?").run(id);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return sendJson(res, 200, { ok: true, categories: getCategories(), links: getAllLinks() });
  }).catch((error) => sendJson(res, error.status || 400, { error: error.message }));
}

function handleAdminLink(req, res, method, id) {
  if (!isAllowedAdminOrigin(req)) return sendJson(res, 403, { error: "来源不被允许" });
  return readJson(req).then((body) => {
    if (method === "POST") {
      const link = normalizeLink(body);
      const now = new Date().toISOString();
      const created = { id: crypto.randomUUID(), ...link, position: nextPosition(link.category), created_at: now, updated_at: now };
      db.prepare(`INSERT INTO links (id, category, title, mark, tone, status, description, note, url, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(created.id, created.category, created.title, created.mark, created.tone, created.status, created.description, created.note, created.url, created.position, created.created_at, created.updated_at);
      return sendJson(res, 201, { link: toLink(created) });
    }
    const existing = getLink(id);
    if (!existing) return sendJson(res, 404, { error: "入口不存在" });
    if (method === "DELETE") {
      db.prepare("DELETE FROM links WHERE id = ?").run(id);
      return sendJson(res, 200, { ok: true });
    }
    const link = normalizeLink(body, existing);
    const now = new Date().toISOString();
    const position = link.category === existing.category ? existing.position : nextPosition(link.category);
    db.prepare(`UPDATE links SET category = ?, title = ?, mark = ?, tone = ?, status = ?, description = ?, note = ?, url = ?, position = ?, updated_at = ? WHERE id = ?`)
      .run(link.category, link.title, link.mark, link.tone, link.status, link.description, link.note, link.url, position, now, id);
    return sendJson(res, 200, { link: toLink({ ...existing, ...link, id, position, updated_at: now }) });
  }).catch((error) => sendJson(res, error.status || 400, { error: error.message }));
}

function serveAdminFile(req, res, pathname) {
  const relative = pathname === "/admin/" ? "index.html" : pathname.slice("/admin/".length);
  if (!relative || relative.includes("..") || relative.includes("\\")) return sendText(res, 404, "Not found\n");
  const file = path.join(ADMIN_DIR, relative);
  if (!file.startsWith(ADMIN_DIR + path.sep)) return sendText(res, 404, "Not found\n");
  try {
    const body = fs.readFileSync(file);
    const type = file.endsWith(".html") ? "text/html; charset=utf-8" : file.endsWith(".css") ? "text/css; charset=utf-8" : "application/javascript; charset=utf-8";
    sendText(res, 200, body, type);
  } catch { sendText(res, 404, "Not found\n"); }
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = requestUrl.pathname;
  if (pathname.startsWith("/api/")) applyCors(req, res);
  if (req.method === "OPTIONS" && pathname.startsWith("/api/")) return res.writeHead(204).end();
  if (pathname === "/api/health" && req.method === "GET") return sendJson(res, 200, { ok: true, service: "wayfind-admin" });
  if (pathname === "/api/public/links" && req.method === "GET") return sendJson(res, 200, { categories: getCategories(), links: getAllLinks() });
  if (pathname === "/api/auth/login" && req.method === "POST") return handleLogin(req, res);
  if (pathname === "/api/auth/logout" && req.method === "POST") {
    const session = getSession(req);
    if (session) sessions.delete(session.id);
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
  }
  if (pathname === "/api/auth/session" && req.method === "GET") {
    const session = getSession(req);
    return sendJson(res, 200, session ? { authenticated: true, username: session.username } : { authenticated: false });
  }
  if (pathname === "/api/admin/links" && req.method === "GET") {
    if (!requireSession(req, res)) return;
    return sendJson(res, 200, { categories: getCategories(), links: getAllLinks() });
  }
  if (pathname === "/api/admin/categories" && req.method === "POST") {
    if (!requireSession(req, res)) return;
    return handleAdminCategory(req, res);
  }
  const categoryMatch = pathname.match(/^\/api\/admin\/categories\/([^/]+)$/);
  if (categoryMatch && req.method === "DELETE") {
    if (!requireSession(req, res)) return;
    return handleAdminCategoryDelete(req, res, categoryMatch[1]);
  }
  if (pathname === "/api/admin/links" && req.method === "POST") {
    if (!requireSession(req, res)) return;
    return handleAdminLink(req, res, "POST");
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
  if (pathname === "/admin" && req.method === "GET") {
    res.writeHead(301, { Location: "/admin/" });
    return res.end();
  }
  if (pathname.startsWith("/admin/") && req.method === "GET") return serveAdminFile(req, res, pathname);
  sendText(res, 404, "Not found\n");
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
