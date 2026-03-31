const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(env, origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (url.pathname === "/" && request.method === "GET") {
        return json({ ok: true, service: "the-cactus-admin-api" }, 200, cors);
      }

      if (url.pathname === "/api/admin/session" && request.method === "GET") {
        return json({ ok: true, auth: "disabled" }, 200, cors);
      }

      if (url.pathname === "/api/issues" && request.method === "GET") {
        const issues = await readJsonFromGitHub(env, "site/assets/data/issues.json");
        return json({ issues }, 200, cors);
      }

      if (url.pathname === "/api/issues" && request.method === "POST") {
        const body = await request.json();
        await createIssue(env, body);
        await triggerDeploy(env);
        return json({ ok: true }, 200, cors);
      }

      if (url.pathname === "/api/issues/current" && request.method === "POST") {
        const body = await request.json();
        await setCurrentIssue(env, body.slug);
        await triggerDeploy(env);
        return json({ ok: true }, 200, cors);
      }

      const issueMatch = url.pathname.match(/^\/api\/issues\/([^/]+)$/);
      if (issueMatch && request.method === "GET") {
        const slug = decodeURIComponent(issueMatch[1]);
        const issue = await readJsonFromGitHub(env, `site/content/${slug}/issue.json`);
        return json({ issue }, 200, cors);
      }

      if (url.pathname === "/api/article" && request.method === "GET") {
        const issueSlug = url.searchParams.get("issueSlug");
        const articleSlug = url.searchParams.get("articleSlug");
        if (!issueSlug || !articleSlug) throw badRequest("Missing issueSlug or articleSlug.");
        const article = await getArticle(env, issueSlug, articleSlug);
        return json({ article }, 200, cors);
      }

      if (url.pathname === "/api/articles" && request.method === "POST") {
        const body = await request.json();
        await createArticle(env, body);
        await triggerDeploy(env);
        return json({ ok: true }, 200, cors);
      }

      if (url.pathname === "/api/articles" && request.method === "PATCH") {
        const body = await request.json();
        await updateArticle(env, body);
        await triggerDeploy(env);
        return json({ ok: true }, 200, cors);
      }

      return json({ error: "Not found" }, 404, cors);
    } catch (err) {
      const status = err.status || 500;
      return json({ error: err.message || String(err) }, status, cors);
    }
  }
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function corsHeaders(env, origin) {
  const allow = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const allowedOrigin = allow.includes(origin) ? origin : allow[0] || "*";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
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
  const binary = atob(String(content || "").replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function githubGetContent(env, filePath) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${filePath}?ref=${env.GITHUB_BRANCH}`;
  const res = await fetch(url, { headers: ghHeaders(env) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET failed for ${filePath}: ${await res.text()}`);
  return res.json();
}

async function readJsonFromGitHub(env, filePath) {
  const file = await githubGetContent(env, filePath);
  if (!file) throw new Error(`Missing file: ${filePath}`);
  return JSON.parse(decodeBase64Utf8(file.content));
}

async function readTextFromGitHub(env, filePath) {
  const file = await githubGetContent(env, filePath);
  if (!file) return "";
  return decodeBase64Utf8(file.content);
}

async function writeFileToGitHub(env, filePath, base64Content, message) {
  const existing = await githubGetContent(env, filePath);
  const body = { message, content: base64Content, branch: env.GITHUB_BRANCH };
  if (existing?.sha) body.sha = existing.sha;
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${filePath}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...ghHeaders(env), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`GitHub PUT failed for ${filePath}: ${await res.text()}`);
  return res.json();
}

