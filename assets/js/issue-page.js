const API_BASE = "https://the-cactus-admin-api.thecactusphsweb.workers.dev";

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
      day: "numeric"
    });
  }

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;

  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function articleUrl(issueSlug, articleSlug) {
  return `/${encodeURIComponent(issueSlug)}/${encodeURIComponent(articleSlug)}/`;
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

async function loadPartials() {
  const headerMount = document.getElementById("header-mount");
  const footerMount = document.getElementById("footer-mount");

  if (headerMount) {
    const res = await fetch("/partials/header.html", { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load header");
    headerMount.innerHTML = await res.text();
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

function resolvePdfUrl(slug, issue) {
  const raw = issue.pdfUrl || "magazine.pdf";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw;
  return `/${slug}/${raw}`;
}

function resolveCoverUrl(slug, issue) {
  const coverFilename = issue.coverFilename || "cover.jpg";
  if (/^https?:\/\//i.test(coverFilename)) return coverFilename;
  if (coverFilename.startsWith("/")) return coverFilename;
  return `/${slug}/${coverFilename}`;
}

function resolveHeroUrl(issueSlug, article) {
  const heroFile = article.heroFilename || article.imageUrl || "";
  return heroFile ? `/${issueSlug}/${article.slug}/${heroFile}` : "";
}

function renderArticleCardHtml(issueSlug, article) {
  const link = articleUrl(issueSlug, article.slug);
  const heroUrl = resolveHeroUrl(issueSlug, article);

  return `
    <article class="article-card">
      ${heroUrl ? `
        <a class="article-card-image-wrap" href="${link}">
          <img class="article-card-image" src="${heroUrl}" alt="${escapeHtml(article.title)}">
        </a>
      ` : ""}
      <div class="article-card-content">
        <h3><a href="${link}">${escapeHtml(article.title)}</a></h3>
        ${article.subtitle ? `<p class="muted">${escapeHtml(article.subtitle)}</p>` : ""}
        <div class="article-meta">
          <a class="author-link" href="${authorUrl(article.author)}">${escapeHtml(article.author)}</a>
          · ${escapeHtml(formatDate(article.date))}
        </div>
      </div>
    </article>
  `;
}

async function loadIssue() {
  const slug = window.location.pathname.split("/").filter(Boolean)[0];
  const issue = await fetchApiJson(`/api/issues/${encodeURIComponent(slug)}`);

  const headerTitle = document.getElementById("issue-title");
  const headerMeta = document.getElementById("issue-meta");
  const container = document.getElementById("issue-articles");

  document.title = `${issue.title || slug} – The Cactus`;

  headerTitle.textContent = issue.title || slug;
  headerMeta.textContent = issue.dateLabel || "";
  container.innerHTML = "";

  const articles = Array.isArray(issue.articles) ? issue.articles : [];
  const typeOrder = ["Long Article", "Interview", "Opinion", "Other"];

  typeOrder.forEach((typeName) => {
    const list = typeName === "Other"
      ? articles.filter((a) => !typeOrder.includes(a.type))
      : articles.filter((a) => (a.type || "Other") === typeName);

    if (!list.length) return;

    const html = `
      <section>
        <h3 class="article-section-title">${escapeHtml(typeName)}</h3>
        <div class="article-section-grid">
          ${list.map((article) => renderArticleCardHtml(slug, article)).join("")}
        </div>
      </section>
    `;

    container.insertAdjacentHTML("beforeend", html);
  });

  const pdfUrl = resolvePdfUrl(slug, issue);
  const coverUrl = resolveCoverUrl(slug, issue);

  container.insertAdjacentHTML("beforeend", `
    <section class="issue-pdf-section">
      <h3 class="article-section-title">Full Magazine</h3>
      <a class="issue-pdf-card" href="${pdfUrl}" target="_blank" rel="noopener noreferrer">
        <div class="issue-pdf-cover-wrap">
          <img class="issue-pdf-cover" src="${coverUrl}" alt="${escapeHtml(issue.title || slug)} PDF cover">
        </div>
        <div class="issue-pdf-content">
          <div class="issue-pdf-label">View PDF Version of the Magazine</div>
          <div class="issue-pdf-title">${escapeHtml(issue.title || slug)}</div>
          <div class="issue-pdf-meta">${escapeHtml(issue.dateLabel || "")}</div>
          <div class="issue-pdf-button">Open PDF</div>
        </div>
      </a>
    </section>
  `);
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadPartials();
    await loadIssue();
  } catch (err) {
    console.error(err);
  }
});