function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function articleUrl(issueSlug, articleSlug) { return `/${encodeURIComponent(issueSlug)}/${encodeURIComponent(articleSlug)}/`; }
async function loadPartials() {
  const headerMount = document.getElementById("header-mount");
  const footerMount = document.getElementById("footer-mount");
  if (headerMount) headerMount.innerHTML = await (await fetch("/partials/header.html", { cache: "no-store" })).text();
  if (footerMount) {
    footerMount.innerHTML = await (await fetch("/partials/footer.html", { cache: "no-store" })).text();
    const yearSpan = document.getElementById("year");
    if (yearSpan) yearSpan.textContent = new Date().getFullYear();
  }
}
async function loadIssue() {
  const slug = window.location.pathname.split("/").filter(Boolean)[0];
  const issue = await (await fetch("./issue.json", { cache: "no-store" })).json();
  const articles = Array.isArray(issue.articles) ? issue.articles : [];
  const headerTitle = document.getElementById("issue-title");
  const headerMeta = document.getElementById("issue-meta");
  const container = document.getElementById("issue-articles");
  document.title = `${issue.title || slug} – The Cactus`;
  headerTitle.textContent = issue.title || slug;
  headerMeta.textContent = issue.dateLabel || "";
  container.innerHTML = "";
  const typeOrder = ["Long Article", "Interview", "Opinion", "Other"];
  typeOrder.forEach((typeName) => {
    const list = typeName === "Other"
      ? articles.filter((a) => !typeOrder.includes(a.type))
      : articles.filter((a) => (a.type || "Other") === typeName);
    if (!list.length) return;
    const html = `
      <section>
        <h3 class="article-section-title">${escapeHtml(typeName)}</h3>
        <div class="article-section-grid">
          ${list.map((article) => `
            <article class="article-card">
              <h3><a href="${articleUrl(slug, article.slug)}">${escapeHtml(article.title)}</a></h3>
              ${article.subtitle ? `<p class="muted">${escapeHtml(article.subtitle)}</p>` : ""}
              <div class="article-meta">${escapeHtml(article.author)} · ${escapeHtml(formatDate(article.date))}</div>
            </article>
          `).join("")}
        </div>
      </section>`;
    container.insertAdjacentHTML("beforeend", html);
  });

  container.insertAdjacentHTML("beforeend", `
    <section class="issue-pdf-section">
      <h3 class="article-section-title">Full Magazine</h3>
      <a class="issue-pdf-card" href="./magazine.pdf" target="_blank" rel="noopener noreferrer">
        <div class="issue-pdf-cover-wrap">
          <img class="issue-pdf-cover" src="./${issue.coverFilename || 'cover.jpg'}" alt="${escapeHtml(issue.title || slug)} PDF cover">
        </div>
        <div class="issue-pdf-content">
          <div class="issue-pdf-label">View PDF Version of the Magazine</div>
          <div class="issue-pdf-title">${escapeHtml(issue.title || slug)}</div>
          <div class="issue-pdf-meta">${escapeHtml(issue.dateLabel || "")}</div>
          <div class="issue-pdf-button">Open PDF</div>
        </div>
      </a>
    </section>
  `);
}
document.addEventListener("DOMContentLoaded", async () => {
  try { await loadPartials(); await loadIssue(); } catch (err) { console.error(err); }
});
