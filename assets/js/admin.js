const API_BASE = "https://the-cactus-admin-api.thecactusphsweb.workers.dev";

const statusEl = document.getElementById("admin-status");
const issueForm = document.getElementById("issue-form");
const currentForm = document.getElementById("current-form");
const articleForm = document.getElementById("article-form");
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

let siteCache = { issues: [] };
let issueArticlesCache = new Map();
let adminInitialized = false;

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#9b1c1c" : "";
}

async function api(path, method = "GET", body = null) {
  const options = { method, headers: {}, cache: "no-store" };
  if (body) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, options);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

function slugify(text) {
  return String(text || "")
    .toLowerCase().trim()
    .replace(/['’"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fileToBase64(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
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
  return clean.split(/\n\s*\n/).map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br>")}</p>`).join("");
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
      <div class="preview-breadcrumb">Preview</div>
      <h1 class="preview-title">${escapeHtml(data.title || "Article title")}</h1>
      ${data.subtitle ? `<div class="preview-subtitle">${escapeHtml(data.subtitle)}</div>` : ""}
      <div class="preview-meta">${escapeHtml(data.author || "Author")} · ${escapeHtml(data.date || "Date")} · ${escapeHtml(data.category || "Category")}</div>
      ${imageUrl ? `<img class="preview-image" src="${imageUrl}" alt="Preview image">` : ""}
      ${data.imageCaption ? `<div class="preview-caption">${escapeHtml(data.imageCaption)}</div>` : ""}
      <div class="preview-body">${bodyHtml}</div>
      ${citations ? `<section class="preview-citations"><h3>Citations</h3><div class="preview-citations-text">${escapeHtml(citations)}</div></section>` : ""}
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
  const update = () => renderPreview(previewEl, getFormDataForPreview(form), currentImageUrl);
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
  return { setImageUrl(url) { currentImageUrl = url || ""; update(); }, update };
}

function switchTab(tabId) {
  tabs.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tabId));
  panels.forEach((panel) => panel.classList.toggle("active", panel.id === tabId));
}

tabs.forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

const createPreviewController = bindLivePreview(articleForm, createPreview);
const editPreviewController = bindLivePreview(editArticleForm, editPreview);

async function fetchArticleBodyHtml(issueSlug, articleSlug) {
  const data = await api(`/api/article-body?issueSlug=${encodeURIComponent(issueSlug)}&articleSlug=${encodeURIComponent(articleSlug)}`);
  return data.html || "";
}

async function refreshSite() {
  const data = await api("/api/site");
  siteCache = data;

  const issues = siteCache.issues || [];
  [issueSelect, currentIssueSelect, editIssueSelect, editIssueTargetSelect].forEach((select) => {
    if (!select) return;
    select.innerHTML = "";
    issues.forEach((issue) => {
      const opt = document.createElement("option");
      opt.value = issue.slug;
      opt.textContent = `${issue.title}${issue.isCurrent ? " (current)" : ""}`;
      select.appendChild(opt);
    });
  });

  const current = issues.find((issue) => issue.isCurrent);
  if (current && currentIssueSelect) currentIssueSelect.value = current.slug;
  if (issues.length && editIssueSelect) {
    await refreshArticlesForIssue(editIssueSelect.value || issues[0].slug);
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
    opt.value = article.slug;
    opt.textContent = `${article.slug} — ${article.title}`;
    editArticleSelect.appendChild(opt);
  });
}

function setupStaticHandlers() {
  issueForm.querySelector('input[name="title"]').addEventListener("input", (e) => {
    const slugInput = issueForm.querySelector('input[name="slug"]');
    if (!slugInput.dataset.manual) slugInput.value = slugify(e.target.value);
  });
  issueForm.querySelector('input[name="slug"]').addEventListener("input", (e) => { e.target.dataset.manual = "1"; });

  articleForm.querySelector('input[name="title"]').addEventListener("input", (e) => {
    const slugInput = articleForm.querySelector('input[name="slug"]');
    if (!slugInput.dataset.manual) slugInput.value = slugify(e.target.value);
  });
  articleForm.querySelector('input[name="slug"]').addEventListener("input", (e) => { e.target.dataset.manual = "1"; });

  if (editIssueSelect) {
    editIssueSelect.addEventListener("change", async () => {
      if (!editIssueSelect.value) return;
      await refreshArticlesForIssue(editIssueSelect.value);
    });
  }
}

