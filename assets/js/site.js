const API_BASE = "https://the-cactus-admin-api.thecactusphsweb.workers.dev";

async function loadPartials() {
  const headerMount = document.getElementById("header-mount");
  const footerMount = document.getElementById("footer-mount");

  if (headerMount) {
    const res = await fetch("/partials/header.html", { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load header");
    headerMount.innerHTML = await res.text();

    const key = document.body.dataset.nav || "";
    const link = headerMount.querySelector(`[data-nav="${key}"]`);
    if (link) link.setAttribute("aria-current", "page");
  }

  if (footerMount) {
    const res = await fetch("/partials/footer.html", { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load footer");
    footerMount.innerHTML = await res.text();

    const yearSpan = document.getElementById("year");
    if (yearSpan) yearSpan.textContent = new Date().getFullYear();
  }

  initHeader();
}

function initHeader() {
  const dateEl = document.getElementById("header-date");
  if (dateEl) {
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }
}

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name) || "";
}

function showPageError(message) {
  const el = document.getElementById("page-error");
  if (!el) return;
  el.hidden = false;
  el.textContent = message;
  el.style.marginTop = "1rem";
  el.style.padding = "0.8rem 1rem";
  el.style.border = "1px solid rgba(0,0,0,0.12)";
  el.style.borderRadius = "0.8rem";
  el.style.background = "rgba(255,255,255,0.9)";
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugifyValue(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/['’"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function authorAnchorId(name) {
  return `author-${slugifyValue(name)}`;
}

function authorUrl(name) {
  return `/authors/?author=${encodeURIComponent(name)}#${authorAnchorId(name)}`;
}

function formatDate(iso) {
  const s = String(iso || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]) - 1;
    const day = Number(m[3]);
    const d = new Date(year, month, day);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;

  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function issueUrl(issueSlug) {
  return `/${encodeURIComponent(issueSlug)}/`;
}

function articleUrl(article) {
  return `/${encodeURIComponent(article.issueSlug)}/${encodeURIComponent(article.slug)}/`;
}

async function fetchApiJson(path) {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  const text = await res.text();

  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) throw new Error(data.error || `Failed to load ${path}`);
  return data;
}

async function loadIssuesList() {
  if (window.__CACTUS_ISSUES__) return window.__CACTUS_ISSUES__;
  const data = await fetchApiJson("/api/issues");
  window.__CACTUS_ISSUES__ = data.issues || [];
  return window.__CACTUS_ISSUES__;
}

async function loadIssueData(slug) {
  const data = await fetchApiJson(`/api/issues/${encodeURIComponent(slug)}`);
  return {
    slug,
    title: data.title || slug,
    dateLabel: data.dateLabel || "",
    coverFilename: data.coverFilename || "cover.jpg",
    pdfUrl: data.pdfUrl || "magazine.pdf",
    articles: Array.isArray(data.articles) ? data.articles : []
  };
}

function normalizeArticle(issueSlug, article) {
  const heroFile = article.heroFilename || article.imageUrl || "";
  const heroPath = heroFile ? `/${issueSlug}/${article.slug}/${heroFile}` : "";

  return {
    ...article,
    issueSlug,
    heroPath
  };
}

function getCurrentIssueFromList(issues) {
  return issues.find((i) => i.isCurrent) || issues[0];
}

function updateCurrentIssueNavLink(issues) {
  const link = document.querySelector('[data-nav="current"]');
  if (!link) return;
  const current = getCurrentIssueFromList(issues);
  if (current) link.href = issueUrl(current.slug);
}

function sortByDateDesc(list) {
  return [...list].sort((a, b) => {
    const da = new Date(String(a.date).replace(/-/g, "/"));
    const db = new Date(String(b.date).replace(/-/g, "/"));
    return db - da;
  });
}

function renderArticleCardHtml(article) {
  const link = articleUrl(article);
  return `
    <article class="article-card">
      ${article.heroPath ? `
        <a class="article-card-image-wrap" href="${link}">
          <img class="article-card-image" src="${article.heroPath}" alt="${escapeHtml(article.title)}">
        </a>
      ` : ""}
      <div class="article-card-content">
        <h3><a href="${link}">${escapeHtml(article.title)}</a></h3>
        <div class="article-meta">
          <span class="article-type">${escapeHtml(article.type || "Article")}</span>
          <span class="article-meta-sep">·</span>
          <span>${escapeHtml(formatDate(article.date))}</span>
          <span class="article-meta-sep">·</span>
          <a class="author-link" href="${authorUrl(article.author)}">${escapeHtml(article.author)}</a>
        </div>
      </div>
    </article>
  `;
}

function renderSearchSummary(container, query, count) {
  const box = document.createElement("div");
  box.className = "search-summary";
  box.innerHTML = `
    <div><strong>Search:</strong> “${escapeHtml(query)}”</div>
    <div>${count} article result${count === 1 ? "" : "s"}</div>
  `;
  container.appendChild(box);
}

function searchArticles(query, articles) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return articles
    .map((article) => {
      const haystack = [
        article.title,
        article.subtitle,
        article.author,
        article.category,
        article.type,
        ...(article.tags || [])
      ].join(" ").toLowerCase();

      let score = 0;
      if ((article.title || "").toLowerCase().includes(q)) score += 4;
      if ((article.author || "").toLowerCase().includes(q)) score += 3;
      if (haystack.includes(q)) score += 1;

      return { article, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || new Date(String(b.article.date).replace(/-/g, "/")) - new Date(String(a.article.date).replace(/-/g, "/")))
    .map((x) => x.article);
}

function renderHomeHeroThreeColumns(articles) {
  const mainContainer = document.getElementById("hero-main");
  const centerContainer = document.getElementById("hero-center");
  const rightContainer = document.getElementById("hero-right");

  if (!mainContainer || !centerContainer || !rightContainer) return;

  const slotted = articles.filter(
    (a) =>
      a.frontPageSlot === "main" ||
      a.frontPageSlot === "center-lead" ||
      a.frontPageSlot === "center" ||
      a.frontPageSlot === "right"
  );

  const main = slotted.find((a) => a.frontPageSlot === "main");
  const centerLead = slotted.find((a) => a.frontPageSlot === "center-lead");
  const centerCards = slotted.filter((a) => a.frontPageSlot === "center").slice(0, 3);
  const rightCards = slotted.filter((a) => a.frontPageSlot === "right").slice(0, 6);

  mainContainer.innerHTML = "";
  centerContainer.innerHTML = "";
  rightContainer.innerHTML = "";

  if (main) {
    mainContainer.innerHTML = `
      <article class="hero-main-article">
        <div class="hero-main-image-wrap">
          ${main.heroPath ? `<a href="${articleUrl(main)}"><img class="hero-main-image" src="${main.heroPath}" alt="${escapeHtml(main.title)}"></a>` : ""}
        </div>
        <div>
          <div class="hero-main-kicker">
            ${escapeHtml(main.category || "")}${main.date ? " | " + escapeHtml(formatDate(main.date)) : ""}
          </div>
          <h1 class="hero-main-title"><a href="${articleUrl(main)}">${escapeHtml(main.title)}</a></h1>
          ${main.subtitle ? `<p class="hero-main-dek">${escapeHtml(main.subtitle)}</p>` : ""}
          <p class="hero-main-byline"><a class="author-link" href="${authorUrl(main.author)}">${escapeHtml(main.author)}</a></p>
        </div>
      </article>
    `;
  }

  if (centerLead) {
    centerContainer.innerHTML += `
      <article class="center-lead-card">
        <div class="center-lead-image-wrap">
          ${centerLead.heroPath ? `<a href="${articleUrl(centerLead)}"><img class="center-lead-image" src="${centerLead.heroPath}" alt="${escapeHtml(centerLead.title)}"></a>` : ""}
        </div>
        <div class="center-kicker">
          ${escapeHtml(centerLead.category || "")}${centerLead.date ? " | " + escapeHtml(formatDate(centerLead.date)) : ""}
        </div>
        <h3 class="center-title"><a href="${articleUrl(centerLead)}">${escapeHtml(centerLead.title)}</a></h3>
        <p class="center-meta"><a class="author-link" href="${authorUrl(centerLead.author)}">${escapeHtml(centerLead.author)}</a></p>
      </article>
    `;
  }

  centerCards.forEach((article) => {
    centerContainer.innerHTML += `
      <article class="center-card">
        <div class="center-kicker">
          ${escapeHtml(article.category || "")}${article.date ? " | " + escapeHtml(formatDate(article.date)) : ""}
        </div>
        <h3 class="center-card-title"><a href="${articleUrl(article)}">${escapeHtml(article.title)}</a></h3>
        <p class="center-card-meta"><a class="author-link" href="${authorUrl(article.author)}">${escapeHtml(article.author)}</a></p>
      </article>
    `;
  });

  rightCards.forEach((article) => {
    rightContainer.innerHTML += `
      <article class="right-card">
        <div class="right-kicker">
          ${escapeHtml(article.category || "")}${article.date ? " | " + escapeHtml(formatDate(article.date)) : ""}
        </div>
        <div class="right-title"><a href="${articleUrl(article)}">${escapeHtml(article.title)}</a></div>
        <div class="right-meta"><a class="author-link" href="${authorUrl(article.author)}">${escapeHtml(article.author)}</a></div>
      </article>
    `;
  });
}

async function renderArchivePage() {
  const grid = document.getElementById("issue-grid");
  if (!grid) return;

  const query = getQueryParam("q").trim();
  const issues = await loadIssuesList();

  if (query) {
    const allArticles = [];
    for (const issue of issues) {
      const data = await loadIssueData(issue.slug);
      allArticles.push(...data.articles.map((a) => normalizeArticle(issue.slug, a)));
    }

    const results = searchArticles(query, allArticles);

    grid.innerHTML = "";
    renderSearchSummary(grid, query, results.length);

    const resultsWrap = document.createElement("div");
    resultsWrap.className = "article-section-grid";
    resultsWrap.innerHTML = results.map(renderArticleCardHtml).join("");
    grid.appendChild(resultsWrap);
    return;
  }

  grid.innerHTML = "";

  issues.forEach((issue) => {
    grid.innerHTML += `
      <article class="issue-card">
        <div class="issue-cover-wrap">
          ${issue.coverImage ? `<a href="${issueUrl(issue.slug)}"><img src="/${issue.coverImage}" alt="${escapeHtml(issue.title)} cover"></a>` : ""}
        </div>
        <a class="issue-title-link" href="${issueUrl(issue.slug)}">${escapeHtml(issue.title)}</a>
        <div class="issue-date">${escapeHtml(issue.dateLabel)}</div>
      </article>
    `;
  });
}

async function renderAuthorsPage() {
  const container = document.getElementById("authors-container");
  if (!container) return;

  const authorFilter = getQueryParam("author");
  const issues = await loadIssuesList();
  const allArticles = [];

  for (const issue of issues) {
    const data = await loadIssueData(issue.slug);
    allArticles.push(...data.articles.map((a) => normalizeArticle(issue.slug, a)));
  }

  let authorNames = [...new Set(allArticles.map((a) => a.author || "Unknown"))].sort((a, b) => a.localeCompare(b));

  if (authorFilter) {
    authorNames = authorNames.filter((name) => name.toLowerCase() === authorFilter.toLowerCase());
  }

  const wrapper = document.createElement("div");
  wrapper.className = "author-grid";

  authorNames.forEach((name) => {
    const articles = allArticles
      .filter((a) => (a.author || "Unknown") === name)
      .sort((a, b) => new Date(String(b.date).replace(/-/g, "/")) - new Date(String(a.date).replace(/-/g, "/")));

    const block = document.createElement("section");
    block.className = "author-block";
    block.id = authorAnchorId(name);
    block.innerHTML = `
      <div class="author-name">${escapeHtml(name)}</div>
      <div class="author-count">${articles.length} article${articles.length === 1 ? "" : "s"}</div>
      <div class="article-section-grid">
        ${articles.map(renderArticleCardHtml).join("")}
      </div>
    `;

    wrapper.appendChild(block);
  });

  container.innerHTML = "";
  container.appendChild(wrapper);
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadPartials();

    const issues = await loadIssuesList();
    updateCurrentIssueNavLink(issues);

    const page = document.body.dataset.page;

    if (page === "home") {
      const current = getCurrentIssueFromList(issues);
      if (!current) return;

      const data = await loadIssueData(current.slug);
      const articles = data.articles.map((a) => normalizeArticle(current.slug, a));
      renderHomeHeroThreeColumns(articles);
    }

    if (page === "archive") await renderArchivePage();
    if (page === "authors") await renderAuthorsPage();
  } catch (err) {
    console.error(err);
    showPageError(String(err.message || err));
  }
});