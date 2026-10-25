import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowDown, ArrowUpRight, Check, Copy, Download, FolderOpen, Gauge, Magnet, Moon, Sun, Terminal } from "lucide-react";
import { LogoMark } from "./Logo";
import { ClientPreview } from "./ClientPreview";
import "./styles.css";

const REPO = "https://github.com/xandertaylorx/Torrentory-Client";
const DOWNLOAD = `${REPO}/releases/latest/download`;
const INSTALL = `curl -fsSL ${DOWNLOAD}/install.sh | /bin/bash`;
const features = [
  { icon: Magnet, title: "Paste and go", description: "Open magnet links or drop in a .torrent file without a complicated setup flow." },
  { icon: Gauge, title: "Only what matters", description: "Clear progress, speed and time remaining. Advanced details stay out of the way." },
  { icon: FolderOpen, title: "Your files, locally", description: "Choose where downloads go and open completed files directly from the client." },
];

function App() {
  const [dark, setDark] = useState(() => {
    try { return (localStorage.getItem("torrentory-theme") ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark"; }
    catch { return false; }
  });
  const [copyState, setCopyState] = useState("");
  const commandRef = useRef<HTMLElement>(null);
  const [release, setRelease] = useState({ version: "0.1.7", date: "", notes: "" });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try { localStorage.setItem("torrentory-theme", dark ? "dark" : "light"); } catch { /* Storage may be disabled. */ }
  }, [dark]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("https://api.github.com/repos/xandertaylorx/Torrentory-Client/releases/latest", { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error("Release unavailable"); return response.json(); })
      .then(data => {
        if (typeof data.tag_name === "string" && /^v\d+\.\d+\.\d+$/.test(data.tag_name)) {
          setRelease({ version: data.tag_name.slice(1), date: typeof data.published_at === "string" ? data.published_at : "", notes: typeof data.body === "string" ? data.body : "" });
        }
      }).catch(() => { /* Stable download URLs work when the API is unavailable. */ });
    return () => controller.abort();
  }, []);
  async function copyCommand() {
    try { await navigator.clipboard.writeText(INSTALL); setCopyState("Copied to clipboard"); }
    catch {
      if (commandRef.current) {
        const range = document.createRange(); range.selectNodeContents(commandRef.current);
        const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
      }
      setCopyState("Select and copy the command below");
    }
  }
  return <>
    <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 bg-[var(--fg)] p-3 text-[var(--bg)]">Skip to content</a>
    <header className="border-b border-[var(--line)]">
      <nav aria-label="Main navigation" className="mx-auto flex h-20 max-w-[1200px] items-center justify-between gap-4 px-5 md:px-6">
        <a href="#" aria-label="Torrentory Client home" className="torrentory-logo flex items-center gap-2.5 text-[17px] font-semibold tracking-[-.04em]"><LogoMark /><span>Torrentory<span className="ml-2 hidden text-xs font-normal tracking-normal text-[var(--muted)] sm:inline">Client</span></span></a>
        <div className="flex items-center gap-5 text-xs font-medium sm:gap-7">
          <a href="#install" className="hover:opacity-60">Install</a><a href={REPO} className="inline-flex items-center gap-1 hover:opacity-60">GitHub <ArrowUpRight size={13}/></a>
          <button type="button" onClick={() => setDark(!dark)} aria-label={dark ? "Use light theme" : "Use dark theme"} className="grid size-8 cursor-pointer place-items-center border border-[var(--line)]">{dark ? <Sun size={15}/> : <Moon size={15}/>}</button>
        </div>
      </nav>
    </header>
    <main id="main">
      <section className="relative overflow-hidden border-b border-[var(--line)]">
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-75" />
        <div className="relative mx-auto grid max-w-[1200px] gap-14 px-5 py-20 md:px-6 md:py-28 lg:grid-cols-[0.86fr_1.14fr] lg:items-center lg:gap-20">
          <div className="max-w-xl">
            <a href={`${REPO}/releases/latest`} className="inline-flex items-center gap-2 border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-[11px] text-[var(--muted)]"><span className="size-1.5 rounded-full bg-emerald-500"/> Latest stable · v{release.version} <ArrowUpRight size={11}/></a>
            <p className="eyebrow mt-8">TORRENTORY CLIENT / 01</p>
            <h1 className="mt-4 text-5xl font-semibold tracking-[-.065em] sm:text-6xl lg:text-7xl">Download without the clutter.</h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-[var(--muted)]">A minimal desktop torrent client built for people who want to add a download, see its progress and get on with their day.</p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <a href="#install" className="inline-flex h-11 items-center gap-2.5 bg-[var(--fg)] px-4 text-sm font-medium text-[var(--bg)] hover:opacity-85"><Terminal size={17}/> Install for macOS <ArrowDown size={14}/></a>
              <a href={`${DOWNLOAD}/Torrentory-Client-windows-x64.exe`} className="inline-flex h-9 items-center gap-2 border border-[var(--line)] bg-[var(--panel)] px-3 text-xs hover:border-[var(--fg)]"><Download size={13}/> Windows</a>
            </div>
            <p className="mt-4 text-xs leading-5 text-[var(--muted)]">macOS 12+ · Apple Silicon &nbsp;/&nbsp; Windows 10+ · x64</p>
            <div className="mt-10 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--muted)]">{["Free", "Native desktop app", "No account required"].map(item => <span key={item} className="inline-flex items-center gap-1.5"><Check size={13} className="text-emerald-500"/> {item}</span>)}</div>
          </div>
          <ClientPreview />
        </div>
      </section>
      <section aria-label="Features" className="border-b border-[var(--line)] bg-[var(--panel)]">
        <div className="mx-auto grid max-w-[1200px] divide-y divide-[var(--line)] px-5 md:grid-cols-3 md:divide-x md:divide-y-0 md:px-6">{features.map(({icon: Icon, title, description}, index) => <article key={title} className="py-10 md:px-8 md:py-12 first:md:pl-0 last:md:pr-0"><div className="flex items-center justify-between"><div className="grid size-9 place-items-center border border-[var(--line)] bg-[var(--bg)]"><Icon size={16}/></div><span className="mono text-[10px] text-[var(--muted)]">0{index + 1}</span></div><h2 className="mt-6 text-lg font-semibold tracking-[-.035em]">{title}</h2><p className="mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">{description}</p></article>)}</div>
      </section>
      <section id="install" className="scroll-mt-8 border-b border-[var(--line)]">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-5 py-20 md:px-6 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
          <div><p className="eyebrow">UP AND RUNNING / 02</p><h2 className="mt-4 text-3xl font-semibold tracking-[-.05em] sm:text-4xl">One command.<br/>Ready to download.</h2><p className="mt-5 max-w-sm text-sm leading-6 text-[var(--muted)]">The recommended macOS install. Paste into Terminal to download the latest release, verify its checksum and Apple signature, and install in your Applications folder.</p><p className="mt-4 text-xs leading-5 text-[var(--muted)]">Signed with Developer ID and notarised by Apple. The installer keeps Gatekeeper enabled and never asks for your password.</p></div>
          <div className="min-w-0">
            <div className="border border-[var(--line)] bg-[var(--panel)]">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3"><span className="mono flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--muted)]"><Terminal size={13}/> Terminal · macOS</span><span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">Recommended</span></div>
              <div className="p-5"><code ref={commandRef} className="mono block break-all text-xs leading-7 sm:text-sm">{INSTALL}</code><button type="button" onClick={copyCommand} className="mt-5 inline-flex cursor-pointer items-center gap-2 border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs font-medium hover:border-[var(--fg)]">{copyState === "Copied to clipboard" ? <Check size={13}/> : <Copy size={13}/>} {copyState === "Copied to clipboard" ? "Copied" : "Copy command"}</button><p role="status" aria-live="polite" className="mt-2 min-h-4 text-xs text-[var(--muted)]">{copyState}</p></div>
            </div>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-3 text-xs"><a href={`${DOWNLOAD}/install.sh`} className="inline-flex items-center gap-1 underline underline-offset-4">Inspect installer <ArrowUpRight size={12}/></a><a href={`${DOWNLOAD}/Torrentory-Client-macos-arm64.dmg`} className="inline-flex items-center gap-1 underline underline-offset-4">Download DMG <Download size={12}/></a><a href={`${DOWNLOAD}/SHA256SUMS`} className="inline-flex items-center gap-1 underline underline-offset-4">Checksums <ArrowUpRight size={12}/></a></div>
            <p className="mt-5 text-xs leading-5 text-[var(--muted)]">Prefer a manual install? Open the DMG and drag Torrentory Client into Applications. macOS may ask you to confirm the first launch. Intel Macs and Linux are not currently packaged.</p>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-[1200px] px-5 py-16 md:px-6">
        <div className="flex flex-col justify-between gap-6 border border-[var(--line)] bg-[var(--panel)] p-7 sm:flex-row sm:items-center sm:p-10"><div><p className="eyebrow">BUILT IN THE OPEN / 03</p><h2 className="mt-4 text-2xl font-semibold tracking-[-.045em]">Your client. Your downloads.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">Source code, release notes and installers live together on GitHub. No sign-up, no catalogue. Just a desktop app for content you are authorised to access.</p></div><a href={`${REPO}/releases/latest`} className="inline-flex shrink-0 items-center gap-2 text-sm font-medium underline underline-offset-4">Release notes <ArrowUpRight size={15}/></a></div>
      </section>
    </main>
    <footer className="border-t border-[var(--line)]"><div className="mx-auto flex max-w-[1200px] flex-col justify-between gap-5 px-5 py-8 text-xs text-[var(--muted)] sm:flex-row md:px-6"><span className="inline-flex items-center gap-2"><LogoMark className="h-5 w-5"/> Torrentory Client</span><span>Download and share content you have permission to use.</span><a href={REPO} className="hover:text-[var(--fg)]">Source on GitHub ↗</a></div></footer>
  </>;
}

createRoot(document.getElementById("root")!).render(<App />);
