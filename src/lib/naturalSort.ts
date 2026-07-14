// Filtro de mídia + ordenação natural da playlist da pasta. Puro e testado.

import { basename } from "./format";

export const VIDEO_EXTS = [
  "mp4", "mkv", "webm", "avi", "mov", "m4v", "mpg", "mpeg", "flv", "ts", "wmv", "ogv", "3gp",
];
export const AUDIO_EXTS = [
  "mp3", "flac", "m4a", "ogg", "opus", "wav", "aac", "wma", "aiff", "alac", "mka",
];
const MEDIA = new Set([...VIDEO_EXTS, ...AUDIO_EXTS]);

export function extOf(path: string): string {
  const b = basename(path);
  const dot = b.lastIndexOf(".");
  return dot >= 0 ? b.slice(dot + 1).toLowerCase() : "";
}

export function isMedia(path: string): boolean {
  return MEDIA.has(extOf(path));
}

export function isVideoExt(path: string): boolean {
  return VIDEO_EXTS.includes(extOf(path));
}

/**
 * Comparação natural: "ep2" antes de "ep10", ignorando caixa e acentos.
 * Compara pelo nome do arquivo (não pelo caminho inteiro).
 */
export function naturalCompare(a: string, b: string): number {
  const na = normalizeForSort(basename(a));
  const nb = normalizeForSort(basename(b));
  return na.localeCompare(nb, undefined, { numeric: true, sensitivity: "base" });
}

function normalizeForSort(s: string): string {
  // Remove os diacríticos combinantes após NFD (sem caractere combinante no fonte).
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** De uma lista de arquivos da pasta → só mídia, ordenada naturalmente. */
export function buildPlaylist(files: string[]): string[] {
  return files.filter(isMedia).sort(naturalCompare);
}
