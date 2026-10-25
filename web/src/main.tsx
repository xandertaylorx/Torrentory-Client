import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ArrowUpRight, Check, Copy } from "lucide-react";
import { ClientPreview } from "./ClientPreview";
import { Footer, Header } from "./Layout";
import { DocPage, LegalPage, ReleasesPage } from "./Pages";
import { Link, usePath } from "./router";
import "./styles.css";

import { REPO } from "./Markdown";
const DOWNLOAD = `${REPO}/releases/latest/download`;
const DMG = `${DOWNLOAD}/Torrentory-Client-macos-arm64.dmg`;
const EXE = `${DOWNLOAD}/Torrentory-Client-windows-x64.exe`;
const INSTALL = `curl -fsSL ${DOWNLOAD}/install.sh | /bin/bash`;

const comparison = [
  ["Price", "Free", "Free tier, paid Pro plan"],
  ["Speed", "Whatever your connection allows", "Boosts sold separately"],
  ["Ads", "None", "In the interface"],
  ["Installer", "The app, nothing else", "Bundled offers"],
  ["Streaming", "Included", "Often paid"],
  ["Telemetry", "None", "Usage tracking"],
  ["Source", "MIT licensed", "Closed"],
];

const features = [
  ["Stream while downloading", "Play audio and video before the transfer finishes, with seeking, playback speed and SRT or WebVTT subtitles."],
  ["Choose your files", "Pick the destination and exactly which files to download before anything starts."],
  ["Create torrents", "Turn any file or folder into a .torrent with your own trackers."],
  ["Resumes instantly", "Every transfer comes back after a restart without a full recheck."],
  ["Signed updates", "Updates are verified against a key built into the app before they install."],
  ["Private by default", "No account, no telemetry and no remote-control API. Nothing leaves your machine except peer traffic."],
];

