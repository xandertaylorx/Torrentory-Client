import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TourStep { target?: string; title: string; body: string }
interface Rect { x: number; y: number; width: number; height: number; radius: number }
const steps: TourStep[] = [
  { title: "A quick look around", body: "Learn the essentials of Torrentory. This tour only points things out: it won't start, pause or remove any downloads. Use Next and Back, or the arrow keys. Press Esc to leave." },
  { target: "add", title: "Add your first torrent", body: "Paste a magnet link or choose a .torrent file here. You can also drop a .torrent file onto the window. Review the files and save location before starting. Only share content you're authorised to access." },
  { target: "create", title: "Share your own files", body: "Create a .torrent from a local file or folder, choose trackers and save the torrent file to share. Creating the file doesn't automatically start seeding it." },
  { target: "filters", title: "Find the right transfer", body: "Switch between All, Downloading and Completed. The counts keep up with your library. A search box appears when you have more than four torrents." },
  { target: "library", title: "Your downloads, in one place", body: "Torrents appear here with progress and transfer speeds. Select one for files, trackers and peers. Hover a row to pause, resume or open its menu. Play appears for supported audio and video, even before the download finishes." },
  { target: "settings", title: "Make it yours", body: "Settings holds your download folder, speed limits, appearance and background behaviour. You can run this tour again any time from Settings → About." },
  { target: "updates", title: "Stay up to date", body: "Torrentory checks for updates on launch. Use this control to check again or install an available update. You're ready to go: close the tour and add a torrent when you're ready." },
];
const spring = { type: "spring", stiffness: 380, damping: 38, mass: 0.9 } as const;
const margin = 12;
const clamp = (value: number, max: number) => Math.max(margin, Math.min(value, max - margin));

