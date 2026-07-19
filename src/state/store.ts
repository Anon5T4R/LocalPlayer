import { create } from "zustand";

import * as B from "../lib/backend";
import { fmtTime, stem } from "../lib/format";
import { t as tr } from "../lib/i18n";
import {
  parseResume,
  removeResume,
  RESUME_MAX_FRAC,
  resumeTargetMs,
  shouldResume,
  upsertResume,
  type ResumeMap,
} from "../lib/resume";
import { THUMB_COUNT } from "../lib/thumbs";
import {
  hasRealVideo,
  interpretEvent,
  OBSERVE,
  parseChapters,
  parseTracks,
} from "../lib/mpvEvents";
import { buildPlaylist, isMedia } from "../lib/naturalSort";
import { DEFAULT_SETTINGS, type Chapter, type Repeat, type Settings, type Track } from "../lib/types";
import { useUi } from "./ui";

const SETTINGS_KEY = "localplayer.settings";
const SESSION_KEY = "localplayer.session";
const RECENTS_KEY = "localplayer.recents";

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter((x) => typeof x === "string").slice(0, 12);
    }
  } catch {
    /* ignora */
  }
  return [];
}

function pushRecent(path: string, cur: string[]): string[] {
  const next = [path, ...cur.filter((p) => p !== path)].slice(0, 12);
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* ignora */
  }
  return next;
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignora */
  }
  return { ...DEFAULT_SETTINGS };
}

function loadSession(): { volume: number; muted: boolean } {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { volume: typeof s.volume === "number" ? s.volume : DEFAULT_SETTINGS.defaultVolume, muted: !!s.muted };
    }
  } catch {
    /* ignora */
  }
  return { volume: DEFAULT_SETTINGS.defaultVolume, muted: false };
}

type Ready = "checking" | "ok" | "no-mpv";

interface PlayerStore {
  settings: Settings;
  ready: Ready;
  started: boolean;
  embedded: boolean;

  // reprodução
  path: string;
  title: string;
  duration: number;
  position: number;
  paused: boolean;
  buffered: number;
  volume: number;
  muted: boolean;
  speed: number;

  hasVideo: boolean;
  tracks: Track[];
  chapters: Chapter[];
  chapterIndex: number;
  aid: number | "no";
  sid: number | "no";
  vid: number | "no";
  subDelay: number;
  ab: { a: number | null; b: number | null };

  // playlist
  items: string[];
  index: number;
  repeat: Repeat;
  shuffle: boolean;
  recents: string[];

  /** Miniaturas da timeline do arquivo atual (null = sem vídeo/ainda nada). */
  thumbs: { path: string; count: number; files: (string | null)[] } | null;

  // ações
  boot(): Promise<void>;
  setSettings(patch: Partial<Settings>): Promise<void>;
  ensureStarted(): Promise<boolean>;
  openFile(path: string): Promise<void>;
  openFiles(paths: string[]): Promise<void>;
  playIndex(i: number): Promise<void>;
  next(): void;
  prev(): void;
  onEndFile(reason: string): void;

  togglePause(): void;
  seekRel(delta: number): void;
  seekAbs(secs: number): void;
  seekPct(pct: number): void;
  setVolume(v: number): void;
  nudgeVolume(d: number): void;
  toggleMute(): void;
  setSpeed(s: number): void;
  nudgeSpeed(d: number): void;
  resetSpeed(): void;
  setTrack(kind: "aid" | "sid" | "vid", id: number | "no"): void;
  cycleSub(): void;
  screenshot(): void;
  setAbA(): void;
  setAbB(): void;
  clearAb(): void;
  setRepeat(r: Repeat): void;
  toggleShuffle(): void;

  applyRawEvent(raw: unknown): void;
  handleMpvExit(): void;
  goHome(): void;

  /** Miniatura pronta (evento `thumbs-ready` do Rust). */
  applyThumbReady(p: { path: string; index: number; file: string; count: number }): void;
  /** Salva a posição atual no resume AGORA (troca de arquivo, home, fechamento). */
  savePositionNow(): void;
}

const sess = loadSession();

// ---- resume próprio (fora do estado React: nada aqui re-renderiza nada) ----
let resumeMap: ResumeMap = {};
let resumeLoaded = false;
let lastResumeSaveTs = 0;
/** Arquivo pra quem já disparamos a geração de thumbs (dedup do gatilho). */
let thumbsStartedFor = "";

function persistResume() {
  void B.resumeSave(JSON.stringify(resumeMap)).catch(() => {});
}

