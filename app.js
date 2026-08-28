const PUBLIC_API_URL = "https://zhuyz.art/wayfind-api/public/links";
const THEME_STORAGE_KEY = "wayfind-theme";
let isNavigationLoading = false;

document.addEventListener("DOMContentLoaded", () => {
  initializeTheme();
  const container = document.querySelector("#link-sections");
  if (!container) return;

  loadAndRenderNavigation(container);
});

async function loadAndRenderNavigation(container) {
  if (isNavigationLoading) return;
  isNavigationLoading = true;
  container.setAttribute("aria-busy", "true");
  container.innerHTML = '<p class="load-state" role="status">正在加载导航...</p>';
  try {
    const data = await loadNavigationData();
    renderSectionNav(data.categories);
    container.innerHTML = data.categories.length
      ? data.categories.map((section, index) => renderSection(section, data.links, index)).join("")
      : '<p class="load-state" role="status">暂时没有可展示的入口。</p>';
    refreshIcons();
  } catch (error) {
    console.error("Navigation loading failed:", error);
    renderSectionNav([]);
    container.innerHTML = `<div class="load-state">
      <p role="status">导航暂时无法加载，请重新加载。</p>
      <button class="reload-button" type="button">重新加载</button>
    </div>`;
    container.querySelector(".reload-button")?.addEventListener("click", () => {
      loadAndRenderNavigation(container);
    });
  } finally {
    container.removeAttribute("aria-busy");
    isNavigationLoading = false;
  }
}

function initializeTheme() {
  const savedTheme = readStoredTheme();
  applyTheme(savedTheme === "light" ? "light" : "dark", false);

  const toggle = document.querySelector("#theme-toggle");
  if (!toggle) return;
  toggle.addEventListener("click", () => {
    const currentTheme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    applyTheme(currentTheme === "light" ? "dark" : "light");
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
  const normalizedTheme = theme === "light" ? "light" : "dark";
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
  const isLight = normalizedTheme === "light";
  const nextLabel = isLight ? "切换深色模式" : "切换浅色模式";
  toggle.innerHTML = `<i data-lucide="${isLight ? "sun" : "moon"}" aria-hidden="true"></i>`;
  toggle.title = nextLabel;
  toggle.setAttribute("aria-label", nextLabel);
  refreshIcons();
}

async function loadNavigationData() {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(PUBLIC_API_URL, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Navigation API returned ${response.status}`);
    return validateNavigationData(await response.json());
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function validateNavigationData(data) {
  if (!data || !Array.isArray(data.categories) || !Array.isArray(data.links)) {
    throw new Error("Navigation API returned invalid data");
  }

  const categories = data.categories.filter((item) => (
    item
    && typeof item.id === "string"
    && typeof item.name === "string"
    && typeof item.description === "string"
    && Number.isInteger(item.position)
    && item.position >= 0
  ));
  const names = new Set(categories.map((item) => item.name));
  const links = data.links.filter((item) => (
    item
    && typeof item.category === "string"
    && names.has(item.category)
    && typeof item.title === "string"
    && typeof item.mark === "string"
    && typeof item.status === "string"
    && typeof item.description === "string"
    && typeof item.note === "string"
    && typeof item.url === "string"
    && Number.isInteger(item.position)
    && item.position >= 0
  ));

  categories.sort(comparePosition);
  return { categories, links };
}

function comparePosition(left, right) {
  return left.position - right.position
    || String(left.name || left.title).localeCompare(String(right.name || right.title), "zh-CN");
}

function renderSectionNav(categories) {
  const nav = document.querySelector("#section-nav");
  if (!nav) return;
  nav.innerHTML = categories.map((category, index) => `<a href="#${escapeAttribute(category.id)}"><span class="nav-index">${String(index + 1).padStart(2, "0")}</span>${escapeHtml(category.name)}</a>`).join("");
}

function renderSection(section, allLinks, index) {
  const links = allLinks.filter((link) => link.category === section.name).sort(comparePosition);
  return `<section class="link-section" id="${escapeAttribute(section.id)}" aria-labelledby="${escapeAttribute(section.id)}-title">
    <div class="section-heading">
      <div class="section-heading-copy">
        <p class="section-index">${String(index + 1).padStart(2, "0")}</p>
        <div>
          <h2 id="${escapeAttribute(section.id)}-title">${escapeHtml(section.name)}</h2>
          <p>${escapeHtml(section.description)}</p>
        </div>
      </div>
      <span class="section-count">${links.length} 个入口</span>
    </div>
    <div class="link-grid">
      ${links.map(renderCard).join("")}
    </div>
  </section>`;
}

function renderCard(link, index) {
  const url = normalizeUrl(link.url);
  const title = escapeHtml(link.title);
  return `<a class="link-card tone-${escapeAttribute(link.tone || "teal")}" href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer" aria-label="打开 ${escapeAttribute(link.title)}（新标签页）">
    <div class="card-topline">
      <span class="status-badge">${escapeHtml(link.status)}</span>
      <span class="card-number" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
    </div>
    <div class="card-identity">
      <span class="link-mark" aria-hidden="true">${escapeHtml(link.mark)}</span>
      <h3><span class="card-title-text">${title}</span><i data-lucide="arrow-up-right" aria-hidden="true"></i></h3>
    </div>
    <p class="card-description">${escapeHtml(link.description)}</p>
    <div class="card-meta">
      <span>${escapeHtml(link.note)}</span>
      <span>${escapeHtml(getHost(url))}</span>
    </div>
  </a>`;
}

function normalizeUrl(value) {
  const trimmed = String(value || "").trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function getHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
  }
}
