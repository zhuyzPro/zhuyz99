const STORAGE_KEYS = {
  favorites: "wayfind:favorites",
  theme: "wayfind:theme",
};

const CATEGORIES = ["全部", "AI 工具", "开发", "设计", "效率", "阅读"];

const DEFAULT_LINKS = [
  {
    id: "chatgpt",
    title: "ChatGPT",
    category: "AI 工具",
    mark: "AI",
    tone: "coral",
    badge: "常用",
    description: "写作、分析与快速提问，先把想法说出来。",
    url: "https://chatgpt.com/",
    tags: ["对话", "写作", "分析"],
  },
  {
    id: "claude",
    title: "Claude",
    category: "AI 工具",
    mark: "CL",
    tone: "yellow",
    badge: "常用",
    description: "长文本阅读和结构化思考，适合慢一点的工作。",
    url: "https://claude.ai/",
    tags: ["阅读", "写作", "研究"],
  },
  {
    id: "perplexity",
    title: "Perplexity",
    category: "AI 工具",
    mark: "PX",
    tone: "teal",
    badge: "检索",
    description: "带来源的网页搜索，把答案和出处放在一起。",
    url: "https://www.perplexity.ai/",
    tags: ["搜索", "研究"],
  },
  {
    id: "github",
    title: "GitHub",
    category: "开发",
    mark: "GH",
    tone: "purple",
    badge: "代码",
    description: "仓库、Issue、Pull Request 和每天的提交记录。",
    url: "https://github.com/",
    tags: ["git", "开源", "协作"],
  },
  {
    id: "mdn",
    title: "MDN Web Docs",
    category: "开发",
    mark: "MD",
    tone: "blue",
    badge: "文档",
    description: "Web API 和浏览器行为的可靠参考。",
    url: "https://developer.mozilla.org/zh-CN/",
    tags: ["前端", "文档", "CSS"],
  },
  {
    id: "vercel",
    title: "Vercel",
    category: "开发",
    mark: "VC",
    tone: "teal",
    badge: "部署",
    description: "预览部署、日志和项目状态，一次看清。",
    url: "https://vercel.com/dashboard",
    tags: ["部署", "项目"],
  },
  {
    id: "figma",
    title: "Figma",
    category: "设计",
    mark: "FG",
    tone: "coral",
    badge: "设计",
    description: "界面、原型和组件库都从这里开始。",
    url: "https://www.figma.com/",
    tags: ["UI", "原型", "协作"],
  },
  {
    id: "dribbble",
    title: "Dribbble",
    category: "设计",
    mark: "DB",
    tone: "purple",
    badge: "灵感",
    description: "收集细节、动效和配色的灵感板。",
    url: "https://dribbble.com/",
    tags: ["灵感", "视觉"],
  },
  {
    id: "notion",
    title: "Notion",
    category: "效率",
    mark: "N",
    tone: "yellow",
    badge: "工作台",
    description: "项目、笔记和资料库，用一个空间串起来。",
    url: "https://www.notion.so/",
    tags: ["笔记", "项目", "数据库"],
  },
  {
    id: "linear",
    title: "Linear",
    category: "效率",
    mark: "LN",
    tone: "blue",
    badge: "项目",
    description: "轻快地拆 Issue、排优先级和跟进进度。",
    url: "https://linear.app/",
    tags: ["任务", "协作"],
  },
  {
    id: "drive",
    title: "Google Drive",
    category: "效率",
    mark: "GD",
    tone: "teal",
    badge: "文件",
    description: "常用文档、表格和交付文件的集合处。",
    url: "https://drive.google.com/",
    tags: ["文件", "文档"],
  },
  {
    id: "sspai",
    title: "少数派",
    category: "阅读",
    mark: "少",
    tone: "coral",
    badge: "中文",
    description: "工具、效率和数字生活的中文内容精选。",
    url: "https://sspai.com/",
    tags: ["效率", "生活"],
  },
  {
    id: "product-hunt",
    title: "Product Hunt",
    category: "阅读",
    mark: "PH",
    tone: "yellow",
    badge: "发现",
    description: "每天看看新产品，保持对互联网的体感。",
    url: "https://www.producthunt.com/",
    tags: ["产品", "发现"],
  },
  {
    id: "readhub",
    title: "Readhub",
    category: "阅读",
    mark: "RH",
    tone: "blue",
    badge: "资讯",
    description: "科技媒体新闻的快速聚合与浏览入口。",
    url: "https://readhub.cn/",
    tags: ["科技", "新闻"],
  },
];

