import type { LucideIcon } from "lucide-react";
import { Check, Download, MonitorDown, Pause, Search } from "lucide-react";
import { LogoMark } from "./Logo";

export function ClientPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[680px]">
      <div className="absolute -inset-8 bg-[var(--fg)] opacity-[0.025] blur-3xl" />
      <div className="relative overflow-hidden border border-[var(--line)] bg-[var(--panel)] shadow-2xl shadow-black/10">
        <div className="flex h-11 items-center border-b border-[var(--line)] px-4">
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-[var(--line)]" />
            <span className="size-2.5 rounded-full bg-[var(--line)]" />
            <span className="size-2.5 rounded-full bg-[var(--line)]" />
          </div>
          <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2 text-xs font-medium">
            <LogoMark className="h-4 w-4" /> Torrentory
          </div>
        </div>

        <div className="grid min-h-[410px] grid-cols-[56px_1fr] sm:grid-cols-[154px_1fr]">
          <aside className="border-r border-[var(--line)] p-3 sm:p-4">
            <div className="mb-6 hidden items-center justify-between sm:flex">
              <span className="text-xs font-medium">Library</span>
              <span className="mono text-[9px] text-[var(--muted)]">03</span>
            </div>
            <div className="space-y-1">
              <PreviewNav icon={MonitorDown} label="All" active count="3" />
              <PreviewNav icon={Download} label="Downloading" count="2" />
              <PreviewNav icon={Check} label="Completed" count="1" />
            </div>
          </aside>

          <div className="min-w-0">
            <div className="flex h-14 items-center justify-between border-b border-[var(--line)] px-4 sm:px-5">
              <div>
                <p className="text-xs font-medium">All downloads</p>
                <p className="mt-0.5 hidden text-[10px] text-[var(--muted)] sm:block">2 active · 1 complete</p>
              </div>
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="grid size-8 place-items-center border border-[var(--line)] text-[var(--muted)]">
                  <Search size={13} />
                </span>
                <span aria-hidden="true" className="inline-flex h-8 items-center gap-1.5 bg-[var(--fg)] px-3 text-[11px] font-medium text-[var(--bg)]">
                  <Download size={12} /> Add
                </span>
              </div>
            </div>

            <div className="divide-y divide-[var(--line)]">
              <PreviewTorrent name="Ubuntu 26.04 Desktop" size="6.1 GB" progress={74} speed="18.4 MB/s" eta="1m" />
              <PreviewTorrent name="Blender Open Movie Archive" size="3.8 GB" progress={31} speed="8.7 MB/s" eta="5m" />
              <PreviewTorrent name="Debian 13.1" size="4.2 GB" progress={100} speed="Complete" eta="" complete />
            </div>
          </div>
        </div>
      </div>
      <p className="mono mt-3 text-center text-[9px] uppercase tracking-[.15em] text-[var(--muted)]">
        Interface preview · final product may change
      </p>
    </div>
  );
}

function PreviewNav({
  icon: Icon,
  label,
  count,
  active = false,
}: {
  icon: LucideIcon;
  label: string;
  count: string;
  active?: boolean;
}) {
  return (
    <div className={`flex h-8 items-center justify-center gap-2 px-2 text-[11px] sm:justify-start ${active ? "bg-[var(--soft)] text-[var(--fg)]" : "text-[var(--muted)]"}`}>
      <Icon size={13} />
      <span className="hidden flex-1 sm:block">{label}</span>
      <span className="mono hidden text-[9px] sm:block">{count}</span>
    </div>
  );
}

function PreviewTorrent({
  name,
  size,
  progress,
  speed,
  eta,
  complete = false,
}: {
  name: string;
  size: string;
  progress: number;
  speed: string;
  eta: string;
  complete?: boolean;
}) {
  return (
    <div className="px-4 py-5 sm:px-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 grid size-8 shrink-0 place-items-center border border-[var(--line)] bg-[var(--bg)]">
          {complete ? <Check size={14} className="text-emerald-500" /> : <Download size={14} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{name}</p>
              <p className="mt-1 text-[10px] text-[var(--muted)]">{size} · {progress}%</p>
            </div>
            {complete ? (
              <span className="text-[10px] text-emerald-500">Complete</span>
            ) : (
              <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center text-[var(--muted)]">
                <Pause size={12} />
              </span>
            )}
          </div>
          <div className="mt-3 h-1 overflow-hidden bg-[var(--soft)]">
            <div className={`h-full ${complete ? "bg-emerald-500" : "bg-[var(--fg)]"}`} style={{ width: `${progress}%` }} />
          </div>
          {!complete && (
            <div className="mt-2 flex justify-between text-[9px] text-[var(--muted)]">
              <span>{speed}</span>
              <span>{eta} remaining</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
