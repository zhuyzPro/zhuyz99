const API_BASE = window.location.pathname.startsWith("/wayfind-admin") ? "/wayfind-api" : "/api";
const state = { categories: [], links: [], editingId: null };

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  refreshIcons();
  start();
});

async function start() {
  try {
    const session = await request("/auth/session");
    if (session.authenticated) return showDashboard(session.username);
  } catch {
    showLoginError("后台暂时无法连接，请稍后再试。");
    return;
  }
  showLogin();
}

function bindEvents() {
  document.querySelector("#login-form").addEventListener("submit", login);
  document.querySelector("#logout-button").addEventListener("click", logout);
  document.querySelector("#add-button").addEventListener("click", () => openDialog());
  document.querySelector("#category-panels").addEventListener("click", handlePanelClick);
  document.querySelector("#link-form").addEventListener("submit", saveLink);
  document.querySelector("#close-dialog").addEventListener("click", closeDialog);
  document.querySelector("#cancel-dialog").addEventListener("click", closeDialog);
}

async function login(event) {
  event.preventDefault();
  hide("#login-error");
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const button = formElement.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const session = await request("/auth/login", { method: "POST", body: { username: form.get("username"), password: form.get("password") } });
    formElement.reset();
    showDashboard(session.username);
  } catch (error) {
    showLoginError(error.message);
  } finally {
    button.disabled = false;
  }
}

async function logout() {
  await request("/auth/logout", { method: "POST" }).catch(() => {});
  showLogin();
}

async function showDashboard(username) {
  document.querySelector("#session-user").textContent = username;
  document.querySelector("#session-user").hidden = false;
  document.querySelector("#logout-button").hidden = false;
  document.querySelector("#login-view").hidden = true;
  document.querySelector("#dashboard-view").hidden = false;
  try {
    const data = await request("/admin/links");
    state.categories = data.categories || [];
    state.links = data.links || [];
    render();
  } catch (error) {
    showFlash(error.message, "error");
  }
}

function showLogin() {
  document.querySelector("#session-user").hidden = true;
  document.querySelector("#logout-button").hidden = true;
  document.querySelector("#dashboard-view").hidden = true;
  document.querySelector("#login-view").hidden = false;
  document.querySelector("#login-username").focus();
}

function render() {
  const container = document.querySelector("#category-panels");
  container.innerHTML = state.categories.map((category, index) => {
    const links = state.links.filter((link) => link.category === category.name).sort((a, b) => a.position - b.position);
    return `<section class="category-panel" aria-labelledby="category-${index}">
      <div class="category-heading"><div><span class="section-number">${String(index + 1).padStart(2, "0")}</span><div><h2 id="category-${index}">${escapeHtml(category.name)}</h2><p>${escapeHtml(category.description)}</p></div></div><span class="category-count">${links.length} 个入口</span></div>
      <div class="link-list">${links.length ? links.map((link, linkIndex) => renderLink(link, linkIndex, links.length)).join("") : `<p class="empty-state">这个分类还没有入口。</p>`}</div>
    </section>`;
  }).join("");
  refreshIcons();
}

function renderLink(link, index, total) {
  return `<article class="link-row" data-id="${escapeAttribute(link.id)}">
    <span class="row-mark tone-${escapeAttribute(link.tone)}">${escapeHtml(link.mark)}</span>
    <div class="row-main"><strong>${escapeHtml(link.title)}</strong><span>${escapeHtml(link.url)}</span></div>
    <span class="row-status">${escapeHtml(link.status)}</span>
    <div class="row-actions">
      <button class="icon-button" type="button" data-action="up" title="上移" aria-label="上移" ${index === 0 ? "disabled" : ""}><i data-lucide="arrow-up" aria-hidden="true"></i></button>
      <button class="icon-button" type="button" data-action="down" title="下移" aria-label="下移" ${index === total - 1 ? "disabled" : ""}><i data-lucide="arrow-down" aria-hidden="true"></i></button>
      <button class="icon-button" type="button" data-action="edit" title="编辑" aria-label="编辑"><i data-lucide="pencil" aria-hidden="true"></i></button>
      <button class="icon-button danger" type="button" data-action="delete" title="删除" aria-label="删除"><i data-lucide="trash-2" aria-hidden="true"></i></button>
    </div>
  </article>`;
}

async function handlePanelClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button || button.disabled) return;
  const row = button.closest("[data-id]");
  const link = state.links.find((item) => item.id === row?.dataset.id);
  if (!link) return;
  if (button.dataset.action === "edit") return openDialog(link);
  if (button.dataset.action === "delete") {
    if (!window.confirm(`确定删除“${link.title}”吗？`)) return;
    try {
      await request(`/admin/links/${encodeURIComponent(link.id)}`, { method: "DELETE" });
      state.links = state.links.filter((item) => item.id !== link.id);
      render();
      showFlash("入口已删除。", "success");
    } catch (error) { showFlash(error.message, "error"); }
    return;
  }
  const categoryLinks = state.links.filter((item) => item.category === link.category).sort((a, b) => a.position - b.position);
  const current = categoryLinks.findIndex((item) => item.id === link.id);
  const next = button.dataset.action === "up" ? current - 1 : current + 1;
  if (next < 0 || next >= categoryLinks.length) return;
  [categoryLinks[current], categoryLinks[next]] = [categoryLinks[next], categoryLinks[current]];
  try {
    await request("/admin/reorder", { method: "POST", body: { category: link.category, ids: categoryLinks.map((item) => item.id) } });
    categoryLinks.forEach((item, position) => { item.position = position; });
    render();
    showFlash("排序已保存。", "success");
  } catch (error) { showFlash(error.message, "error"); }
}

function openDialog(link = null) {
  state.editingId = link?.id || null;
  document.querySelector("#dialog-title").textContent = link ? "编辑入口" : "新增入口";
  const values = link || { category: "中转站", title: "", url: "", mark: "", status: "常用", tone: "teal", description: "", note: "" };
  ["title", "url", "category", "mark", "status", "tone", "description", "note"].forEach((field) => {
    document.querySelector(`#field-${field}`).value = values[field] || "";
  });
  hide("#dialog-error");
  const dialog = document.querySelector("#link-dialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  document.querySelector("#field-title").focus();
}

function closeDialog() {
  const dialog = document.querySelector("#link-dialog");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

async function saveLink(event) {
  event.preventDefault();
  hide("#dialog-error");
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const body = Object.fromEntries(form.entries());
  const button = formElement.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const path = state.editingId ? `/admin/links/${encodeURIComponent(state.editingId)}` : "/admin/links";
    const result = await request(path, { method: state.editingId ? "PUT" : "POST", body });
    if (state.editingId) state.links = state.links.map((link) => link.id === state.editingId ? result.link : link);
    else state.links.push(result.link);
    closeDialog();
    render();
    showFlash(state.editingId ? "入口已更新。" : "入口已添加。", "success");
  } catch (error) {
    const target = document.querySelector("#dialog-error");
    target.textContent = error.message;
    target.hidden = false;
  } finally { button.disabled = false; }
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    credentials: "include",
    headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}

function showLoginError(message) { const target = document.querySelector("#login-error"); target.textContent = message; target.hidden = false; }
function showFlash(message, type) { const target = document.querySelector("#flash"); target.textContent = message; target.className = `flash ${type}`; target.hidden = false; window.clearTimeout(showFlash.timer); showFlash.timer = window.setTimeout(() => { target.hidden = true; }, 3200); }
function hide(selector) { document.querySelector(selector).hidden = true; }
function refreshIcons() { if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } }); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]); }
function escapeAttribute(value) { return escapeHtml(value); }
