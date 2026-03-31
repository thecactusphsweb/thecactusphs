const API_BASE = window.__CACTUS_API_BASE__ || "https://the-cactus-admin-api.thecactusphsweb.workers.dev";

const adminApp = document.getElementById("admin-app");
const statusEl = document.getElementById("admin-status");
const bootstrapEl = document.getElementById("admin-bootstrap");

const issueForm = document.getElementById("issue-form");
const articleForm = document.getElementById("article-form");
const currentForm = document.getElementById("current-form");
const issueSelect = document.getElementById("issue-select");
const currentIssueSelect = document.getElementById("current-issue-select");
const editIssueSelect = document.getElementById("edit-issue-select");
const editArticleSelect = document.getElementById("edit-article-select");
const editLoadForm = document.getElementById("edit-load-form");
const editArticleForm = document.getElementById("edit-article-form");

const tabs = document.querySelectorAll(".admin-tab[data-tab]");
const panels = document.querySelectorAll(".admin-tab-panel");
const issueTitleInput = issueForm?.querySelector('input[name="title"]');
const issueSlugInput = issueForm?.querySelector('input[name="slug"]');
const createPreview = document.getElementById("create-article-preview");
const editPreview = document.getElementById("edit-article-preview");
const currentIssuePreview = document.getElementById("current-issue-preview");

let issuesCache = [];
let loadedArticleKey = "";
let apiWritable = false;
let bootstrapIssues = [];

try {
  bootstrapIssues = JSON.parse(bootstrapEl?.textContent || "[]");
} catch {
  bootstrapIssues = [];
}

function setStatus(message, kind = "info") {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.remove("is-error", "is-success");
  if (kind === "error") statusEl.classList.add("is-error");
  if (kind === "success") statusEl.classList.add("is-success");
}

function switchTab(tabId) {
  tabs.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tabId));
  panels.forEach((panel) => panel.classList.toggle("active", panel.id === tabId));
}

tabs.forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function api(path, method = "GET", body = null) {
  const opts = { method, headers: {}, credentials: "include" };
  if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetchWithTimeout(`${API_BASE}${path}`, opts, 15000);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/["'’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function fileToBase64(file) {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fillSelect(select, items, getValue, getLabel) {
  if (!select) return;
  const previous = select.value;
  select.innerHTML = "";
  if (!items.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No items available";
    select.appendChild(opt);
    return;
  }
  items.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = getValue(item);
    opt.textContent = getLabel(item);
    select.appendChild(opt);
  });
  if (items.some((item) => getValue(item) === previous)) select.value = previous;
}

function issueFromCache(slug) {
  return issuesCache.find((issue) => issue.slug === slug);
}

function articleFromCache(issueSlug, articleSlug) {
  return issueFromCache(issueSlug)?.articles?.find((article) => article.slug === articleSlug);
}

function setFormValue(form, name, value) {
  const field = form?.elements?.namedItem(name);
  if (field) field.value = value ?? "";
}

function normalizeBootstrapIssue(issue) {
  return {
    slug: issue.slug,
    title: issue.title,
    dateLabel: issue.dateLabel || "",
    coverImage: issue.coverImage || "",
    coverFilename: issue.coverFilename || (issue.coverImage ? issue.coverImage.split("/").pop() : "cover.png"),
    pdfUrl: issue.pdfUrl || "",
    isCurrent: !!issue.isCurrent,
    articles: (issue.articles || []).map((article) => ({
      id: article.id,
      slug: article.slug,
      title: article.title || "",
      subtitle: article.subtitle || "",
      author: article.author || "",
      date: article.date || "",
      category: article.category || "",
      type: article.type || "Long Article",
      tags: article.tags || [],
      frontPageSlot: article.frontPageSlot || "none",
      imageCaption: article.imageCaption || "",
      citationsText: article.citationsText || "",
      bodyText: article.bodyText || "",
      issueSlug: issue.slug,
      issueTitle: issue.title
    }))
  };
}

