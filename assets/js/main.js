const SITE_DATA_PATH = "/data/site.json";

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

async function fetchText(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.text();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function sortByDateDesc(list) {
  return [...list].sort((a, b) => new Date(b.date) - new Date(a.date));
}

function articleUrl(issueSlug, articleSlug) {
  return `/${encodeURIComponent(issueSlug)}/${encodeURIComponent(articleSlug)}/`;
}

function issueUrl(issueSlug) {
  return `/${encodeURIComponent(issueSlug)}/`;
}

function authorUrl(name) {
  return `/authors/?author=${encodeURIComponent(name)}`;
}

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  const v = params.get(name);
  return v ? v.trim() : "";
}

function normalize(s) {
  return String(s || "").toLowerCase().trim();
}

async function loadShell() {
  const headerMount = document.getElementById("header-mount");
  const footerMount = document.getElementById("footer-mount");

  if (headerMount) {
    headerMount.innerHTML = await fetchText("/partials/header.html");
    const navKey = document.body.dataset.nav || "";
    const activeLink = headerMount.querySelector(`[data-nav="${navKey}"]`);
    if (activeLink) activeLink.setAttribute("aria-current", "page");
  }

  if (footerMount) {
    footerMount.innerHTML = await fetchText("/partials/footer.html");
    const year = document.getElementById("year");
    if (year) year.textContent = new Date().getFullYear();
  }

  const dateEl = document.getElementById("header-date");
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }

  const q = getQueryParam("q");
  const input = document.getElementById("site-search-input");
  if (input && q) input.value = q;
}

function showError(message) {
  const el = document.getElementById("page-error");
  if (!el) return;
  el.hidden = false;
  el.className = "error-box";
  el.textContent = message;
}

function flattenArticles(site) {
  return (site.issues || []).flatMap((issue) =>
    (issue.articles || []).map((article) => ({ ...article, issueSlug: issue.slug, issueTitle: issue.title }))
  );
}

function getCurrentIssue(site) {
  return (site.issues || []).find((issue) => issue.isCurrent) || (site.issues || [])[0] || null;
}

function updateCurrentIssueLink(site) {
  const link = document.querySelector('[data-nav="current"]');
  const current = getCurrentIssue(site);
  if (link && current) link.href = issueUrl(current.slug);
}

function renderArticleCardHtml(article) {
  return `
    <article class="article-card">
      <h3><a href="${articleUrl(article.issueSlug, article.slug)}">${escapeHtml(article.title)}</a></h3>
      ${article.subtitle ? `<p class="muted">${escapeHtml(article.subtitle)}</p>` : ""}
      <div class="article-meta">
        ${escapeHtml(article.type || "Other")} · ${escapeHtml(formatDate(article.date))} ·
        <a href="${authorUrl(article.author)}" style="color: var(--accent); text-decoration: none; font-weight: 950;">${escapeHtml(article.author)}</a>
      </div>
    </article>
  `;
}

