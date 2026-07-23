// Interpretação dos eventos crus do mpv (JSON IPC) em sinais normalizados que a
// store aplica. Puro e testado — o Rust só repassa as linhas, a semântica é aqui.

import { t as tr } from "./i18n";
import type { Chapter, Track, TrackType } from "./types";

/** Propriedades que observamos no mpv, com um id estável cada. */
export const OBSERVE: Array<[number, string]> = [
  [1, "time-pos"],
  [2, "duration"],
  [3, "pause"],
  [4, "volume"],
  [5, "mute"],
  [6, "speed"],
  [7, "media-title"],
  [8, "track-list"],
  [9, "chapter-list"],
  [10, "chapter"],
  [11, "path"],
  [12, "filename"],
  [13, "width"],
  [14, "demuxer-cache-time"],
  [15, "sub-delay"],
  [16, "core-idle"],
  [17, "vid"],
  [18, "aid"],
  [19, "sid"],
  [20, "eof-reached"],
];

export type MpvSignal =
  | { kind: "prop"; name: string; data: unknown }
  | { kind: "endFile"; reason: string }
  | { kind: "startFile" }
  | { kind: "fileLoaded" }
  | { kind: "seek" }
  | { kind: "ignore" };

/** Um objeto de evento cru do mpv → sinal normalizado. */
export function interpretEvent(ev: unknown): MpvSignal {
  if (!ev || typeof ev !== "object") return { kind: "ignore" };
  const o = ev as Record<string, unknown>;

  if (typeof o.event === "string") {
    switch (o.event) {
      case "property-change":
        return { kind: "prop", name: String(o.name ?? ""), data: o.data };
      case "end-file":
        return { kind: "endFile", reason: String(o.reason ?? "") };
      case "start-file":
        return { kind: "startFile" };
      case "file-loaded":
        return { kind: "fileLoaded" };
      case "seek":
        return { kind: "seek" };
      default:
        return { kind: "ignore" };
    }
  }
  // Respostas de comando (request_id) e afins: ignoradas.
  return { kind: "ignore" };
}

/** track-list do mpv → nossa lista de Track. */
export function parseTracks(data: unknown): Track[] {
  if (!Array.isArray(data)) return [];
  const out: Track[] = [];
  for (const raw of data) {
    if (!raw || typeof raw !== "object") continue;
    const t = raw as Record<string, unknown>;
    const type = t.type as TrackType;
    if (type !== "video" && type !== "audio" && type !== "sub") continue;
    out.push({
      id: typeof t.id === "number" ? t.id : 0,
      type,
      title: typeof t.title === "string" ? t.title : undefined,
      lang: typeof t.lang === "string" ? t.lang : undefined,
      selected: t.selected === true,
      external: t.external === true,
      codec: typeof t.codec === "string" ? t.codec : undefined,
    });
  }
  return out;
}

/** chapter-list do mpv → nossa lista de Chapter. */
export function parseChapters(data: unknown): Chapter[] {
  if (!Array.isArray(data)) return [];
  const out: Chapter[] = [];
  for (let i = 0; i < data.length; i++) {
    const raw = data[i];
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    out.push({
      title: typeof c.title === "string" && c.title ? c.title : tr("chapter.n", { n: i + 1 }),
      time: typeof c.time === "number" ? c.time : 0,
    });
  }
  return out;
}

/** Há trilha de vídeo REAL selecionada (não capa de álbum)? */
export function hasRealVideo(tracks: Track[]): boolean {
  return tracks.some((t) => t.type === "video" && t.selected && !isAlbumArt(t));
}

function isAlbumArt(t: Track): boolean {
  // Capa embutida costuma vir como codec de imagem (mjpeg/png) numa faixa de vídeo.
  const c = (t.codec ?? "").toLowerCase();
  return c === "mjpeg" || c === "png" || c === "bmp" || c === "gif";
}

/** Rótulo amigável de uma faixa pro menu. */
export function trackLabel(t: Track): string {
  const parts: string[] = [];
  if (t.lang) parts.push(t.lang.toUpperCase());
  if (t.title) parts.push(t.title);
  if (parts.length === 0) parts.push(tr("track.n", { n: t.id }));
  if (t.external) parts.push(tr("track.external"));
  return parts.join(" · ");
}