function articlePreviewHtml(data, issueTitle = "") {
  const tags = (data.tags || []).filter(Boolean);
  const body = String(data.bodyText || "").trim();
  const bodyHtml = body
    ? body.split(/\n\s*\n/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("")
    : '<p class="muted">Article body preview appears here.</p>';
  const citations = String(data.citationsText || "").trim();
  return `
    <article class="admin-preview-article">
      <div class="admin-preview-kicker">${escapeHtml(data.category || data.type || "Article")} ${issueTitle ? `· ${escapeHtml(issueTitle)}` : ""}</div>
      <h3 class="admin-preview-title">${escapeHtml(data.title || "Untitled Article")}</h3>
      ${data.subtitle ? `<div class="admin-preview-subtitle">${escapeHtml(data.subtitle)}</div>` : ""}
      <div class="admin-preview-meta">${escapeHtml(data.author || "Author Name")} ${data.date ? `· ${escapeHtml(data.date)}` : ""}</div>
      ${tags.length ? `<div class="admin-preview-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      <div class="admin-preview-body">${bodyHtml}</div>
      ${citations ? `<section class="admin-preview-citations"><h4>Citations</h4><pre>${escapeHtml(citations)}</pre></section>` : ""}
    </article>`;
}

function getArticleDataFromForm(form) {
  const fd = new FormData(form);
  return {
    issueSlug: fd.get("issueSlug") || editIssueSelect?.value || "",
    author: String(fd.get("author") || ""),
    title: String(fd.get("title") || ""),
    subtitle: String(fd.get("subtitle") || ""),
    date: String(fd.get("date") || ""),
    category: String(fd.get("category") || ""),
    type: String(fd.get("type") || "Long Article"),
    tags: String(fd.get("tags") || "").split(",").map((x) => x.trim()).filter(Boolean),
    bodyText: String(fd.get("bodyText") || ""),
    citationsText: String(fd.get("citationsText") || "")
  };
}

function renderCreatePreview() {
  if (!createPreview) return;
  const data = getArticleDataFromForm(articleForm);
  const issueTitle = issueFromCache(data.issueSlug)?.title || "";
  createPreview.innerHTML = articlePreviewHtml(data, issueTitle);
}

function renderEditPreview() {
  if (!editPreview) return;
  if (editArticleForm?.hidden) {
    editPreview.innerHTML = '<p class="muted">Load an article to preview and edit it here.</p>';
    return;
  }
  const data = getArticleDataFromForm(editArticleForm);
  const issueTitle = issueFromCache(editIssueSelect?.value)?.title || "";
  editPreview.innerHTML = articlePreviewHtml(data, issueTitle);
}

function renderCurrentIssuePreview() {
  if (!currentIssuePreview) return;
  const issue = issueFromCache(currentIssueSelect?.value);
  if (!issue) {
    currentIssuePreview.innerHTML = '<p class="muted">Choose an issue to preview it here.</p>';
    return;
  }
  currentIssuePreview.innerHTML = `
    <div class="admin-current-card">
      <div class="admin-issue-title-row">
        <h3>${escapeHtml(issue.title)}</h3>
        ${issue.isCurrent ? '<span class="admin-pill">Current</span>' : ''}
      </div>
      <div class="admin-issue-meta">${escapeHtml(issue.slug)} · ${escapeHtml(issue.dateLabel || '')}</div>
      <div class="admin-current-links">
        <a href="/${issue.slug}/" target="_blank" rel="noopener noreferrer">Open issue page</a>
        ${issue.pdfUrl ? `<a href="${escapeHtml(issue.pdfUrl)}" target="_blank" rel="noopener noreferrer">Open PDF</a>` : ''}
      </div>
      <div class="admin-current-count">${issue.articles?.length || 0} article${(issue.articles?.length || 0) === 1 ? '' : 's'}</div>
    </div>`;
}

async function probeApiStatus() {
  try {
    const data = await api("/");
    apiWritable = !!data.ok;
    setStatus("Site data loaded. The admin API is connected and ready to save changes.", "success");
  } catch {
    apiWritable = false;
    setStatus("Site data loaded. The editor is working, but saving will fail until the admin Worker is deployed correctly.", "error");
  }
}

function populateFromBootstrap() {
  issuesCache = bootstrapIssues.map(normalizeBootstrapIssue);
  const issueLabel = (issue) => `${issue.title}${issue.isCurrent ? " (current)" : ""}`;
  [issueSelect, currentIssueSelect, editIssueSelect].forEach((select) => {
    fillSelect(select, issuesCache, (issue) => issue.slug, issueLabel);
  });
  if (!currentIssueSelect.value && issuesCache.length) currentIssueSelect.value = issuesCache.find((i) => i.isCurrent)?.slug || issuesCache[0].slug;
  if (!editIssueSelect.value && issuesCache.length) editIssueSelect.value = issuesCache[0].slug;
  refreshEditArticles();
  renderCurrentIssuePreview();
  renderCreatePreview();
  renderEditPreview();
}

function refreshEditArticles() {
  const issueSlug = editIssueSelect?.value;
  const issue = issueFromCache(issueSlug);
  const articles = issue?.articles || [];
  fillSelect(editArticleSelect, articles, (article) => article.slug, (article) => article.title);
}

issueTitleInput?.addEventListener("input", (e) => {
  if (!issueSlugInput) return;
  if (!issueSlugInput.dataset.manual || !issueSlugInput.value.trim()) {
    issueSlugInput.value = slugify(e.target.value);
  }
});
issueSlugInput?.addEventListener("input", () => {
  if (!issueSlugInput) return;
  issueSlugInput.dataset.manual = issueSlugInput.value.trim() ? "1" : "";
});

articleForm?.addEventListener("input", renderCreatePreview);
articleForm?.addEventListener("change", renderCreatePreview);
editArticleForm?.addEventListener("input", renderEditPreview);
editArticleForm?.addEventListener("change", renderEditPreview);
currentIssueSelect?.addEventListener("change", renderCurrentIssuePreview);
editIssueSelect?.addEventListener("change", () => {
  refreshEditArticles();
  editArticleForm.hidden = true;
  loadedArticleKey = "";
  renderEditPreview();
});

issueForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    setStatus("Creating issue…");
    const fd = new FormData(issueForm);
    const cover = fd.get("cover");
    if (!(cover instanceof File) || !cover.size) throw new Error("Please upload a cover image.");
    const slug = String(fd.get("slug") || "").trim() || slugify(fd.get("title"));
    if (!slug) throw new Error("Please enter an issue title so a slug can be generated.");
    await api("/api/issues", "POST", {
      title: fd.get("title"),
      slug,
      dateLabel: fd.get("dateLabel"),
      pdfUrl: fd.get("pdfUrl"),
      isCurrent: fd.get("isCurrent") === "on",
      coverBase64: await fileToBase64(cover),
      coverExtension: cover.name.split(".").pop()?.toLowerCase() || "jpg"
    });
    setStatus("Issue created. Wait for the site redeploy, then refresh the site.", "success");
    issueForm.reset();
    if (issueSlugInput) issueSlugInput.dataset.manual = "";
  } catch (err) {
    setStatus(err.message, "error");
  }
});

articleForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    setStatus("Creating article…");
    const fd = new FormData(articleForm);
    const hero = fd.get("hero");
    const payload = {
      issueSlug: fd.get("issueSlug"),
      title: fd.get("title"),
      subtitle: fd.get("subtitle"),
      author: fd.get("author"),
      date: fd.get("date"),
      category: fd.get("category"),
      type: fd.get("type"),
      tags: String(fd.get("tags") || "").split(",").map((x) => x.trim()).filter(Boolean),
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
    await api("/api/articles", "POST", payload);
    setStatus("Article created. Wait for the site redeploy, then refresh the site.", "success");
    articleForm.reset();
    renderCreatePreview();
  } catch (err) {
    setStatus(err.message, "error");
  }
});

editLoadForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const issueSlug = editIssueSelect.value;
    const articleSlug = editArticleSelect.value;
    const article = articleFromCache(issueSlug, articleSlug);
    if (!article) throw new Error("Article not found.");
    loadedArticleKey = `${issueSlug}/${articleSlug}`;
    setFormValue(editArticleForm, "slug", article.slug);
    setFormValue(editArticleForm, "title", article.title);
    setFormValue(editArticleForm, "subtitle", article.subtitle || "");
    setFormValue(editArticleForm, "author", article.author || "");
    setFormValue(editArticleForm, "date", article.date || "");
    setFormValue(editArticleForm, "category", article.category || "");
    setFormValue(editArticleForm, "type", article.type || "Long Article");
    setFormValue(editArticleForm, "tags", (article.tags || []).join(", "));
    setFormValue(editArticleForm, "frontPageSlot", article.frontPageSlot || "none");
    setFormValue(editArticleForm, "imageCaption", article.imageCaption || "");
    setFormValue(editArticleForm, "citationsText", article.citationsText || "");
    setFormValue(editArticleForm, "bodyText", article.bodyText || "");
    editArticleForm.hidden = false;
    renderEditPreview();
    setStatus(`Loaded article: ${article.title}`, "success");
  } catch (err) {
    setStatus(err.message, "error");
  }
});

editArticleForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const issueSlug = editIssueSelect.value;
    const articleSlug = editArticleSelect.value;
    if (!loadedArticleKey || loadedArticleKey !== `${issueSlug}/${articleSlug}`) throw new Error("Please load the article before saving changes.");
    setStatus("Saving article changes…");
    const fd = new FormData(editArticleForm);
    const hero = fd.get("hero");
    const payload = {
      issueSlug,
      articleSlug,
      title: fd.get("title"),
      subtitle: fd.get("subtitle"),
      author: fd.get("author"),
      date: fd.get("date"),
      category: fd.get("category"),
      type: fd.get("type"),
      tags: String(fd.get("tags") || "").split(",").map((x) => x.trim()).filter(Boolean),
      frontPageSlot: fd.get("frontPageSlot"),
      featuredMain: fd.get("frontPageSlot") === "main",
      imageCaption: fd.get("imageCaption"),
      citationsText: fd.get("citationsText"),
      bodyText: fd.get("bodyText")
    };
    if (hero instanceof File && hero.size) {
      payload.heroBase64 = await fileToBase64(hero);
      payload.heroExtension = hero.name.split(".").pop()?.toLowerCase() || "jpg";
    }
    await api("/api/articles", "PATCH", payload);
    setStatus("Article updated. Wait for the site redeploy, then refresh the site.", "success");
  } catch (err) {
    setStatus(err.message, "error");
  }
});

currentForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    setStatus("Updating current issue…");
    const fd = new FormData(currentForm);
    await api("/api/issues/current", "POST", { slug: fd.get("currentSlug") });
    setStatus("Current issue updated. Wait for the site redeploy, then refresh the site.", "success");
  } catch (err) {
    setStatus(err.message, "error");
  }
});

function init() {
  adminApp.hidden = false;
  populateFromBootstrap();
  if (!issuesCache.length) {
    setStatus("No issue data was found in the published site bundle.", "error");
  } else {
    setStatus("Site data loaded from the current published content.");
  }
  probeApiStatus();
}

init();
