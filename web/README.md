# Torrentory Client website

Standalone static marketing and download page, adapted from the original Torrentory client page. There is no catalogue, torrent search, submission endpoint, database, or website backend.

```sh
cd web
npm ci
npm run dev
npm run build
```

## Deploy on Vercel

Import `xandertaylorx/Torrentory-Client` as a Vercel project and use:

| Setting | Value |
| --- | --- |
| Root Directory | `web` |
| Framework Preset | Vite |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js Version | 22.x |
| Environment Variables | None |

Click Deploy. Future pushes to the production branch (`main`) deploy automatically. To use a custom domain, add it in the Vercel project's Settings → Domains and apply the DNS records Vercel provides.

The desktop client at the repository root is not part of the Vercel build. GitHub Releases continues to host all installers. The site is a single-page app with real paths (`/releases`, `/security`, `/license`, `/legal`); `vercel.json` rewrites unknown paths to `index.html`, and assets are served from the site root. The security and license pages, and the release notes, are read live from this repository and the GitHub API.

Install buttons use stable asset names on the existing GitHub repository's latest release. Release metadata uses the public GitHub API; download links keep working if that API is unavailable or rate limited. The macOS command downloads `install.sh` from the latest release.

The site's app window is an illustrative preview with example downloads, not a live torrent interface. macOS Apple Silicon and Windows x64 are the packaged platforms.
