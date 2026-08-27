const API_BASE = window.location.pathname.startsWith("/wayfind-admin") ? "/wayfind-api" : "/api";
const THEME_STORAGE_KEY = "wayfind-admin-theme";
const TONES = new Set(["coral", "teal", "yellow", "blue", "purple", "orange", "rose", "lime", "indigo"]);
const state = { categories: [], links: [], editingId: null, editingCategoryId: null, categoryBeforeNew: "", categoryReturnToLink: false, pendingCategoryDelete: null };

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  initializeTheme();
  refreshIcons();
  start();
});

function initializeTheme() {
  const savedTheme = readStoredTheme();
  applyTheme(savedTheme === "dark" ? "dark" : "light", false);

  const toggle = document.querySelector("#theme-toggle");
  if (!toggle) return;
  toggle.addEventListener("click", () => {
    const currentTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    applyTheme(currentTheme === "dark" ? "light" : "dark");
  });
}

function readStoredTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function applyTheme(theme, persist = true) {
  const normalizedTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = normalizedTheme;

  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme);
    } catch {
      // The visual switch still works when storage is unavailable.
    }
  }

  const toggle = document.querySelector("#theme-toggle");
  if (!toggle) return;
  const isDark = normalizedTheme === "dark";
  const nextLabel = isDark ? "切换浅色模式" : "切换深色模式";
  toggle.innerHTML = `<i data-lucide="${isDark ? "sun" : "moon"}" aria-hidden="true"></i>`;
  toggle.title = nextLabel;
  toggle.setAttribute("aria-label", nextLabel);
  refreshIcons();
}

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
  document.querySelector("#add-category-button").addEventListener("click", () => openCategoryDialog());
  document.querySelector("#category-panels").addEventListener("click", handlePanelClick);
  document.querySelector("#field-category").addEventListener("change", handleCategorySelect);
  document.querySelector("#tone-picker").addEventListener("click", handleToneSelect);
  document.querySelector("#tone-picker").addEventListener("keydown", handleToneKeydown);
  document.querySelector("#link-form").addEventListener("submit", saveLink);
  document.querySelector("#close-dialog").addEventListener("click", closeDialog);
  document.querySelector("#cancel-dialog").addEventListener("click", closeDialog);
  document.querySelector("#category-form").addEventListener("submit", saveCategory);
  document.querySelector("#close-category-dialog").addEventListener("click", closeCategoryDialog);
  document.querySelector("#cancel-category-dialog").addEventListener("click", closeCategoryDialog);
  document.querySelector("#category-delete-form").addEventListener("submit", deleteCategory);
  document.querySelector("#close-category-delete-dialog").addEventListener("click", closeCategoryDeleteDialog);
  document.querySelector("#cancel-category-delete-dialog").addEventListener("click", closeCategoryDeleteDialog);
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
  try {
    await request("/auth/logout", { method: "POST" });
    showLogin();
  } catch (error) {
    showFlash(error.message, "error");
  }
}

async function showDashboard(username) {
  document.querySelector("#session-user").textContent = username;
  document.querySelector("#session-user").hidden = false;
  document.querySelector("#front-link").hidden = false;
  document.querySelector("#front-divider").hidden = false;
  document.querySelector("#logout-divider").hidden = false;
  document.querySelector("#logout-button").hidden = false;
  document.querySelector("#login-view").hidden = true;
  document.querySelector("#dashboard-view").hidden = false;
  try {
    const data = await request("/admin/links");
    state.categories = data.categories || [];
    state.links = data.links || [];
    render();
  } catch (error) {
    if (error.status === 401) {
      showLogin();
      showLoginError(error.message);
      return;
    }
    showFlash(error.message, "error");
  }
}

function showLogin() {
  document.querySelector("#session-user").hidden = true;
  document.querySelector("#front-link").hidden = true;
  document.querySelector("#front-divider").hidden = true;
  document.querySelector("#logout-divider").hidden = true;
  document.querySelector("#logout-button").hidden = true;
  document.querySelector("#dashboard-view").hidden = true;
  document.querySelector("#login-view").hidden = false;
  document.querySelector("#login-username").focus();
}

