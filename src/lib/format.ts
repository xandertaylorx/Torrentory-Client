export function bytes(value = 0): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const power = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** power).toFixed(power > 1 ? 1 : 0)} ${units[power]}`;
}
export function progress(downloaded: number, total: number): number {
  return total > 0 ? Math.min(100, Math.max(0, (downloaded / total) * 100)) : 0;
}
export function statusLabel(item: { stats: { state: string; finished: boolean } }): string {
  if (item.stats.finished && item.stats.state === "live") return "Seeding";
  if (item.stats.finished && item.stats.state === "paused") return "Seeding paused";
  if (item.stats.finished) return "Completed";
  if (item.stats.state === "live") return "Downloading";
  if (item.stats.state === "paused") return "Paused";
  if (item.stats.state === "initializing") return "Preparing";
  return "Needs attention";
}

/** Turns GitHub release Markdown into short plain text for the update popup. */
export function plainNotes(markdown = "", limit = 420): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/[*_`>]/g, "")
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), limit - 40)).trimEnd()}…`;
}

/** Human label for a KB/s speed limit; zero means unlimited. */
export function limitLabel(kbps: number): string {
  if (!Number.isFinite(kbps) || kbps <= 0) return "Unlimited";
  return kbps >= 1024 ? `${(kbps / 1024).toFixed(kbps % 1024 === 0 ? 0 : 1)} MB/s` : `${Math.round(kbps)} KB/s`;
}
