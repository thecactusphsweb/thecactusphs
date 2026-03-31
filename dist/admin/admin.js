const API_BASE = window.__CACTUS_API_BASE__ || "https://the-cactus-admin-api.thecactusphsweb.workers.dev";

const adminApp = document.getElementById("admin-app");
const statusEl = document.getElementById("admin-status");

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
let issuesCache = [];
let loadedArticleKey = "";

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#9b1c1c" : "";
}

function switchTab(tabId) {
  tabs.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tabId));
  panels.forEach((panel) => panel.classList.toggle("active", panel.id === tabId));
}
tabs.forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

async function api(path, method = "GET", body = null) {
  const opts = { method, headers: {}, credentials: "include" };
  if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, opts);
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

async function fileToBase64(file) {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fillSelect(select, items, getValue, getLabel) {
  select.innerHTML = "";
  items.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = getValue(item);
    opt.textContent = getLabel(item);
    select.appendChild(opt);
  });
}

async function refreshIssues() {
  const data = await api("/api/issues");
  issuesCache = data.issues || [];
  const issueLabel = (issue) => `${issue.title}${issue.isCurrent ? " (current)" : ""}`;
  for (const select of [issueSelect, currentIssueSelect, editIssueSelect]) {
    fillSelect(select, issuesCache, (issue) => issue.slug, issueLabel);
  }
  await refreshEditArticles();
}

async function refreshEditArticles() {
  const issueSlug = editIssueSelect.value;
  if (!issueSlug) {
    editArticleSelect.innerHTML = "";
    return;
  }
  const data = await api(`/api/issues/${encodeURIComponent(issueSlug)}`);
  const articles = data.issue?.articles || [];
  fillSelect(editArticleSelect, articles, (article) => article.slug, (article) => article.title);
}

function issueFromCache(slug) {
  return issuesCache.find((issue) => issue.slug === slug);
}

function setFormValue(form, name, value) {
  const field = form.elements.namedItem(name);
  if (field) field.value = value ?? "";
}

issueForm?.querySelector('input[name="title"]')?.addEventListener("input", (e) => {
  const slugInput = issueForm.querySelector('input[name="slug"]');
  if (!slugInput.dataset.manual) slugInput.value = slugify(e.target.value);
});
issueForm?.querySelector('input[name="slug"]')?.addEventListener("input", (e) => { e.target.dataset.manual = "1"; });

issueForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    setStatus("Creating issue…");
    const fd = new FormData(issueForm);
    const cover = fd.get("cover");
    if (!(cover instanceof File) || !cover.size) throw new Error("Please upload a cover image.");
    await api("/api/issues", "POST", {
      title: fd.get("title"),
      slug: fd.get("slug"),
      dateLabel: fd.get("dateLabel"),
      isCurrent: fd.get("isCurrent") === "on",
      coverBase64: await fileToBase64(cover),
      coverExtension: cover.name.split(".").pop()?.toLowerCase() || "jpg"
    });
    issueForm.reset();
    await refreshIssues();
    setStatus("Issue created. GitHub should redeploy the site automatically.");
  } catch (err) {
    setStatus(err.message, true);
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
    articleForm.reset();
    await refreshIssues();
    setStatus("Article created. GitHub should redeploy the site automatically.");
  } catch (err) {
    setStatus(err.message, true);
  }
});

editIssueSelect?.addEventListener("change", async () => {
  try {
    await refreshEditArticles();
    editArticleForm.hidden = true;
  } catch (err) {
    setStatus(err.message, true);
  }
});

editLoadForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const issueSlug = editIssueSelect.value;
    const articleSlug = editArticleSelect.value;
    const data = await api(`/api/article?issueSlug=${encodeURIComponent(issueSlug)}&articleSlug=${encodeURIComponent(articleSlug)}`);
    const article = data.article;
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
    setStatus(`Loaded article: ${article.title}`);
  } catch (err) {
    setStatus(err.message, true);
  }
});

editArticleForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const issueSlug = editIssueSelect.value;
    const articleSlug = editArticleSelect.value;
    if (!loadedArticleKey || loadedArticleKey !== `${issueSlug}/${articleSlug}`) {
      throw new Error("Please load the article before saving changes.");
    }
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
    editArticleForm.reset();
    editArticleForm.hidden = true;
    await refreshIssues();
    await refreshEditArticles();
    setStatus("Article updated. GitHub should redeploy the site automatically.");
  } catch (err) {
    setStatus(err.message, true);
  }
});

currentForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    setStatus("Updating current issue…");
    const fd = new FormData(currentForm);
    await api("/api/issues/current", "POST", { slug: fd.get("currentSlug") });
    await refreshIssues();
    setStatus("Current issue updated.");
  } catch (err) {
    setStatus(err.message, true);
  }
});

async function init() {
  adminApp.hidden = false;
  await refreshIssues();
  setStatus("Admin connected. Changes save directly to GitHub.");
}

init().catch((err) => {
  adminApp.hidden = false;
  setStatus(err.message, true);
  console.error(err);
});
