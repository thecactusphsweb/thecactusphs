
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
      if (url.pathname === "/api/admin/login" && request.method === "POST") {
        const { password } = await request.json();
        if (!password || password !== env.ADMIN_PASSWORD) {
          return json({ error: "Invalid password." }, 401, cors);
        }
        const token = await signSession("admin", env.ADMIN_COOKIE_SECRET);
        const headers = new Headers({ ...JSON_HEADERS, ...cors });
        headers.append("Set-Cookie", buildSessionCookie(env, token));
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
      }

      if (url.pathname === "/api/admin/logout" && request.method === "POST") {
        const headers = new Headers({ ...JSON_HEADERS, ...cors });
        headers.append("Set-Cookie", clearSessionCookie(env));
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
      }

      if (url.pathname === "/api/admin/session" && request.method === "GET") {
        await requireAdmin(request, env);
        return json({ ok: true }, 200, cors);
      }

      if (url.pathname === "/api/issues" && request.method === "GET") {
        const issues = await readJsonFromGitHub(env, "site/assets/data/issues.json");
        return json({ issues }, 200, cors);
      }

      if (url.pathname === "/api/issues" && request.method === "POST") {
        await requireAdmin(request, env);
        const body = await request.json();
        await createIssue(env, body);
        await triggerDeploy(env);
        return json({ ok: true }, 200, cors);
      }

      if (url.pathname === "/api/issues/current" && request.method === "POST") {
        await requireAdmin(request, env);
        const body = await request.json();
        await setCurrentIssue(env, body.slug);
        await triggerDeploy(env);
        return json({ ok: true }, 200, cors);
      }

      if (url.pathname === "/api/articles" && request.method === "POST") {
        await requireAdmin(request, env);
        const body = await request.json();
        await createArticle(env, body);
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

function json(data, status=200, extraHeaders={}) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}
function corsHeaders(env, origin) {
  const allow = (env.ALLOWED_ORIGINS || "").split(",").map(s=>s.trim()).filter(Boolean);
  const allowedOrigin = allow.includes(origin) ? origin : allow[0] || "*";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
function getCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  for (const part of raw.split(/;\s*/)) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx) === name) return part.slice(idx+1);
  }
  return "";
}
async function signSession(value, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/,"");
  return `${value}.${b64}`;
}
async function verifySession(token, secret) {
  const [value] = String(token || "").split(".");
  if (!value) return false;
  return token === await signSession(value, secret);
}
function buildSessionCookie(env, token) {
  const secure = String(env.COOKIE_SECURE || "true") === "true" ? "; Secure" : "";
  return `${env.ADMIN_COOKIE_NAME || "cactus_admin_session"}=${token}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=604800`;
}
function clearSessionCookie(env) {
  const secure = String(env.COOKIE_SECURE || "true") === "true" ? "; Secure" : "";
  return `${env.ADMIN_COOKIE_NAME || "cactus_admin_session"}=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0`;
}
async function requireAdmin(request, env) {
  const token = getCookie(request, env.ADMIN_COOKIE_NAME || "cactus_admin_session");
  const ok = await verifySession(token, env.ADMIN_COOKIE_SECRET || "");
  if (!ok) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
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
async function githubGetContent(env, filePath) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${filePath}?ref=${env.GITHUB_BRANCH}`;
  const res = await fetch(url, { headers: ghHeaders(env) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET failed for ${filePath}`);
  return res.json();
}
async function readJsonFromGitHub(env, filePath) {
  const file = await githubGetContent(env, filePath);
  if (!file) throw new Error(`Missing file: ${filePath}`);
  return JSON.parse(decodeBase64Utf8(file.content));
}
async function writeFileToGitHub(env, filePath, base64Content, message) {
  const existing = await githubGetContent(env, filePath);
  const body = { message, content: base64Content, branch: env.GITHUB_BRANCH };
  if (existing?.sha) body.sha = existing.sha;
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${filePath}`;
  const res = await fetch(url, { method: "PUT", headers: { ...ghHeaders(env), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`GitHub PUT failed for ${filePath}: ${await res.text()}`);
  return res.json();
}
function slugifyValue(s) {
  return String(s || "").toLowerCase().trim().replace(/['’"]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function textToStoredHtml(text) {
  const clean = String(text || "").trim();
  if (!clean) return "";
  return clean.split(/\n\s*\n/).map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br>")}</p>`).join("\n\n");
}
function escapeHtml(str) {
  return String(str || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function safeExt(ext) {
  return String(ext || "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
}
async function createIssue(env, body) {
  const { title, slug, dateLabel, isCurrent, coverBase64, coverExtension } = body;
  if (!title || !slug || !dateLabel || !coverBase64) throw new Error("Missing required issue fields.");
  const issues = await readJsonFromGitHub(env, "site/assets/data/issues.json");
  if (issues.some((x) => x.slug === slug)) throw new Error(`Issue slug already exists: ${slug}`);
  if (isCurrent) issues.forEach((x) => { x.isCurrent = false; });
  const coverFilename = `cover.${safeExt(coverExtension)}`;
  issues.unshift({ slug, title, dateLabel, coverImage: `${slug}/${coverFilename}`, pdfUrl: `${slug}/magazine.pdf`, isCurrent: !!isCurrent });
  const issueJson = { slug, title, dateLabel, coverFilename, pdfUrl: `${slug}/magazine.pdf`, articles: [] };
  await writeFileToGitHub(env, `site/content/${slug}/issue.json`, b64FromUtf8(JSON.stringify(issueJson, null, 2)), `Create issue metadata for ${slug}`);
  await writeFileToGitHub(env, `site/content/${slug}/${coverFilename}`, coverBase64, `Upload cover image for ${slug}`);
  await writeFileToGitHub(env, "site/assets/data/issues.json", b64FromUtf8(JSON.stringify(issues, null, 2)), `Update issues list for ${slug}`);
}
async function setCurrentIssue(env, slug) {
  const issues = await readJsonFromGitHub(env, "site/assets/data/issues.json");
  let found = false;
  issues.forEach((issue) => { if (issue.slug === slug) { issue.isCurrent = true; found = true; } else issue.isCurrent = false; });
  if (!found) throw new Error(`Issue not found: ${slug}`);
  await writeFileToGitHub(env, "site/assets/data/issues.json", b64FromUtf8(JSON.stringify(issues, null, 2)), `Set current issue to ${slug}`);
}
async function createArticle(env, body) {
  const { issueSlug, title, subtitle, author, date, category, type, tags, frontPageSlot, featuredMain, sponsored, imageCaption, citationsText, bodyText, heroBase64, heroExtension } = body;
  if (!issueSlug || !title || !author || !date || !type || !bodyText) throw new Error("Missing required article fields.");
  const issuePath = `site/content/${issueSlug}/issue.json`;
  const issueJson = await readJsonFromGitHub(env, issuePath);
  const articles = Array.isArray(issueJson.articles) ? issueJson.articles : [];
  const nextId = articles.length ? Math.max(...articles.map((a) => Number(a.id) || 0)) + 1 : 1;
  const articleSlug = slugifyValue(title) || String(nextId);
  if (articles.some((a) => a.slug === articleSlug)) throw new Error(`Article slug already exists in this issue: ${articleSlug}`);
  const hasHero = typeof heroBase64 === "string" && heroBase64.length > 0;
  const heroFilename = hasHero ? `hero.${safeExt(heroExtension)}` : "";
  articles.push({ id: nextId, slug: articleSlug, title, subtitle: subtitle || "", author, date, category: category || "", type, tags: Array.isArray(tags) ? tags : [], featuredMain: !!featuredMain, sponsored: !!sponsored, frontPageSlot: frontPageSlot || "none", imageUrl: heroFilename || "", heroFilename: heroFilename || "", imageCaption: imageCaption || "", citationsText: citationsText || "" });
  issueJson.articles = articles;
  await writeFileToGitHub(env, `site/content/${issueSlug}/${articleSlug}/body.html`, b64FromUtf8(textToStoredHtml(bodyText)), `Create article body for ${articleSlug}`);
  if (hasHero) await writeFileToGitHub(env, `site/content/${issueSlug}/${articleSlug}/${heroFilename}`, heroBase64, `Upload hero image for ${articleSlug}`);
  await writeFileToGitHub(env, issuePath, b64FromUtf8(JSON.stringify(issueJson, null, 2)), `Add article ${articleSlug} to ${issueSlug}`);
}
async function triggerDeploy(env) {
  if (!env.CLOUDFLARE_PAGES_DEPLOY_HOOK) return;
  await fetch(env.CLOUDFLARE_PAGES_DEPLOY_HOOK, { method: "POST" });
}
