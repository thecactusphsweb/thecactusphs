const API_BASE = "https://the-cactus-admin-api.thecactusphsweb.workers.dev";
const AUTH_PASSWORD_KEY = "cactus_admin_password";

const adminApp = document.getElementById("admin-app");
const authGate = document.getElementById("admin-auth-gate");
const authForm = document.getElementById("admin-auth-form");
const authPasswordInput = document.getElementById("admin-password-input");
const authErrorEl = document.getElementById("admin-auth-error");

const statusEl = document.getElementById("admin-status");
const issueForm = document.getElementById("issue-form");
const articleForm = document.getElementById("article-form");
const currentForm = document.getElementById("current-form");
const loadArticleForm = document.getElementById("load-article-form");
const editArticleForm = document.getElementById("edit-article-form");

const issueSelect = document.getElementById("issue-select");
const currentIssueSelect = document.getElementById("current-issue-select");
const editIssueSelect = document.getElementById("edit-issue-select");
const editIssueTargetSelect = document.getElementById("edit-issue-target-select");
const editArticleSelect = document.getElementById("edit-article-select");

const createPreview = document.getElementById("create-preview");
const editPreview = document.getElementById("edit-preview");

const tabs = document.querySelectorAll(".admin-tab");
const panels = document.querySelectorAll(".admin-tab-panel");

function getAdminPassword() {
  return sessionStorage.getItem(AUTH_PASSWORD_KEY) || "";
}

function setAdminPassword(password) {
  sessionStorage.setItem(AUTH_PASSWORD_KEY, password);
}

function clearAdminPassword() {
  sessionStorage.removeItem(AUTH_PASSWORD_KEY);
}

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#9b1c1c" : "";
}

function setAuthError(message = "") {
  if (!authErrorEl) return;
  authErrorEl.hidden = !message;
  authErrorEl.textContent = message;
}

function unlockAdmin() {
  document.body.classList.remove("admin-locked");
  if (authGate) authGate.hidden = true;
  if (adminApp) adminApp.hidden = false;
}

function lockAdmin() {
  document.body.classList.add("admin-locked");
  if (authGate) authGate.hidden = false;
  if (adminApp) adminApp.hidden = true;
}

async function api(path, method = "GET", body = null, includeAdminPassword = false) {
  const opts = {
    method,
    headers: {},
    cache: "no-store"
  };

  if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }

  if (includeAdminPassword) {
    const password = getAdminPassword();
    if (!password) throw new Error("Admin password is missing. Refresh and log in again.");
    opts.headers["X-Admin-Password"] = password;
  }

  const res = await fetch(`${API_BASE}${path}`, opts);
  const text = await res.text();

  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

async function requireAdminAccess() {
  const existingPassword = getAdminPassword();
  if (existingPassword) {
    try {
      await api("/api/auth", "POST", { password: existingPassword });
      unlockAdmin();
      return;
    } catch {
      clearAdminPassword();
    }
  }

  lockAdmin();

  await new Promise((resolve) => {
    authForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      setAuthError("");

      try {
        const password = authPasswordInput.value;
        await api("/api/auth", "POST", { password });
        setAdminPassword(password);
        authPasswordInput.value = "";
        unlockAdmin();
        setStatus("Authenticated.");
        resolve();
      } catch (err) {
        setAuthError(err.message || "Incorrect password.");
      }
    }, { once: false });
  });
}

function switchTab(tabId) {
  tabs.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tabId));
  panels.forEach((panel) => panel.classList.toggle("active", panel.id === tabId));
}