export function ProductTour({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, "");
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const firstLayout = useRef(true);
  const step = steps[index];
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const width = useMotionValue(0);
  const height = useMotionValue(0);
  const radius = useMotionValue(0);
  const cardX = useMotionValue(0);
  const cardY = useMotionValue(0);
  const safeWidth = useTransform(width, value => Math.max(0, value));
  const safeHeight = useTransform(height, value => Math.max(0, value));
  const safeRadius = useTransform(radius, value => Math.max(0, value));
  const go = useCallback((next: number) => {
    if (next >= steps.length) onClose();
    else setIndex(Math.max(0, next));
  }, [onClose]);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const target = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
    const animations: ReturnType<typeof animate>[] = [];
    let frame = 0;
    const layout = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let rect: Rect | null = null;
      if (target?.isConnected) {
        const bounds = target.getBoundingClientRect();
        if (bounds.width > 0 && bounds.height > 0) {
          const left = Math.max(4, bounds.left - 6);
          const top = Math.max(4, bounds.top - 6);
          rect = {
            x: left, y: top,
            width: Math.max(0, Math.min(vw - 4, bounds.right + 6) - left),
            height: Math.max(0, Math.min(vh - 4, bounds.bottom + 6) - top),
            radius: Math.min(12, (parseFloat(getComputedStyle(target).borderTopLeftRadius) || 0) + 6),
          };
        }
      }
      const cw = card.offsetWidth;
      const ch = card.offsetHeight;
      let cx = (vw - cw) / 2;
      let cy = (vh - ch) / 2;
      if (rect) {
        const gap = 14;
        if (vw < 640) cy = vh - ch - margin;
        else if (rect.y + rect.height + gap + ch <= vh - margin) {
          cx = rect.x + rect.width / 2 - cw / 2;
          cy = rect.y + rect.height + gap;
        } else if (rect.y - gap - ch >= margin) {
          cx = rect.x + rect.width / 2 - cw / 2;
          cy = rect.y - gap - ch;
        } else if (rect.x + rect.width + gap + cw <= vw - margin) {
          cx = rect.x + rect.width + gap;
          cy = rect.y + rect.height / 2 - ch / 2;
        } else if (rect.x - gap - cw >= margin) {
          cx = rect.x - gap - cw;
          cy = rect.y + rect.height / 2 - ch / 2;
        }
      }
      const cut = rect ?? { x: vw / 2, y: vh / 2, width: 0, height: 0, radius: 0 };
      animations.splice(0).forEach(animation => animation.stop());
      const values = [[x, cut.x], [y, cut.y], [width, cut.width], [height, cut.height], [radius, cut.radius], [cardX, clamp(cx, vw - cw)], [cardY, clamp(cy, vh - ch)]] as const;
      values.forEach(([value, to]) => {
        if (reduce || firstLayout.current) value.set(to);
        else animations.push(animate(value, to, spring));
      });
      firstLayout.current = false;
      setReady(true);
    };
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    };
    layout();
    const observer = new ResizeObserver(update);
    observer.observe(card);
    if (target) observer.observe(target);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      animations.forEach(animation => animation.stop());
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [step, reduce, x, y, width, height, radius, cardX, cardY]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = document.getElementById("root");
    const wasInert = root?.inert ?? false;
    const hidden = root?.getAttribute("aria-hidden") ?? null;
    if (root) { root.inert = true; root.setAttribute("aria-hidden", "true"); }
    nextRef.current?.focus({ preventScroll: true });
    const keepFocus = (event: FocusEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) nextRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("focusin", keepFocus);
    const stop = (event: Event) => {
      if (!cardRef.current?.contains(event.target as Node)) event.preventDefault();
    };
    window.addEventListener("wheel", stop, { passive: false });
    window.addEventListener("touchmove", stop, { passive: false });
    return () => {
      document.removeEventListener("focusin", keepFocus);
      if (root) {
        root.inert = wasInert;
        if (hidden === null) root.removeAttribute("aria-hidden");
        else root.setAttribute("aria-hidden", hidden);
      }
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
      const restore = previous?.isConnected && previous !== document.body ? previous : document.querySelector<HTMLElement>('[data-tour="settings"]');
      restore?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === "Escape") onClose();
        else go(index + (event.key === "ArrowRight" ? 1 : -1));
      } else if ((event.metaKey || event.ctrlKey) && ["o", "n", ","].includes(event.key.toLowerCase())) {
        event.preventDefault();
        event.stopImmediatePropagation();
      } else if (event.key === "Tab") {
        const buttons = cardRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
        if (!buttons?.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [index, go, onClose]);

  return createPortal(<div className="product-tour">
    <svg className="tour-overlay" aria-hidden="true">
      <defs><mask id={`${uid}-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
        <rect width="100%" height="100%" fill="white" />
        <motion.rect x={x} y={y} width={safeWidth} height={safeHeight} rx={safeRadius} fill="black" />
      </mask></defs>
      <rect width="100%" height="100%" fill="black" fillOpacity={0.6} mask={`url(#${uid}-mask)`} />
      <motion.rect x={x} y={y} width={safeWidth} height={safeHeight} rx={safeRadius} fill="none" stroke="white" strokeOpacity={0.4} strokeWidth={1.5} />
    </svg>
    <motion.div ref={cardRef} role="dialog" aria-modal="true" aria-label="Torrentory product tour" aria-describedby={`${uid}-body`} className="tour-card" style={{ x: cardX, y: cardY, visibility: ready ? "visible" : "hidden" }}>
      <header className="tour-header"><span>Quick tour · {index + 1} of {steps.length}</span><button className="button quiet" onClick={onClose}>Skip tour</button></header>
      <div className="tour-copy" aria-live="polite" aria-atomic="true">
        <motion.div key={index} initial={reduce ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }}>
          <h2>{step.title}</h2><p id={`${uid}-body`}>{step.body}</p>
        </motion.div>
      </div>
      <footer className="tour-footer"><div className="tour-dots" aria-label="Tour steps">{steps.map((item, i) => <button key={item.title} aria-label={`Go to step ${i + 1}`} aria-current={i === index ? "step" : undefined} onClick={() => go(i)}><span /></button>)}</div><div className="tour-actions"><button className="button quiet" disabled={index === 0} onClick={() => go(index - 1)}>Back</button><button ref={nextRef} className="button primary" onClick={() => go(index + 1)}>{index === steps.length - 1 ? "Done" : "Next"}</button></div></footer>
    </motion.div>
  </div>, document.body);
}
