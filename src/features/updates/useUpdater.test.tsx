// @vitest-environment jsdom
import { StrictMode, type ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";
import { useUpdater } from "./useUpdater";

const native = vi.hoisted(() => ({ check: vi.fn(), relaunch: vi.fn() }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: native.check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: native.relaunch }));
const makeUpdate = () => ({ version: "0.1.9", body: "Fixes and improvements", close: vi.fn(), downloadAndInstall: vi.fn().mockResolvedValue(undefined) });
beforeEach(() => { vi.resetAllMocks(); native.check.mockResolvedValue(null); native.relaunch.mockResolvedValue(undefined); });
afterEach(cleanup);

describe("native update flow", () => {
  it("checks once on launch in StrictMode and opens the update popup", async () => {
    const update = makeUpdate(); native.check.mockResolvedValue(update as unknown as Update);
    const { result } = renderHook(() => useUpdater(true), { wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> });
    await waitFor(() => expect(result.current.phase).toBe("available"));
    expect(result.current.open).toBe(true);
    expect(result.current.update?.version).toBe("0.1.9");
    expect(native.check).toHaveBeenCalledTimes(1);
    act(() => result.current.dismiss());
    expect(result.current.open).toBe(false);
    await act(() => result.current.checkNow());
    expect(result.current.open).toBe(true);
    expect(native.check).toHaveBeenCalledTimes(1);
  });
  it("stays quiet offline on launch and supports a manual retry", async () => {
    native.check.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useUpdater(true));
    await waitFor(() => expect(result.current.phase).toBe("idle"));
    expect(result.current.open).toBe(false);
    native.check.mockResolvedValueOnce(null);
    await act(() => result.current.checkNow());
    expect(result.current.phase).toBe("current");
    expect(result.current.open).toBe(true);
  });
  it("reports manual errors and can check again", async () => {
    const { result } = renderHook(() => useUpdater(true));
    await waitFor(() => expect(result.current.phase).toBe("idle"));
    native.check.mockRejectedValueOnce(new Error("offline"));
    await act(() => result.current.checkNow());
    expect(result.current.phase).toBe("error");
    expect(result.current.error).toContain("internet connection");
    await act(() => result.current.checkNow());
    expect(result.current.phase).toBe("current");
  });
  it("shows progress, prevents dismissal/duplicate installs, and restarts only after installation", async () => {
    const update = makeUpdate(); let finish: () => void = () => {}; let onEvent: (event: DownloadEvent) => void = () => {};
    update.downloadAndInstall.mockImplementation(callback => { onEvent = callback; return new Promise<void>(resolve => { finish = resolve; }); });
    native.check.mockResolvedValue(update);
    const { result } = renderHook(() => useUpdater(true));
    await waitFor(() => expect(result.current.phase).toBe("available"));
    let installing: Promise<void>;
    act(() => { installing = result.current.install(); });
    act(() => { onEvent({ event: "Started", data: { contentLength: 200 } }); onEvent({ event: "Progress", data: { chunkLength: 80 } }); });
    expect(result.current.progress).toBe(40);
    expect(result.current.phase).toBe("downloading");
    act(() => result.current.dismiss()); expect(result.current.open).toBe(true);
    await act(() => result.current.install()); expect(update.downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(native.relaunch).not.toHaveBeenCalled();
    act(() => onEvent({ event: "Finished" })); expect(result.current.phase).toBe("installing");
    await act(async () => { finish(); await installing; });
    expect(native.relaunch).toHaveBeenCalledTimes(1);
  });
  it("does not restart after a rejected download or signature, and can retry", async () => {
    const update = makeUpdate(); update.downloadAndInstall.mockRejectedValueOnce(new Error("invalid signature")); native.check.mockResolvedValue(update);
    const { result } = renderHook(() => useUpdater(true));
    await waitFor(() => expect(result.current.phase).toBe("available"));
    await act(() => result.current.install());
    expect(result.current.phase).toBe("error"); expect(native.relaunch).not.toHaveBeenCalled();
    await act(() => result.current.install());
    expect(native.relaunch).toHaveBeenCalledTimes(1);
  });
  it("retries a failed restart without downloading or installing again", async () => {
    const update = makeUpdate(); native.check.mockResolvedValue(update); native.relaunch.mockRejectedValueOnce(new Error("failed"));
    const { result } = renderHook(() => useUpdater(true));
    await waitFor(() => expect(result.current.phase).toBe("available"));
    await act(() => result.current.install());
    expect(result.current.phase).toBe("error"); expect(result.current.installed).toBe(true);
    await act(() => result.current.install());
    expect(update.downloadAndInstall).toHaveBeenCalledTimes(1); expect(native.relaunch).toHaveBeenCalledTimes(2);
  });
  it("does not call native APIs in the browser preview", async () => {
    const { result } = renderHook(() => useUpdater(false));
    await act(() => result.current.checkNow());
    expect(native.check).not.toHaveBeenCalled();
  });
});