tabs.forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/['’"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fileToBase64(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function textToParagraphHtml(text) {
  const clean = String(text || "").trim();
  if (!clean) return "<p></p>";

  return clean
    .split(/\n\s*\n/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function storedHtmlToPlainText(html) {
  if (!html) return "";

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild || doc.body;

  const blocks = [];

  Array.from(root.children).forEach((el) => {
    el.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    const text = (el.textContent || "").trim();
    if (text) blocks.push(text);
  });

  if (blocks.length) return blocks.join("\n\n").trim();

  root.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  return (root.textContent || "").trim();
}

function renderPreview(targetEl, data, imageUrl = "") {
  const bodyHtml = textToParagraphHtml(data.bodyText || "");
  const citations = String(data.citationsText || "").trim();

  targetEl.innerHTML = `
    <article class="preview-article">
      <div class="preview-breadcrumb">Current Issue • Preview</div>
      <h1 class="preview-title">${escapeHtml(data.title || "Article title")}</h1>
      ${data.subtitle ? `<div class="preview-subtitle">${escapeHtml(data.subtitle)}</div>` : ""}
      <div class="preview-meta">
        ${escapeHtml(data.author || "Author")} · ${escapeHtml(data.date || "Date")} · ${escapeHtml(data.category || "Category")}
      </div>

      ${imageUrl ? `<img class="preview-image" src="${imageUrl}" alt="Preview image">` : ""}

      ${data.imageCaption ? `<div class="preview-caption">${escapeHtml(data.imageCaption)}</div>` : ""}

      <div class="preview-body">${bodyHtml}</div>

      ${citations ? `
        <section class="preview-citations">
          <h3>Citations</h3>
          <div class="preview-citations-text">${escapeHtml(citations)}</div>
        </section>
      ` : ""}
    </article>
  `;
}

function getFormDataForPreview(form) {
  const fd = new FormData(form);
  return {
    title: fd.get("title") || "",
    subtitle: fd.get("subtitle") || "",
    author: fd.get("author") || "",
    date: fd.get("date") || "",
    category: fd.get("category") || "",
    imageCaption: fd.get("imageCaption") || "",
    bodyText: fd.get("bodyText") || "",
    citationsText: fd.get("citationsText") || ""
  };
}

function bindLivePreview(form, previewEl) {
  let currentImageUrl = "";

  const update = () => {
    renderPreview(previewEl, getFormDataForPreview(form), currentImageUrl);
  };

  form.addEventListener("input", update);

  const imageInput = form.querySelector('input[name="hero"]');
  if (imageInput) {
    imageInput.addEventListener("change", () => {
      const file = imageInput.files?.[0];
      currentImageUrl = file ? URL.createObjectURL(file) : "";
      update();
    });
  }

  update();

  return {
    setImageUrl(url) {
      currentImageUrl = url || "";
      update();
    },
    update
  };
}

function resolveIssueAssetPath(issueSlug, relativePath) {
  if (!relativePath) return "";
  if (relativePath.startsWith("http://") || relativePath.startsWith("https://")) return relativePath;
  const prefix = `issues/${issueSlug}/`;
  if (relativePath.startsWith(prefix)) return relativePath;
  if (relativePath.startsWith("articles/")) return prefix + relativePath;
  return relativePath;
}

async function fetchArticleBodyHtml(issueSlug, articleId) {
  const data = await api(
    `/api/article-body?issueSlug=${encodeURIComponent(issueSlug)}&articleId=${encodeURIComponent(articleId)}`
  );
  return data.html || "";
}

let issuesCache = [];
let issueArticlesCache = new Map();

async function refreshIssues() {
  const data = await api("/api/issues");
  issuesCache = data.issues || [];

  for (const select of [issueSelect, currentIssueSelect, editIssueSelect, editIssueTargetSelect]) {
    if (!select) continue;
    select.innerHTML = "";
    issuesCache.forEach((issue) => {
      const opt = document.createElement("option");
      opt.value = issue.slug;
      opt.textContent = `${issue.title}${issue.isCurrent ? " (current)" : ""}`;
      select.appendChild(opt);
    });
  }

  const current = issuesCache.find((x) => x.isCurrent);
  if (current && currentIssueSelect) currentIssueSelect.value = current.slug;

  if (issuesCache.length && editIssueSelect) {
    await refreshArticlesForIssue(editIssueSelect.value || issuesCache[0].slug);
  } else if (editArticleSelect) {
    editArticleSelect.innerHTML = "";
  }
}

async function refreshArticlesForIssue(issueSlug) {
  const data = await api(`/api/issues/${encodeURIComponent(issueSlug)}`);
  const articles = data.articles || [];
  issueArticlesCache.set(issueSlug, articles);

  if (!editArticleSelect) return;
  editArticleSelect.innerHTML = "";

  articles.forEach((article) => {
    const opt = document.createElement("option");
    opt.value = String(article.id);
    opt.textContent = `${article.id} — ${article.title}`;
    editArticleSelect.appendChild(opt);
  });
}

issueForm.querySelector('input[name="title"]').addEventListener("input", (e) => {
  const slugInput = issueForm.querySelector('input[name="slug"]');
  if (!slugInput.dataset.manual) slugInput.value = slugify(e.target.value);
});

issueForm.querySelector('input[name="slug"]').addEventListener("input", (e) => {
  e.target.dataset.manual = "1";
});

if (editIssueSelect) {
  editIssueSelect.addEventListener("change", async () => {
    if (!editIssueSelect.value) return;
    await refreshArticlesForIssue(editIssueSelect.value);
  });
}

const createPreviewController = bindLivePreview(articleForm, createPreview);
const editPreviewController = bindLivePreview(editArticleForm, editPreview);

issueForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    setStatus("Creating issue…");
    const fd = new FormData(issueForm);
    const cover = fd.get("cover");

    if (!(cover instanceof File) || !cover.size) {
      throw new Error("Please upload a cover image.");
    }

    const payload = {
      title: fd.get("title"),
      slug: fd.get("slug"),
      dateLabel: fd.get("dateLabel"),
      isCurrent: fd.get("isCurrent") === "on",
      coverBase64: await fileToBase64(cover),
      coverExtension: cover.name.split(".").pop()?.toLowerCase() || "jpg"
    };

    await api("/api/issues", "POST", payload, true);
    issueForm.reset();
    await refreshIssues();
    setStatus("Issue created.");
  } catch (err) {
    setStatus(err.message, true);
  }
});

articleForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    setStatus("Creating article…");
    const fd = new FormData(articleForm);
    const hero = fd.get("hero");
    const tags = String(fd.get("tags") || "").split(",").map((x) => x.trim()).filter(Boolean);
    const slot = String(fd.get("frontPageSlot") || "none");

    const payload = {
      issueSlug: fd.get("issueSlug"),
      title: fd.get("title"),
      subtitle: fd.get("subtitle"),
      author: fd.get("author"),
      date: fd.get("date"),
      category: fd.get("category"),
      type: fd.get("type"),
      tags,
      frontPageSlot: slot,
      featuredMain: slot === "main",
      sponsored: false,
      imageCaption: fd.get("imageCaption"),
      citationsText: fd.get("citationsText"),
      bodyText: fd.get("bodyText")
    };

    if (hero instanceof File && hero.size) {
      payload.heroBase64 = await fileToBase64(hero);
      payload.heroExtension = hero.name.split(".").pop()?.toLowerCase() || "jpg";
    }

    await api("/api/articles", "POST", payload, true);
    articleForm.reset();
    createPreviewController.setImageUrl("");
    await refreshIssues();
    if (payload.issueSlug) {
      await refreshArticlesForIssue(payload.issueSlug);
    }
    setStatus("Article created.");
  } catch (err) {
    setStatus(err.message, true);
  }
});

currentForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    setStatus("Updating current issue…");
    const fd = new FormData(currentForm);
    await api("/api/issues/current", "POST", { slug: fd.get("currentSlug") }, true);
    await refreshIssues();
    setStatus("Current issue updated.");
  } catch (err) {
    setStatus(err.message, true);
  }
});

loadArticleForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const fd = new FormData(loadArticleForm);
    const issueSlug = fd.get("issueSlug");
    const articleId = Number(fd.get("articleId"));
    const articles = issueArticlesCache.get(issueSlug) || [];
    const article = articles.find((a) => Number(a.id) === articleId);
    if (!article) throw new Error("Article not found.");

    editArticleForm.elements.originalIssueSlug.value = issueSlug;
    editArticleForm.elements.articleId.value = String(article.id);
    editIssueTargetSelect.value = issueSlug;
    editArticleForm.elements.title.value = article.title || "";
    editArticleForm.elements.subtitle.value = article.subtitle || "";
    editArticleForm.elements.author.value = article.author || "";
    editArticleForm.elements.date.value = article.date || "";
    editArticleForm.elements.category.value = article.category || "";
    editArticleForm.elements.type.value = article.type || "Long Article";
    editArticleForm.elements.tags.value = (article.tags || []).join(", ");
    editArticleForm.elements.frontPageSlot.value = article.frontPageSlot || "none";
    editArticleForm.elements.imageCaption.value = article.imageCaption || "";
    editArticleForm.elements.citationsText.value = article.citationsText || "";

    const html = await fetchArticleBodyHtml(issueSlug, article.id);
    editArticleForm.elements.bodyText.value = storedHtmlToPlainText(html);

    editPreviewController.setImageUrl(resolveIssueAssetPath(issueSlug, article.imageUrl || ""));
    editPreviewController.update();

    switchTab("edit-articles-tab");
    setStatus("Article loaded.");
  } catch (err) {
    setStatus(err.message, true);
  }
});

editArticleForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    setStatus("Saving article…");
    const fd = new FormData(editArticleForm);
    const hero = fd.get("hero");
    const tags = String(fd.get("tags") || "").split(",").map((x) => x.trim()).filter(Boolean);

    const payload = {
      originalIssueSlug: fd.get("originalIssueSlug"),
      issueSlug: fd.get("issueSlug"),
      articleId: Number(fd.get("articleId")),
      title: fd.get("title"),
      subtitle: fd.get("subtitle"),
      author: fd.get("author"),
      date: fd.get("date"),
      category: fd.get("category"),
      type: fd.get("type"),
      tags,
      frontPageSlot: fd.get("frontPageSlot"),
      featuredMain: fd.get("frontPageSlot") === "main",
      sponsored: false,
      imageCaption: fd.get("imageCaption"),
      citationsText: fd.get("citationsText"),
      bodyText: fd.get("bodyText")
    };

    if (hero instanceof File && hero.size) {
      payload.heroBase64 = await fileToBase64(hero);
      payload.heroExtension = hero.name.split(".").pop()?.toLowerCase() || "jpg";
    }

    await api("/api/articles/update", "POST", payload, true);
    await refreshIssues();
    if (editIssueSelect.value) {
      await refreshArticlesForIssue(editIssueSelect.value);
    }
    setStatus("Article updated.");
  } catch (err) {
    setStatus(err.message, true);
  }
});

async function boot() {
  await requireAdminAccess();
  await refreshIssues();
}

boot().catch((err) => {
  lockAdmin();
  setAuthError(err.message || "Could not initialize admin.");
});