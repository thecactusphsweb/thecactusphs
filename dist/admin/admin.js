const API_BASE = window.__CACTUS_API_BASE__ || "https://the-cactus-admin-api.thecactusphsweb.workers.dev";

const adminApp = document.getElementById("admin-app");
const statusEl = document.getElementById("admin-status");
const overviewEl = document.getElementById("admin-overview");
const refreshButton = document.getElementById("refresh-admin-data");
const currentIssuePreview = document.getElementById("current-issue-preview");
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

let issuesCache = [];
let loadedArticleKey = "";
let apiWritable = false;
let bootstrapIssues = [];

try {
  bootstrapIssues = JSON.parse(bootstrapEl?.textContent || "[]");
} catch {
  bootstrapIssues = [];
}

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
  statusEl.classList.toggle("is-success", !isError);
}

function switchTab(tabId) {
  tabs.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tabId));
  panels.forEach((panel) => panel.classList.toggle("active", panel.id === tabId));
}

tabs.forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
refreshButton?.addEventListener("click", () => init(true));

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
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

async function fetchJson(path) {
  const res = await fetchWithTimeout(path, { credentials: "same-origin" }, 8000);
  if (!res.ok) throw new Error(`Static fetch failed: ${path}`);
  return res.json();
}

async function fetchText(path) {
  const res = await fetchWithTimeout(path, { credentials: "same-origin" }, 8000);
  if (!res.ok) throw new Error(`Static fetch failed: ${path}`);
  return res.text();
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

async function loadIssueSummariesStatic() {
  try {
    return await fetchJson("/assets/data/issues.json");
  } catch {
    return bootstrapIssues.map(({ slug, title, dateLabel, coverImage, pdfUrl, isCurrent }) => ({ slug, title, dateLabel, coverImage, pdfUrl, isCurrent }));
  }
}

async function loadIssueDetailsStatic(slug) {
  const boot = bootstrapIssues.find((issue) => issue.slug === slug);
  try {
    return await fetchJson(`/${slug}/issue.json`);
  } catch {
    if (boot) return boot;
    throw new Error(`Unable to load issue details for ${slug}.`);
  }
}

async function loadArticleBody(issueSlug, articleSlug) {
  try {
    const html = await fetchText(`/${issueSlug}/${articleSlug}/body.html`);
    return html
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
  } catch {
    const article = articleFromCache(issueSlug, articleSlug);
    return article?.bodyText || "";
  }
}

function renderOverview() {
  if (!overviewEl) return;
  if (!issuesCache.length) {
    overviewEl.innerHTML = '<p class="muted">No issues found.</p>';
    return;
  }
  overviewEl.innerHTML = issuesCache.map((issue) => {
    const pdfHref = issue.pdfUrl || "";
    const articles = issue.articles || [];
    return `
      <article class="admin-issue-overview ${issue.isCurrent ? "is-current" : ""}">
        <div class="admin-issue-top">
          <div>
            <div class="admin-issue-title-row">
              <h3>${escapeHtml(issue.title)}</h3>
              ${issue.isCurrent ? '<span class="admin-pill">Current</span>' : ""}
            </div>
            <div class="admin-issue-meta">${escapeHtml(issue.slug)} · ${escapeHtml(issue.dateLabel || "")}</div>
          </div>
          ${pdfHref ? `<a class="admin-link-button" href="${escapeHtml(pdfHref)}" target="_blank" rel="noopener noreferrer">Open PDF</a>` : '<span class="admin-muted-chip">No PDF linked</span>'}
        </div>
        <div class="admin-article-mini-list">
          ${articles.length ? articles.map((article) => `<div class="admin-article-mini-item"><strong>${escapeHtml(article.title)}</strong><span>${escapeHtml(article.author || "")}</span></div>`).join("") : '<div class="muted">No articles yet.</div>'}
        </div>
      </article>`;
  }).join("");
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
      <div class="admin-issue-meta">${escapeHtml(issue.slug)} · ${escapeHtml(issue.dateLabel || "")}</div>
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
    setStatus("Loaded current site data. Saving changes will publish through the admin API.");
  } catch {
    apiWritable = false;
    setStatus("Loaded current site data. Saving is unavailable until the admin Worker is redeployed.", true);
  }
}

async function refreshIssues(showLoadedMessage = false) {
  const summaries = await loadIssueSummariesStatic();
  const detailedIssues = await Promise.all((summaries || []).map(async (summary) => {
    const detail = await loadIssueDetailsStatic(summary.slug);
    return {
      ...summary,
      ...detail,
      isCurrent: !!summary.isCurrent,
      pdfUrl: detail?.pdfUrl || summary.pdfUrl || "",
      articles: (detail?.articles || []).map((article) => ({ ...article, issueSlug: summary.slug }))
    };
  }));

  issuesCache = detailedIssues;
  const issueLabel = (issue) => `${issue.title}${issue.isCurrent ? " (current)" : ""}`;
  for (const select of [issueSelect, currentIssueSelect, editIssueSelect]) {
    fillSelect(select, issuesCache, (issue) => issue.slug, issueLabel);
  }
  if (currentIssueSelect?.value) currentIssueSelect.dispatchEvent(new Event("change"));
  await refreshEditArticles();
  renderOverview();
  renderCurrentIssuePreview();

  if (showLoadedMessage) {
    setStatus(apiWritable ? "Refreshed current site data. Saves go through the admin API." : "Refreshed current site data. Saving is unavailable until the admin Worker is redeployed.", !apiWritable);
  }
}

async function refreshEditArticles() {
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
      isCurrent: fd.get("isCurrent") === "on",
      coverBase64: await fileToBase64(cover),
      coverExtension: cover.name.split(".").pop()?.toLowerCase() || "jpg"
    });
    issueForm.reset();
    if (issueSlugInput) issueSlugInput.dataset.manual = "";
    setStatus("Issue created. Wait for the site redeploy, then click Refresh.");
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
    setStatus("Article created. Wait for the site redeploy, then click Refresh.");
  } catch (err) {
    setStatus(err.message, true);
  }
});

editIssueSelect?.addEventListener("change", async () => {
  await refreshEditArticles();
  editArticleForm.hidden = true;
});

currentIssueSelect?.addEventListener("change", renderCurrentIssuePreview);

editLoadForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const issueSlug = editIssueSelect.value;
    const articleSlug = editArticleSelect.value;
    const article = articleFromCache(issueSlug, articleSlug);
    if (!article) throw new Error("Article not found.");
    const bodyText = await loadArticleBody(issueSlug, articleSlug);
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
    setFormValue(editArticleForm, "bodyText", bodyText || "");
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
    setStatus("Article updated. Wait for the site redeploy, then click Refresh.");
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
    setStatus("Current issue updated. Wait for the site redeploy, then click Refresh.");
  } catch (err) {
    setStatus(err.message, true);
  }
});

async function init(manualRefresh = false) {
  adminApp.hidden = false;
  if (!manualRefresh) setStatus("Loading current site data…");
  await refreshIssues(manualRefresh);
  probeApiStatus();
}

init().catch((err) => {
  adminApp.hidden = false;
  setStatus(err.message, true);
  console.error(err);
});