const state = {
  activeCategory: "全部",
  query: "",
  favorites: readStorage(STORAGE_KEYS.favorites, []),
};

const elements = {};
let toastTimer;

document.addEventListener("DOMContentLoaded", init);

function init() {
  Object.assign(elements, {
    categoryTabs: document.querySelector("#category-tabs"),
    searchInput: document.querySelector("#search-input"),
    clearSearch: document.querySelector("#clear-search"),
    linkGrid: document.querySelector("#link-grid"),
    emptyState: document.querySelector("#empty-state"),
    resultsCount: document.querySelector("#results-count"),
    favoriteList: document.querySelector("#favorite-list"),
    favoriteCount: document.querySelector("#favorite-count"),
    clearFavorites: document.querySelector("#clear-favorites"),
    themeToggle: document.querySelector("#theme-toggle"),
    clock: document.querySelector("#clock"),
    dateLabel: document.querySelector("#date-label"),
    toast: document.querySelector("#toast"),
  });

  applyStoredTheme();
  bindEvents();
  render();
  updateClock();
  window.setInterval(updateClock, 30_000);
}

function bindEvents() {
  elements.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    elements.clearSearch.hidden = state.query.length === 0;
    renderLinks();
  });

  elements.clearSearch.addEventListener("click", clearSearch);

  elements.categoryTabs.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-category]");
    if (!tab) return;
    state.activeCategory = tab.dataset.category;
    renderTabs();
    renderLinks();
  });

  elements.linkGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-favorite-id]");
    if (!button) return;
    event.preventDefault();
    toggleFavorite(button.dataset.favoriteId);
  });

  document.querySelector("#theme-toggle").addEventListener("click", toggleTheme);
  elements.clearFavorites.addEventListener("click", clearFavorites);

  window.addEventListener("keydown", (event) => {
    const activeTag = document.activeElement?.tagName;
    const typing = activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT";
    if (event.key === "/" && !typing) {
      event.preventDefault();
      elements.searchInput.focus();
    }
    if (event.key === "Escape" && document.activeElement === elements.searchInput && state.query) {
      clearSearch();
    }
  });
}

function allLinks() {
  return DEFAULT_LINKS;
}

function render() {
  renderTabs();
  renderLinks();
  renderFavorites();
  refreshIcons();
}

function renderTabs() {
  const links = allLinks();
  const counts = links.reduce((result, link) => {
    result[link.category] = (result[link.category] || 0) + 1;
    return result;
  }, {});

  elements.categoryTabs.innerHTML = CATEGORIES.map((category) => {
    const count = category === "全部" ? links.length : counts[category] || 0;
    const selected = state.activeCategory === category;
    return `<button class="category-tab" type="button" role="tab" aria-selected="${selected}" aria-controls="link-grid" data-category="${escapeAttribute(category)}">
      <span>${escapeHtml(category)}</span><span class="category-tab-count">${count}</span>
    </button>`;
  }).join("");
  refreshIcons();
}

function renderLinks() {
  const filtered = getFilteredLinks();
  elements.resultsCount.textContent = state.query
    ? `找到 ${filtered.length} 个入口`
    : `${filtered.length} 个入口`;
  elements.linkGrid.innerHTML = filtered.map(renderLinkCard).join("");
  elements.emptyState.hidden = filtered.length > 0;
  elements.linkGrid.hidden = filtered.length === 0;
  refreshIcons();
}

function getFilteredLinks() {
  const query = state.query.toLocaleLowerCase("zh-CN");
  return allLinks().filter((link) => {
    const inCategory = state.activeCategory === "全部" || link.category === state.activeCategory;
    if (!inCategory) return false;
    if (!query) return true;
    const searchable = [link.title, link.description, link.category, link.host, ...(link.tags || [])]
      .join(" ")
      .toLocaleLowerCase("zh-CN");
    return searchable.includes(query);
  });
}

