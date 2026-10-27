// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("@tauri-apps/api/app", () => ({ getVersion: () => Promise.resolve("0.1.10") }));
vi.mock("framer-motion", async importOriginal => ({
  ...await importOriginal<typeof import("framer-motion")>(), useReducedMotion: () => true,
}));
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("launches and replays the tour from Settings without opening real torrent actions", () => {
  render(<App />);
  const start = () => {
    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    fireEvent.click(screen.getByRole("button", { name: "About" }));
    fireEvent.click(screen.getByRole("button", { name: "Run tour" }));
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Torrentory product tour" })).toBeTruthy();
    expect(screen.getByText("Quick tour · 1 of 7")).toBeTruthy();
  };
  start();
  fireEvent.keyDown(window, { key: "o", metaKey: true });
  expect(screen.queryByRole("dialog", { name: "Add a torrent" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Go to step 7" }));
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open settings" }));
  start();
  fireEvent.click(screen.getByRole("button", { name: "Skip tour" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});
