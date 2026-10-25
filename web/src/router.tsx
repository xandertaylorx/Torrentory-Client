import { useEffect, useState } from "react";
import type { AnchorHTMLAttributes, MouseEvent } from "react";

export function navigate(to: string) {
  history.pushState(null, "", to);
  dispatchEvent(new PopStateEvent("popstate"));
  setTimeout(() => {
    const id = new URL(to, location.origin).hash.slice(1);
    const target = id ? document.getElementById(id) : null;
    if (target) target.scrollIntoView(); else scrollTo(0, 0);
  }, 50);
}

export function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const update = () => setPath(location.pathname);
    addEventListener("popstate", update);
    return () => removeEventListener("popstate", update);
  }, []);
  return path.replace(/\/+$/, "") || "/";
}

/** Client-side link for same-site paths; anything else behaves as a normal anchor. */
export function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  function handle(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  }
  return <a href={href} onClick={handle} {...rest} />;
}
