const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "content-type": "application/json; charset=utf-8"
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      if (url.pathname === "/api/site" && request.method === "GET") {
        const site = await readJsonFromGitHub(env, "data/site.json");
        return json(site);
      }

      if (url.pathname.startsWith("/api/issues/") && request.method === "GET") {
        const slug = decodeURIComponent(url.pathname.replace("/api/issues/", ""));
        const site = await readJsonFromGitHub(env, "data/site.json");
        const issue = (site.issues || []).find((x) => x.slug === slug);
        if (!issue) return json({ error: "Issue not found." }, 404);
        return json(issue);
      }

      if (url.pathname === "/api/article-body" && request.method === "GET") {
        const issueSlug = url.searchParams.get("issueSlug") || "";
        const articleSlug = url.searchParams.get("articleSlug") || "";
        if (!issueSlug || !articleSlug) return json({ error: "Missing issueSlug or articleSlug." }, 400);
        const site = await readJsonFromGitHub(env, "data/site.json");
        const issue = (site.issues || []).find((x) => x.slug === issueSlug);
        const article = (issue?.articles || []).find((x) => x.slug === articleSlug);
        if (!article) return json({ error: "Article not found." }, 404);
        const html = await readTextFromGitHub(env, trimLeadingSlash(article.contentPath));
        return json({ html });
      }

      if (url.pathname === "/api/issues" && request.method === "POST") {
        const body = await request.json();
        await createIssue(env, body);
        return json({ ok: true });
      }

      if (url.pathname === "/api/issues/current" && request.method === "POST") {
        const body = await request.json();
        await setCurrentIssue(env, body.slug);
        return json({ ok: true });
      }

      if (url.pathname === "/api/articles" && request.method === "POST") {
        const body = await request.json();
        await createArticle(env, body);
        return json({ ok: true });
      }

      if (url.pathname === "/api/articles/update" && request.method === "POST") {
        const body = await request.json();
        await updateArticle(env, body);
        return json({ ok: true });
      }

      return json({ error: "Not found" }, 404);
    } catch (err) {
      return json({ error: err.message || String(err) }, err.status || 500);
    }
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: CORS_HEADERS });
}

function ghHeaders(env) {
  if (!env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is not configured.");
  }
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "the-cactus-admin"
  };
}

function trimLeadingSlash(path) {
  return String(path || "").replace(/^\/+/, "");
}

