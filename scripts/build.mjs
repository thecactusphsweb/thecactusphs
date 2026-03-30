import fs from "node:fs/promises";
import path from "node:path";
import {
  loadContent,
  pageShell,
  renderArticleCardHtml,
  issueUrl,
  articleUrl,
  authorUrl,
  authorAnchorId,
  escapeHtml,
  formatDate
} from "./render.mjs";

const root = path.resolve(process.cwd());
const siteDir = path.join(root, "site");
const distDir = path.join(root, "dist");

async function rm(p) { await fs.rm(p, { recursive: true, force: true }); }
async function mkdir(p) { await fs.mkdir(p, { recursive: true }); }
async function copyDir(src, dst) { await fs.cp(src, dst, { recursive: true }); }

function pickHomeColumns(currentArticles) {
  const slotted = currentArticles.filter((a) => ["main", "center-lead", "center", "right"].includes(a.frontPageSlot));
  const unslotted = currentArticles.filter((a) => !slotted.includes(a));

  let main = slotted.find((a) => a.frontPageSlot === "main") || currentArticles[0] || null;
  const center = [];
  const right = [];
  const used = new Set(main ? [main] : []);

  const centerLead = slotted.find((a) => a.frontPageSlot === "center-lead");
  if (centerLead && !used.has(centerLead)) {
    center.push(centerLead);
    used.add(centerLead);
  }

  for (const a of slotted.filter((x) => x.frontPageSlot === "center")) {
    if (center.length >= 2 || used.has(a)) continue;
    center.push(a);
    used.add(a);
  }

  for (const a of slotted.filter((x) => x.frontPageSlot === "right")) {
    if (right.length >= 4 || used.has(a)) continue;
    right.push(a);
    used.add(a);
  }

  for (const a of unslotted) {
    if (used.has(a)) continue;
    if (center.length < 2) {
      center.push(a);
    } else if (right.length < 4) {
      right.push(a);
    }
    used.add(a);
  }

  return { main, center, right };
}

const issues = await loadContent(siteDir);
await rm(distDir);
await mkdir(distDir);
await copyDir(path.join(siteDir, "assets"), path.join(distDir, "assets"));
await copyDir(path.join(siteDir, "admin"), path.join(distDir, "admin"));
await copyDir(path.join(siteDir, "content"), distDir);

const current = issues.find((i) => i.isCurrent) || issues[0];
const currentIssueHref = current ? issueUrl(current.slug) : "/archive/";
const currentArticles = current?.articles || [];
const { main, center, right } = pickHomeColumns(currentArticles);

const homeBody = `
<section class="section">
  <div class="section-header">
    <h2>${escapeHtml(current?.title || "Current Issue")}</h2>
    <p>${escapeHtml(current?.dateLabel || "")}</p>
  </div>
  <div class="home-grid-3">
    <div class="home-col home-col-main">
      ${main ? renderArticleCardHtml(main, "home-card home-card-main") : ""}
    </div>
    <div class="home-col home-col-center">
      ${center.map((article, index) => renderArticleCardHtml(article, `home-card ${index === 0 ? "home-card-medium" : "home-card-compact"}`)).join("")}
    </div>
    <div class="home-col home-col-right">
      ${right.map((article) => renderArticleCardHtml(article, "home-card home-card-compact home-card-tight")).join("")}
    </div>
  </div>
</section>`;

await fs.writeFile(path.join(distDir, "index.html"), pageShell({
  title: "The Cactus",
  description: "The Cactus is a student science and ideas magazine.",
  canonicalPath: "/",
  currentNav: "home",
  currentIssueHref,
  body: homeBody
}));

const archiveBody = `
<section class="section">
  <div class="section-header"><h2>Archive</h2><p>Browse past issues by cover.</p></div>
  <div class="issue-grid">
    ${issues.map((issue) => `<article class="issue-card"><div class="issue-cover-wrap"><a href="${issueUrl(issue.slug)}"><img src="/${issue.slug}/${issue.coverFilename || "cover.png"}" alt="${escapeHtml(issue.title)} cover"></a></div><a class="issue-title-link" href="${issueUrl(issue.slug)}">${escapeHtml(issue.title)}</a><div class="issue-date">${escapeHtml(issue.dateLabel || "")}</div></article>`).join("")}
  </div>
</section>`;
await mkdir(path.join(distDir, "archive"));
await fs.writeFile(path.join(distDir, "archive/index.html"), pageShell({
  title: "The Cactus – Archive",
  description: "Browse past issues of The Cactus.",
  canonicalPath: "/archive/",
  currentNav: "archive",
  currentIssueHref,
  body: archiveBody
}));

const allArticles = issues.flatMap((i) => i.articles);
const byAuthor = new Map();
for (const a of allArticles) {
  const name = a.author || "Unknown";
  if (!byAuthor.has(name)) byAuthor.set(name, []);
  byAuthor.get(name).push(a);
}

const authorSortKey = (name) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  const last = parts[parts.length - 1].toLowerCase();
  const first = parts.slice(0, -1).join(" ").toLowerCase();
  return `${last}|${first}`;
};

const authorsBody = `<section class="section"><div class="section-header"><h2>Authors</h2><p>Browse by author.</p></div><div class="author-grid">
${[...byAuthor.entries()].sort((a, b) => authorSortKey(a[0]).localeCompare(authorSortKey(b[0]))).map(([name, arts]) => `<section class="author-block" id="${authorAnchorId(name)}"><div class="author-name">${escapeHtml(name)}</div><div class="author-count">${arts.length} article${arts.length === 1 ? "" : "s"}</div><div class="article-section-grid">${arts.map((article) => renderArticleCardHtml(article)).join("")}</div></section>`).join("")}
</div></section>`;
await mkdir(path.join(distDir, "authors"));
await fs.writeFile(path.join(distDir, "authors/index.html"), pageShell({
  title: "The Cactus – Authors",
  description: "Browse articles by author.",
  canonicalPath: "/authors/",
  currentNav: "authors",
  currentIssueHref,
  body: authorsBody
}));

