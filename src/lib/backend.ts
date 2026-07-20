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

// Os comandos async do Tauri podem chegar fora de ordem no Rust; o `seq`
// crescente deixa o Rust descartar chamadas atrasadas (um "esconde" velho
// aterrissando depois do "mostra" deixava o vídeo invisível). Base em Date.now()
// pra sobreviver a reload do webview (HMR) sem voltar atrás.
let stageSeq = Date.now() * 1000;
export const stageRect = (
  x: number,
  y: number,
  w: number,
  h: number,
  visible: boolean,
) => cmd<void>("stage_rect", { seq: ++stageSeq, x, y, w, h, visible });

// ---- resume próprio (app_data/resume.json; lógica em lib/resume.ts) ----
export const resumeLoad = () => cmd<string>("resume_load");
export const resumeSave = (data: string) => cmd<void>("resume_save", { data });

// ---- miniaturas da timeline (thumbs.rs; eventos `thumbs-ready`) ----
export const thumbsStart = (path: string, durationMs: number, mpvPath: string) =>
  cmd<string>("thumbs_start", { path, durationMs, overridePath: mpvPath });
export const thumbsCancel = () => cmd<void>("thumbs_cancel");

// ---- mpv: comando cru ----
export const mpvCommand = (args: unknown[]) => cmd<void>("mpv_command", { args });

// ---- mpv: helpers de alto nível ----
/** Carrega o arquivo, opcionalmente já ABRINDO na posição dada (resume).
 *  O `start=` no próprio loadfile é a forma à prova de corrida: seek disparado
 *  no `file-loaded` chegava cedo demais às vezes e o mpv o descartava — o
 *  "continuar de onde parou" falhava de vez em quando. Como opção de abertura,
 *  o próprio mpv aplica no momento certo. (mpv ≥0.38: loadfile <url> <flags>
 *  <index> <options> — o índice -1 é obrigatório pra opções na 4ª posição;
 *  a build embarcada é 0.41.) */
export const mpvLoad = (path: string, startSecs?: number) =>
  startSecs && startSecs > 0
    ? mpvCommand(["loadfile", path, "replace", "-1", `start=${startSecs.toFixed(3)}`])
    : mpvCommand(["loadfile", path, "replace"]);
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

// ---- Dados e armazenamento (B11) ----
export interface StorageInfo {
  dir: string;
  thumbsBytes: number;
  thumbsFiles: number;
  cachedVideos: number;
  liveCount: number;
  staleBytes: number;
  staleCount: number;
  missingBytes: number;
  missingCount: number;
  unlabeledBytes: number;
  unlabeledCount: number;
  tmpBytes: number;
  tmpCount: number;
  resumeBytes: number;
  resumeEntries: number;
}
export interface Freed {
  files: number;
  bytes: number;
}
export const storageInfo = () => cmd<StorageInfo>("storage_info");
export const storageClearStale = () => cmd<Freed>("storage_clear_stale");
export const storageClearMissing = () => cmd<Freed>("storage_clear_missing");
export const storageClearTmp = () => cmd<Freed>("storage_clear_tmp");
export const storageClearAllThumbs = () => cmd<Freed>("storage_clear_all_thumbs");