function b64FromUtf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function decodeBase64Utf8(content) {
  const binary = atob(content.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function slugifyValue(s) {
  return String(s || "").toLowerCase().trim().replace(/['’"]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function escapeHtml(str) {
  return String(str || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function textToStoredHtml(text) {
  const clean = String(text || "").trim();
  if (!clean) return "";
  return clean.split(/\n\s*\n/).map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br>")}</p>`).join("\n\n");
}

function buildIssuePageHtml(issueSlug) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>The Cactus – Issue</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="/assets/css/styles.css" />
  <script defer src="/assets/js/main.js"></script>
</head>
<body data-page="issue" data-nav="current" data-issue-slug="${escapeHtml(issueSlug)}">
  <div id="header-mount"></div>
  <main class="site-main container">
    <section class="section">
      <div class="issue-header">
        <h1 id="issue-title" class="issue-header-title">Issue</h1>
        <div id="issue-meta" class="issue-header-meta"></div>
      </div>
      <div id="issue-articles" class="article-list-layout"></div>
      <div id="page-error" hidden></div>
    </section>
  </main>
  <div id="footer-mount"></div>
</body>
</html>`;
}

function buildArticlePageHtml(issueSlug, articleSlug) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>The Cactus – Article</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="/assets/css/styles.css" />
  <script defer src="/assets/js/main.js"></script>
</head>
<body data-page="article" data-nav="current" data-issue-slug="${escapeHtml(issueSlug)}" data-article-slug="${escapeHtml(articleSlug)}">
  <div id="header-mount"></div>
  <main class="site-main container">
    <section class="section">
      <div id="article-container"></div>
      <div id="page-error" hidden></div>
    </section>
  </main>
  <div id="footer-mount"></div>
</body>
</html>`;
}

async function githubGetContent(env, path) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}?ref=${env.GITHUB_BRANCH}`;
  const res = await fetch(url, { headers: ghHeaders(env) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET failed for ${path}`);
  return res.json();
}

async function readJsonFromGitHub(env, path) {
  const file = await githubGetContent(env, path);
  if (!file) throw new Error(`Missing file: ${path}`);
  return JSON.parse(decodeBase64Utf8(file.content));
}

async function readTextFromGitHub(env, path) {
  const file = await githubGetContent(env, path);
  if (!file) throw new Error(`Missing file: ${path}`);
  return decodeBase64Utf8(file.content);
}

async function writeFileToGitHub(env, path, base64Content, message) {
  const existing = await githubGetContent(env, path);
  const body = { message, content: base64Content, branch: env.GITHUB_BRANCH };
  if (existing?.sha) body.sha = existing.sha;
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...ghHeaders(env), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub PUT failed for ${path}: ${text}`);
  }
  return res.json();
}

async function writeJson(env, path, obj, message) {
  await writeFileToGitHub(env, path, b64FromUtf8(JSON.stringify(obj, null, 2)), message);
}

async function createIssue(env, body) {
  const { title, slug, dateLabel, isCurrent, coverBase64, coverExtension } = body;
  if (!title || !slug || !dateLabel) throw new Error("Missing required issue fields.");

  const site = await readJsonFromGitHub(env, "data/site.json");
  const issues = Array.isArray(site.issues) ? site.issues : [];
  if (issues.some((issue) => issue.slug === slug)) throw new Error(`Issue slug already exists: ${slug}`);
  if (isCurrent) issues.forEach((issue) => { issue.isCurrent = false; });

  const ext = String(coverExtension || "png").replace(/[^a-z0-9]/gi, "").toLowerCase() || "png";
  const coverPath = coverBase64 ? `/${slug}/cover.${ext}` : "";
  const issue = {
    slug,
    title,
    dateLabel,
    coverImage: coverPath,
    pdfUrl: `/${slug}/magazine.pdf`,
    isCurrent: !!isCurrent,
    articles: []
  };

  issues.unshift(issue);
  site.issues = issues;

  await writeFileToGitHub(env, `${slug}/index.html`, b64FromUtf8(buildIssuePageHtml(slug)), `Create issue page ${slug}`);
  if (coverBase64) {
    await writeFileToGitHub(env, `${slug}/cover.${ext}`, coverBase64, `Upload issue cover ${slug}`);
  }
  await writeJson(env, "data/site.json", site, `Create issue ${slug}`);
}

async function setCurrentIssue(env, slug) {
  const site = await readJsonFromGitHub(env, "data/site.json");
  let found = false;
  (site.issues || []).forEach((issue) => {
    if (issue.slug === slug) {
      issue.isCurrent = true;
      found = true;
    } else {
      issue.isCurrent = false;
    }
  });
  if (!found) throw new Error(`Issue not found: ${slug}`);
  await writeJson(env, "data/site.json", site, `Set current issue ${slug}`);
}

async function createArticle(env, body) {
  const {
    issueSlug, slug, title, subtitle, author, date, category, type, tags,
    frontPageSlot, featuredMain, sponsored, imageCaption, citationsText,
    bodyText, heroBase64, heroExtension
  } = body;

  if (!issueSlug || !slug || !title || !author || !date || !type || !bodyText) {
    throw new Error("Missing required article fields.");
  }

  const site = await readJsonFromGitHub(env, "data/site.json");
  const issue = (site.issues || []).find((x) => x.slug === issueSlug);
  if (!issue) throw new Error(`Issue not found: ${issueSlug}`);
  if ((issue.articles || []).some((article) => article.slug === slug)) throw new Error(`Article slug already exists in ${issueSlug}: ${slug}`);

  const ext = String(heroExtension || "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  const imageUrl = heroBase64 ? `/${issueSlug}/${slug}/hero.${ext}` : "";
  const contentPath = `/${issueSlug}/${slug}/content.html`;

  const article = {
    slug,
    title,
    subtitle: subtitle || "",
    author,
    date,
    category: category || "",
    type,
    tags: Array.isArray(tags) ? tags : [],
    frontPageSlot: frontPageSlot || "none",
    featuredMain: !!featuredMain,
    sponsored: !!sponsored,
    imageUrl,
    imageCaption: imageCaption || "",
    contentPath,
    citationsText: citationsText || ""
  };

  issue.articles = Array.isArray(issue.articles) ? issue.articles : [];
  issue.articles.push(article);

  await writeFileToGitHub(env, `${issueSlug}/${slug}/index.html`, b64FromUtf8(buildArticlePageHtml(issueSlug, slug)), `Create article page ${slug}`);
  await writeFileToGitHub(env, `${issueSlug}/${slug}/content.html`, b64FromUtf8(textToStoredHtml(bodyText)), `Create article body ${slug}`);
  if (heroBase64) {
    await writeFileToGitHub(env, `${issueSlug}/${slug}/hero.${ext}`, heroBase64, `Upload hero image ${slug}`);
  }
  await writeJson(env, "data/site.json", site, `Create article ${slug}`);
}

async function updateArticle(env, body) {
  const {
    originalIssueSlug, issueSlug, originalArticleSlug, title, subtitle, author, date,
    category, type, tags, frontPageSlot, featuredMain, sponsored, imageCaption,
    citationsText, bodyText, heroBase64, heroExtension
  } = body;

  if (!originalIssueSlug || !issueSlug || !originalArticleSlug) {
    throw new Error("Missing article identity for update.");
  }
  if (originalIssueSlug !== issueSlug) {
    throw new Error("Moving articles across issues is not supported in this simplified version.");
  }

  const site = await readJsonFromGitHub(env, "data/site.json");
  const issue = (site.issues || []).find((x) => x.slug === issueSlug);
  if (!issue) throw new Error(`Issue not found: ${issueSlug}`);

  const articles = Array.isArray(issue.articles) ? issue.articles : [];
  const article = articles.find((x) => x.slug === originalArticleSlug);
  if (!article) throw new Error("Article not found.");

  let imageUrl = article.imageUrl || "";
  if (heroBase64) {
    const ext = String(heroExtension || "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
    imageUrl = `/${issueSlug}/${originalArticleSlug}/hero.${ext}`;
    await writeFileToGitHub(env, `${issueSlug}/${originalArticleSlug}/hero.${ext}`, heroBase64, `Update hero image ${originalArticleSlug}`);
  }

  article.title = title;
  article.subtitle = subtitle || "";
  article.author = author;
  article.date = date;
  article.category = category || "";
  article.type = type;
  article.tags = Array.isArray(tags) ? tags : [];
  article.frontPageSlot = frontPageSlot || "none";
  article.featuredMain = !!featuredMain;
  article.sponsored = !!sponsored;
  article.imageUrl = imageUrl;
  article.imageCaption = imageCaption || "";
  article.citationsText = citationsText || "";

  await writeFileToGitHub(env, `${issueSlug}/${originalArticleSlug}/content.html`, b64FromUtf8(textToStoredHtml(bodyText)), `Update article body ${originalArticleSlug}`);
  await writeJson(env, "data/site.json", site, `Update article ${originalArticleSlug}`);
}
