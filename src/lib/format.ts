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
