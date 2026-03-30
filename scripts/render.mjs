import fs from "node:fs/promises";
import path from "node:path";

export function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function slugifyValue(s = "") {
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/[\'’"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function authorAnchorId(name) {
  return `author-${slugifyValue(name)}`;
}

export function authorUrl(name) {
  return `/authors/?author=${encodeURIComponent(name)}#${authorAnchorId(name)}`;
}

export function formatDate(iso) {
  const d = new Date(String(iso || "").replace(/-/g, "/"));
  if (Number.isNaN(d.getTime())) return String(iso || "");
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

export function issueUrl(issueSlug) {
  return `/${encodeURIComponent(issueSlug)}/`;
}

export function articleUrl(article) {
  return `/${encodeURIComponent(article.issueSlug)}/${encodeURIComponent(article.slug)}/`;
}

export async function loadContent(siteDir) {
  const issues = JSON.parse(await fs.readFile(path.join(siteDir, "assets/data/issues.json"), "utf8"));
  const issueMap = [];
  for (const issue of issues) {
    const issueDir = path.join(siteDir, "content", issue.slug);
    const issueJson = JSON.parse(await fs.readFile(path.join(issueDir, "issue.json"), "utf8"));
    const articles = [];
    for (const article of issueJson.articles || []) {
      const articleDir = path.join(issueDir, article.slug);
      let bodyHtml = "";
      try {
        bodyHtml = await fs.readFile(path.join(articleDir, "body.html"), "utf8");
      } catch {}
      articles.push({
        ...article,
        issueSlug: issue.slug,
        issueTitle: issueJson.title,
        issueDateLabel: issueJson.dateLabel,
        bodyHtml
      });
    }
    issueMap.push({ ...issue, ...issueJson, articles });
  }
  return issueMap;
}

export function renderHeader(currentNav = "", currentIssueHref = "/") {
  return `<header class="site-header">
  <div class="container header-top">
    <div class="header-left"><div class="header-date">${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div></div>
    <a href="/" class="brand">
      <img class="brand-logo" src="/assets/img/cactus-logo.jpg" alt="The Cactus logo" />
      <span class="brand-name">The Cactus</span>
    </a>
    <form class="header-search" action="/search/" method="GET">
      <input id="site-search-input" class="search-input" type="search" name="q" placeholder="Search articles…" />
      <button class="search-button" type="submit">Search</button>
    </form>
  </div>
  <div class="navbar">
    <div class="container nav-inner">
      <nav class="nav-links">
        <a href="/" ${currentNav === "home" ? 'aria-current="page"' : ""}>Home</a>
        <a href="${currentIssueHref}" ${currentNav === "current" ? 'aria-current="page"' : ""}>Current Issue</a>
        <a href="/archive/" ${currentNav === "archive" ? 'aria-current="page"' : ""}>Archive</a>
        <a href="/authors/" ${currentNav === "authors" ? 'aria-current="page"' : ""}>Authors</a>
        <a href="/about/" ${currentNav === "about" ? 'aria-current="page"' : ""}>About</a>
        <a href="/sponsors/" ${currentNav === "sponsors" ? 'aria-current="page"' : ""}>Sponsors</a>
      </nav>
    </div>
  </div>
</header>`;
}

export function renderFooter() {
  return `<footer class="site-footer"><div class="container footer-inner"><p>© ${new Date().getFullYear()} The Cactus</p><p class="footer-note">Designed and coded by the Cactus web team.</p></div></footer>`;
}

export function pageShell({ title, description, canonicalPath, currentNav = "", currentIssueHref = "/", body, extraHead = "" }) {
  const canonical = `https://thecactusphs.com${canonicalPath}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${canonical}" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" href="/assets/img/favicon-48.png" type="image/png" sizes="48x48" />
  <link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${canonical}" />
  <link rel="stylesheet" href="/assets/css/styles.css" />
  <script defer src="/assets/js/site.js"></script>
  ${extraHead}
</head>
<body>
  ${renderHeader(currentNav, currentIssueHref)}
  <main class="site-main container">${body}</main>
  ${renderFooter()}
</body>
</html>`;
}

export function renderArticleCardHtml(article, extraClass = "") {
  const heroFile = article.heroFilename || article.imageUrl || "";
  const heroPath = heroFile ? `/${article.issueSlug}/${article.slug}/${heroFile}` : "";
  const link = articleUrl(article);
  return `
    <article class="article-card ${extraClass}">
      ${heroPath ? `<a class="article-card-image-wrap" href="${link}"><img class="article-card-image" src="${heroPath}" alt="${escapeHtml(article.title)}"></a>` : ""}
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
    </article>`;
}