export const usePlayer = create<PlayerStore>((set, get) => ({
  settings: loadSettings(),
  ready: "checking",
  started: false,
  embedded: false,

  path: "",
  title: "",
  duration: 0,
  position: 0,
  paused: false,
  buffered: 0,
  volume: sess.volume,
  muted: sess.muted,
  speed: 1,

  hasVideo: false,
  tracks: [],
  chapters: [],
  chapterIndex: -1,
  aid: "no",
  sid: "no",
  vid: "no",
  subDelay: 0,
  ab: { a: null, b: null },

  items: [],
  index: -1,
  repeat: "off",
  shuffle: false,
  recents: loadRecents(),

  thumbs: null,

  async boot() {
    const { settings } = get();
    if (!B.inTauri()) {
      set({ ready: "no-mpv" });
      return;
    }
    const ok = await B.mpvAvailable(settings.mpvPath).catch(() => false);
    set({ ready: ok ? "ok" : "no-mpv" });
  },

  async setSettings(patch) {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* ignora */
    }
    // Trocar o modo de janela (embed × separada) ou o caminho do mpv exige
    // reiniciar o processo do mpv com outros argumentos.
    if (("embedVideo" in patch || "mpvPath" in patch) && get().started) {
      const cur = get();
      await B.mpvStop().catch(() => {});
      set({ started: false, embedded: false });
      const wasPlaying = cur.path;
      const idx = cur.index;
      if (wasPlaying) {
        await get().ensureStarted();
        await get().playIndex(idx);
      }
    }
  },

  async ensureStarted() {
    if (get().started) return true;
    const { settings, volume, muted, speed } = get();
    // Carrega o resume próprio ANTES do primeiro arquivo tocar (o file-loaded
    // consulta o mapa). Uma vez por sessão; falha = mapa vazio, sem drama.
    if (!resumeLoaded) {
      resumeLoaded = true;
      resumeMap = parseResume(await B.resumeLoad().catch(() => "{}"));
    }
    try {
      const r = await B.mpvStart({
        volume,
        speed: speed || settings.defaultSpeed,
        // SEMPRE false: o resume agora é NOSSO (lib/resume.ts salva a cada 5s,
        // não só no quit). O watch-later do mpv ligado junto duplicaria o seek.
        remember: false,
        separateWindow: !settings.embedVideo,
        mpvPath: settings.mpvPath,
      });
      set({ started: true, embedded: r.embedded });
      // Observadores + estado inicial de mute.
      for (const [id, name] of OBSERVE) {
        await B.mpvObserve(id, name).catch(() => {});
      }
      await B.mpvSetMute(muted).catch(() => {});
      return true;
    } catch (e) {
      useUi.getState().toast("error", tr("err.mpvStart", { e: String(e) }));
      set({ ready: "no-mpv" });
      return false;
    }
  },

  async openFile(path) {
    if (!isMedia(path)) {
      useUi.getState().toast("error", tr("err.notMedia"));
      return;
    }
    let items: string[] = [];
    const dir = await B.parentDir(path).catch(() => null);
    if (dir) {
      const files = await B.listDir(dir).catch(() => [] as string[]);
      items = buildPlaylist(files);
    }
    if (!items.includes(path)) items = [path, ...items];
    const index = items.indexOf(path);
    set({ items, index });
    const ok = await get().ensureStarted();
    if (ok) await get().playIndex(index);
  },

  async openFiles(paths) {
    const media = paths.filter(isMedia);
    if (media.length === 0) {
      useUi.getState().toast("error", tr("err.noMedia"));
      return;
    }
    if (media.length === 1) {
      await get().openFile(media[0]);
      return;
    }
    // Vários arquivos soltos = playlist explícita, na ordem natural.
    const items = buildPlaylist(media);
    set({ items, index: 0 });
    const ok = await get().ensureStarted();
    if (ok) await get().playIndex(0);
  },

  async playIndex(i) {
    const { items } = get();
    if (i < 0 || i >= items.length) return;
    // Troca de arquivo: a posição do que estava tocando entra no resume já.
    get().savePositionNow();
    thumbsStartedFor = "";
    const path = items[i];
    set({
      index: i,
      path,
      thumbs: null,
      recents: pushRecent(path, get().recents),
      title: stem(path),
      position: 0,
      duration: 0,
      buffered: 0,
      paused: false,
      chapters: [],
      chapterIndex: -1,
      ab: { a: null, b: null },
    });
    await B.mpvLoad(path).catch((e) => {
      useUi.getState().toast("error", tr("err.openFail", { e: String(e) }));
    });
  },

  next() {
    const { index, items, shuffle } = get();
    if (items.length === 0) return;
    if (shuffle && items.length > 1) {
      let r = index;
      while (r === index) r = Math.floor(Math.random() * items.length);
      void get().playIndex(r);
      return;
    }
    void get().playIndex((index + 1) % items.length);
  },

  prev() {
    const { index, items, position } = get();
    if (items.length === 0) return;
    // Convenção de player: se já passou de 3s, "anterior" reinicia a faixa atual.
    if (position > 3) {
      get().seekAbs(0);
      return;
    }
    void get().playIndex((index - 1 + items.length) % items.length);
  },

  onEndFile(reason) {
    if (reason !== "eof") return; // stop/quit/error não avançam
    const { repeat, index, items, shuffle, settings } = get();
    // Assistiu até o fim: some do resume (reabrir recomeça do zero).
    const done = get().path;
    if (done && done in resumeMap) {
      resumeMap = removeResume(resumeMap, done);
      persistResume();
    }
    if (repeat === "one") {
      void get().playIndex(index);
      return;
    }
    if (!settings.autoplayNext) {
      set({ paused: true });
      return;
    }
    if (shuffle && items.length > 1) {
      get().next();
      return;
    }
    if (index + 1 < items.length) {
      void get().playIndex(index + 1);
    } else if (repeat === "all") {
      void get().playIndex(0);
    } else {
      set({ paused: true });
    }
  },

  togglePause() {
    const p = !get().paused;
    set({ paused: p });
    void B.mpvSetPause(p);
  },
  seekRel(delta) {
    void B.mpvSeekRel(delta);
  },
  seekAbs(secs) {
    void B.mpvSeekAbs(secs);
  },
  seekPct(pct) {
    void B.mpvSeekPct(pct);
  },
  setVolume(v) {
    v = Math.max(0, Math.min(130, Math.round(v)));
    set({ volume: v });
    void B.mpvSetVolume(v);
    persistSession(get());
  },
  nudgeVolume(d) {
    get().setVolume(get().volume + d);
  },
  toggleMute() {
    const m = !get().muted;
    set({ muted: m });
    void B.mpvSetMute(m);
    persistSession(get());
  },
  setSpeed(s) {
    s = Math.max(0.25, Math.min(4, Math.round(s * 100) / 100));
    set({ speed: s });
    void B.mpvSetSpeed(s);
  },
  nudgeSpeed(d) {
    get().setSpeed(get().speed + d);
  },
  resetSpeed() {
    get().setSpeed(1);
  },
  setTrack(kind, id) {
    void B.mpvSetTrack(kind, id);
  },
  cycleSub() {
    const subs = get().tracks.filter((t) => t.type === "sub");
    if (subs.length === 0) {
      useUi.getState().toast("info", tr("toast.noSubs"));
      return;
    }
    const cur = get().sid;
    if (cur === "no") {
      get().setTrack("sid", subs[0].id);
    } else {
      const pos = subs.findIndex((t) => t.id === cur);
      const nextSub = subs[pos + 1];
      get().setTrack("sid", nextSub ? nextSub.id : "no");
    }
  },
  screenshot() {
    void B.mpvScreenshot();
    useUi.getState().toast("success", tr("toast.screenshotSaved"));
  },
  setAbA() {
    set({ ab: { a: get().position, b: get().ab.b } });
    useUi.getState().toast("info", tr("toast.abA"));
  },
  setAbB() {
    const a = get().ab.a;
    if (a === null) {
      useUi.getState().toast("info", tr("toast.abNeedA"));
      return;
    }
    set({ ab: { a, b: get().position } });
    useUi.getState().toast("success", tr("toast.abOn"));
  },
  clearAb() {
    set({ ab: { a: null, b: null } });
  },
  setRepeat(r) {
    set({ repeat: r });
  },
  toggleShuffle() {
    set({ shuffle: !get().shuffle });
  },

  applyRawEvent(raw) {
    const sig = interpretEvent(raw);
    switch (sig.kind) {
      case "endFile":
        get().onEndFile(sig.reason);
        return;
      case "fileLoaded": {
        set({ paused: false });
        // Resume próprio: retoma de posMs-2s se valer a pena (lib/resume.ts).
        // Usa a duração SALVA — a atual pode ainda não ter chegado do mpv.
        const { path, settings } = get();
        const e = resumeMap[path];
        if (settings.rememberPosition && e && shouldResume(e)) {
          get().seekAbs(resumeTargetMs(e.posMs) / 1000);
          useUi.getState().toast("info", tr("toast.resume", { time: fmtTime(e.posMs / 1000) }));
        }
        return;
      }
      case "prop":
        applyProp(sig.name, sig.data, set, get);
        return;
      default:
        return;
    }
  },

  handleMpvExit() {
    set({ started: false, embedded: false });
  },

  goHome() {
    // Volta pra tela inicial sem matar o mpv (ele fica ocioso). Para a mídia atual.
    get().savePositionNow();
    thumbsStartedFor = "";
    void B.thumbsCancel().catch(() => {});
    if (get().started) void B.mpvCommand(["stop"]);
    set({ index: -1, path: "", title: "", position: 0, duration: 0, paused: true, thumbs: null });
  },

  applyThumbReady(p) {
    const t = get().thumbs;
    // Evento de arquivo antigo (geração cancelada tarde) não suja o atual.
    if (!t || t.path !== p.path || p.index < 0 || p.index >= t.count) return;
    if (t.files[p.index] === p.file) return;
    const files = t.files.slice();
    files[p.index] = p.file;
    set({ thumbs: { ...t, files } });
  },

  savePositionNow() {
    const s = get();
    if (!s.settings.rememberPosition || !s.path || s.duration <= 0) return;
    lastResumeSaveTs = Date.now();
    if (s.position >= s.duration * RESUME_MAX_FRAC) {
      // Já no finzinho = assistido: remove em vez de salvar (senão o "próximo"
      // depois do eof re-salvava pos≈duração e desfazia a remoção do onEndFile).
      if (s.path in resumeMap) {
        resumeMap = removeResume(resumeMap, s.path);
        persistResume();
      }
      return;
    }
    resumeMap = upsertResume(
      resumeMap,
      s.path,
      Math.round(s.position * 1000),
      Math.round(s.duration * 1000),
      lastResumeSaveTs,
    );
    persistResume();
  },
}));

