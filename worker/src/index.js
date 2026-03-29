const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "content-type": "application/json; charset=utf-8"
};

const ISSUE_INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>The Cactus – Issue</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="/assets/css/styles.css" />
  <script defer src="/assets/js/issue-page.js"></script>
</head>
<body data-page="issue">
  <div id="header-mount"></div>
  <main class="site-main container">
    <section class="section">
      <header class="issue-header">
        <h1 id="issue-title" class="issue-header-title">Issue</h1>
        <div id="issue-meta" class="issue-header-meta"></div>
      </header>
      <div id="issue-articles" class="article-list-layout"></div>
      <div id="page-error" hidden></div>
    </section>
  </main>
  <div id="footer-mount"></div>
</body>
</html>`;

const ARTICLE_INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>The Cactus – Article</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="/assets/css/styles.css" />
  <script defer src="/assets/js/article-page.js"></script>
</head>
<body data-page="article">
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      if (url.pathname === "/api/issues" && request.method === "GET") {
        const issues = await readJsonFromGitHub(env, "assets/data/issues.json");
        return json({ issues });
      }

      if (url.pathname.startsWith("/api/issues/") && request.method === "GET") {
        const slug = decodeURIComponent(url.pathname.replace("/api/issues/", ""));
        const issue = await readJsonFromGitHub(env, `${slug}/issue.json`);
        return json(issue);
      }

      if (url.pathname === "/api/article-body" && request.method === "GET") {
        const issueSlug = url.searchParams.get("issueSlug") || "";
        const articleId = Number(url.searchParams.get("articleId") || "");

        if (!issueSlug || Number.isNaN(articleId)) {
          return json({ error: "Missing issueSlug or articleId." }, 400);
        }

        const issue = await readJsonFromGitHub(env, `${issueSlug}/issue.json`);
        const article = (issue.articles || []).find((a) => Number(a.id) === articleId);

        if (!article) {
          return json({ error: "Article not found." }, 404);
        }

        const html = await readTextFromGitHub(env, `${issueSlug}/${article.slug}/body.html`);
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
        const result = await createArticle(env, body);
        return json({ ok: true, articleId: result.articleId });
      }

      if (url.pathname === "/api/articles/update" && request.method === "POST") {
        const body = await request.json();
        await updateArticle(env, body);
        return json({ ok: true });
      }

      return json({ error: "Not found" }, 404);
    } catch (err) {
      return json({ error: err.message || String(err) }, 500);
    }
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: CORS_HEADERS
  });
}

function ghHeaders(env) {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "the-cactus-admin"
  };
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
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/['’"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function textToStoredHtml(text) {
  const clean = String(text || "").trim();
  if (!clean) return "";

  return clean
    .split(/\n\s*\n/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br>")}</p>`)
    .join("\n\n");
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

  const body = {
    message,
    content: base64Content,
    branch: env.GITHUB_BRANCH
  };

  if (existing?.sha) body.sha = existing.sha;

  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      ...ghHeaders(env),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub PUT failed for ${path}: ${text}`);
  }

  return res.json();
}

function safeExt(ext) {
  return String(ext || "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
}

async function createIssue(env, body) {
  const { title, slug, dateLabel, isCurrent, coverBase64, coverExtension } = body;

  if (!title || !slug || !dateLabel || !coverBase64) {
    throw new Error("Missing required issue fields.");
  }

  const issues = await readJsonFromGitHub(env, "assets/data/issues.json");

  if (issues.some((x) => x.slug === slug)) {
    throw new Error(`Issue slug already exists: ${slug}`);
  }

  if (isCurrent) {
    issues.forEach((x) => { x.isCurrent = false; });
  }

  const coverFilename = `cover.${safeExt(coverExtension)}`;

  issues.unshift({
    slug,
    title,
    dateLabel,
    coverImage: `${slug}/${coverFilename}`,
    pdfUrl: `${slug}/magazine.pdf`,
    isCurrent: !!isCurrent
  });

  const issueJson = {
    slug,
    title,
    dateLabel,
    coverFilename,
    pdfUrl: "magazine.pdf",
    articles: []
  };

  await writeFileToGitHub(
    env,
    `${slug}/index.html`,
    b64FromUtf8(ISSUE_INDEX_HTML),
    `Create issue page for ${slug}`
  );

  await writeFileToGitHub(
    env,
    `${slug}/issue.json`,
    b64FromUtf8(JSON.stringify(issueJson, null, 2)),
    `Create issue metadata for ${slug}`
  );

  await writeFileToGitHub(
    env,
    `${slug}/${coverFilename}`,
    coverBase64,
    `Upload cover image for ${slug}`
  );

  await writeFileToGitHub(
    env,
    "assets/data/issues.json",
    b64FromUtf8(JSON.stringify(issues, null, 2)),
    `Update issues list for ${slug}`
  );
}

async function setCurrentIssue(env, slug) {
  const issues = await readJsonFromGitHub(env, "assets/data/issues.json");
  let found = false;

  issues.forEach((issue) => {
    if (issue.slug === slug) {
      issue.isCurrent = true;
      found = true;
    } else {
      issue.isCurrent = false;
    }
  });

  if (!found) throw new Error(`Issue not found: ${slug}`);

  await writeFileToGitHub(
    env,
    "assets/data/issues.json",
    b64FromUtf8(JSON.stringify(issues, null, 2)),
    `Set current issue to ${slug}`
  );
}

async function createArticle(env, body) {
  const {
    issueSlug,
    title,
    subtitle,
    author,
    date,
    category,
    type,
    tags,
    frontPageSlot,
    featuredMain,
    sponsored,
    imageCaption,
    citationsText,
    bodyText,
    heroBase64,
    heroExtension
  } = body;

  if (!issueSlug || !title || !author || !date || !type || !bodyText) {
    throw new Error("Missing required article fields.");
  }

  const issuePath = `${issueSlug}/issue.json`;
  const issueJson = await readJsonFromGitHub(env, issuePath);
  const articles = Array.isArray(issueJson.articles) ? issueJson.articles : [];

  const nextId = articles.length
    ? Math.max(...articles.map((a) => Number(a.id) || 0)) + 1
    : 1;

  const articleSlug = slugifyValue(title) || String(nextId);

  if (articles.some((a) => a.slug === articleSlug)) {
    throw new Error(`Article slug already exists in this issue: ${articleSlug}`);
  }

  const hasHero = typeof heroBase64 === "string" && heroBase64.length > 0;
  const heroFilename = hasHero ? `hero.${safeExt(heroExtension)}` : "";

  const articleObject = {
    id: nextId,
    slug: articleSlug,
    title,
    subtitle: subtitle || "",
    author,
    date,
    category: category || "",
    type,
    tags: Array.isArray(tags) ? tags : [],
    featuredMain: !!featuredMain,
    sponsored: !!sponsored,
    frontPageSlot: frontPageSlot || "none",
    imageUrl: heroFilename || "",
    heroFilename: heroFilename || "",
    imageCaption: imageCaption || "",
    citationsText: citationsText || ""
  };

  articles.push(articleObject);
  issueJson.articles = articles;

  await writeFileToGitHub(
    env,
    `${issueSlug}/${articleSlug}/index.html`,
    b64FromUtf8(ARTICLE_INDEX_HTML),
    `Create article page for ${articleSlug}`
  );

  await writeFileToGitHub(
    env,
    `${issueSlug}/${articleSlug}/body.html`,
    b64FromUtf8(textToStoredHtml(bodyText)),
    `Create article body for ${articleSlug}`
  );

  if (hasHero) {
    await writeFileToGitHub(
      env,
      `${issueSlug}/${articleSlug}/${heroFilename}`,
      heroBase64,
      `Upload hero image for ${articleSlug}`
    );
  }

  await writeFileToGitHub(
    env,
    issuePath,
    b64FromUtf8(JSON.stringify(issueJson, null, 2)),
    `Add article ${articleSlug} to ${issueSlug}`
  );

  return { articleId: nextId };
}

async function updateArticle(env, body) {
  const {
    originalIssueSlug,
    issueSlug,
    articleId,
    title,
    subtitle,
    author,
    date,
    category,
    type,
    tags,
    frontPageSlot,
    featuredMain,
    sponsored,
    imageCaption,
    citationsText,
    bodyText,
    heroBase64,
    heroExtension
  } = body;

  if (!originalIssueSlug || !issueSlug || !articleId) {
    throw new Error("Missing issue/article identity for update.");
  }

  if (originalIssueSlug !== issueSlug) {
    throw new Error("Moving articles across issues is not supported in this version.");
  }

  const issuePath = `${issueSlug}/issue.json`;
  const issueJson = await readJsonFromGitHub(env, issuePath);
  const articles = Array.isArray(issueJson.articles) ? issueJson.articles : [];

  const idx = articles.findIndex((a) => Number(a.id) === Number(articleId));
  if (idx === -1) throw new Error("Article not found.");

  const existing = articles[idx];
  const newSlug = slugifyValue(title) || existing.slug || String(articleId);

  if (newSlug !== existing.slug) {
    throw new Error("Changing article slug/folder is not supported in this version.");
  }

  const hasNewHero = typeof heroBase64 === "string" && heroBase64.length > 0;
  let heroFilename = existing.heroFilename || existing.imageUrl || "";

  if (hasNewHero) {
    heroFilename = `hero.${safeExt(heroExtension)}`;
    await writeFileToGitHub(
      env,
      `${issueSlug}/${existing.slug}/${heroFilename}`,
      heroBase64,
      `Update hero image for ${existing.slug}`
    );
  }

  articles[idx] = {
    ...existing,
    title,
    subtitle: subtitle || "",
    author,
    date,
    category: category || "",
    type,
    tags: Array.isArray(tags) ? tags : [],
    featuredMain: !!featuredMain,
    sponsored: !!sponsored,
    frontPageSlot: frontPageSlot || "none",
    imageUrl: heroFilename || "",
    heroFilename: heroFilename || "",
    imageCaption: imageCaption || "",
    citationsText: citationsText || ""
  };

  issueJson.articles = articles;

  await writeFileToGitHub(
    env,
    `${issueSlug}/${existing.slug}/body.html`,
    b64FromUtf8(textToStoredHtml(bodyText)),
    `Update article body for ${existing.slug}`
  );

  await writeFileToGitHub(
    env,
    issuePath,
    b64FromUtf8(JSON.stringify(issueJson, null, 2)),
    `Update article ${existing.slug} in ${issueSlug}`
  );
}