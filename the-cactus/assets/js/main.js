/* =========================================================
   The Cactus — public site
   ========================================================= */

async function loadPartials() {
  const headerMount = document.getElementById("header-mount");
  const footerMount = document.getElementById("footer-mount");

  if (headerMount) {
    const res = await fetch("partials/header.html");
    if (!res.ok) throw new Error("Could not load partials/header.html");
    headerMount.innerHTML = await res.text();

    const key = document.body.dataset.nav || "";
    const link = headerMount.querySelector(`[data-nav="${key}"]`);
    if (link) link.setAttribute("aria-current", "page");
  }

  if (footerMount) {
    const res = await fetch("partials/footer.html");
    if (!res.ok) throw new Error("Could not load partials/footer.html");
    footerMount.innerHTML = await res.text();

    const yearSpan = document.getElementById("year");
    if (yearSpan) yearSpan.textContent = new Date().getFullYear();
  }

  initHeader();
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

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  const v = params.get(name);
  return v ? v.trim() : "";
}

function normalize(s) {
  return String(s || "").toLowerCase().trim();
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function sortByDateDesc(list) {
  return [...list].sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

async function loadIssuesList() {
  if (window.__CACTUS_ISSUES__) return window.__CACTUS_ISSUES__;
  const issues = await fetchJson("assets/data/issues.json");
  window.__CACTUS_ISSUES__ = issues;
  return issues;
}

async function loadIssueData(slug) {
  window.__CACTUS_ISSUE_CACHE__ = window.__CACTUS_ISSUE_CACHE__ || {};
  if (window.__CACTUS_ISSUE_CACHE__[slug]) return window.__CACTUS_ISSUE_CACHE__[slug];

  const data = await fetchJson(`issues/${slug}/issue.json`);
  const articles = Array.isArray(data.articles) ? data.articles : [];
  window.__CACTUS_ISSUE_CACHE__[slug] = { slug: data.slug || slug, articles };
  return window.__CACTUS_ISSUE_CACHE__[slug];
}

function getCurrentIssueFromList(issues) {
  return issues.find((i) => i.isCurrent) || issues[0];
}

function normalizeArticlePaths(issueSlug, article) {
  const prefix = `issues/${issueSlug}/`;

  const fix = (p) => {
    if (!p) return p;
    if (p.startsWith("http://") || p.startsWith("https://")) return p;
    if (p.startsWith(prefix)) return p;
    if (p.startsWith("articles/")) return prefix + p;
    return p;
  };

  return {
    ...article,
    issueSlug,
    imageUrl: fix(article.imageUrl),
    contentPath: fix(article.contentPath),
  };
}

function articleUrl(articleId, issueSlug) {
  return `article.html?id=${encodeURIComponent(articleId)}&issue=${encodeURIComponent(issueSlug)}`;
}

function authorUrl(authorName) {
  return `authors.html?author=${encodeURIComponent(authorName)}`;
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

  const q = getQueryParam("q");
  const input = document.getElementById("site-search-input");
  if (input && q) input.value = q;
}

function searchArticlesInList(query, articles) {
  const q = normalize(query);
  if (!q) return [];

  return articles
    .map((a) => {
      const hay = [
        a.title,
        a.subtitle,
        a.author,
        a.category,
        a.type,
        a.imageCaption,
        ...(a.tags || []),
      ]
        .map(normalize)
        .join(" | ");

      let score = 0;
      if (normalize(a.title).includes(q)) score += 3;
      if (hay.includes(q)) score += 1;

      return { article: a, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score || new Date(y.article.date) - new Date(x.article.date))
    .map((x) => x.article);
}

function renderSearchSummary(container, query, count) {
  const box = document.createElement("div");
  box.className = "search-summary";
  box.innerHTML = `
    <div><strong>Search:</strong> “${escapeHtml(query)}”</div>
    <div>${count} result${count === 1 ? "" : "s"}</div>
  `;
  container.appendChild(box);
}

function renderArticleCardHtml(article) {
  const link = articleUrl(article.id, article.issueSlug);
  return `
    <article class="article-card">
      <h3><a href="${link}">${escapeHtml(article.title)}</a></h3>
      ${article.subtitle ? `<p class="muted">${escapeHtml(article.subtitle)}</p>` : ""}
      <div class="article-meta">
        ${escapeHtml(article.type || "Other")} · ${escapeHtml(formatDate(article.date))} ·
        <a href="${authorUrl(article.author)}" style="color: var(--accent); text-decoration: none; font-weight: 950;">
          ${escapeHtml(article.author)}
        </a>
      </div>
    </article>
  `;
}

function pickHomepageArticles(articles) {
  const sorted = sortByDateDesc(articles);

  const main = sorted.find((a) => a.frontPageSlot === "main") ||
               sorted.find((a) => a.featuredMain) ||
               sorted[0];

  const centerLead = sorted.find((a) => a.id !== main.id && a.frontPageSlot === "center-lead") ||
                     sorted.find((a) => a.id !== main.id);

  const centerCards = sorted
    .filter((a) => a.id !== main.id && a.id !== centerLead?.id && a.frontPageSlot === "center")
    .slice(0, 3);

  const rightCards = sorted
    .filter((a) => a.id !== main.id && a.id !== centerLead?.id && !centerCards.some((x) => x.id === a.id))
    .filter((a) => a.frontPageSlot === "right" || !a.frontPageSlot || a.frontPageSlot === "none")
    .slice(0, 6);

  return { main, centerLead, centerCards, rightCards };
}

function renderHomeHeroThreeColumns(issueSlug, articles) {
  const mainContainer = document.getElementById("hero-main");
  const centerContainer = document.getElementById("hero-center");
  const rightContainer = document.getElementById("hero-right");
  if (!mainContainer || !centerContainer || !rightContainer) return;

  const { main, centerLead, centerCards, rightCards } = pickHomepageArticles(articles);
  if (!main) return;

  const mainLink = articleUrl(main.id, issueSlug);

  mainContainer.innerHTML = `
    <article class="hero-main-article">
      <div class="hero-main-image-wrap">
        ${main.imageUrl ? `<a href="${mainLink}"><img class="hero-main-image" src="${main.imageUrl}" alt="${escapeHtml(main.title)}"></a>` : ""}
      </div>
      <div>
        <div class="hero-main-kicker">
          ${escapeHtml(main.category || "")}${main.date ? " | " + escapeHtml(formatDate(main.date)) : ""}
        </div>
        <h1 class="hero-main-title"><a href="${mainLink}">${escapeHtml(main.title)}</a></h1>
        ${main.subtitle ? `<p class="hero-main-dek">${escapeHtml(main.subtitle)}</p>` : ""}
        <p class="hero-main-byline">
          <a href="${authorUrl(main.author)}" style="color: inherit; text-decoration: none; font-weight: 950;">
            ${escapeHtml(main.author)}
          </a>
        </p>
      </div>
    </article>
  `;

  centerContainer.innerHTML = "";

  if (centerLead) {
    const centerLeadLink = articleUrl(centerLead.id, issueSlug);
    centerContainer.innerHTML += `
      <article class="center-lead-card">
        <div class="center-lead-image-wrap">
          ${centerLead.imageUrl ? `<a href="${centerLeadLink}"><img class="center-lead-image" src="${centerLead.imageUrl}" alt="${escapeHtml(centerLead.title)}"></a>` : ""}
        </div>
        <div class="center-kicker">
          ${escapeHtml(centerLead.category || "")}${centerLead.date ? " | " + escapeHtml(formatDate(centerLead.date)) : ""}
        </div>
        <h3 class="center-title"><a href="${centerLeadLink}">${escapeHtml(centerLead.title)}</a></h3>
        <p class="center-meta">
          <a href="${authorUrl(centerLead.author)}" style="color: inherit; text-decoration: none; font-weight: 950;">
            ${escapeHtml(centerLead.author)}
          </a>
        </p>
      </article>
    `;
  }

  centerCards.forEach((article) => {
    const link = articleUrl(article.id, issueSlug);
    centerContainer.innerHTML += `
      <article class="center-card">
        <div class="center-kicker">
          ${escapeHtml(article.category || "")}${article.date ? " | " + escapeHtml(formatDate(article.date)) : ""}
        </div>
        <h3 class="center-card-title"><a href="${link}">${escapeHtml(article.title)}</a></h3>
        <p class="center-card-meta">
          <a href="${authorUrl(article.author)}" style="color: inherit; text-decoration: none; font-weight: 950;">
            ${escapeHtml(article.author)}
          </a>
        </p>
      </article>
    `;
  });

  rightContainer.innerHTML = "";
  rightCards.forEach((article) => {
    const link = articleUrl(article.id, issueSlug);
    if (article.sponsored) {
      rightContainer.innerHTML += `
        <article class="right-card-sponsored">
          <div class="sponsored-label">Sponsored</div>
          <div class="sponsored-title">${escapeHtml(article.title)}</div>
          <div class="sponsored-meta">${escapeHtml(article.author)}</div>
        </article>
      `;
    } else {
      rightContainer.innerHTML += `
        <article class="right-card">
          <div class="right-kicker">
            ${escapeHtml(article.category || "")}${article.date ? " | " + escapeHtml(formatDate(article.date)) : ""}
          </div>
          <div class="right-title"><a href="${link}">${escapeHtml(article.title)}</a></div>
          <div class="right-meta">
            <a href="${authorUrl(article.author)}" style="color: inherit; text-decoration: none; font-weight: 950;">
              ${escapeHtml(article.author)}
            </a>
          </div>
        </article>
      `;
    }
  });
}

async function loadAllArticlesAcrossIssues(issues) {
  const all = [];
  for (const issue of issues) {
    const data = await loadIssueData(issue.slug);
    const fixed = (data.articles || []).map((a) => normalizeArticlePaths(issue.slug, a));
    all.push(...fixed);
  }
  return all;
}

function renderIssueArticles(issueMeta, issueArticles, query, allArticlesForSearch) {
  const headerTitle = document.getElementById("issue-title");
  const headerMeta = document.getElementById("issue-meta");
  const container = document.getElementById("issue-articles");
  if (!headerTitle || !container || !headerMeta) return;

  headerTitle.textContent = issueMeta.title;
  headerMeta.textContent = issueMeta.dateLabel;
  container.innerHTML = "";

  if (query) {
    const results = searchArticlesInList(query, allArticlesForSearch);
    renderSearchSummary(container, query, results.length);

    const grid = document.createElement("div");
    grid.className = "article-section-grid";
    grid.style.marginTop = "0.9rem";
    grid.innerHTML = results.map(renderArticleCardHtml).join("");
    container.appendChild(grid);
    return;
  }

  const typeOrder = ["Long Article", "Interview", "Opinion", "Other"];

  typeOrder.forEach((typeName) => {
    const list =
      typeName === "Other"
        ? issueArticles.filter((a) => !typeOrder.includes(a.type))
        : issueArticles.filter((a) => (a.type || "Other") === typeName);

    if (list.length === 0) return;

    const section = document.createElement("section");
    section.innerHTML = `
      <h3 class="article-section-title">${escapeHtml(typeName)}</h3>
      <div class="article-section-grid">
        ${list.map(renderArticleCardHtml).join("")}
      </div>
    `;
    container.appendChild(section);
  });
}

async function renderCurrentIssuePage() {
  const q = getQueryParam("q");
  const issues = await loadIssuesList();
  const current = getCurrentIssueFromList(issues);
  const issueData = await loadIssueData(current.slug);
  const issueArticles = (issueData.articles || []).map((a) => normalizeArticlePaths(current.slug, a));

  let allForSearch = [];
  if (q) allForSearch = await loadAllArticlesAcrossIssues(issues);

  renderIssueArticles(current, issueArticles, q, allForSearch);
}

async function renderIssuePage() {
  const slug = getQueryParam("issue");
  const q = getQueryParam("q");

  const issues = await loadIssuesList();
  const issueMeta = issues.find((i) => i.slug === slug);
  if (!issueMeta) {
    showPageError("Issue not found.");
    return;
  }

  const issueData = await loadIssueData(issueMeta.slug);
  const issueArticles = (issueData.articles || []).map((a) => normalizeArticlePaths(issueMeta.slug, a));

  let allForSearch = [];
  if (q) allForSearch = await loadAllArticlesAcrossIssues(issues);

  renderIssueArticles(issueMeta, issueArticles, q, allForSearch);
}

async function renderArticlePage() {
  const idRaw = getQueryParam("id");
  const issueSlug = getQueryParam("issue");
  const container = document.getElementById("article-container");
  if (!container) return;

  const articleId = Number(idRaw);
  if (!issueSlug || Number.isNaN(articleId)) {
    container.innerHTML = "<p>Article not found.</p>";
    return;
  }

  const issues = await loadIssuesList();
  const issueMeta = issues.find((i) => i.slug === issueSlug);
  if (!issueMeta) {
    container.innerHTML = "<p>Issue not found.</p>";
    return;
  }

  const issueData = await loadIssueData(issueSlug);
  const issueArticles = (issueData.articles || []).map((a) => normalizeArticlePaths(issueSlug, a));
  const article = issueArticles.find((a) => Number(a.id) === articleId);

  if (!article) {
    container.innerHTML = "<p>Article not found.</p>";
    return;
  }

  container.innerHTML = `
    <div class="article-page">
      <div class="article-breadcrumb">
        <a href="articles.html">Current Issue</a>
        • <a href="issue.html?issue=${encodeURIComponent(issueSlug)}">${escapeHtml(issueMeta.title)}</a>
      </div>

      <h1 class="article-title">${escapeHtml(article.title)}</h1>

      <div class="article-meta-full">
        <a href="${authorUrl(article.author)}" style="color: var(--accent); text-decoration: none; font-weight: 950;">
          ${escapeHtml(article.author)}
        </a>
        · ${escapeHtml(formatDate(article.date))}
        · ${escapeHtml(article.category || article.type || "")}
      </div>

      ${article.imageUrl ? `<img class="article-hero-image" src="${article.imageUrl}" alt="${escapeHtml(article.title)}">` : ""}

      ${article.imageCaption ? `<div class="article-image-caption" style="margin-top:-0.6rem; margin-bottom:1rem; color:var(--muted); font-size:0.92rem;">${escapeHtml(article.imageCaption)}</div>` : ""}

      <div class="article-body"><p>Loading…</p></div>

      ${article.citationsHtml ? `
        <section class="article-citations" style="margin-top:2rem;">
          <h2 style="font-size:1.1rem; margin-bottom:0.5rem;">Citations</h2>
          <div class="article-citations-body">${article.citationsHtml}</div>
        </section>
      ` : ""}
    </div>
  `;

  const bodyEl = container.querySelector(".article-body");

  if (!article.contentPath) {
    bodyEl.innerHTML = "<p>Full text coming soon.</p>";
    return;
  }

  fetch(article.contentPath)
    .then((res) => {
      if (!res.ok) throw new Error("Could not load article HTML");
      return res.text();
    })
    .then((html) => {
      bodyEl.innerHTML = html;
    })
    .catch(() => {
      bodyEl.innerHTML = "<p>Full text coming soon.</p>";
    });
}

async function renderArchivePage() {
  const grid = document.getElementById("issue-grid");
  if (!grid) return;

  const issues = await loadIssuesList();
  grid.innerHTML = "";

  issues.forEach((issue) => {
    const link = `issue.html?issue=${encodeURIComponent(issue.slug)}`;
    grid.innerHTML += `
      <article class="issue-card">
        <div class="issue-cover-wrap">
          ${issue.coverImage ? `<a href="${link}"><img src="${issue.coverImage}" alt="${escapeHtml(issue.title)} cover"></a>` : ""}
        </div>
        <a class="issue-title-link" href="${link}">${escapeHtml(issue.title)}</a>
        <div class="issue-date">${escapeHtml(issue.dateLabel)}</div>
      </article>
    `;
  });
}

async function renderAuthorsPage() {
  const container = document.getElementById("authors-container");
  if (!container) return;

  const issues = await loadIssuesList();
  const authorFilter = getQueryParam("author");
  const q = getQueryParam("q");
  const all = await loadAllArticlesAcrossIssues(issues);

  const map = new Map();
  all.forEach((a) => {
    const name = a.author || "Unknown";
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(a);
  });

  let authors = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));

  if (authorFilter) {
    authors = authors.filter((name) => normalize(name) === normalize(authorFilter));
  }

  container.innerHTML = "";

  if (q) {
    const results = searchArticlesInList(q, all);
    const resultAuthors = new Set(results.map((a) => a.author));
    authors = authors.filter((name) => normalize(name).includes(normalize(q)) || resultAuthors.has(name));
    renderSearchSummary(container, q, results.length);
  }

  const wrapper = document.createElement("div");
  wrapper.className = "author-grid";

  authors.forEach((name) => {
    const articles = (map.get(name) || []).sort((a, b) => new Date(b.date) - new Date(a.date));
    const list = authorFilter ? articles : articles.slice(0, 8);

    const block = document.createElement("section");
    block.className = "author-block";
    block.innerHTML = `
      <div class="author-name">${escapeHtml(name)}</div>
      <div class="author-count">${articles.length} article${articles.length === 1 ? "" : "s"}</div>
      <div class="article-section-grid">
        ${list.map(renderArticleCardHtml).join("")}
      </div>
    `;
    wrapper.appendChild(block);
  });

  container.appendChild(wrapper);
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadPartials();

    const page = document.body.dataset.page;

    if (page === "home") {
      const issues = await loadIssuesList();
      const current = getCurrentIssueFromList(issues);
      const data = await loadIssueData(current.slug);
      const articles = (data.articles || []).map((a) => normalizeArticlePaths(current.slug, a));
      renderHomeHeroThreeColumns(current.slug, articles);
    }

    if (page === "current-issue") await renderCurrentIssuePage();
    if (page === "issue") await renderIssuePage();
    if (page === "article") await renderArticlePage();
    if (page === "archive") await renderArchivePage();
    if (page === "authors") await renderAuthorsPage();
  } catch (err) {
    console.error(err);
    showPageError(String(err.message || err));
  }
});
