import { getCurrentWindow } from "@tauri-apps/api/window";
import type { MouseEvent as ReactMouseEvent } from "react";

const INTERACTIVE = "button, input, select, textarea, a, [role='button'], [data-no-drag]";

export function dragWindow(event: ReactMouseEvent<HTMLElement>): void {
  if (event.button !== 0 || !("__TAURI_INTERNALS__" in window)) return;
  if ((event.target as HTMLElement).closest(INTERACTIVE)) return;
  const appWindow = getCurrentWindow();
  if (event.detail === 2) void appWindow.toggleMaximize().catch(console.error);
  else void appWindow.startDragging().catch(console.error);
}
