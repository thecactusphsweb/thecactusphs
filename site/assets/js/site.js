function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(iso) {
  const d = new Date(String(iso || "").replace(/-/g, "/"));
  if (Number.isNaN(d.getTime())) return String(iso || "");
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function authorAnchorId(name) {
  return `author-${String(name || "")
    .toLowerCase()
    .trim()
    .replace(/['’\"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}

function authorUrl(name) {
  return `/authors/?author=${encodeURIComponent(name)}#${authorAnchorId(name)}`;
}

function articleUrl(article) {
  return `/${encodeURIComponent(article.issueSlug)}/${encodeURIComponent(article.slug)}/`;
}

function articleCardHtml(article) {
  const heroPath = article.heroFilename ? `/${article.issueSlug}/${article.slug}/${article.heroFilename}` : "";
  return `
    <article class="article-card">
      ${heroPath ? `<a class="article-card-image-wrap" href="${articleUrl(article)}"><img class="article-card-image" src="${heroPath}" alt="${escapeHtml(article.title)}"></a>` : ""}
      <div class="article-card-content">
        <h3><a href="${articleUrl(article)}">${escapeHtml(article.title)}</a></h3>
        <div class="article-meta">
          <span class="article-type">${escapeHtml(article.type || article.category || "Article")}</span>
          <span class="article-meta-sep">·</span>
          <span>${escapeHtml(formatDate(article.date))}</span>
          <span class="article-meta-sep">·</span>
          <a class="author-link" href="${authorUrl(article.author)}">${escapeHtml(article.author)}</a>
        </div>
      </div>
    </article>`;
}

function searchScore(article, queryWords) {
  const title = String(article.title || "").toLowerCase();
  const author = String(article.author || "").toLowerCase();
  const category = String(article.category || "").toLowerCase();
  const type = String(article.type || "").toLowerCase();

  let score = 0;
  for (const word of queryWords) {
    if (!word) continue;
    if (title.includes(word)) score += 12;
    if (author.includes(word)) score += 8;
    if (category.includes(word)) score += 6;
    if (type.includes(word)) score += 6;
  }
  return score;
}

async function initSearchPage() {
  const root = document.querySelector("[data-search-results]");
  if (!root) return;

  const params = new URLSearchParams(location.search);
  const q = (params.get("q") || "").trim();
  const queryLabel = document.querySelector("[data-search-query]");
  const summary = document.querySelector("[data-search-summary]");

  if (queryLabel) queryLabel.textContent = q || "Search";

  if (!q) {
    if (summary) summary.textContent = "Enter a search term to find articles by title, author, or topic.";
    root.innerHTML = "";
    return;
  }

  const response = await fetch("/assets/data/search-index.json", { cache: "no-store" });
  const articles = await response.json();
  const queryWords = q.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = articles
    .map((article) => ({ article, score: searchScore(article, queryWords) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.article.date) - new Date(a.article.date))
    .map((entry) => entry.article);

  if (summary) {
    summary.textContent = matches.length
      ? `${matches.length} article${matches.length === 1 ? "" : "s"} found for “${q}”.`
      : `No articles found for “${q}”.`;
  }

  root.innerHTML = matches.length
    ? `<div class="article-section-grid">${matches.map(articleCardHtml).join("")}</div>`
    : "";
}

async function initAuthorPage() {
  const params = new URLSearchParams(location.search);
  const author = params.get("author");
  if (!author) return;
  const summary = document.querySelector("[data-author-summary]");
  if (summary) summary.textContent = `Showing entries for ${author}.`;
}

window.addEventListener("DOMContentLoaded", async () => {
  try {
    await initSearchPage();
    await initAuthorPage();
  } catch (err) {
    console.error(err);
  }
});
