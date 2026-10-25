import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, ArrowUpRight, Captions, Check, Copy, Cpu, Download, EyeOff, FilePlus2, ListChecks, Magnet, RotateCcw, ShieldCheck, Star, Terminal, X } from "lucide-react";
import { LogoMark } from "./Logo";
import { ClientPreview } from "./ClientPreview";
import "./styles.css";

const REPO = "https://github.com/xandertaylorx/Torrentory-Client";
const DOWNLOAD = `${REPO}/releases/latest/download`;
const DMG = `${DOWNLOAD}/Torrentory-Client-macos-arm64.dmg`;
const EXE = `${DOWNLOAD}/Torrentory-Client-windows-x64.exe`;
const INSTALL = `curl -fsSL ${DOWNLOAD}/install.sh | /bin/bash`;

const paywalls = ["Pro upgrades", "Paid speed boosts", "Ads in the sidebar", "Bundled toolbars", "Crypto tokens", "Premium streaming", "Usage tracking", "Nag screens"];

const comparison: [string, string, string][] = [
  ["Price", "$0. Forever.", "Free tier, then a paid Pro plan"],
  ["Paid speed boosts", "Never. No caps at all.", "Sold as an add-on"],
  ["Ads", "None", "Built into the interface"],
  ["Installer", "Just the app", "Bundled offers to opt out of"],
  ["Stream while downloading", "Included", "Often behind the paywall"],
  ["Telemetry", "None", "Usage tracking"],
  ["Source code", "MIT licensed, public", "Closed"],
];

const features: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Captions, title: "Stream while it downloads", body: "Play audio and video before the download finishes. Seeking, playback speed, fullscreen and SRT/WebVTT subtitles included." },
  { icon: ListChecks, title: "Take only what you need", body: "Pick the destination and exactly which files to grab before a single byte moves." },
  { icon: FilePlus2, title: "Create your own torrents", body: "Turn any file or folder into a .torrent with your own trackers, straight from the app." },
  { icon: RotateCcw, title: "Picks up where it left off", body: "Fast resume restores every transfer after a restart without re-checking from scratch." },
  { icon: ShieldCheck, title: "Signed, one-click updates", body: "Every update is verified against a key baked into the app before it installs." },
  { icon: EyeOff, title: "Private by design", body: "No account, no telemetry, no remote control API. Nothing phones home." },
];

