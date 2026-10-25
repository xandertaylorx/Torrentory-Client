// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Settings } from "../../lib/types";
import { SettingsModal, validateSettings } from "./SettingsModal";

const native = vi.hoisted(() => ({ save: vi.fn(), enable: vi.fn(), disable: vi.fn() }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: () => Promise.resolve("9.9.9") }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("@tauri-apps/plugin-autostart", () => ({ enable: native.enable, disable: native.disable }));
vi.mock("../../lib/api", () => ({ saveSettings: native.save, makeDefaultTorrentClient: vi.fn() }));

const base: Settings = {
  downloadLocation: "/Users/you/Downloads", askWhereToSave: true, launchAtLogin: false, continueInBackground: true,
  completionNotifications: true, defaultClientPromptDismissed: false, confirmRemove: true, confirmDeleteFiles: true,
  downloadLimitKbps: 0, uploadLimitKbps: 0, listeningPort: 4240, incomingConnections: true, appearance: "system",
};
beforeEach(() => {
  vi.resetAllMocks();
  native.save.mockResolvedValue(undefined);
  Object.defineProperty(window, "matchMedia", { value: () => ({ matches: false }), configurable: true });
});
afterEach(cleanup);

function open(onChange = vi.fn(), onClose = vi.fn()) {
  render(<SettingsModal value={base} defaultClient={null} onDefaultClientChange={vi.fn()} valueMakingDefault={false} onMakingDefaultChange={vi.fn()} onToast={vi.fn()} onChange={onChange} onClose={onClose} />);
  return { onChange, onClose };
}

it("validates ports and limits", () => {
  expect(validateSettings(base)).toBeNull();
  expect(validateSettings({ ...base, listeningPort: 80 })).toMatch(/port/);
  expect(validateSettings({ ...base, downloadLimitKbps: -1 })).toMatch(/download limit/);
  expect(validateSettings({ ...base, uploadLimitKbps: Number.NaN })).toMatch(/upload limit/);
});

it("enables Save only after a change and saves the draft", async () => {
  const { onChange, onClose } = open();
  const save = screen.getByRole("button", { name: "Save settings" }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Bandwidth" }));
  fireEvent.click(screen.getAllByRole("button", { name: "5 MB/s" })[0]);
  expect(save.disabled).toBe(false);
  fireEvent.click(save);
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(native.save).toHaveBeenCalledWith({ ...base, downloadLimitKbps: 5120 });
  expect(onChange).toHaveBeenCalledWith({ ...base, downloadLimitKbps: 5120 });
});

it("blocks saving an invalid port and explains why", () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: "Network" }));
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "80" } });
  expect(screen.getByRole("alert").textContent).toContain("between 1024 and 65535");
  expect((screen.getByRole("button", { name: "Save settings" }) as HTMLButtonElement).disabled).toBe(true);
});

it("shows the app version in About", async () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: "About" }));
  expect(await screen.findByText(/Version 9\.9\.9/)).toBeTruthy();
});