/** First sentence of the release notes with Markdown removed. */
function firstSentence(markdown: string) {
  const paragraph = markdown.split(/\n\s*\n/).find(block => block.trim() && !block.trim().startsWith("```")) ?? "";
  const plain = paragraph.replace(/[*_`#>]/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
  return (plain.match(/^.+?[.!?](\s|$)/)?.[0] ?? plain).trim();
}

function Home() {
  const [copied, setCopied] = useState(false);
  const commandRef = useRef<HTMLElement>(null);
  const [version, setVersion] = useState("0.1.8");
  const [note, setNote] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("https://api.github.com/repos/xandertaylorx/Torrentory-Client/releases/latest", { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error("Release unavailable"); return response.json(); })
      .then(data => { if (typeof data.tag_name === "string" && /^v\d+\.\d+\.\d+$/.test(data.tag_name)) {
        setVersion(data.tag_name.slice(1));
        if (typeof data.body === "string") setNote(firstSentence(data.body));
      } })
      .catch(() => { /* Stable download URLs work when the API is unavailable. */ });
    return () => controller.abort();
  }, []);
  async function copyCommand() {
    try { await navigator.clipboard.writeText(INSTALL); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch {
      if (commandRef.current) {
        const range = document.createRange(); range.selectNodeContents(commandRef.current);
        const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
      }
    }
  }

  return <>
    <>
      <section className="mx-auto max-w-[1080px] px-6 pt-20 pb-14 text-center md:pt-28">
        {note && <Link href="/releases" className="mx-auto mb-8 flex w-fit max-w-[min(100%,24rem)] items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)] py-1 pr-3 pl-1 text-xs text-[var(--muted)] hover:border-[color-mix(in_srgb,var(--line)_50%,var(--fg))]"><span className="shrink-0 rounded-full bg-[var(--soft)] px-2 py-0.5 font-medium text-[var(--fg)]">v{version}</span><span className="truncate">{note}</span><ArrowUpRight size={12} className="shrink-0" /></Link>}
        <h1 className="mx-auto max-w-[17ch] text-[clamp(2.5rem,6.2vw,4.75rem)] leading-[1.02] font-semibold tracking-[-.05em]">The torrent client with nothing to upgrade.</h1>
        <p className="mx-auto mt-6 max-w-[34rem] text-balance text-[17px] leading-7 text-[var(--muted)]">Other clients charge for the speed your connection already has. Torrentory is free, open source and uncapped. No Pro tier, no ads, no catch.</p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a href={DMG} className="btn btn-primary">Download for Mac</a>
          <a href={EXE} className="btn">Download for Windows</a>
        </div>
        <p className="mt-4 text-xs text-[var(--faint)]">Version {version} · macOS 12+ Apple Silicon · Windows 10+ · MIT licensed</p>
      </section>

      <section aria-label="Product preview" className="mx-auto max-w-[1080px] px-6 pb-28"><ClientPreview /></section>

      <section id="why" className="rule scroll-mt-4">
        <div className="mx-auto grid max-w-[1080px] gap-12 px-6 py-24 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
          <div>
            <h2 className="text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Your bandwidth is not a product.</h2>
            <p className="mt-5 max-w-sm leading-7 text-[var(--muted)]">A torrent client moves files. Torrentory does that and nothing else, so there is nothing to sell you.</p>
          </div>
          <div className="min-w-0 text-sm">
            <div className="grid grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)_minmax(0,1.2fr)] gap-x-4 border-b border-[var(--line)] pb-3 text-xs text-[var(--faint)]"><span /><span className="font-medium text-[var(--fg)]">Torrentory</span><span>Typical freemium client</span></div>
            {comparison.map(([label, ours, theirs]) => (
              <div key={label} className="grid grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)_minmax(0,1.2fr)] gap-x-4 border-b border-[var(--line)] py-4"><span className="text-[var(--muted)]">{label}</span><span className="font-medium">{ours}</span><span className="text-[var(--muted)]">{theirs}</span></div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="rule scroll-mt-4">
        <div className="mx-auto max-w-[1080px] px-6 py-24">
          <h2 className="max-w-md text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Everything is included.</h2>
          <dl className="mt-14 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(([title, body]) => <div key={title}><dt className="font-medium">{title}</dt><dd className="mt-2 text-sm leading-6 text-[var(--muted)]">{body}</dd></div>)}
          </dl>
          <p className="mt-14 max-w-xl text-sm leading-6 text-[var(--muted)]">Built on librqbit, a BitTorrent engine written in Rust, inside a native Tauri shell. The macOS download is 11 MB.</p>
        </div>
      </section>

      <section id="open-source" className="rule">
        <div className="mx-auto grid max-w-[1080px] items-center gap-12 px-6 py-24 lg:grid-cols-2 lg:gap-20">
          <div>
            <h2 className="text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Read the code.</h2>
            <p className="mt-5 max-w-md leading-7 text-[var(--muted)]">Every line is public under the MIT license. Audit it, fork it or build it yourself. There is no closed core and nothing to unlock.</p>
            <a href={REPO} className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4">View on GitHub <ArrowUpRight size={14} /></a>
          </div>
          <pre className="mono overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 text-[13px] leading-7"><Line>git clone {REPO.replace("https://", "")}</Line><Line>cd Torrentory-Client && npm install</Line><Line>npm run tauri dev</Line></pre>
        </div>
      </section>

      <section id="install" className="rule scroll-mt-4">
        <div className="mx-auto max-w-[1080px] px-6 py-24">
          <h2 className="text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Install</h2>
          <div className="mt-10 grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:gap-20">
            <div className="min-w-0">
              <p className="text-sm text-[var(--muted)]">macOS · paste into Terminal. Downloads the latest release, verifies its checksum and Apple signature, and installs to Applications.</p>
              <div className="mt-4 flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
                <code ref={commandRef} className="mono min-w-0 flex-1 text-[13px] leading-6 break-all"><span className="text-[var(--faint)] select-none">$ </span>{INSTALL}</code>
                <button type="button" onClick={copyCommand} aria-label="Copy install command" className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md border border-[var(--line)] text-[var(--muted)] hover:text-[var(--fg)]">{copied ? <Check size={14} /> : <Copy size={14} />}</button>
              </div>
              <p role="status" aria-live="polite" className="sr-only">{copied ? "Copied to clipboard" : ""}</p>
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--muted)]">
                <a href={`${DOWNLOAD}/install.sh`} className="underline underline-offset-4 hover:text-[var(--fg)]">Inspect installer</a>
                <a href={`${DOWNLOAD}/SHA256SUMS`} className="underline underline-offset-4 hover:text-[var(--fg)]">Checksums</a>
                <a href={`${REPO}/releases/latest`} className="underline underline-offset-4 hover:text-[var(--fg)]">Release notes</a>
              </div>
            </div>
            <div className="text-sm">
              <p className="text-[var(--muted)]">Or download directly</p>
              <div className="mt-4 divide-y divide-[var(--line)] rounded-lg border border-[var(--line)] bg-[var(--panel)]">
                <a href={DMG} className="flex items-center justify-between px-4 py-3.5 hover:bg-[var(--soft)]"><span>macOS <span className="text-[var(--faint)]">Apple Silicon · 11 MB</span></span><ArrowUpRight size={15} className="text-[var(--muted)]" /></a>
                <a href={EXE} className="flex items-center justify-between px-4 py-3.5 hover:bg-[var(--soft)]"><span>Windows <span className="text-[var(--faint)]">x64 · 5 MB</span></span><ArrowUpRight size={15} className="text-[var(--muted)]" /></a>
              </div>
            </div>
          </div>
          <p className="mt-10 max-w-2xl text-xs leading-5 text-[var(--faint)]">The macOS build is Developer ID signed but not notarised, so macOS may ask you to confirm the first launch. The installer keeps Gatekeeper on. Windows builds are unsigned. Intel Macs and Linux are not packaged yet.</p>
        </div>
      </section>
    </>

  </>;
}

function Line({ children }: { children: ReactNode }) {
  return <span className="block whitespace-pre"><span className="text-[var(--faint)] select-none">$ </span>{children}</span>;
}

const titles: Record<string, string> = {
  "/": "Torrentory — The torrent client with nothing to upgrade",
  "/releases": "Releases — Torrentory",
  "/security": "Security — Torrentory",
  "/license": "MIT License — Torrentory",
  "/legal": "Legal — Torrentory",
};

function App() {
  const path = usePath();
  useEffect(() => { document.title = titles[path] ?? titles["/"]; }, [path]);
  let page: ReactNode;
  switch (path) {
    case "/releases": page = <ReleasesPage />; break;
    case "/security": page = <DocPage file="SECURITY.md" eyebrow="Security" title="How Torrentory stays safe." intro="Controls, trust boundaries and how to report a problem." />; break;
    case "/license": page = <DocPage file="LICENSE" plain eyebrow="License" title="MIT License." intro="Free to use, modify and distribute. Read it in full below." />; break;
    case "/legal": page = <LegalPage />; break;
    default: page = <Home />;
  }
  return <>
    <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 rounded-md bg-[var(--fg)] p-3 text-[var(--bg)]">Skip to content</a>
    <Header />
    <main id="main">{page}</main>
    <Footer />
  </>;
}

createRoot(document.getElementById("root")!).render(<App />);