function slugifyValue(s) {
  return String(s || "").toLowerCase().trim().replace(/["'’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function textToStoredHtml(text) {
  const clean = String(text || "").trim();
  if (!clean) return "";
  return clean
    .split(/\n\s*\n/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br>")}</p>`)
    .join("\n\n");
}

function htmlToEditableText(html) {
  return String(html || "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<\/p>/gi, "")
    .replace(/<p>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeExt(ext) {
  return String(ext || "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
}

async function createIssue(env, body) {
  const { title, slug, dateLabel, isCurrent, coverBase64, coverExtension } = body;
  const finalSlug = slugifyValue(slug || title);
  if (!title || !finalSlug || !dateLabel || !coverBase64) throw badRequest("Missing required issue fields.");
  const issues = await readJsonFromGitHub(env, "site/assets/data/issues.json");
  if (issues.some((x) => x.slug === finalSlug)) throw badRequest(`Issue slug already exists: ${finalSlug}`);
  if (isCurrent) issues.forEach((x) => { x.isCurrent = false; });
  const coverFilename = `cover.${safeExt(coverExtension)}`;
  issues.unshift({ slug: finalSlug, title, dateLabel, coverImage: `${finalSlug}/${coverFilename}`, pdfUrl: `${finalSlug}/magazine.pdf`, isCurrent: !!isCurrent });
  const issueJson = { slug: finalSlug, title, dateLabel, coverFilename, pdfUrl: `${finalSlug}/magazine.pdf`, articles: [] };
  await writeFileToGitHub(env, `site/content/${finalSlug}/issue.json`, b64FromUtf8(JSON.stringify(issueJson, null, 2)), `Create issue metadata for ${finalSlug}`);
  await writeFileToGitHub(env, `site/content/${finalSlug}/${coverFilename}`, coverBase64, `Upload cover image for ${finalSlug}`);
  await writeFileToGitHub(env, "site/assets/data/issues.json", b64FromUtf8(JSON.stringify(issues, null, 2)), `Update issues list for ${finalSlug}`);
}

async function setCurrentIssue(env, slug) {
  const issues = await readJsonFromGitHub(env, "site/assets/data/issues.json");
  let found = false;
  issues.forEach((issue) => {
    if (issue.slug === slug) { issue.isCurrent = true; found = true; }
    else issue.isCurrent = false;
  });
  if (!found) throw badRequest(`Issue not found: ${slug}`);
  await writeFileToGitHub(env, "site/assets/data/issues.json", b64FromUtf8(JSON.stringify(issues, null, 2)), `Set current issue to ${slug}`);
}

async function getIssueJson(env, issueSlug) {
  return readJsonFromGitHub(env, `site/content/${issueSlug}/issue.json`);
}

async function getArticle(env, issueSlug, articleSlug) {
  const issueJson = await getIssueJson(env, issueSlug);
  const article = (issueJson.articles || []).find((entry) => entry.slug === articleSlug);
  if (!article) throw badRequest(`Article not found: ${articleSlug}`);
  const bodyHtml = await readTextFromGitHub(env, `site/content/${issueSlug}/${articleSlug}/body.html`);
  return {
    ...article,
    bodyText: htmlToEditableText(bodyHtml)
  };
}

async function createArticle(env, body) {
  const { issueSlug, title, subtitle, author, date, category, type, tags, frontPageSlot, featuredMain, sponsored, imageCaption, citationsText, bodyText, heroBase64, heroExtension } = body;
  if (!issueSlug || !title || !author || !date || !type || !bodyText) throw badRequest("Missing required article fields.");
  const issuePath = `site/content/${issueSlug}/issue.json`;
  const issueJson = await readJsonFromGitHub(env, issuePath);
  const articles = Array.isArray(issueJson.articles) ? issueJson.articles : [];
  const nextId = articles.length ? Math.max(...articles.map((a) => Number(a.id) || 0)) + 1 : 1;
  const articleSlug = slugifyValue(title) || String(nextId);
  if (articles.some((a) => a.slug === articleSlug)) throw badRequest(`Article slug already exists in this issue: ${articleSlug}`);
  const hasHero = typeof heroBase64 === "string" && heroBase64.length > 0;
  const heroFilename = hasHero ? `hero.${safeExt(heroExtension)}` : "";
  articles.push({
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
  });
  issueJson.articles = articles;
  await writeFileToGitHub(env, `site/content/${issueSlug}/${articleSlug}/body.html`, b64FromUtf8(textToStoredHtml(bodyText)), `Create article body for ${articleSlug}`);
  if (hasHero) {
    await writeFileToGitHub(env, `site/content/${issueSlug}/${articleSlug}/${heroFilename}`, heroBase64, `Upload hero image for ${articleSlug}`);
  }
  await writeFileToGitHub(env, issuePath, b64FromUtf8(JSON.stringify(issueJson, null, 2)), `Add article ${articleSlug} to ${issueSlug}`);
}

async function updateArticle(env, body) {
  const { issueSlug, articleSlug, title, subtitle, author, date, category, type, tags, frontPageSlot, featuredMain, imageCaption, citationsText, bodyText, heroBase64, heroExtension } = body;
  if (!issueSlug || !articleSlug || !title || !author || !date || !type || !bodyText) throw badRequest("Missing required article fields.");
  const issuePath = `site/content/${issueSlug}/issue.json`;
  const issueJson = await readJsonFromGitHub(env, issuePath);
  const articles = Array.isArray(issueJson.articles) ? issueJson.articles : [];
  const article = articles.find((entry) => entry.slug === articleSlug);
  if (!article) throw badRequest(`Article not found: ${articleSlug}`);

  article.title = title;
  article.subtitle = subtitle || "";
  article.author = author;
  article.date = date;
  article.category = category || "";
  article.type = type;
  article.tags = Array.isArray(tags) ? tags : [];
  article.frontPageSlot = frontPageSlot || "none";
  article.featuredMain = !!featuredMain;
  article.imageCaption = imageCaption || "";
  article.citationsText = citationsText || "";

  if (typeof heroBase64 === "string" && heroBase64.length > 0) {
    const heroFilename = `hero.${safeExt(heroExtension)}`;
    article.heroFilename = heroFilename;
    article.imageUrl = heroFilename;
    await writeFileToGitHub(env, `site/content/${issueSlug}/${articleSlug}/${heroFilename}`, heroBase64, `Replace hero image for ${articleSlug}`);
  }

  await writeFileToGitHub(env, `site/content/${issueSlug}/${articleSlug}/body.html`, b64FromUtf8(textToStoredHtml(bodyText)), `Update article body for ${articleSlug}`);
  await writeFileToGitHub(env, issuePath, b64FromUtf8(JSON.stringify(issueJson, null, 2)), `Update article ${articleSlug} in ${issueSlug}`);
}

async function triggerDeploy(env) {
  if (!env.CLOUDFLARE_PAGES_DEPLOY_HOOK) return;
  try {
    await fetch(env.CLOUDFLARE_PAGES_DEPLOY_HOOK, { method: "POST" });
  } catch {}
}
