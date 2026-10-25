import type { ReactNode } from "react";
import { Link } from "./router";

export const REPO = "https://github.com/xandertaylorx/Torrentory-Client";
const SITE_PAGES: Record<string, string> = { "SECURITY.md": "/security", LICENSE: "/license" };

/** Resolves a Markdown link target. Returns null for anything that is not http(s), mailto or a repo-relative path. */
function resolveHref(raw: string): string | null {
  const url = raw.trim();
  if (/^(https?:|mailto:)/i.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return null;
  const path = url.replace(/^\.?\//, "");
  return SITE_PAGES[path] ?? `${REPO}/blob/main/${path}`;
}

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)<]+)/g;

function inline(text: string): ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{inline(part.slice(2, -2))}</strong>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) return anchor(i, link[1], link[2]);
    if (/^https?:\/\//.test(part)) return anchor(i, part, part);
    return part;
  });
}

function anchor(key: number, label: string, target: string) {
  const href = resolveHref(target);
  if (!href) return label;
  return href.startsWith("/") ? <Link key={key} href={href}>{label}</Link> : <a key={key} href={href} rel="noopener noreferrer">{label}</a>;
}

/** Renders a small, safe subset of Markdown as React elements. Nothing is injected as HTML. */
export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let i = 0;
  const startsBlock = (line: string) => /^(#{1,4}\s|```|\s*[-*]\s|\s*\d+\.\s|---+\s*$)/.test(line);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      i++;
      nodes.push(<pre key={nodes.length}><code>{code.join("\n")}</code></pre>);
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 4);
      const Tag = `h${level}` as "h2" | "h3" | "h4";
      nodes.push(<Tag key={nodes.length}>{inline(heading[2])}</Tag>);
      i++;
      continue;
    }
    if (/^---+\s*$/.test(line)) { nodes.push(<hr key={nodes.length} />); i++; continue; }
    const bullet = /^\s*[-*]\s+/;
    const numbered = /^\s*\d+\.\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const matcher = ordered ? numbered : bullet;
      const items: string[] = [];
      while (i < lines.length && matcher.test(lines[i])) {
        let item = lines[i++].replace(matcher, "");
        while (i < lines.length && lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && !matcher.test(lines[i])) item += ` ${lines[i++].trim()}`;
        items.push(item);
      }
      const List = ordered ? "ol" : "ul";
      nodes.push(<List key={nodes.length}>{items.map((item, n) => <li key={n}>{inline(item)}</li>)}</List>);
      continue;
    }
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i])) paragraph.push(lines[i++].trim());
    if (!paragraph.length) { paragraph.push(line.trim()); i++; }
    nodes.push(<p key={nodes.length}>{inline(paragraph.join(" "))}</p>);
  }
  return <div className="prose">{nodes}</div>;
}