for (const issue of issues) {
  const issueDir = path.join(distDir, issue.slug);
  await mkdir(issueDir);
  const typeOrder = ["Long Article", "Interview", "Opinion", "Other"];
  const sections = typeOrder.map((typeName) => {
    const list = typeName === "Other"
      ? issue.articles.filter((a) => !["Long Article", "Interview", "Opinion"].includes(a.type))
      : issue.articles.filter((a) => (a.type || "Other") === typeName);
    if (!list.length) return "";
    return `<section><h3 class="article-section-title">${escapeHtml(typeName)}</h3><div class="article-section-grid">${list.map((article) => renderArticleCardHtml(article)).join("")}</div></section>`;
  }).join("");

  const issueBody = `<section class="section"><header class="issue-header"><h1 class="issue-header-title">${escapeHtml(issue.title)}</h1><div class="issue-header-meta">${escapeHtml(issue.dateLabel || "")}</div></header><div class="article-list-layout">${sections}<section class="issue-pdf-section"><h3 class="article-section-title">Full Magazine</h3><a class="issue-pdf-card" href="${escapeHtml(issue.pdfUrl)}" target="_blank" rel="noopener noreferrer"><div class="issue-pdf-cover-wrap"><img class="issue-pdf-cover" src="/${issue.slug}/${issue.coverFilename || "cover.png"}" alt="${escapeHtml(issue.title)} PDF cover"></div><div class="issue-pdf-content"><div class="issue-pdf-label">View PDF Version of the Magazine</div><div class="issue-pdf-title">${escapeHtml(issue.title)}</div><div class="issue-pdf-meta">${escapeHtml(issue.dateLabel || "")}</div><div class="issue-pdf-button">Open PDF</div></div></a></section></div></section>`;

  await fs.writeFile(path.join(issueDir, "index.html"), pageShell({
    title: `${issue.title} – The Cactus`,
    description: `${issue.title} issue of The Cactus.`,
    canonicalPath: `/${issue.slug}/`,
    currentNav: issue.slug === current?.slug ? "current" : "",
    currentIssueHref,
    body: issueBody
  }));

  for (const article of issue.articles) {
    const articleDir = path.join(issueDir, article.slug);
    await mkdir(articleDir);
    const hero = (article.heroFilename || article.imageUrl)
      ? `<img class="article-hero-image" src="/${issue.slug}/${article.slug}/${article.heroFilename || article.imageUrl}" alt="${escapeHtml(article.title)}">`
      : "";
    const articleBody = `<section class="section"><div class="article-page"><div class="article-breadcrumb"><a href="/${issue.slug}/">${escapeHtml(issue.title)}</a></div>${hero}<h1 class="article-title">${escapeHtml(article.title)}</h1><div class="article-meta-full"><a class="author-link" href="${authorUrl(article.author)}">${escapeHtml(article.author)}</a> · ${escapeHtml(formatDate(article.date))} · ${escapeHtml(article.category || article.type || "")}</div>${article.imageCaption ? `<div class="article-image-caption" style="margin-top:-0.2rem; margin-bottom:1rem; color:var(--muted); font-size:0.92rem;">${escapeHtml(article.imageCaption)}</div>` : ""}<div class="article-body">${article.bodyHtml || ""}</div>${article.citationsText ? `<section class="article-citations"><h2>Citations</h2><div class="article-citations-body">${escapeHtml(article.citationsText)}</div></section>` : ""}</div></section>`;
    await fs.writeFile(path.join(articleDir, "index.html"), pageShell({
      title: `${article.title} – The Cactus`,
      description: article.subtitle || `${article.title} by ${article.author}.`,
      canonicalPath: articleUrl(article),
      currentNav: "",
      currentIssueHref,
      body: articleBody
    }));
  }
}

for (const [slug, title, desc, bodyHtml] of [
  ["about", "The Cactus – About", "About The Cactus.", "<section class='section'><div class='section-header'><h2>About</h2><p>About the magazine.</p></div><div class='static-card' style='padding:1rem 1.1rem;'><p>The Cactus is a student magazine featuring science, engineering, and ideas writing.</p></div></section>"],
  ["sponsors", "The Cactus – Sponsors", "Sponsors of The Cactus.", "<section class='section'><div class='section-header'><h2>Sponsors</h2><p>Sponsor acknowledgements.</p></div><div class='static-card' style='padding:1rem 1.1rem;'><p>Add sponsor logos and blurbs here.</p></div></section>"]
]) {
  await mkdir(path.join(distDir, slug));
  await fs.writeFile(path.join(distDir, `${slug}/index.html`), pageShell({
    title,
    description: desc,
    canonicalPath: `/${slug}/`,
    currentNav: slug,
    currentIssueHref,
    body: bodyHtml
  }));
}

const urls = [
  "/",
  "/archive/",
  "/authors/",
  "/about/",
  "/sponsors/",
  ...issues.map((i) => `/${i.slug}/`),
  ...allArticles.map((a) => articleUrl(a))
];
await fs.writeFile(path.join(distDir, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>https://thecactusphs.com${u}</loc></url>`).join("\n")}\n</urlset>\n`);
await fs.writeFile(path.join(distDir, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: https://thecactusphs.com/sitemap.xml\n`);
console.log("Build complete.");
