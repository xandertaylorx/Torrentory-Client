import type { ReactNode } from "react";
import { LogoMark } from "./Logo";
import { DotShader } from "./DotShader";
import { Link } from "./router";
import { REPO } from "./Markdown";

export function Header() {
  return (
    <header>
      <nav aria-label="Main navigation" className="mx-auto flex h-16 max-w-[1080px] items-center justify-between px-6">
        <Link href="/" aria-label="Torrentory home" className="torrentory-logo flex items-center gap-2 text-[15px] font-semibold tracking-[-.04em]"><LogoMark className="h-[22px] w-[22px]" /> Torrentory</Link>
        <div className="flex items-center gap-6 text-[13px] text-[var(--muted)]">
          <Link href="/#why" className="hidden hover:text-[var(--fg)] md:block">Why</Link>
          <Link href="/#features" className="hidden hover:text-[var(--fg)] md:block">Features</Link>
          <Link href="/releases" className="hidden hover:text-[var(--fg)] sm:block">Releases</Link>
          <a href={REPO} className="hover:text-[var(--fg)]">GitHub</a>
          <Link href="/#install" className="btn btn-primary !h-8 !px-3.5 !text-[13px]">Download</Link>
        </div>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="rule dot-surface">
      <DotShader />
      <div className="mx-auto flex max-w-[1080px] flex-col justify-between gap-4 px-6 py-8 text-xs text-[var(--muted)] md:flex-row md:items-center">
        <span>© Torrentory · Built by <a href="https://crooli.com" target="_blank" rel="noopener noreferrer" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', fontWeight: 800 }} className="text-[var(--fg)] hover:underline">Crooli</a></span>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/releases" className="hover:text-[var(--fg)]">Releases</Link>
          <Link href="/security" className="hover:text-[var(--fg)]">Security</Link>
          <Link href="/license" className="hover:text-[var(--fg)]">MIT License</Link>
          <Link href="/legal" className="hover:text-[var(--fg)]">Legal</Link>
          <a href={REPO} className="hover:text-[var(--fg)]">GitHub</a>
        </div>
      </div>
    </footer>
  );
}

export function PageHeading({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-[1080px] px-6 pt-16 pb-12 md:pt-24">
      {eyebrow && <p className="mono text-xs text-[var(--faint)]">{eyebrow}</p>}
      <h1 className="mt-3 max-w-[18ch] text-[clamp(2.25rem,5vw,3.75rem)] leading-[1.04] font-semibold tracking-[-.05em]">{title}</h1>
      {children && <div className="mt-5 max-w-xl text-[17px] leading-7 text-[var(--muted)]">{children}</div>}
    </div>
  );
}
