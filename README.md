# The Cactus — working admin bundle

This bundle is the no-password admin version.

What it does:
- loads existing issues/articles immediately from bundled site data
- auto-generates issue slug from issue title
- create issue
- create article
- edit article
- set current issue
- live article preview on the right
- saves through the Cloudflare Worker to GitHub

## One-time setup

1. Open this folder in VS Code.
2. Make sure these GitHub repo secrets already exist for the Pages deploy workflow:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
3. Make sure the Worker secret exists:
   - `GITHUB_TOKEN`

## Deploy/update public site

```bash
npm install
npm run build
git add .
git commit -m "Deploy working admin bundle"
git push origin main
```

## Deploy/update the Worker

```bash
npx wrangler deploy
npx wrangler secret put GITHUB_TOKEN
```

## Local preview

```bash
npm install
npm run build
python3 -m http.server 8788 -d dist
```

Then open:
- `http://localhost:8788/`
- `http://localhost:8788/admin/`