function render() {
  populateCategoryOptions();
  const container = document.querySelector("#category-panels");
  container.innerHTML = state.categories.map((category, index) => {
    const links = state.links.filter((link) => link.category === category.name).sort((a, b) => a.position - b.position);
    const enabled = isEnabled(category);
    return `<section class="category-panel${enabled ? "" : " is-disabled"}" aria-labelledby="category-${index}">
      <div class="category-heading"><div class="category-heading-main"><span class="section-number">${String(index + 1).padStart(2, "0")}</span><div><h2 id="category-${index}">${escapeHtml(category.name)}</h2><p>${escapeHtml(category.description)}</p></div></div><div class="category-heading-actions"><span class="category-count">${links.length} 个入口</span>${renderEnabledToggle("category", category.id, category.name, enabled)}<button class="icon-button" type="button" data-category-action="edit" data-category-id="${escapeAttribute(category.id)}" title="编辑分类" aria-label="编辑分类：${escapeAttribute(category.name)}"><i data-lucide="pencil" aria-hidden="true"></i></button><button class="icon-button danger" type="button" data-category-action="delete" data-category-id="${escapeAttribute(category.id)}" title="删除分类" aria-label="删除分类：${escapeAttribute(category.name)}"><i data-lucide="trash-2" aria-hidden="true"></i></button></div></div>
      <div class="link-list">${links.length ? links.map((link, linkIndex) => renderLink(link, linkIndex, links.length)).join("") : `<p class="empty-state">这个分类还没有入口。</p>`}</div>
    </section>`;
  }).join("");
  refreshIcons();
}

function renderLink(link, index, total) {
  const enabled = isEnabled(link);
  return `<article class="link-row${enabled ? "" : " is-disabled"}" data-id="${escapeAttribute(link.id)}">
    <span class="row-mark tone-${escapeAttribute(link.tone)}">${escapeHtml(link.mark)}</span>
    <div class="row-main"><strong>${escapeHtml(link.title)}</strong><span>${escapeHtml(link.url)}</span>${link.adminNote ? `<small class="row-admin-note" title="${escapeAttribute(link.adminNote)}">${escapeHtml(link.adminNote)}</small>` : ""}</div>
    <span class="row-status">${escapeHtml(link.status)}</span>
    <div class="row-actions">
      ${renderEnabledToggle("link", link.id, link.title, enabled)}
      <button class="icon-button" type="button" data-action="up" title="上移" aria-label="上移" ${index === 0 ? "disabled" : ""}><i data-lucide="arrow-up" aria-hidden="true"></i></button>
      <button class="icon-button" type="button" data-action="down" title="下移" aria-label="下移" ${index === total - 1 ? "disabled" : ""}><i data-lucide="arrow-down" aria-hidden="true"></i></button>
      <button class="icon-button" type="button" data-action="edit" title="编辑" aria-label="编辑"><i data-lucide="pencil" aria-hidden="true"></i></button>
      <button class="icon-button danger" type="button" data-action="delete" title="删除" aria-label="删除"><i data-lucide="trash-2" aria-hidden="true"></i></button>
    </div>
  </article>`;
}

function renderEnabledToggle(type, id, name, enabled) {
  const targetName = type === "category" ? "分类" : "入口";
  const nextAction = enabled ? "关闭" : "开启";
  const label = enabled ? "已开启" : "已关闭";
  const actionAttribute = type === "category" ? "data-category-action" : "data-action";
  return `<button class="status-toggle" type="button" ${actionAttribute}="toggle-enabled" data-${type}-id="${escapeAttribute(id)}" role="switch" aria-checked="${enabled}" aria-label="${nextAction}${targetName}：${escapeAttribute(name)}" title="${nextAction}${targetName}"><span class="status-toggle-track" aria-hidden="true"></span><span class="status-toggle-label">${label}</span></button>`;
}

