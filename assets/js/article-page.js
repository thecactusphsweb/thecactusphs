const API_BASE = "https://the-cactus-admin-api.thecactusphsweb.workers.dev";

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
    day: "numeric"
  });
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
}

async function loadArticle() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const issueSlug = segments[0];
  const articleSlug = segments[1];

  const issue = await fetchApiJson(`/api/issues/${encodeURIComponent(issueSlug)}`);
  const articles = Array.isArray(issue.articles) ? issue.articles : [];
  const article = articles.find((a) => a.slug === articleSlug);

  if (!article) throw new Error("Article not found");

  document.title = `${article.title} – The Cactus`;

  const bodyResponse = await fetchApiJson(
    `/api/article-body?issueSlug=${encodeURIComponent(issueSlug)}&articleId=${encodeURIComponent(article.id)}`
  );

  const bodyHtml = bodyResponse.html || "";
  const heroFilename = article.heroFilename || article.imageUrl || "";
  const heroPath = heroFilename ? `/${issueSlug}/${article.slug}/${heroFilename}` : "";

  const container = document.getElementById("article-container");

  container.innerHTML = `
    <div class="article-page">
      <div class="article-breadcrumb">
        <a href="/${encodeURIComponent(issueSlug)}/">${escapeHtml(issue.title || issueSlug)}</a>
      </div>

      <h1 class="article-title">${escapeHtml(article.title)}</h1>

      <div class="article-meta-full">
        ${escapeHtml(article.author)} · ${escapeHtml(formatDate(article.date))} · ${escapeHtml(article.category || article.type || "")}
      </div>

      ${heroPath ? `<img class="article-hero-image" src="${heroPath}" alt="${escapeHtml(article.title)}">` : ""}

      ${article.imageCaption ? `<div class="article-image-caption" style="margin-top:-0.6rem; margin-bottom:1rem; color:var(--muted); font-size:0.92rem;">${escapeHtml(article.imageCaption)}</div>` : ""}

      <div class="article-body">${bodyHtml}</div>

      ${article.citationsText ? `
        <section class="article-citations" style="margin-top:2rem;">
          <h2 style="font-size:1.1rem; margin-bottom:0.5rem;">Citations</h2>
          <div class="article-citations-body" style="white-space: pre-wrap; line-height: 1.6;">${escapeHtml(article.citationsText)}</div>
        </section>
      ` : ""}
    </div>
  `;
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadPartials();
    await loadArticle();
  } catch (err) {
    console.error(err);
  }
});