function searchArticles(query, articles) {
  const q = normalize(query);
  if (!q) return [];
  return articles
    .map((article) => {
      const haystack = [
        article.title,
        article.subtitle,
        article.author,
        article.category,
        article.type,
        article.imageCaption,
        ...(article.tags || [])
      ].map(normalize).join(" | ");
      let score = 0;
      if (normalize(article.title).includes(q)) score += 3;
      if (haystack.includes(q)) score += 1;
      return { article, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.article.date) - new Date(a.article.date))
    .map((x) => x.article);
}

function renderSearchSummary(container, query, count) {
  const box = document.createElement("div");
  box.className = "search-summary";
  box.innerHTML = `<div><strong>Search:</strong> “${escapeHtml(query)}”</div><div>${count} result${count === 1 ? "" : "s"}</div>`;
  container.appendChild(box);
}

function pickHomepageArticles(articles) {
  const sorted = sortByDateDesc(articles);
  const main = sorted.find((a) => a.frontPageSlot === "main") || sorted.find((a) => a.featuredMain) || sorted[0];
  const centerLead = sorted.find((a) => a.id !== main?.id && a.frontPageSlot === "center-lead") || sorted.find((a) => a.id !== main?.id);
  const centerCards = sorted.filter((a) => a.id !== main?.id && a.id !== centerLead?.id && a.frontPageSlot === "center").slice(0, 3);
  const rightCards = sorted.filter((a) => a.id !== main?.id && a.id !== centerLead?.id && !centerCards.some((x) => x.id === a.id))
    .filter((a) => a.frontPageSlot === "right" || !a.frontPageSlot || a.frontPageSlot === "none")
    .slice(0, 6);
  return { main, centerLead, centerCards, rightCards };
}

function renderHome(site) {
  const current = getCurrentIssue(site);
  if (!current) {
    showError("No issues published yet.");
    return;
  }

  const articles = (current.articles || []).map((article) => ({ ...article, issueSlug: current.slug }));
  const { main, centerLead, centerCards, rightCards } = pickHomepageArticles(articles);
  const mainContainer = document.getElementById("hero-main");
  const centerContainer = document.getElementById("hero-center");
  const rightContainer = document.getElementById("hero-right");

  if (!mainContainer || !centerContainer || !rightContainer || !main) return;

  mainContainer.innerHTML = `
    <article class="hero-main-article">
      <div class="hero-main-image-wrap">
        ${main.imageUrl ? `<a href="${articleUrl(main.issueSlug, main.slug)}"><img class="hero-main-image" src="${main.imageUrl}" alt="${escapeHtml(main.title)}"></a>` : ""}
      </div>
      <div>
        <div class="hero-main-kicker">${escapeHtml(main.category || "")}${main.date ? " | " + escapeHtml(formatDate(main.date)) : ""}</div>
        <h1 class="hero-main-title"><a href="${articleUrl(main.issueSlug, main.slug)}">${escapeHtml(main.title)}</a></h1>
        ${main.subtitle ? `<p class="hero-main-dek">${escapeHtml(main.subtitle)}</p>` : ""}
        <p class="hero-main-byline"><a href="${authorUrl(main.author)}" style="color: inherit; text-decoration: none; font-weight: 950;">${escapeHtml(main.author)}</a></p>
      </div>
    </article>
  `;

  centerContainer.innerHTML = "";
  if (centerLead) {
    centerContainer.innerHTML += `
      <article class="center-lead-card">
        <div class="center-lead-image-wrap">
          ${centerLead.imageUrl ? `<a href="${articleUrl(centerLead.issueSlug, centerLead.slug)}"><img class="center-lead-image" src="${centerLead.imageUrl}" alt="${escapeHtml(centerLead.title)}"></a>` : ""}
        </div>
        <div class="center-kicker">${escapeHtml(centerLead.category || "")}${centerLead.date ? " | " + escapeHtml(formatDate(centerLead.date)) : ""}</div>
        <h3 class="center-title"><a href="${articleUrl(centerLead.issueSlug, centerLead.slug)}">${escapeHtml(centerLead.title)}</a></h3>
        <p class="center-meta"><a href="${authorUrl(centerLead.author)}" style="color: inherit; text-decoration: none; font-weight: 950;">${escapeHtml(centerLead.author)}</a></p>
      </article>
    `;
  }

  centerCards.forEach((article) => {
    centerContainer.innerHTML += `
      <article class="center-card">
        <div class="center-kicker">${escapeHtml(article.category || "")}${article.date ? " | " + escapeHtml(formatDate(article.date)) : ""}</div>
        <h3 class="center-card-title"><a href="${articleUrl(article.issueSlug, article.slug)}">${escapeHtml(article.title)}</a></h3>
        <p class="center-card-meta"><a href="${authorUrl(article.author)}" style="color: inherit; text-decoration: none; font-weight: 950;">${escapeHtml(article.author)}</a></p>
      </article>
    `;
  });

  rightContainer.innerHTML = "";
  rightCards.forEach((article) => {
    if (article.sponsored) {
      rightContainer.innerHTML += `
        <article class="right-card-sponsored">
          <div class="sponsored-label">Sponsored</div>
          <div class="right-title">${escapeHtml(article.title)}</div>
          <div class="right-meta">${escapeHtml(article.author)}</div>
        </article>
      `;
    } else {
      rightContainer.innerHTML += `
        <article class="right-card">
          <div class="right-kicker">${escapeHtml(article.category || "")}${article.date ? " | " + escapeHtml(formatDate(article.date)) : ""}</div>
          <div class="right-title"><a href="${articleUrl(article.issueSlug, article.slug)}">${escapeHtml(article.title)}</a></div>
          <div class="right-meta"><a href="${authorUrl(article.author)}" style="color: inherit; text-decoration: none; font-weight: 950;">${escapeHtml(article.author)}</a></div>
        </article>
      `;
    }
  });
}

function renderIssuePdfCard(issue) {
  return `
    <section class="issue-pdf-section">
      <h3 class="article-section-title">Full Magazine</h3>
      <a class="issue-pdf-card" href="${issue.pdfUrl || issueUrl(issue.slug) + "magazine.pdf"}" target="_blank" rel="noopener noreferrer">
        <div class="issue-pdf-cover-wrap">
          ${issue.coverImage ? `<img class="issue-pdf-cover" src="${issue.coverImage}" alt="${escapeHtml(issue.title)} cover">` : ""}
        </div>
        <div class="issue-pdf-content">
          <div class="issue-pdf-label">View PDF Version of the Magazine</div>
          <div class="issue-pdf-title">${escapeHtml(issue.title)}</div>
          <div class="issue-pdf-meta">${escapeHtml(issue.dateLabel || "")}</div>
          <div class="issue-pdf-button">Open PDF</div>
        </div>
      </a>
    </section>
  `;
}

function renderIssue(site) {
  const issueSlug = document.body.dataset.issueSlug || "";
  const issue = (site.issues || []).find((x) => x.slug === issueSlug);
  if (!issue) {
    showError("Issue not found.");
    return;
  }

  document.title = `${issue.title} – The Cactus`;
  const headerTitle = document.getElementById("issue-title");
  const headerMeta = document.getElementById("issue-meta");
  const container = document.getElementById("issue-articles");
  if (!headerTitle || !headerMeta || !container) return;

  headerTitle.textContent = issue.title;
  headerMeta.textContent = issue.dateLabel || "";
  container.innerHTML = "";

  const articles = (issue.articles || []).map((article) => ({ ...article, issueSlug: issue.slug }));
  const typeOrder = ["Long Article", "Interview", "Opinion", "Other"];

  typeOrder.forEach((typeName) => {
    const list = typeName === "Other"
      ? articles.filter((article) => !typeOrder.includes(article.type))
      : articles.filter((article) => (article.type || "Other") === typeName);

    if (!list.length) return;

    const section = document.createElement("section");
    section.innerHTML = `
      <h3 class="article-section-title">${escapeHtml(typeName)}</h3>
      <div class="article-section-grid">${list.map(renderArticleCardHtml).join("")}</div>
    `;
    container.appendChild(section);
  });

  container.insertAdjacentHTML("beforeend", renderIssuePdfCard(issue));
}

async function renderArticle(site) {
  const issueSlug = document.body.dataset.issueSlug || "";
  const articleSlug = document.body.dataset.articleSlug || "";
  const issue = (site.issues || []).find((x) => x.slug === issueSlug);
  const article = (issue?.articles || []).find((x) => x.slug === articleSlug);

  if (!issue || !article) {
    showError("Article not found.");
    return;
  }

  document.title = `${article.title} – The Cactus`;
  const container = document.getElementById("article-container");
  if (!container) return;

  container.innerHTML = `
    <div class="article-page">
      <div class="article-breadcrumb"><a href="${issueUrl(issue.slug)}">${escapeHtml(issue.title)}</a></div>
      <h1 class="article-title">${escapeHtml(article.title)}</h1>
      ${article.subtitle ? `<div class="preview-subtitle">${escapeHtml(article.subtitle)}</div>` : ""}
      <div class="article-meta-full">
        <a href="${authorUrl(article.author)}" style="color: var(--accent); text-decoration: none; font-weight: 950;">${escapeHtml(article.author)}</a>
        · ${escapeHtml(formatDate(article.date))}
        · ${escapeHtml(article.category || article.type || "")}
      </div>
      ${article.imageUrl ? `<img class="article-hero-image" src="${article.imageUrl}" alt="${escapeHtml(article.title)}">` : ""}
      ${article.imageCaption ? `<div style="margin-top:-0.6rem; margin-bottom:1rem; color:var(--muted); font-size:0.92rem;">${escapeHtml(article.imageCaption)}</div>` : ""}
      <div class="article-body"><p>Loading…</p></div>
      ${article.citationsText ? `<section style="margin-top:2rem;"><h2 style="font-size:1.1rem; margin-bottom:0.5rem;">Citations</h2><div style="white-space: pre-wrap; line-height: 1.6;">${escapeHtml(article.citationsText)}</div></section>` : ""}
    </div>
  `;

  const bodyEl = container.querySelector(".article-body");
  const html = await fetchText(article.contentPath);
  bodyEl.innerHTML = html || "<p>Full text coming soon.</p>";
}

function renderArchives(site) {
  const grid = document.getElementById("issue-grid");
  if (!grid) return;
  grid.innerHTML = "";

  const q = getQueryParam("q");
  if (q) {
    const allArticles = flattenArticles(site);
    const results = searchArticles(q, allArticles);
    renderSearchSummary(grid, q, results.length);
    const resultsWrap = document.createElement("div");
    resultsWrap.className = "article-section-grid";
    resultsWrap.style.marginTop = "1rem";
    resultsWrap.innerHTML = results.map(renderArticleCardHtml).join("");
    grid.appendChild(resultsWrap);
    return;
  }

  (site.issues || []).forEach((issue) => {
    grid.innerHTML += `
      <article class="issue-card">
        <div class="issue-cover-wrap">${issue.coverImage ? `<a href="${issueUrl(issue.slug)}"><img src="${issue.coverImage}" alt="${escapeHtml(issue.title)} cover"></a>` : ""}</div>
        <a class="issue-title-link" href="${issueUrl(issue.slug)}">${escapeHtml(issue.title)}</a>
        <div class="issue-date">${escapeHtml(issue.dateLabel || "")}</div>
      </article>
    `;
  });
}

function renderAuthors(site) {
  const container = document.getElementById("authors-container");
  if (!container) return;

  const allArticles = flattenArticles(site);
  const authorFilter = getQueryParam("author");
  const q = getQueryParam("q");
  const map = new Map();

  allArticles.forEach((article) => {
    const key = article.author || "Unknown";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(article);
  });

  let authors = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
  if (authorFilter) authors = authors.filter((name) => normalize(name) === normalize(authorFilter));

  container.innerHTML = "";

  if (q) {
    const results = searchArticles(q, allArticles);
    const resultAuthors = new Set(results.map((article) => article.author));
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
      <div class="article-section-grid">${list.map(renderArticleCardHtml).join("")}</div>
    `;
    wrapper.appendChild(block);
  });

  container.appendChild(wrapper);
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadShell();
    const site = await fetchJson(SITE_DATA_PATH);
    updateCurrentIssueLink(site);

    const page = document.body.dataset.page;
    if (page === "home") renderHome(site);
    if (page === "issue") renderIssue(site);
    if (page === "article") await renderArticle(site);
    if (page === "archives") renderArchives(site);
    if (page === "authors") renderAuthors(site);
  } catch (error) {
    console.error(error);
    showError(String(error.message || error));
  }
});
