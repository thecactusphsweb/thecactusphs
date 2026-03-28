export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Public test route: this must come BEFORE the auth check
    if (url.pathname === "/api/test" && request.method === "GET") {
      return json({ ok: true, message: "Worker is running." });
    }

    // Protect all other API routes
    if (url.pathname.startsWith("/api/")) {
      const user = request.headers.get("CF-Access-Authenticated-User-Email");
      if (!user) {
        return json(
          { error: "Unauthorized. Protect /admin.html and /api/* with Cloudflare Access." },
          401
        );
      }
    }

    return json({ error: "Not found" }, 404);
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}
