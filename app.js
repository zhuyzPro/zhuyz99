const CATEGORIES = [
  {
    id: "relay",
    name: "中转站",
    description: "模型聚合、API 与中转服务",
  },
  {
    id: "other",
    name: "其他",
    description: "日常使用的工具与网站",
  },
];

const LINKS = [
  {
    category: "中转站",
    title: "OpenRouter",
    mark: "OR",
    tone: "coral",
    status: "推荐",
    description: "多模型统一入口，按需切换模型和供应商。",
    note: "模型聚合 · API",
    url: "https://openrouter.ai/",
  },
  {
    category: "中转站",
    title: "硅基流动",
    mark: "硅",
    tone: "teal",
    status: "常用",
    description: "国产模型与推理 API，适合快速接入测试。",
    note: "模型服务 · 国内",
    url: "https://cloud.siliconflow.cn/",
  },
  {
    category: "中转站",
    title: "Poe",
    mark: "PO",
    tone: "yellow",
    status: "常用",
    description: "集中使用不同模型和机器人，适合日常对话。",
    note: "多模型 · 对话",
    url: "https://poe.com/",
  },
  {
    category: "中转站",
    title: "Together AI",
    mark: "TA",
    tone: "blue",
    status: "API",
    description: "开源模型推理与微调服务，开发入口清晰。",
    note: "推理 · 开发",
    url: "https://api.together.xyz/",
  },
  {
    category: "中转站",
    title: "Replicate",
    mark: "RP",
    tone: "purple",
    status: "模型",
    description: "把社区模型变成 API，适合快速验证想法。",
    note: "模型托管 · API",
    url: "https://replicate.com/",
  },
  {
    category: "中转站",
    title: "Hugging Face",
    mark: "HF",
    tone: "yellow",
    status: "社区",
    description: "模型、数据集和 Spaces 的开放社区。",
    note: "开源 · 模型",
    url: "https://huggingface.co/",
  },
  {
    category: "其他",
    title: "GitHub",
    mark: "GH",
    tone: "purple",
    status: "代码",
    description: "仓库、Issue、Pull Request 和开源项目。",
    note: "开发 · 协作",
    url: "https://github.com/",
  },
  {
    category: "其他",
    title: "ChatGPT",
    mark: "AI",
    tone: "teal",
    status: "常用",
    description: "写作、分析与快速提问，从这里开始工作。",
    note: "对话 · 写作",
    url: "https://chatgpt.com/",
  },
  {
    category: "其他",
    title: "Claude",
    mark: "CL",
    tone: "coral",
    status: "常用",
    description: "长文本阅读和结构化思考，适合复杂任务。",
    note: "阅读 · 分析",
    url: "https://claude.ai/",
  },
  {
    category: "其他",
    title: "Perplexity",
    mark: "PX",
    tone: "blue",
    status: "检索",
    description: "带来源的网页搜索，把答案和出处放在一起。",
    note: "搜索 · 研究",
    url: "https://www.perplexity.ai/",
  },
  {
    category: "其他",
    title: "Figma",
    mark: "FG",
    tone: "coral",
    status: "设计",
    description: "界面、原型和组件库的协作工作台。",
    note: "UI · 原型",
    url: "https://www.figma.com/",
  },
  {
    category: "其他",
    title: "Notion",
    mark: "N",
    tone: "yellow",
    status: "工作台",
    description: "项目、笔记和资料库集中管理。",
    note: "笔记 · 项目",
    url: "https://www.notion.so/",
  },
  {
    category: "其他",
    title: "Vercel",
    mark: "VC",
    tone: "teal",
    status: "部署",
    description: "预览部署、日志和项目状态，一次看清。",
    note: "部署 · 项目",
    url: "https://vercel.com/dashboard",
  },
  {
    category: "其他",
    title: "少数派",
    mark: "少",
    tone: "blue",
    status: "中文",
    description: "工具、效率和数字生活的中文内容精选。",
    note: "效率 · 阅读",
    url: "https://sspai.com/",
  },
];

document.addEventListener("DOMContentLoaded", () => {
  const container = document.querySelector("#link-sections");
  if (!container) return;
  container.innerHTML = CATEGORIES.map(renderSection).join("");
  refreshIcons();
});

function renderSection(section) {
  const links = LINKS.filter((link) => link.category === section.name);
  return `<section class="link-section" id="${escapeAttribute(section.id)}" aria-labelledby="${escapeAttribute(section.id)}-title">
    <div class="section-heading">
      <div class="section-heading-copy">
        <p class="section-index">${section.id === "relay" ? "01" : "02"}</p>
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

function renderCard(link) {
  const url = normalizeUrl(link.url);
  return `<article class="link-card tone-${escapeAttribute(link.tone || "teal")}">
    <div class="card-topline">
      <span class="link-mark" aria-hidden="true">${escapeHtml(link.mark)}</span>
      <span class="status-badge">${escapeHtml(link.status)}</span>
    </div>
    <h3><a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.title)} <i data-lucide="arrow-up-right" aria-hidden="true"></i></a></h3>
    <p class="card-description">${escapeHtml(link.description)}</p>
    <div class="card-meta">
      <span>${escapeHtml(link.note)}</span>
      <span>${escapeHtml(getHost(url))}</span>
    </div>
  </article>`;
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
