import { X } from "lucide-react";
import { useEffect } from "react";
import type { ReactNode } from "react";

export function Modal({ title, subtitle, children, onClose, wide = false, dismissible = true }: {
  title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean; dismissible?: boolean;
}) {
  useEffect(() => {
    if (!dismissible) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } };
    addEventListener("keydown", close);
    return () => removeEventListener("keydown", close);
  }, [dismissible, onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => dismissible && event.target === event.currentTarget && onClose()}>
    <section className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header className="modal-head">
        <div><h2 id="modal-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <button className="icon-button" onClick={onClose} disabled={!dismissible} aria-label="Close"><X size={17} /></button>
      </header>
      {children}
    </section>
  </div>;
}
