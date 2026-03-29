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

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function issueUrl(issueSlug) { return `/${encodeURIComponent(issueSlug)}/`; }
function articleUrl(article) { return `/${encodeURIComponent(article.issueSlug)}/${encodeURIComponent(article.slug)}/`; }

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

async function loadIssuesList() {
  if (window.__CACTUS_ISSUES__) return window.__CACTUS_ISSUES__;
  const issues = await fetchJson("/assets/data/issues.json");
  window.__CACTUS_ISSUES__ = issues || [];
  return window.__CACTUS_ISSUES__;
}

async function loadIssueData(slug) {
  const data = await fetchJson(`/${slug}/issue.json`);
  const articles = Array.isArray(data.articles) ? data.articles : [];
  return { slug, ...data, articles };
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

function renderArticleCardHtml(article) {
  const link = articleUrl(article);
  return `
    <article class="article-card">
      <h3><a href="${link}">${escapeHtml(article.title)}</a></h3>
      ${article.subtitle ? `<p class="muted">${escapeHtml(article.subtitle)}</p>` : ""}
      <div class="article-meta">
        ${escapeHtml(article.type || "Other")} · ${escapeHtml(formatDate(article.date))} ·
        <a href="/authors/?author=${encodeURIComponent(article.author)}" style="color: var(--accent); text-decoration: none; font-weight: 950;">
          ${escapeHtml(article.author)}
        </a>
      </div>
    </article>
  `;
}

function sortByDateDesc(list) {
  return [...list].sort((a, b) => new Date(b.date) - new Date(a.date));
}

function renderHomeHeroThreeColumns(articles) {
  const mainContainer = document.getElementById("hero-main");
  const centerContainer = document.getElementById("hero-center");
  const rightContainer = document.getElementById("hero-right");
  if (!mainContainer || !centerContainer || !rightContainer || !articles.length) return;

  const sorted = sortByDateDesc(articles);
  const main = sorted.find((a) => a.frontPageSlot === "main") || sorted[0];
  const centerLead = sorted.find((a) => a.slug !== main.slug && a.frontPageSlot === "center-lead") ||
                     sorted.find((a) => a.slug !== main.slug);
  const centerCards = sorted
    .filter((a) => a.slug !== main.slug && a.slug !== centerLead?.slug && a.frontPageSlot === "center")
    .slice(0, 3);
  const rightCards = sorted
    .filter((a) => a.slug !== main.slug && a.slug !== centerLead?.slug && !centerCards.some((x) => x.slug === a.slug))
    .slice(0, 6);

  mainContainer.innerHTML = `
    <article class="hero-main-article">
      <div class="hero-main-image-wrap">
        ${main.imageUrl ? `<a href="${articleUrl(main)}"><img class="hero-main-image" src="/${main.issueSlug}/${main.slug}/${main.heroFilename || main.imageUrl}" alt="${escapeHtml(main.title)}"></a>` : ""}
      </div>
      <div>
        <div class="hero-main-kicker">
          ${escapeHtml(main.category || "")}${main.date ? " | " + escapeHtml(formatDate(main.date)) : ""}
        </div>
        <h1 class="hero-main-title"><a href="${articleUrl(main)}">${escapeHtml(main.title)}</a></h1>
        ${main.subtitle ? `<p class="hero-main-dek">${escapeHtml(main.subtitle)}</p>` : ""}
        <p class="hero-main-byline">${escapeHtml(main.author)}</p>
      </div>
    </article>
  `;

  centerContainer.innerHTML = "";
  if (centerLead) {
    centerContainer.innerHTML += `
      <article class="center-lead-card">
        <div class="center-lead-image-wrap">
          ${centerLead.imageUrl ? `<a href="${articleUrl(centerLead)}"><img class="center-lead-image" src="/${centerLead.issueSlug}/${centerLead.slug}/${centerLead.heroFilename || centerLead.imageUrl}" alt="${escapeHtml(centerLead.title)}"></a>` : ""}
        </div>
        <div class="center-kicker">${escapeHtml(centerLead.category || "")}${centerLead.date ? " | " + escapeHtml(formatDate(centerLead.date)) : ""}</div>
        <h3 class="center-title"><a href="${articleUrl(centerLead)}">${escapeHtml(centerLead.title)}</a></h3>
        <p class="center-meta">${escapeHtml(centerLead.author)}</p>
      </article>
    `;
  }

  centerCards.forEach((article) => {
    centerContainer.innerHTML += `
      <article class="center-card">
        <div class="center-kicker">${escapeHtml(article.category || "")}${article.date ? " | " + escapeHtml(formatDate(article.date)) : ""}</div>
        <h3 class="center-card-title"><a href="${articleUrl(article)}">${escapeHtml(article.title)}</a></h3>
        <p class="center-card-meta">${escapeHtml(article.author)}</p>
      </article>
    `;
  });

  rightContainer.innerHTML = "";
  rightCards.forEach((article) => {
    rightContainer.innerHTML += `
      <article class="right-card">
        <div class="right-kicker">${escapeHtml(article.category || "")}${article.date ? " | " + escapeHtml(formatDate(article.date)) : ""}</div>
        <div class="right-title"><a href="${articleUrl(article)}">${escapeHtml(article.title)}</a></div>
        <div class="right-meta">${escapeHtml(article.author)}</div>
      </article>
    `;
  });
}

async function renderArchivePage() {
  const grid = document.getElementById("issue-grid");
  if (!grid) return;
  const issues = await loadIssuesList();
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

  const issues = await loadIssuesList();
  const all = [];
  for (const issue of issues) {
    const data = await loadIssueData(issue.slug);
    all.push(...data.articles.map((a) => ({ ...a, issueSlug: issue.slug })));
  }

  const map = new Map();
  all.forEach((a) => {
    const name = a.author || "Unknown";
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(a);
  });

  const wrapper = document.createElement("div");
  wrapper.className = "author-grid";
  Array.from(map.keys()).sort((a,b)=>a.localeCompare(b)).forEach((name) => {
    const articles = map.get(name).sort((a,b)=>new Date(b.date)-new Date(a.date));
    const block = document.createElement("section");
    block.className = "author-block";
    block.innerHTML = `
      <div class="author-name">${escapeHtml(name)}</div>
      <div class="author-count">${articles.length} article${articles.length === 1 ? "" : "s"}</div>
      <div class="article-section-grid">
        ${articles.slice(0,8).map(renderArticleCardHtml).join("")}
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
      const articles = data.articles.map((a) => ({ ...a, issueSlug: current.slug }));
      renderHomeHeroThreeColumns(articles);
    }
    if (page === "archive") await renderArchivePage();
    if (page === "authors") await renderAuthorsPage();
  } catch (err) {
    console.error(err);
    showPageError(String(err.message || err));
  }
});
