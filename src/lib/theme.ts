import type { Appearance } from "./types";

/** Applies the light/dark class for an appearance setting. */
export function applyAppearance(appearance: Appearance) {
  const dark = appearance === "dark" || (appearance === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}
