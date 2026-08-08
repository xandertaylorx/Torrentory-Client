import type { TorrentFile } from "./types";

export type MediaKind = "audio" | "video";

const AUDIO_EXTENSIONS = new Set(["aac", "aiff", "alac", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav"]);
const VIDEO_EXTENSIONS = new Set(["m4v", "mkv", "mov", "mp4", "ogv", "webm"]);
const SUBTITLE_EXTENSIONS = new Set(["srt", "vtt"]);

export function extension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function mediaKind(name: string): MediaKind | null {
  const ext = extension(name);
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  return null;
}

export function isSubtitle(name: string): boolean {
  return SUBTITLE_EXTENSIONS.has(extension(name));
}

function directory(file: TorrentFile): string {
  return file.components.slice(0, -1).join("/");
}

function stem(name: string): string {
  return name.replace(/\.[^.]+$/, "").toLowerCase();
}

export function subtitlesFor(files: TorrentFile[], media: TorrentFile): Array<{ file: TorrentFile; fileId: number }> {
  const mediaStem = stem(media.name);
  const sameDirectory = files
    .map((file, fileId) => ({ file, fileId }))
    .filter(({ file }) => file.included && isSubtitle(file.name) && directory(file) === directory(media));
  const named = sameDirectory.filter(({ file }) => {
    const subtitleStem = stem(file.name);
    return subtitleStem === mediaStem || subtitleStem.startsWith(`${mediaStem}.`) || subtitleStem.startsWith(`${mediaStem}-`);
  });
  return named.length ? named : sameDirectory;
}

export function subtitleLabel(name: string): string {
  const parts = name.replace(/\.[^.]+$/, "").split(/[._-]/);
  return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : "Subtitles";
}

export function srtToVtt(source: string): string {
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  return `WEBVTT\n\n${normalized.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")}`;
}
