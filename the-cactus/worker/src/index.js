export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/issues" && request.method === "GET") {
        const issues = await readJsonFromGitHub(env, "assets/data/issues.json");
        return json({ issues });
      }

      if (url.pathname.startsWith("/api/issues/") && request.method === "GET") {
        const slug = decodeURIComponent(url.pathname.replace("/api/issues/", ""));
        const issue = await readJsonFromGitHub(env, `issues/${slug}/issue.json`);
        return json(issue);
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
    headers: { "content-type": "application/json; charset=utf-8" }
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
  const decoded = atob(file.content.replace(/\n/g, ""));
  return JSON.parse(decoded);
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

async function createIssue(env, body) {
  const { title, slug, dateLabel, isCurrent, pdfBase64, coverBase64 } = body;

  if (!title || !slug || !dateLabel || !pdfBase64 || !coverBase64) {
    throw new Error("Missing required issue fields.");
  }

  const issues = await readJsonFromGitHub(env, "assets/data/issues.json");

  if (issues.some((x) => x.slug === slug)) {
    throw new Error(`Issue slug already exists: ${slug}`);
  }

  if (isCurrent) issues.forEach((x) => { x.isCurrent = false; });

  issues.unshift({
    slug,
    title,
    dateLabel,
    coverImage: `issues/${slug}/cover.jpg`,
    isCurrent: !!isCurrent
  });

  await writeFileToGitHub(
    env,
    `issues/${slug}/issue.json`,
    b64FromUtf8(JSON.stringify({ slug, articles: [] }, null, 2)),
    `Create issue ${slug}`
  );

  await writeFileToGitHub(
    env,
    `issues/${slug}/magazine.pdf`,
    pdfBase64,
    `Upload magazine PDF for ${slug}`
  );

  await writeFileToGitHub(
    env,
    `issues/${slug}/cover.jpg`,
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
    citationsHtml,
    bodyHtml,
    heroBase64,
    heroExtension
  } = body;

  if (!issueSlug || !title || !author || !date || !type || !bodyHtml || !heroBase64) {
    throw new Error("Missing required article fields.");
  }

  const issuePath = `issues/${issueSlug}/issue.json`;
  const issueJson = await readJsonFromGitHub(env, issuePath);
  const articles = Array.isArray(issueJson.articles) ? issueJson.articles : [];

  const nextId = articles.length
    ? Math.max(...articles.map((a) => Number(a.id) || 0)) + 1
    : 1;

  const ext = (heroExtension || "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";

  const articleObject = {
    id: nextId,
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
    imageUrl: `articles/${nextId}/hero.${ext}`,
    imageCaption: imageCaption || "",
    contentPath: `articles/${nextId}/article.html`,
    citationsHtml: citationsHtml || ""
  };

  articles.push(articleObject);

  await writeFileToGitHub(
    env,
    `issues/${issueSlug}/articles/${nextId}/hero.${ext}`,
    heroBase64,
    `Upload hero image for article ${nextId} in ${issueSlug}`
  );

  await writeFileToGitHub(
    env,
    `issues/${issueSlug}/articles/${nextId}/article.html`,
    b64FromUtf8(bodyHtml),
    `Create article body for article ${nextId} in ${issueSlug}`
  );

  await writeFileToGitHub(
    env,
    issuePath,
    b64FromUtf8(JSON.stringify({ slug: issueSlug, articles }, null, 2)),
    `Add article ${nextId} to ${issueSlug}`
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
    citationsHtml,
    bodyHtml,
    heroBase64,
    heroExtension
  } = body;

  if (!originalIssueSlug || !issueSlug || !articleId) {
    throw new Error("Missing issue/article identity for update.");
  }

  if (originalIssueSlug !== issueSlug) {
    throw new Error("Moving articles across issues is not supported in this first version.");
  }

  const issuePath = `issues/${issueSlug}/issue.json`;
  const issueJson = await readJsonFromGitHub(env, issuePath);
  const articles = Array.isArray(issueJson.articles) ? issueJson.articles : [];

  const idx = articles.findIndex((a) => Number(a.id) === Number(articleId));
  if (idx === -1) throw new Error("Article not found.");

  const existing = articles[idx];
  let ext = "jpg";

  if (existing.imageUrl && existing.imageUrl.includes(".")) {
    ext = existing.imageUrl.split(".").pop().toLowerCase();
  }

  if (heroExtension) {
    ext = String(heroExtension).replace(/[^a-z0-9]/gi, "").toLowerCase() || ext;
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
    imageUrl: `articles/${articleId}/hero.${ext}`,
    imageCaption: imageCaption || "",
    contentPath: `articles/${articleId}/article.html`,
    citationsHtml: citationsHtml || ""
  };

  if (heroBase64) {
    await writeFileToGitHub(
      env,
      `issues/${issueSlug}/articles/${articleId}/hero.${ext}`,
      heroBase64,
      `Update hero image for article ${articleId} in ${issueSlug}`
    );
  }

  await writeFileToGitHub(
    env,
    `issues/${issueSlug}/articles/${articleId}/article.html`,
    b64FromUtf8(bodyHtml),
    `Update article body for article ${articleId} in ${issueSlug}`
  );

  await writeFileToGitHub(
    env,
    issuePath,
    b64FromUtf8(JSON.stringify({ slug: issueSlug, articles }, null, 2)),
    `Update article ${articleId} in ${issueSlug}`
  );
}
