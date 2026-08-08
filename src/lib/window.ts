import { getCurrentWindow } from "@tauri-apps/api/window";
import type { MouseEvent as ReactMouseEvent } from "react";

const INTERACTIVE = "button, input, select, textarea, a, [role='button'], [data-no-drag]";

export function dragWindow(event: ReactMouseEvent<HTMLElement>): void {
  if (event.button !== 0 || !("__TAURI_INTERNALS__" in window)) return;
  if ((event.target as HTMLElement).closest(INTERACTIVE)) return;
  event.preventDefault();
  const appWindow = getCurrentWindow();
  if (event.detail === 2) void appWindow.toggleMaximize();
  else void appWindow.startDragging();
}