function renderLinkCard(link) {
  const favorite = state.favorites.includes(link.id);
  const url = normalizeUrl(link.url);
  const badge = link.badge ? `<span class="status-badge">${escapeHtml(link.badge)}</span>` : "";
  return `<article class="link-card tone-${escapeAttribute(link.tone || "teal")}">
    <div class="card-topline">
      <span class="link-icon" aria-hidden="true">${escapeHtml(link.mark || initials(link.title))}</span>
      <button class="favorite-toggle" type="button" aria-label="${favorite ? "取消收藏" : "收藏"} ${escapeAttribute(link.title)}" aria-pressed="${favorite}" data-favorite-id="${escapeAttribute(link.id)}">
        <i data-lucide="star"></i>
      </button>
    </div>
    <div class="card-copy">
      <div class="title-row">
        <h3><a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.title)} <i data-lucide="arrow-up-right" aria-hidden="true"></i></a></h3>
        ${badge}
      </div>
      <p class="card-description">${escapeHtml(link.description || "")}</p>
    </div>
    <div class="card-meta">
      <span class="card-host">${escapeHtml(link.host || getHost(url))}</span>
      <span class="card-category">${escapeHtml(link.category)}</span>
    </div>
  </article>`;
}

function renderFavorites() {
  const links = allLinks().filter((link) => state.favorites.includes(link.id));
  elements.favoriteCount.textContent = links.length;
  elements.clearFavorites.disabled = links.length === 0;
  if (!links.length) {
    elements.favoriteList.innerHTML = `<div class="favorite-empty"><i data-lucide="star"></i><p>收藏常用入口，下一次更快抵达。</p></div>`;
    refreshIcons();
    return;
  }

  elements.favoriteList.innerHTML = links.map((link) => {
    const url = normalizeUrl(link.url);
    return `<a class="favorite-item" href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">
      <span class="favorite-item-mark" aria-hidden="true">${escapeHtml(link.mark || initials(link.title))}</span>
      <span class="favorite-item-copy"><span class="favorite-item-title">${escapeHtml(link.title)}</span><span class="favorite-item-host">${escapeHtml(link.host || getHost(url))}</span></span>
    </a>`;
  }).join("");
  refreshIcons();
}

function toggleFavorite(id) {
  if (state.favorites.includes(id)) {
    state.favorites = state.favorites.filter((favoriteId) => favoriteId !== id);
    showToast("已取消收藏");
  } else {
    state.favorites = [id, ...state.favorites];
    showToast("已加入收藏");
  }
  writeStorage(STORAGE_KEYS.favorites, state.favorites);
  renderLinks();
  renderFavorites();
}

function clearFavorites() {
  if (!state.favorites.length) return;
  state.favorites = [];
  writeStorage(STORAGE_KEYS.favorites, state.favorites);
  renderLinks();
  renderFavorites();
  showToast("收藏已清空");
}

function clearSearch() {
  state.query = "";
  elements.searchInput.value = "";
  elements.clearSearch.hidden = true;
  renderLinks();
  elements.searchInput.focus();
}

function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = nextTheme;
  writeStorage(STORAGE_KEYS.theme, nextTheme);
  updateThemeButton();
}

function applyStoredTheme() {
  const savedTheme = readStorage(STORAGE_KEYS.theme, "dark");
  document.documentElement.dataset.theme = savedTheme === "light" ? "light" : "dark";
  updateThemeButton();
}

function updateThemeButton() {
  const light = document.documentElement.dataset.theme === "light";
  elements.themeToggle.innerHTML = `<i data-lucide="${light ? "moon" : "sun"}"></i>`;
  elements.themeToggle.setAttribute("aria-label", light ? "切换为深色主题" : "切换为浅色主题");
  elements.themeToggle.setAttribute("title", light ? "切换为深色主题" : "切换为浅色主题");
  refreshIcons();
}

function updateClock() {
  const now = new Date();
  const time = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const parts = new Intl.DateTimeFormat("zh-CN", {
    weekday: "short",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";
  elements.clock.textContent = time;
  elements.clock.dateTime = now.toISOString();
  elements.dateLabel.textContent = `${weekday} · ${month}月${day}日`;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2200);
}

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
  }
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

function initials(value) {
  return String(value || "?").replace(/\s+/g, "").slice(0, 2).toUpperCase();
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

function readStorage(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    showToast("浏览器未允许保存偏好");
  }
}
