# The Cactus — clean static version

This version removes the Cloudflare Pages routing function and uses real folders so URLs work naturally:

- `/winter-2026/`
- `/winter-2026/welcome-to-the-winter-2026-issue/`
- `/about/`
- `/archives/`
- `/authors/`
- `/sponsors/`
- `/admin/`

## Important

This bundle removes the admin password entirely. That means **anyone who can reach the API worker can create or edit site content**. It is functional, but not secure.

## Replace your old structure with this one

Delete these old items from your repo before copying this bundle in:

- `functions/`
- old flat pages like `about.html`, `admin.html`, `archive.html`, `article.html`, `articles.html`, `authors.html`, `issue.html`, `sponsors.html`

Keep your custom domain / Cloudflare Pages project.

## Deploy steps

1. Replace your repo contents with this bundle.
2. Commit and push to GitHub.
3. Let Cloudflare Pages redeploy the site.
4. Deploy the API worker separately:
   - `npx wrangler login`
   - `npx wrangler deploy`
5. In Cloudflare Worker settings, set:
   - secret: `GITHUB_TOKEN`
   - vars: `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH`

## Worker vars

- `GITHUB_OWNER=thecactusphsweb`
- `GITHUB_REPO=thecactusphs`
- `GITHUB_BRANCH=main`

## Notes

- Put each issue PDF at `/<issue-slug>/magazine.pdf`
- The sample site starts with one issue and one sample article.
- The admin page is at `/admin/`
