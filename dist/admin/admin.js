const API_BASE = window.__CACTUS_API_BASE__ || "https://the-cactus-admin-api.thecactusphsweb.workers.dev";

const loginCard = document.getElementById("login-card");
const adminApp = document.getElementById("admin-app");
const loginForm = document.getElementById("login-form");
const loginStatus = document.getElementById("login-status");
const logoutButton = document.getElementById("logout-button");
const statusEl = document.getElementById("admin-status");

const issueForm = document.getElementById("issue-form");
const articleForm = document.getElementById("article-form");
const currentForm = document.getElementById("current-form");
const issueSelect = document.getElementById("issue-select");
const currentIssueSelect = document.getElementById("current-issue-select");

const tabs = document.querySelectorAll(".admin-tab[data-tab]");
const panels = document.querySelectorAll(".admin-tab-panel");

function setLoginStatus(message, isError = false) {
  loginStatus.hidden = false;
  loginStatus.textContent = message;
  loginStatus.style.color = isError ? "#9b1c1c" : "";
}

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
    .replace(/['’"]/g, "")
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

async function checkSession() {
  try {
    await api("/api/admin/session");
    loginCard.hidden = true;
    adminApp.hidden = false;
    await refreshIssues();
    setStatus("Signed in.");
  } catch {
    loginCard.hidden = false;
    adminApp.hidden = true;
  }
}

async function refreshIssues() {
  const data = await api("/api/issues");
  const issues = data.issues || [];
  for (const select of [issueSelect, currentIssueSelect]) {
    select.innerHTML = "";
    issues.forEach((issue) => {
      const opt = document.createElement("option");
      opt.value = issue.slug;
      opt.textContent = `${issue.title}${issue.isCurrent ? " (current)" : ""}`;
      select.appendChild(opt);
    });
  }
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(loginForm);
  try {
    await api("/api/admin/login", "POST", { password: fd.get("password") });
    loginForm.reset();
    await checkSession();
  } catch (err) {
    setLoginStatus(err.message, true);
  }
});

logoutButton?.addEventListener("click", async () => {
  try {
    await api("/api/admin/logout", "POST");
  } catch {}
  location.reload();
});

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
    setStatus("Issue created.");
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
    setStatus("Article created.");
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

checkSession();
