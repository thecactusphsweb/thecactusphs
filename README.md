# Cactus Improved

This version keeps the same magazine look, but makes the public site static for better indexing and keeps a password-gated admin workflow.

## Folder layout

- `site/` source content and assets
- `scripts/build.mjs` static-site builder
- `worker/src/index.js` admin API + password session
- `dist/` generated public site after build

## Local test

```bash
npm install
npm run build
python3 -m http.server 8788 -d dist
```

Open:
- public site: `http://localhost:8788/`
- admin page: `http://localhost:8788/admin/`

The local static admin page loads, but the real login and editing require the Worker deployed.

## GitHub

Create a repo, then:

```bash
git init
git add .
git commit -m "Initial Cactus site"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

## Cloudflare Pages

Create a Pages project connected to the repo.

Use:
- Build command: `npm run build`
- Output directory: `dist`

## Worker

Edit `wrangler.jsonc`:
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_BRANCH`
- `ALLOWED_ORIGINS`

Then deploy:

```bash
npx wrangler login
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put ADMIN_COOKIE_SECRET
npx wrangler secret put CLOUDFLARE_PAGES_DEPLOY_HOOK
npx wrangler deploy
```

## API domain

Put your Worker on a domain like `https://api.your-domain.com`.

Then edit `site/admin/index.html` and replace:

```html
window.__CACTUS_API_BASE__ = "https://api.YOUR-DOMAIN.com";
```

with your real API URL.

Then rebuild and push again:

```bash
npm run build
git add .
git commit -m "Connect admin to API"
git push
```

## GitHub token permissions

Use a fine-grained GitHub token with repository contents write access for this repo.

## Notes

- Public pages are generated HTML, so Google sees real content immediately.
- Admin login is password + signed cookie.
- Public PDFs can still be uploaded manually by you.


## Editing article content locally
Edit files under `site/content/.../body.html`, then run `npm run build`. The built pages in `dist/` are regenerated from those source files.