function persistSession(s: { volume: number; muted: boolean }) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ volume: s.volume, muted: s.muted }));
  } catch {
    /* ignora */
  }
}

type SetFn = (partial: Partial<PlayerStore>) => void;
type GetFn = () => PlayerStore;

/** Dispara a geração de thumbs quando dá: precisa de caminho + duração + vídeo
 *  de verdade (áudio não tem o que miniaturar). `duration` e `track-list`
 *  chegam do mpv em qualquer ordem — os dois chamam aqui, o primeiro com o
 *  conjunto completo vence, o dedup segura o resto. */
function maybeStartThumbs(get: GetFn, set: SetFn) {
  const s = get();
  if (!s.path || s.duration <= 0 || !s.hasVideo) return;
  if (thumbsStartedFor === s.path) return;
  thumbsStartedFor = s.path;
  set({ thumbs: { path: s.path, count: THUMB_COUNT, files: Array(THUMB_COUNT).fill(null) } });
  void B.thumbsStart(s.path, Math.round(s.duration * 1000), s.settings.mpvPath).catch(() => {
    // Sem thumbs (mpv sumiu? arquivo esquisito?): tooltip fica só com o tempo.
  });
}

function applyProp(name: string, data: unknown, set: SetFn, get: GetFn) {
  switch (name) {
    case "time-pos": {
      const pos = typeof data === "number" ? data : 0;
      set({ position: pos });
      // Resume: o time-pos só pinga enquanto REPRODUZ, então "salvar a cada 5s
      // de reprodução" é salvar aqui, com trava de relógio.
      if (Date.now() - lastResumeSaveTs >= 5000) get().savePositionNow();
      // Aplica o loop A-B.
      const { ab } = get();
      if (ab.a !== null && ab.b !== null && pos >= ab.b) {
        get().seekAbs(ab.a);
      }
      return;
    }
    case "duration":
      set({ duration: typeof data === "number" ? data : 0 });
      maybeStartThumbs(get, set);
      return;
    case "pause":
      set({ paused: data === true });
      return;
    case "volume":
      if (typeof data === "number") set({ volume: Math.round(data) });
      return;
    case "mute":
      set({ muted: data === true });
      return;
    case "speed":
      if (typeof data === "number") set({ speed: Math.round(data * 100) / 100 });
      return;
    case "media-title":
      if (typeof data === "string" && data.trim()) set({ title: data });
      return;
    case "filename":
      if (typeof data === "string" && !get().title) set({ title: stem(data) });
      return;
    case "track-list": {
      const tracks = parseTracks(data);
      set({ tracks, hasVideo: hasRealVideo(tracks) });
      maybeStartThumbs(get, set);
      return;
    }
    case "chapter-list":
      set({ chapters: parseChapters(data) });
      return;
    case "chapter":
      set({ chapterIndex: typeof data === "number" ? data : -1 });
      return;
    case "demuxer-cache-time":
      set({ buffered: typeof data === "number" ? data : 0 });
      return;
    case "sub-delay":
      set({ subDelay: typeof data === "number" ? data : 0 });
      return;
    case "vid":
      set({ vid: typeof data === "number" ? data : "no" });
      return;
    case "aid":
      set({ aid: typeof data === "number" ? data : "no" });
      return;
    case "sid":
      set({ sid: typeof data === "number" ? data : "no" });
      return;
    default:
      return;
  }
}
