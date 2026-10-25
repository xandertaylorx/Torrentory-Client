import { useEffect, useState } from "react";
import { Check, FilePlus2, Pause, Play, Plus, Settings } from "lucide-react";
import { LogoMark } from "./Logo";

type Filter = "all" | "downloading" | "completed";
interface Item { name: string; total: number; progress: number; rate: number; paused: boolean; media?: boolean }

const initial: Item[] = [
  { name: "ubuntu-26.04-desktop-amd64.iso", total: 6.1, progress: 61.8, rate: 41.8, paused: false },
  { name: "Big Buck Bunny (2008) 4K", total: 3.8, progress: 27.4, rate: 23.4, paused: false, media: true },
  { name: "debian-13.1.0-amd64-DVD-1.iso", total: 4.2, progress: 100, rate: 0, paused: false },
];

const done = (item: Item) => item.progress >= 100;
const gb = (value: number) => `${value.toFixed(1)} GB`;
const eta = (item: Item) => {
  const seconds = (item.total * 1024 * (1 - item.progress / 100)) / Math.max(item.rate, 0.1);
  return seconds > 90 ? `${Math.ceil(seconds / 60)}m` : `${Math.ceil(seconds)}s`;
};

/** A working replica of the desktop window: same layout, tokens and behaviour, no images. */
export function ClientPreview() {
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setItems(current => current.map((item, i) => {
      if (done(item) || item.paused) return item;
      const jitter = Math.sin(Date.now() / 1800 + i * 2) * 3.5;
      const rate = Math.max(8, item.rate + jitter * 0.3);
      return { ...item, rate, progress: Math.min(100, item.progress + (rate * 0.75) / (item.total * 1024) * 100) };
    })), 750);
    return () => clearInterval(id);
  }, []);

  const counts = {
    all: items.length,
    downloading: items.filter(i => !done(i)).length,
    completed: items.filter(done).length,
  };
  const visible = items.filter(i => filter === "all" || (filter === "completed" ? done(i) : !done(i)));
  const live = items.some(i => !done(i) && !i.paused);
  const toggle = (name: string) => setItems(current => current.map(i => i.name === name ? { ...i, paused: !i.paused } : i));

  return (
    <div className="cl-window" role="group" aria-label="Interactive preview of the Torrentory window">
      <div className="cl-titlebar">
        <div className="cl-lights" aria-hidden="true"><i /><i /><i /></div>
        <span className="cl-logo"><LogoMark className="h-[22px] w-[22px]" /> Torrentory</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="cl-icon cl-hide-sm" aria-hidden="true"><Settings size={16} /></span>
          <span className="cl-btn cl-hide-sm" aria-hidden="true"><FilePlus2 size={14} /> Create</span>
          <span className="cl-btn primary" aria-hidden="true"><Plus size={14} /> Add torrent</span>
        </div>
      </div>
      <div className="cl-toolbar">
        <div className="cl-seg" role="tablist">
          {(["all", "downloading", "completed"] as Filter[]).map(name => (
            <button key={name} role="tab" aria-selected={filter === name} className={filter === name ? "on" : ""} onClick={() => setFilter(name)}>{name}<span>{counts[name]}</span></button>
          ))}
        </div>
      </div>
      <div className="cl-list">
        {visible.map(item => {
          const complete = done(item);
          const active = !item.paused && !complete;
          return (
            <article key={item.name} className="cl-row">
              <div className="cl-primary">
                <div className={`cl-mark ${complete ? "complete" : active ? "live" : ""}`} aria-hidden="true">{complete ? <Check size={14} /> : null}</div>
                <div className="cl-name">
                  <strong>{item.name}</strong>
                  <span>{complete ? "Completed" : item.paused ? "Paused" : "Downloading"} · {gb(item.total)}</span>
                </div>
              </div>
              <div className="cl-prog">
                <div className="cl-plabel"><span>{complete ? "100%" : `${item.progress.toFixed(1)}%`}</span><span>{complete ? "Complete" : item.paused ? "—" : eta(item)}</span></div>
                <div className="cl-track"><span style={{ width: `${item.progress}%` }} /></div>
              </div>
              <div className="cl-speed"><b>↓</b> {active ? `${item.rate.toFixed(1)} MB/s` : "—"}</div>
              <div className="flex justify-end cl-hide-sm">{item.media && <span className="cl-play"><Play size={13} fill="currentColor" /> Play</span>}</div>
              {complete ? <span /> : <button type="button" className="cl-icon" onClick={() => toggle(item.name)} aria-label={`${item.paused ? "Resume" : "Pause"} ${item.name}`}>{item.paused ? <Play size={15} /> : <Pause size={15} />}</button>}
            </article>
          );
        })}
      </div>
      <div className="cl-status">
        <span><i className={live ? "on" : ""} /> {live ? "Connected" : "Ready"}</span>
        <span>{items.filter(i => !done(i) && !i.paused).length} active</span>
      </div>
    </div>
  );
}
