# The Cactus — simpler folder-based version

## URL structure
- Home: `/`
- Archive: `/archive/`
- Authors: `/authors/`
- About: `/about/`
- Sponsors: `/sponsors/`
- Admin: `/admin/`
- Issue page: `/<issue-slug>/`
- Article page: `/<issue-slug>/<article-slug>/`

## How updates work
The admin page talks to the Cloudflare Worker API.
The Worker writes files directly into your GitHub repo.
Then Cloudflare Pages redeploys from GitHub.

So updates are not truly instant on the public site — they appear after the Pages deployment finishes.
