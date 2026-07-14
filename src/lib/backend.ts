// Wrappers dos comandos Rust (Tauri v2: chaves camelCase no invoke) + helpers de
// alto nível pro mpv construídos sobre o comando cru `mpv_command`.

import { invoke } from "@tauri-apps/api/core";

export function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function cmd<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!inTauri()) return Promise.reject(new Error(`fora do Tauri: ${name}`));
  return invoke<T>(name, args);
}

// ---- Arquivos / sistema ----
export const getStartupFile = () => cmd<string | null>("get_startup_file");
export const listDir = (dir: string) => cmd<string[]>("list_dir", { dir });
export const parentDir = (path: string) => cmd<string | null>("parent_dir", { path });

// ---- mpv: ciclo de vida ----
export interface StartOpts {
  volume: number;
  speed: number;
  remember: boolean;
  separateWindow: boolean;
  mpvPath: string;
}
export interface StartResult {
  embedded: boolean;
}

export const mpvAvailable = (mpvPath: string) =>
  cmd<boolean>("mpv_available", { overridePath: mpvPath });

export const mpvStart = (o: StartOpts) =>
  cmd<StartResult>("mpv_start", {
    volume: o.volume,
    speed: o.speed,
    remember: o.remember,
    separateWindow: o.separateWindow,
    overridePath: o.mpvPath,
  });

export const mpvStop = () => cmd<void>("mpv_stop");

export const stageRect = (
  x: number,
  y: number,
  w: number,
  h: number,
  visible: boolean,
) => cmd<void>("stage_rect", { x, y, w, h, visible });

// ---- mpv: comando cru ----
export const mpvCommand = (args: unknown[]) => cmd<void>("mpv_command", { args });

// ---- mpv: helpers de alto nível ----
export const mpvLoad = (path: string) => mpvCommand(["loadfile", path, "replace"]);
export const mpvSet = (prop: string, value: unknown) =>
  mpvCommand(["set_property", prop, value]);
export const mpvObserve = (id: number, name: string) =>
  mpvCommand(["observe_property", id, name]);

export const mpvSeekAbs = (secs: number) =>
  mpvCommand(["seek", secs, "absolute", "exact"]);
export const mpvSeekRel = (delta: number) =>
  mpvCommand(["seek", delta, "relative", "exact"]);
export const mpvSeekPct = (pct: number) =>
  mpvCommand(["seek", pct, "absolute-percent", "exact"]);

export const mpvScreenshot = () => mpvCommand(["screenshot"]);
export const mpvAddSub = (path: string) => mpvCommand(["sub-add", path, "select"]);

export const mpvSetPause = (paused: boolean) => mpvSet("pause", paused);
export const mpvSetVolume = (v: number) => mpvSet("volume", Math.max(0, Math.min(130, v)));
export const mpvSetMute = (m: boolean) => mpvSet("mute", m);
export const mpvSetSpeed = (s: number) => mpvSet("speed", Math.max(0.25, Math.min(4, s)));
export const mpvSetTrack = (kind: "aid" | "sid" | "vid", id: number | "no") =>
  mpvSet(kind, id);
export const mpvSetSubDelay = (secs: number) => mpvSet("sub-delay", secs);