function App() {
  const [copied, setCopied] = useState(false);
  const commandRef = useRef<HTMLElement>(null);
  const [version, setVersion] = useState("0.1.8");
  const [stars, setStars] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const api = "https://api.github.com/repos/xandertaylorx/Torrentory-Client";
    fetch(`${api}/releases/latest`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error("Release unavailable"); return response.json(); })
      .then(data => { if (typeof data.tag_name === "string" && /^v\d+\.\d+\.\d+$/.test(data.tag_name)) setVersion(data.tag_name.slice(1)); })
      .catch(() => { /* Stable download URLs work when the API is unavailable. */ });
    fetch(api, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error("Repository unavailable"); return response.json(); })
      .then(data => { if (typeof data.stargazers_count === "number") setStars(data.stargazers_count); })
      .catch(() => { /* The star count is decorative. */ });
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
    <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 rounded-md bg-[var(--accent)] p-3 text-[var(--accent-ink)]">Skip to content</a>
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--bg)]/75 backdrop-blur-xl">
      <nav aria-label="Main navigation" className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-5 md:px-6">
        <a href="#" aria-label="Torrentory home" className="torrentory-logo flex items-center gap-2.5 text-[17px] font-semibold tracking-[-.04em]"><LogoMark className="h-6 w-6" /> Torrentory</a>
        <div className="hidden items-center gap-7 text-[13px] text-[var(--muted)] md:flex">
          <a href="#compare" className="hover:text-[var(--fg)]">Compare</a>
          <a href="#features" className="hover:text-[var(--fg)]">Features</a>
          <a href="#open-source" className="hover:text-[var(--fg)]">Open source</a>
          <a href="#install" className="hover:text-[var(--fg)]">Install</a>
        </div>
        <div className="flex items-center gap-2">
          <a href={REPO} className="hidden h-9 items-center gap-2 rounded-full border border-[var(--line-strong)] px-3.5 text-[13px] hover:border-[var(--muted)] sm:inline-flex"><GithubGlyph /> {stars !== null && stars >= 25 ? <><Star size={12} className="text-[var(--accent)]" fill="currentColor" /> {stars.toLocaleString()}</> : "GitHub"}</a>
          <a href="#install" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--fg)] px-4 text-[13px] font-medium text-[var(--bg)] hover:opacity-85">Download</a>
        </div>
      </nav>
    </header>

    <main id="main">
      <section className="relative overflow-hidden">
        <div className="hero-glow pointer-events-none absolute inset-0" />
        <div className="fade-lines pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative mx-auto max-w-[1200px] px-5 pt-20 pb-16 text-center md:px-6 md:pt-28">
          <a href={`${REPO}/releases/latest`} className="inline-flex items-center gap-2 rounded-full border border-[var(--line-strong)] bg-[var(--panel)]/80 py-1.5 pr-3 pl-1.5 text-xs text-[var(--muted)] hover:border-[var(--muted)]">
            <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent-ink)]">v{version}</span> Signed in-app updates are here <ArrowRight size={12} />
          </a>
          <h1 className="display mx-auto mt-8 max-w-[14ch] text-[clamp(3rem,9vw,7.5rem)]">Full speed.<br /><span className="text-[var(--accent)]">No strings.</span></h1>
          <p className="mx-auto mt-7 max-w-[34rem] text-[17px] leading-7 text-[var(--muted)] sm:text-lg">Other clients sell you upgrades to use the bandwidth you already pay for. Torrentory is free, open source and uncapped. <span className="text-[var(--fg)]">No ads, no Pro tier, no catch.</span></p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href={DMG} className="inline-flex h-12 items-center gap-2.5 rounded-full bg-[var(--accent)] px-6 text-[15px] font-semibold text-[var(--accent-ink)] shadow-[0_0_40px_-8px_var(--accent)] hover:brightness-110"><AppleGlyph /> Download for Mac</a>
            <a href={EXE} className="inline-flex h-12 items-center gap-2.5 rounded-full border border-[var(--line-strong)] bg-[var(--panel)] px-6 text-[15px] font-medium hover:border-[var(--muted)]"><WindowsGlyph /> Download for Windows</a>
          </div>
          <p className="mono mt-5 text-[11px] text-[var(--faint)]">macOS 12+ Apple Silicon · Windows 10+ x64 · MIT licensed</p>
        </div>
        <div className="relative px-5 pb-24 md:px-6"><ClientPreview /></div>
      </section>

      <section aria-label="Key numbers" className="border-y border-[var(--line)] bg-[var(--panel)]">
        <dl className="mx-auto grid max-w-[1200px] grid-cols-2 md:grid-cols-4">
          <Stat value="$0" label="Forever. No Pro tier." />
          <Stat value="0" label="Speed caps or paid boosts" />
          <Stat value="0" label="Ads, analytics or telemetry" />
          <Stat value="11 MB" label="Native download. Rust inside." />
        </dl>
      </section>

      <section className="mx-auto max-w-[1200px] px-5 py-28 md:px-6">
        <p className="mono text-xs text-[var(--accent)]">The problem</p>
        <h2 className="display mt-4 max-w-[18ch] text-[clamp(2.25rem,5.5vw,4.5rem)]">Your connection was never the bottleneck.</h2>
        <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--muted)]">The big-name clients turned a free protocol into a funnel. Faster speeds, streaming and an ad-free window all became things to buy. We shipped none of it.</p>
        <div className="marquee mt-14 overflow-hidden" aria-hidden="true">
          <div className="marquee-track flex w-max gap-3">
            {[...paywalls, ...paywalls].map((item, i) => <span key={i} className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)] px-5 py-3 text-lg whitespace-nowrap sm:text-xl"><X size={16} className="text-[var(--danger)]" /><span className="strike">{item}</span></span>)}
          </div>
        </div>
        <p className="sr-only">Not included in Torrentory: {paywalls.join(", ")}.</p>
      </section>

      <section id="compare" className="scroll-mt-20 mx-auto max-w-[1200px] px-5 pb-28 md:px-6">
        <div className="card overflow-hidden">
          <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] border-b border-[var(--line)] text-xs sm:text-sm">
            <div className="p-4 sm:p-6" />
            <div className="flex items-center gap-2 border-l border-[var(--line)] bg-[var(--accent)]/[0.06] p-4 font-semibold sm:p-6"><LogoMark className="h-5 w-5 text-[var(--accent)]" /> Torrentory</div>
            <div className="border-l border-[var(--line)] p-4 text-[var(--muted)] sm:p-6">Typical freemium clients</div>
          </div>
          {comparison.map(([label, ours, theirs]) => (
            <div key={label} className="grid grid-cols-[repeat(3,minmax(0,1fr))] sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] border-b border-[var(--line)] text-xs last:border-b-0 sm:text-[15px]">
              <div className="p-4 text-[var(--muted)] sm:px-6 sm:py-5">{label}</div>
              <div className="flex items-start gap-2 border-l border-[var(--line)] bg-[var(--accent)]/[0.06] p-4 font-medium sm:px-6 sm:py-5"><Check size={16} className="mt-0.5 hidden shrink-0 text-[var(--accent)] sm:block" /> {ours}</div>
              <div className="flex items-start gap-2 border-l border-[var(--line)] p-4 text-[var(--muted)] sm:px-6 sm:py-5"><X size={16} className="mt-0.5 hidden shrink-0 text-[var(--faint)] sm:block" /> {theirs}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="scroll-mt-20 mx-auto max-w-[1200px] px-5 pb-28 md:px-6">
        <p className="mono text-xs text-[var(--accent)]">Everything included</p>
        <h2 className="display mt-4 max-w-[16ch] text-[clamp(2.25rem,5.5vw,4.5rem)]">The full client. Not the free trial.</h2>
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          <article className="card relative overflow-hidden p-8 md:col-span-2 md:row-span-2 md:p-10">
            <div className="pointer-events-none absolute -right-20 -bottom-20 size-80 rounded-full bg-[var(--accent)] opacity-[0.08] blur-3xl" />
            <Cpu size={22} className="text-[var(--accent)]" />
            <h3 className="mt-6 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">A Rust engine in a native shell.</h3>
            <p className="mt-4 max-w-md leading-7 text-[var(--muted)]">Torrentory runs on librqbit, a memory-safe BitTorrent engine written in Rust, wrapped in a Tauri app instead of a bundled browser. It starts instantly, stays light and never gets in the way of your bandwidth.</p>
            <div className="mt-10 grid max-w-md grid-cols-3 gap-px overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)]">
              {[["11 MB", "macOS download"], ["5 MB", "Windows installer"], ["750 ms", "live refresh"]].map(([v, l]) => <div key={l} className="bg-[var(--panel)] p-4"><p className="text-xl font-semibold tracking-[-.03em]">{v}</p><p className="mt-1 text-[11px] text-[var(--muted)]">{l}</p></div>)}
            </div>
            <div className="mt-8 flex flex-wrap gap-2">{[["Magnet links", Magnet], ["Drag & drop .torrent", Download]].map(([label, Icon]) => { const I = Icon as LucideIcon; return <span key={label as string} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-xs text-[var(--muted)]"><I size={13} /> {label as string}</span>; })}</div>
          </article>
          {features.map(({ icon: Icon, title, body }, i) => (
            <article key={title} className={`card p-7 ${i === features.length - 1 ? "md:col-span-3" : ""}`}>
              <Icon size={20} className="text-[var(--accent)]" />
              <h3 className="mt-5 text-lg font-semibold tracking-[-.025em]">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="open-source" className="scroll-mt-20 border-y border-[var(--line)] bg-[var(--panel)]">
        <div className="mx-auto grid max-w-[1200px] items-center gap-14 px-5 py-28 md:px-6 lg:grid-cols-2">
          <div>
            <p className="mono text-xs text-[var(--accent)]">Open source</p>
            <h2 className="display mt-4 text-[clamp(2.25rem,5.5vw,4.5rem)]">Don't trust us.<br />Read the code.</h2>
            <p className="mt-6 max-w-lg text-lg leading-8 text-[var(--muted)]">Every line of Torrentory is public under the MIT license. Audit it, fork it, build it yourself. There is no hidden server, no closed core and nothing to unlock.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a href={REPO} className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--fg)] px-5 text-sm font-medium text-[var(--bg)] hover:opacity-85"><GithubGlyph /> View on GitHub</a>
              <a href={`${REPO}/blob/main/LICENSE`} className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--line-strong)] px-5 text-sm hover:border-[var(--muted)]">MIT License <ArrowUpRight size={14} /></a>
            </div>
          </div>
          <div className="card overflow-hidden">
            <div className="mono flex items-center gap-2 border-b border-[var(--line)] px-5 py-3 text-[11px] text-[var(--muted)]"><Terminal size={13} /> build from source</div>
            <pre className="mono overflow-x-auto p-6 text-[13px] leading-7"><Line prompt>git clone {REPO.replace("https://", "")}</Line><Line prompt>cd Torrentory-Client && npm install</Line><Line prompt>npm run tauri dev</Line><Line dim>  Compiling librqbit</Line><Line dim>  Compiling torrentory-client</Line><Line accent>  ✓ Torrentory is running. No account needed.</Line></pre>
          </div>
        </div>
      </section>

      <section id="install" className="scroll-mt-20 mx-auto max-w-[1200px] px-5 py-28 md:px-6">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div>
            <p className="mono text-xs text-[var(--accent)]">Install</p>
            <h2 className="display mt-4 text-[clamp(2.25rem,5vw,4rem)]">Running in under a minute.</h2>
            <p className="mt-6 max-w-sm leading-7 text-[var(--muted)]">One command downloads the latest release, verifies its checksum and Apple developer signature, and installs it in Applications.</p>
          </div>
          <div className="min-w-0 space-y-4">
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3"><span className="mono flex items-center gap-2 text-[11px] text-[var(--muted)]"><Terminal size={13} /> macOS · Terminal</span><span className="rounded-full bg-[var(--accent)]/10 px-2.5 py-0.5 text-[11px] font-medium text-[var(--accent)]">Recommended</span></div>
              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                <code ref={commandRef} className="mono block min-w-0 flex-1 break-all text-[13px] leading-6"><span className="text-[var(--faint)] select-none">$ </span>{INSTALL}</code>
                <button type="button" onClick={copyCommand} className="inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full border border-[var(--line-strong)] px-4 text-[13px] font-medium hover:border-[var(--muted)]">{copied ? <Check size={14} className="text-[var(--accent)]" /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}</button>
              </div>
              <p role="status" aria-live="polite" className="sr-only">{copied ? "Copied to clipboard" : ""}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <a href={DMG} className="card group flex items-center justify-between p-5 hover:border-[var(--line-strong)]"><span><span className="flex items-center gap-2 font-medium"><AppleGlyph /> macOS DMG</span><span className="mt-1 block text-xs text-[var(--muted)]">Apple Silicon · 11 MB</span></span><Download size={18} className="text-[var(--muted)] group-hover:text-[var(--accent)]" /></a>
              <a href={EXE} className="card group flex items-center justify-between p-5 hover:border-[var(--line-strong)]"><span><span className="flex items-center gap-2 font-medium"><WindowsGlyph /> Windows installer</span><span className="mt-1 block text-xs text-[var(--muted)]">x64 · 5 MB</span></span><Download size={18} className="text-[var(--muted)] group-hover:text-[var(--accent)]" /></a>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1 text-xs text-[var(--muted)]"><a href={`${DOWNLOAD}/install.sh`} className="inline-flex items-center gap-1 hover:text-[var(--fg)]">Inspect installer <ArrowUpRight size={12} /></a><a href={`${DOWNLOAD}/SHA256SUMS`} className="inline-flex items-center gap-1 hover:text-[var(--fg)]">SHA-256 checksums <ArrowUpRight size={12} /></a><a href={`${REPO}/releases/latest`} className="inline-flex items-center gap-1 hover:text-[var(--fg)]">Release notes <ArrowUpRight size={12} /></a></div>
            <p className="text-xs leading-5 text-[var(--faint)]">The macOS build is Developer ID signed but not notarised, so macOS may ask you to confirm the first launch. The installer keeps Gatekeeper on. Windows builds are unsigned. Intel Macs and Linux are not packaged yet.</p>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-[var(--line)]">
        <div className="hero-glow pointer-events-none absolute inset-0 rotate-180" />
        <div className="relative mx-auto max-w-[1200px] px-5 py-32 text-center md:px-6">
          <LogoMark className="mx-auto h-12 w-12 text-[var(--accent)]" />
          <h2 className="display mx-auto mt-8 max-w-[16ch] text-[clamp(2.5rem,6.5vw,5.5rem)]">Your bandwidth. Your files. Your client.</h2>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href={DMG} className="inline-flex h-12 items-center gap-2.5 rounded-full bg-[var(--accent)] px-6 text-[15px] font-semibold text-[var(--accent-ink)] hover:brightness-110"><AppleGlyph /> Download for Mac</a>
            <a href={EXE} className="inline-flex h-12 items-center gap-2.5 rounded-full border border-[var(--line-strong)] px-6 text-[15px] font-medium hover:border-[var(--muted)]"><WindowsGlyph /> Windows</a>
          </div>
        </div>
      </section>
    </main>

    <footer className="border-t border-[var(--line)]">
      <div className="mx-auto flex max-w-[1200px] flex-col justify-between gap-5 px-5 py-8 text-xs text-[var(--muted)] sm:flex-row sm:items-center md:px-6">
        <span className="inline-flex items-center gap-2 text-[var(--fg)]"><LogoMark className="h-5 w-5" /> Torrentory <span className="text-[var(--faint)]">v{version}</span></span>
        <span>Download and share content you have permission to use.</span>
        <div className="flex gap-5"><a href={REPO} className="hover:text-[var(--fg)]">GitHub</a><a href={`${REPO}/blob/main/LICENSE`} className="hover:text-[var(--fg)]">MIT License</a><a href={`${REPO}/blob/main/SECURITY.md`} className="hover:text-[var(--fg)]">Security</a></div>
      </div>
    </footer>
  </>;
}

function Stat({ value, label }: { value: string; label: string }) {
  return <div className="border-[var(--line)] p-6 not-last:border-r max-md:[&:nth-child(2)]:border-r-0 max-md:[&:nth-child(-n+2)]:border-b md:p-10"><dt className="sr-only">{label}</dt><dd className="text-4xl font-semibold tracking-[-.05em] sm:text-5xl">{value}</dd><p className="mt-2 text-xs text-[var(--muted)] sm:text-sm">{label}</p></div>;
}

function Line({ children, prompt, dim, accent }: { children: ReactNode; prompt?: boolean; dim?: boolean; accent?: boolean }) {
  return <span className={`block whitespace-pre ${dim ? "text-[var(--faint)]" : accent ? "text-[var(--accent)]" : ""}`}>{prompt && <span className="text-[var(--faint)] select-none">$ </span>}{children}</span>;
}

function AppleGlyph() {
  return <svg viewBox="0 0 17 20" className="h-[18px] w-[15px]" fill="currentColor" aria-hidden="true"><path d="M14.1 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.8 1.2 1.8 2.6 3.1 2.5 1.3-.1 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4 1-1.4 1.3-2.7 1.4-2.8-.1 0-2.6-1-2.6-4.2ZM11.6 3c.7-.8 1.2-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4Z" /></svg>;
}

function GithubGlyph() {
  return <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true"><path d="M8 0C3.6 0 0 3.6 0 8c0 3.5 2.3 6.5 5.5 7.6.4.1.5-.2.5-.4v-1.5c-2.2.5-2.7-1-2.7-1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.3 1.9.9 2.3.7.1-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-4 0-.9.3-1.6.8-2.1-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8.6-.2 1.3-.3 2-.3s1.4.1 2 .3c1.5-1 2.2-.8 2.2-.8.4 1.1.2 1.9.1 2.1.5.6.8 1.3.8 2.1 0 3.1-1.9 3.7-3.6 3.9.3.3.5.8.5 1.5v2.2c0 .2.1.5.6.4C13.7 14.5 16 11.5 16 8c0-4.4-3.6-8-8-8Z" /></svg>;
}

function WindowsGlyph() {
  return <svg viewBox="0 0 16 16" className="h-[15px] w-[15px]" fill="currentColor" aria-hidden="true"><path d="M0 2.2 6.5 1.3v6.3H0V2.2Zm7.3-1L16 0v7.6H7.3V1.2ZM0 8.4h6.5v6.3L0 13.8V8.4Zm7.3 0H16V16l-8.7-1.2V8.4Z" /></svg>;
}

createRoot(document.getElementById("root")!).render(<App />);
