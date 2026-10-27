// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppUpdater } from "./AppUpdater";
const native = vi.hoisted(() => ({ check: vi.fn(), relaunch: vi.fn() }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: native.check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: native.relaunch }));
beforeEach(() => { vi.resetAllMocks(); Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true }); });
afterEach(() => { cleanup(); Reflect.deleteProperty(window, "__TAURI_INTERNALS__"); });

it("shows the launch popup and installs/restarts from its Update button", async () => {
  const downloadAndInstall = vi.fn().mockResolvedValue(undefined);
  native.check.mockResolvedValue({ version: "0.1.9", body: "Release improvements", downloadAndInstall });
  native.relaunch.mockResolvedValue(undefined);
  render(<AppUpdater />);
  await screen.findByRole("dialog", { name: "Update Torrentory" });
  expect(screen.getByText("Version 0.1.9 is available")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Later" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Update available" }));
  fireEvent.click(screen.getByRole("button", { name: "Update and restart" }));
  await waitFor(() => expect(native.relaunch).toHaveBeenCalledTimes(1));
  expect(downloadAndInstall).toHaveBeenCalledTimes(1);
});

it("defers the update dialog until a running product tour closes", async () => {
  native.check.mockResolvedValue({ version: "0.1.10", downloadAndInstall: vi.fn() });
  const { rerender } = render(<AppUpdater tourActive />);
  await screen.findByRole("button", { name: "Update available" });
  expect(screen.queryByRole("dialog")).toBeNull();
  rerender(<AppUpdater tourActive={false} />);
  expect(screen.getByRole("dialog", { name: "Update Torrentory" })).toBeTruthy();
});

it("shows an actionable retry without restarting when installation fails", async () => {
  const downloadAndInstall = vi.fn().mockRejectedValue(new Error("invalid signature"));
  native.check.mockResolvedValue({ version: "0.1.9", downloadAndInstall });
  render(<AppUpdater />);
  await screen.findByRole("dialog");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Update and restart" })); });
  expect(screen.getByRole("alert").textContent).toContain("could not be installed");
  expect(screen.getByRole("button", { name: "Retry update" })).toBeTruthy();
  expect(native.relaunch).not.toHaveBeenCalled();
});

it("shows the version change, plain notes and download progress", async () => {
  let report: (event: unknown) => void = () => undefined;
  const downloadAndInstall = vi.fn().mockImplementation((callback: (event: unknown) => void) => { report = callback; return new Promise(() => undefined); });
  native.check.mockResolvedValue({ version: "0.1.9", currentVersion: "0.1.8", body: "Now **faster**.", downloadAndInstall });
  render(<AppUpdater />);
  await screen.findByRole("dialog", { name: "Update Torrentory" });
  expect(screen.getByText("0.1.8")).toBeTruthy();
  expect(screen.getByText("Now faster.")).toBeTruthy();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Update and restart" })); });
  act(() => { report({ event: "Started", data: { contentLength: 2_000_000 } }); report({ event: "Progress", data: { chunkLength: 1_000_000 } }); });
  expect(screen.getByRole("progressbar", { name: "Update progress" }).getAttribute("aria-valuenow")).toBe("50");
  expect(screen.getByText(/of 1.9 MB/)).toBeTruthy();
});
