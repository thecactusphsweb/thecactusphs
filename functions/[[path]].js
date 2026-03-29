export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Only route page navigations. Let assets, APIs, and non-GET requests pass through.
  if (!["GET", "HEAD"].includes(request.method)) {
    return env.ASSETS.fetch(request);
  }

  const pathname = url.pathname;

  // Let anything with a file extension pass straight to static assets.
  if (/\.[a-z0-9]+$/i.test(pathname)) {
    return env.ASSETS.fetch(request);
  }

  // Normalize duplicate slashes and trim trailing slash for routing logic only.
  const segments = pathname.split("/").filter(Boolean);

  // Reserved top-level paths that should continue to go to your normal static pages/assets.
  const reserved = new Set([
    "about",
    "archive",
    "archives",
    "article",
    "articles",
    "authors",
    "admin",
    "assets",
    "issues",
    "partials",
    "sponsors",
    "worker",
    "favicon.ico",
    "robots.txt",
    "sitemap.xml"
  ]);

  // Home page
  if (segments.length === 0) {
    return env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
  }

  // Keep reserved/static routes working as normal.
  if (reserved.has(segments[0])) {
    return env.ASSETS.fetch(request);
  }

  // /issue-slug/  -> serve issue.html
  if (segments.length === 1) {
    return env.ASSETS.fetch(new Request(new URL("/issue.html", url), request));
  }

  // /issue-slug/article-slug/ -> serve article.html
  if (segments.length === 2) {
    return env.ASSETS.fetch(new Request(new URL("/article.html", url), request));
  }

  // Anything deeper falls back to normal asset handling.
  return env.ASSETS.fetch(request);
}