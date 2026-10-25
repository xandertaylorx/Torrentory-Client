import { useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdatePhase = "idle" | "checking" | "available" | "downloading" | "installing" | "restarting" | "current" | "error";
const checkForUpdate = () => check({ timeout: 15_000 });

export function useUpdater(enabled: boolean) {
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const [open, setOpen] = useState(false);
  const [update, setUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const startupCheck = useRef<Promise<Update | null> | null>(null);
  const busy = useRef(false);
  const installed = useRef(false);
  const pending = useRef<Update | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) return;
    startupCheck.current ??= checkForUpdate();
    let active = true;
    setPhase("checking");
    void startupCheck.current.then(result => {
      if (!active) return;
      pending.current = result;
      setUpdate(result);
      setPhase(result ? "available" : "idle");
      if (result) setOpen(true);
    }).catch(() => {
      // Offline starts must not interrupt downloads. A manual retry stays available.
      if (active) setPhase("idle");
    });
    return () => { active = false; mounted.current = false; };
  }, [enabled]);

  async function checkNow() {
    if (!enabled || busy.current || phase === "checking") return;
    if (pending.current || installed.current) { setOpen(true); return; }
    busy.current = true;
    setOpen(true); setPhase("checking"); setError("");
    try {
      const result = await checkForUpdate();
      if (!mounted.current) { await result?.close(); return; }
      pending.current = result;
      setUpdate(result); setPhase(result ? "available" : "current");
    } catch {
      if (mounted.current) { setError("Could not check for updates. Check your internet connection and try again."); setPhase("error"); }
    } finally { busy.current = false; }
  }

  async function install() {
    if (!enabled || busy.current || (!pending.current && !installed.current)) return;
    busy.current = true; setError("");
    try {
      if (!installed.current) {
        setPhase("downloading"); setProgress(null);
        let downloaded = 0, total = 0;
        await pending.current!.downloadAndInstall(event => {
          if (!mounted.current) return;
          if (event.event === "Started") { total = event.data.contentLength ?? 0; downloaded = 0; }
          if (event.event === "Progress") downloaded += event.data.chunkLength;
          if (event.event === "Finished") { setPhase("installing"); setProgress(100); }
          else if (total > 0) setProgress(Math.min(100, Math.round(downloaded / total * 100)));
        }, { timeout: 600_000 });
        installed.current = true;
      }
      setPhase("restarting");
      await relaunch();
    } catch {
      if (mounted.current) {
        setError(installed.current
          ? "The update is installed, but Torrentory could not restart. Try restarting again or quit and reopen the app."
          : "The update could not be installed. Check your connection and application folder permissions, then try again.");
        setPhase("error");
      }
    } finally { busy.current = false; }
  }

  const working = phase === "downloading" || phase === "installing" || phase === "restarting";
  return { phase, open, update, progress, error, working, installed: installed.current,
    checkNow, install, dismiss: () => { if (!busy.current) setOpen(false); } };
}