async function handlePanelClick(event) {
  const categoryButton = event.target.closest("button[data-category-action]");
  if (categoryButton) {
    const category = state.categories.find((item) => item.id === categoryButton.dataset.categoryId);
    if (!category || categoryButton.disabled) return;
    if (categoryButton.dataset.categoryAction === "toggle-enabled") {
      await toggleCategoryEnabled(category, categoryButton);
      return;
    }
    if (categoryButton.dataset.categoryAction === "edit") {
      openCategoryDialog(category);
      return;
    }
    if (categoryButton.dataset.categoryAction !== "delete") return;
    openCategoryDeleteDialog(category);
    return;
  }
  const button = event.target.closest("button[data-action]");
  if (!button || button.disabled) return;
  const row = button.closest("[data-id]");
  const link = state.links.find((item) => item.id === row?.dataset.id);
  if (!link) return;
  if (button.dataset.action === "toggle-enabled") {
    await toggleLinkEnabled(link, button);
    return;
  }
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

async function toggleCategoryEnabled(category, button) {
  const enabled = !isEnabled(category);
  button.disabled = true;
  try {
    const result = await request(`/admin/categories/${encodeURIComponent(category.id)}/enabled`, { method: "PATCH", body: { enabled } });
    const updatedCategory = result.category ? { ...category, ...result.category } : { ...category, enabled };
    state.categories = state.categories.map((item) => item.id === category.id ? updatedCategory : item);
    render();
    showFlash(enabled ? `分类“${updatedCategory.name}”已开启。` : `分类“${updatedCategory.name}”已关闭。`, "success");
  } catch (error) {
    showFlash(error.message, "error");
  } finally {
    button.disabled = false;
  }
}

async function toggleLinkEnabled(link, button) {
  const enabled = !isEnabled(link);
  button.disabled = true;
  try {
    const result = await request(`/admin/links/${encodeURIComponent(link.id)}/enabled`, { method: "PATCH", body: { enabled } });
    const updatedLink = result.link ? { ...link, ...result.link } : { ...link, enabled };
    state.links = state.links.map((item) => item.id === link.id ? updatedLink : item);
    render();
    showFlash(enabled ? `入口“${updatedLink.title}”已开启。` : `入口“${updatedLink.title}”已关闭。`, "success");
  } catch (error) {
    showFlash(error.message, "error");
  } finally {
    button.disabled = false;
  }
}

function openDialog(link = null) {
  state.editingId = link?.id || null;
  document.querySelector("#dialog-title").textContent = link ? "编辑入口" : "新增入口";
  const values = link || { category: state.categories[0]?.name || "", title: "", url: "", mark: "", status: "常用", tone: "teal", description: "", note: "", adminNote: "" };
  state.categoryBeforeNew = values.category;
  populateCategoryOptions(values.category);
  ["title", "url", "category", "mark", "status", "tone", "description", "note"].forEach((field) => {
    document.querySelector(`#field-${field}`).value = values[field] || "";
  });
  document.querySelector("#field-admin-note").value = values.adminNote || "";
  setTone(values.tone, false);
  hide("#dialog-error");
  showLinkDialog();
}

function handleToneSelect(event) {
  const option = event.target.closest("button[data-tone-option]");
  if (!option) return;
  setTone(option.dataset.toneOption);
}

function handleToneKeydown(event) {
  const options = [...document.querySelectorAll("button[data-tone-option]")];
  const currentIndex = options.indexOf(event.target.closest("button[data-tone-option]"));
  if (currentIndex < 0) return;

  let nextIndex = currentIndex;
  if (["ArrowRight", "ArrowDown"].includes(event.key)) nextIndex = (currentIndex + 1) % options.length;
  else if (["ArrowLeft", "ArrowUp"].includes(event.key)) nextIndex = (currentIndex - 1 + options.length) % options.length;
  else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = options.length - 1;
  else return;

  event.preventDefault();
  setTone(options[nextIndex].dataset.toneOption);
}

function setTone(tone, focus = true) {
  const selectedTone = TONES.has(tone) ? tone : "teal";
  document.querySelector("#field-tone").value = selectedTone;
  document.querySelectorAll("button[data-tone-option]").forEach((option) => {
    const selected = option.dataset.toneOption === selectedTone;
    option.setAttribute("aria-checked", String(selected));
    option.tabIndex = selected ? 0 : -1;
    option.classList.toggle("is-selected", selected);
    if (selected && focus) option.focus();
  });
}

function closeDialog() {
  const dialog = document.querySelector("#link-dialog");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function showLinkDialog() {
  const dialog = document.querySelector("#link-dialog");
  if (!dialog.open && typeof dialog.showModal === "function") dialog.showModal();
  else if (!dialog.open) dialog.setAttribute("open", "");
  document.querySelector("#field-title").focus();
}

function populateCategoryOptions(selected = null) {
  const select = document.querySelector("#field-category");
  if (!select) return;
  const current = selected ?? select.value;
  select.innerHTML = state.categories.map((category) => `<option value="${escapeAttribute(category.name)}">${escapeHtml(category.name)}</option>`).join("") + `<option value="__new__">＋ 新增分类…</option>`;
  const hasCurrent = state.categories.some((category) => category.name === current);
  select.value = hasCurrent ? current : (state.categories[0]?.name || "");
}

function handleCategorySelect(event) {
  if (event.target.value !== "__new__") return;
  openCategoryDialog(null, true);
}

function openCategoryDialog(category = null, fromLink = false) {
  state.editingCategoryId = category?.id || null;
  state.categoryReturnToLink = fromLink;
  if (fromLink) {
    const current = document.querySelector("#field-category").value;
    if (current !== "__new__") state.categoryBeforeNew = current || state.categories[0]?.name || "";
    closeDialog();
  }
  const form = document.querySelector("#category-form");
  form.reset();
  document.querySelector("#category-dialog-title").textContent = category ? "编辑分类" : "新增分类";
  document.querySelector("#save-category-label").textContent = category ? "保存修改" : "保存分类";
  document.querySelector("#category-name").value = category?.name || "";
  document.querySelector("#category-description").value = category?.description || "";
  hide("#category-dialog-error");
  const dialog = document.querySelector("#category-dialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  document.querySelector("#category-name").focus();
}

function closeCategoryDialog(nextCategory = null) {
  const dialog = document.querySelector("#category-dialog");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
  if (state.categoryReturnToLink) {
    document.querySelector("#field-category").value = nextCategory || state.categoryBeforeNew || state.categories[0]?.name || "";
    state.categoryReturnToLink = false;
    showLinkDialog();
  }
  state.editingCategoryId = null;
}

function openCategoryDeleteDialog(category) {
  state.pendingCategoryDelete = category;
  const linkCount = state.links.filter((link) => link.category === category.name).length;
  const targetLabel = document.querySelector("#category-target-label");
  const target = document.querySelector("#category-target");
  const choices = state.categories.filter((item) => item.id !== category.id);
  target.innerHTML = choices.map((item) => `<option value="${escapeAttribute(item.id)}">${escapeHtml(item.name)}</option>`).join("");
  target.required = linkCount > 0;
  targetLabel.hidden = linkCount === 0;
  document.querySelector("#category-delete-message").textContent = linkCount > 0
    ? `“${category.name}”中有 ${linkCount} 个入口。删除分类前，请先选择一个分类接收这些入口。`
    : `确定删除空分类“${category.name}”吗？`;
  hide("#category-delete-error");
  const dialog = document.querySelector("#category-delete-dialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeCategoryDeleteDialog() {
  const dialog = document.querySelector("#category-delete-dialog");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
  state.pendingCategoryDelete = null;
}

async function deleteCategory(event) {
  event.preventDefault();
  const category = state.pendingCategoryDelete;
  if (!category) return;
  hide("#category-delete-error");
  const targetId = document.querySelector("#category-target").value;
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const result = await request(`/admin/categories/${encodeURIComponent(category.id)}`, {
      method: "DELETE",
      body: targetId ? { targetCategoryId: targetId } : undefined,
    });
    state.categories = result.categories || state.categories.filter((item) => item.id !== category.id);
    state.links = result.links || state.links.filter((link) => link.category !== category.name);
    closeCategoryDeleteDialog();
    render();
    showFlash("分类已删除。", "success");
  } catch (error) {
    const target = document.querySelector("#category-delete-error");
    target.textContent = error.message;
    target.hidden = false;
  } finally { button.disabled = false; }
}

async function saveCategory(event) {
  event.preventDefault();
  hide("#category-dialog-error");
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const button = formElement.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const editingId = state.editingCategoryId;
    const path = editingId ? `/admin/categories/${encodeURIComponent(editingId)}` : "/admin/categories";
    const result = await request(path, { method: editingId ? "PUT" : "POST", body: { name: form.get("name"), description: form.get("description") } });
    if (editingId) {
      state.categories = state.categories.map((category) => category.id === editingId ? result.category : category);
      state.links = result.links || state.links;
    } else {
      state.categories.push(result.category);
    }
    state.categories.sort((a, b) => a.position - b.position);
    populateCategoryOptions(result.category.name);
    render();
    closeCategoryDialog(result.category.name);
    showFlash(editingId ? "分类已更新。" : "分类已添加。", "success");
  } catch (error) {
    const target = document.querySelector("#category-dialog-error");
    target.textContent = error.message;
    target.hidden = false;
  } finally { button.disabled = false; }
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
  if (!response.ok) throw Object.assign(new Error(data.error || `请求失败（${response.status}）`), { status: response.status });
  return data;
}

function showLoginError(message) { const target = document.querySelector("#login-error"); target.textContent = message; target.hidden = false; }
function showFlash(message, type) { const target = document.querySelector("#flash"); target.textContent = message; target.className = `flash ${type}`; target.hidden = false; window.clearTimeout(showFlash.timer); showFlash.timer = window.setTimeout(() => { target.hidden = true; }, 3200); }
function hide(selector) { document.querySelector(selector).hidden = true; }
function refreshIcons() { if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } }); }
function isEnabled(item) { return item?.enabled !== false; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]); }
function escapeAttribute(value) { return escapeHtml(value); }
