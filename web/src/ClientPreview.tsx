import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp, Check, Download, MonitorDown, Pause, Play, Plus, Search } from "lucide-react";
import { LogoMark } from "./Logo";

const torrents = [
  { name: "Ubuntu 26.04 Desktop amd64", size: 6.1, start: 62, base: 41.8 },
  { name: "Big Buck Bunny 4K (Blender)", size: 3.8, start: 28, base: 23.4, streaming: true },
  { name: "Debian 13.1 DVD", size: 4.2, start: 100, base: 0 },
];

export function ClientPreview() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setTick(t => t + 1), 900);
    return () => clearInterval(id);
  }, []);

  const rows = torrents.map((t, i) => {
    const complete = t.start >= 100;
    const progress = complete ? 100 : Math.min(99, t.start + tick * (0.35 - i * 0.1));
    const speed = complete ? 0 : t.base + Math.sin(tick * 1.3 + i * 2) * 4.2 + Math.cos(tick * 0.7) * 1.8;
    return { ...t, complete, progress, speed };
  });
  const total = rows.reduce((sum, r) => sum + r.speed, 0);

  return (
    <div className="relative mx-auto w-full max-w-[980px]">
      <div className="absolute -inset-x-10 -top-10 bottom-0 rounded-[40px] bg-[var(--accent)] opacity-[0.06] blur-3xl" />
      <div className="relative overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-[var(--panel)] shadow-[0_40px_120px_-30px_rgb(0_0_0/0.9)]">
        <div className="relative flex h-11 items-center border-b border-[var(--line)] px-4">
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="size-3 rounded-full bg-[#ff5f57]" />
            <span className="size-3 rounded-full bg-[#febc2e]" />
            <span className="size-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2 text-xs font-medium text-[var(--muted)]">
            <LogoMark className="h-4 w-4" /> Torrentory
          </div>
        </div>

        <div className="grid grid-cols-[52px_1fr] sm:grid-cols-[180px_1fr]">
          <aside className="border-r border-[var(--line)] p-2.5 sm:p-3">
            <div className="space-y-1">
              <PreviewNav icon={MonitorDown} label="All" active count="3" />
              <PreviewNav icon={Download} label="Downloading" count="2" />
              <PreviewNav icon={Check} label="Completed" count="1" />
            </div>
            <div className="mt-6 hidden rounded-lg border border-[var(--line)] p-3 sm:block">
              <p className="mono text-[9px] uppercase tracking-[.14em] text-[var(--faint)]">Speed cap</p>
              <p className="mt-1 text-sm font-semibold text-[var(--accent)]">None</p>
              <p className="mt-1 text-[10px] leading-4 text-[var(--muted)]">Running at whatever your line can do.</p>
            </div>
          </aside>

          <div className="min-w-0">
            <div className="flex h-14 items-center justify-between gap-3 border-b border-[var(--line)] px-4 sm:px-5">
              <div className="flex items-center gap-4 text-[11px]">
                <span className="mono inline-flex items-center gap-1 text-[var(--accent)]"><ArrowDown size={12} /> {total.toFixed(1)} MB/s</span>
                <span className="mono hidden items-center gap-1 text-[var(--muted)] sm:inline-flex"><ArrowUp size={12} /> {(total * 0.21).toFixed(1)} MB/s</span>
              </div>
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg border border-[var(--line)] text-[var(--muted)]"><Search size={13} /></span>
                <span aria-hidden="true" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--fg)] px-3 text-[11px] font-medium text-[var(--bg)]"><Plus size={12} /> Add</span>
              </div>
            </div>

            <div className="divide-y divide-[var(--line)]">
              {rows.map(r => <PreviewTorrent key={r.name} {...r} />)}
            </div>
          </div>
        </div>
      </div>
      <p className="mono mt-4 text-center text-[10px] uppercase tracking-[.16em] text-[var(--faint)]">Illustrative preview · example downloads</p>
    </div>
  );
}

function PreviewNav({ icon: Icon, label, count, active = false }: { icon: LucideIcon; label: string; count: string; active?: boolean }) {
  return (
    <div className={`flex h-8 items-center justify-center gap-2 rounded-md px-2 text-[11px] sm:justify-start ${active ? "bg-[var(--raised)] text-[var(--fg)]" : "text-[var(--muted)]"}`}>
      <Icon size={13} />
      <span className="hidden flex-1 sm:block">{label}</span>
      <span className="mono hidden text-[9px] sm:block">{count}</span>
    </div>
  );
}

function PreviewTorrent({ name, size, progress, speed, complete, streaming }: { name: string; size: number; progress: number; speed: number; complete: boolean; streaming?: boolean }) {
  const remaining = complete ? 0 : ((size * 1024 * (100 - progress)) / 100 / Math.max(speed, 1));
  return (
    <div className="px-4 py-4 sm:px-5">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border ${complete ? "border-[var(--accent)]/30 text-[var(--accent)]" : "border-[var(--line)]"}`}>
          {complete ? <Check size={14} /> : <Download size={14} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{name}</p>
              <p className="mono mt-1 text-[10px] text-[var(--muted)]">{size.toFixed(1)} GB · {progress.toFixed(1)}%</p>
            </div>
            {complete ? (
              <span className="text-[10px] font-medium text-[var(--accent)]">Done</span>
            ) : streaming ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--line-strong)] px-2 py-0.5 text-[10px] text-[var(--fg)]"><Play size={9} fill="currentColor" /> Stream</span>
            ) : (
              <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center text-[var(--muted)]"><Pause size={12} /></span>
            )}
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-[var(--raised)]">
            <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-700" style={{ width: `${progress}%`, opacity: complete ? 0.5 : 1 }} />
          </div>
          {!complete && (
            <div className="mono mt-2 flex justify-between text-[9px] text-[var(--muted)]">
              <span>{speed.toFixed(1)} MB/s</span>
              <span>{Math.ceil(remaining / 60)}m left</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