function setupFormHandlers() {
  if (adminInitialized) return;
  adminInitialized = true;
  setupStaticHandlers();

  issueForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      setStatus("Creating issue…");
      const fd = new FormData(issueForm);
      const cover = fd.get("cover");
      const payload = {
        title: fd.get("title"),
        slug: fd.get("slug"),
        dateLabel: fd.get("dateLabel"),
        isCurrent: fd.get("isCurrent") === "on"
      };
      if (cover instanceof File && cover.size) {
        payload.coverBase64 = await fileToBase64(cover);
        payload.coverExtension = cover.name.split(".").pop()?.toLowerCase() || "png";
      }
      await api("/api/issues", "POST", payload);
      issueForm.reset();
      await refreshSite();
      setStatus("Issue created.");
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  currentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      setStatus("Updating current issue…");
      const fd = new FormData(currentForm);
      await api("/api/issues/current", "POST", { slug: fd.get("currentSlug") });
      await refreshSite();
      setStatus("Current issue updated.");
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  articleForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      setStatus("Creating article…");
      const fd = new FormData(articleForm);
      const hero = fd.get("hero");
      const payload = {
        issueSlug: fd.get("issueSlug"),
        slug: fd.get("slug"),
        title: fd.get("title"),
        subtitle: fd.get("subtitle"),
        author: fd.get("author"),
        date: fd.get("date"),
        category: fd.get("category"),
        type: fd.get("type"),
        tags: String(fd.get("tags") || "").split(",").map((x) => x.trim()).filter(Boolean),
        frontPageSlot: fd.get("frontPageSlot") || "none",
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
      await api("/api/articles", "POST", payload);
      articleForm.reset();
      createPreviewController.setImageUrl("");
      await refreshSite();
      if (payload.issueSlug) await refreshArticlesForIssue(payload.issueSlug);
      setStatus("Article created.");
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  loadArticleForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(loadArticleForm);
      const issueSlug = fd.get("issueSlug");
      const articleSlug = fd.get("articleSlug");
      const articles = issueArticlesCache.get(issueSlug) || [];
      const article = articles.find((a) => a.slug === articleSlug);
      if (!article) throw new Error("Article not found.");

      editArticleForm.elements.originalIssueSlug.value = issueSlug;
      editArticleForm.elements.originalArticleSlug.value = article.slug;
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
      const html = await fetchArticleBodyHtml(issueSlug, article.slug);
      editArticleForm.elements.bodyText.value = storedHtmlToPlainText(html);
      editPreviewController.setImageUrl(article.imageUrl || "");
      editPreviewController.update();
      switchTab("edit-articles-tab");
      setStatus("Article loaded.");
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  editArticleForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      setStatus("Saving article…");
      const fd = new FormData(editArticleForm);
      const hero = fd.get("hero");
      const payload = {
        originalIssueSlug: fd.get("originalIssueSlug"),
        issueSlug: fd.get("issueSlug"),
        originalArticleSlug: fd.get("originalArticleSlug"),
        title: fd.get("title"),
        subtitle: fd.get("subtitle"),
        author: fd.get("author"),
        date: fd.get("date"),
        category: fd.get("category"),
        type: fd.get("type"),
        tags: String(fd.get("tags") || "").split(",").map((x) => x.trim()).filter(Boolean),
        frontPageSlot: fd.get("frontPageSlot") || "none",
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
      await api("/api/articles/update", "POST", payload);
      await refreshSite();
      if (editIssueSelect.value) await refreshArticlesForIssue(editIssueSelect.value);
      setStatus("Article updated.");
    } catch (error) {
      setStatus(error.message, true);
    }
  });
}

async function boot() {
  setupFormHandlers();
  try {
    setStatus("Loading admin data…");
    await refreshSite();
    setStatus("Ready. Warning: this admin page has no password.");
  } catch (error) {
    setStatus(error.message || "Could not load admin data.", true);
  }
}

boot();
