# Torrentory Client website

Standalone static marketing and download page, adapted from the original Torrentory client page. There is no catalogue, torrent search, submission endpoint, database, or website backend.

```sh
cd web
npm ci
npm run dev
npm run build
```

The **Deploy client website** workflow publishes to GitHub Pages on pushes to `main` that change `web/`. GitHub Pages must use GitHub Actions as its source.

You can also deploy `web/dist/` to any static host. For Vercel, set the project Root Directory to `web`, Framework to Vite, Build Command to `npm run build`, and Output Directory to `dist`. No environment variables are needed. Relative asset paths also support hosting in a subdirectory.

Install buttons use stable asset names on the existing GitHub repository's latest release. Release metadata uses the public GitHub API; download links keep working if that API is unavailable or rate limited. The macOS command downloads `install.sh` from the latest release.

The site's app window is an illustrative preview with example downloads, not a live torrent interface. macOS Apple Silicon and Windows x64 are the packaged platforms.
