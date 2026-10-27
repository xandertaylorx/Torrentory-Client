// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProductTour } from "./ProductTour";

vi.mock("framer-motion", async importOriginal => ({
  ...await importOriginal<typeof import("framer-motion")>(),
  useReducedMotion: () => true,
}));

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  document.body.innerHTML = '<div id="root"><button data-tour="settings">Open settings</button><button data-tour="add">Add torrent</button></div>';
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 800, y: 10, left: 800, top: 10, right: 900, bottom: 40, width: 100, height: 30, toJSON() {} });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(340);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(220);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ""; });

function open() {
  const onClose = vi.fn();
  const result = render(<ProductTour onClose={onClose} />);
  return { ...result, onClose };
}

it("navigates relevant steps, supports jumping back and finishes", () => {
  const { onClose } = open();
  expect(screen.getByRole("dialog", { name: "Torrentory product tour" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "A quick look around" })).toBeTruthy();
  expect((screen.getByRole("button", { name: "Back" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("heading", { name: "Add your first torrent" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("heading", { name: "Share your own files" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByText("Quick tour · 2 of 7")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Go to step 7" }));
  expect(screen.getByRole("heading", { name: "Stay up to date" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(onClose).toHaveBeenCalledOnce();
});

it("handles arrows and Escape without triggering app shortcuts", () => {
  const { onClose } = open();
  const appKey = vi.fn();
  window.addEventListener("keydown", appKey);
  fireEvent.keyDown(window, { key: "ArrowRight" });
  expect(screen.getByText("Quick tour · 2 of 7")).toBeTruthy();
  fireEvent.keyDown(window, { key: "ArrowLeft" });
  expect(screen.getByText("Quick tour · 1 of 7")).toBeTruthy();
  fireEvent.keyDown(window, { key: "o", metaKey: true });
  fireEvent.keyDown(window, { key: "n", ctrlKey: true, shiftKey: true });
  fireEvent.keyDown(window, { key: ",", metaKey: true });
  fireEvent.keyDown(window, { key: "Escape" });
  expect(appKey).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledOnce();
  window.removeEventListener("keydown", appKey);
});

it("makes the app inert, traps focus, blocks background scrolling and restores focus on close", () => {
  const settings = screen.getByRole("button", { name: "Open settings" });
  settings.focus();
  const { unmount } = open();
  const next = screen.getByRole("button", { name: "Next" });
  const skip = screen.getByRole("button", { name: "Skip tour" });
  expect(document.getElementById("root")!.inert).toBe(true);
  expect(document.activeElement).toBe(next);
  expect(document.getElementById("root")!.getAttribute("aria-hidden")).toBe("true");
  settings.focus();
  expect(document.activeElement).toBe(next);
  fireEvent.keyDown(next, { key: "Tab" });
  expect(document.activeElement).toBe(skip);
  fireEvent.keyDown(skip, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(next);
  expect(fireEvent.wheel(document.body)).toBe(false);
  expect(fireEvent.wheel(screen.getByRole("dialog"))).toBe(true);
  unmount();
  expect(document.getElementById("root")!.inert).toBe(false);
  expect(document.getElementById("root")!.hasAttribute("aria-hidden")).toBe(false);
  expect(document.activeElement).toBe(settings);
  expect(fireEvent.wheel(document.body)).toBe(true);
});

it("measures targets, centers missing ones and never renders negative SVG dimensions", async () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() => expect(parseFloat(document.querySelector("svg rect[rx]")!.getAttribute("width")!)).toBe(112));
  for (let i = 3; i <= 7; i++) {
    fireEvent.click(screen.getByRole("button", { name: `Go to step ${i}` }));
    document.querySelectorAll("svg rect[rx]").forEach(rect => {
      expect(parseFloat(rect.getAttribute("width")!)).toBeGreaterThanOrEqual(0);
      expect(parseFloat(rect.getAttribute("height")!)).toBeGreaterThanOrEqual(0);
      expect(parseFloat(rect.getAttribute("rx")!)).toBeGreaterThanOrEqual(0);
    });
  }
  await waitFor(() => expect(parseFloat(document.querySelector("svg rect[rx]")!.getAttribute("width")!)).toBe(0));
  expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
});

it("skips without completing and restarts from the beginning when replayed", () => {
  const first = open();
  fireEvent.click(screen.getByRole("button", { name: "Go to step 5" }));
  fireEvent.click(screen.getByRole("button", { name: "Skip tour" }));
  expect(first.onClose).toHaveBeenCalledOnce();
  first.unmount();
  open();
  expect(screen.getByText("Quick tour · 1 of 7")).toBeTruthy();
});
