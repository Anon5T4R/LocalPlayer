// Formatação de tempo/valores do player. Puro e testado.

/** Segundos → "M:SS" ou "H:MM:SS". Trata NaN/negativo/Infinity como 0. */
export function fmtTime(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) secs = 0;
  const total = Math.floor(secs);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Velocidade → "1x", "1.5x", "0.5x" (sem zeros à toa). */
export function fmtSpeed(sp: number): string {
  if (!Number.isFinite(sp) || sp <= 0) sp = 1;
  const r = Math.round(sp * 100) / 100;
  return `${r}x`;
}

/** Volume 0–130 → percentual inteiro. */
export function fmtVolume(v: number): string {
  if (!Number.isFinite(v) || v < 0) v = 0;
  return `${Math.round(v)}%`;
}

/** Nome do arquivo a partir de um caminho Windows ou Unix. */
export function basename(path: string): string {
  if (!path) return "";
  const norm = path.replace(/[\\/]+$/, "");
  const idx = Math.max(norm.lastIndexOf("/"), norm.lastIndexOf("\\"));
  return idx >= 0 ? norm.slice(idx + 1) : norm;
}

/** Nome sem extensão (pra título amigável quando não há media-title). */
export function stem(path: string): string {
  const b = basename(path);
  const dot = b.lastIndexOf(".");
  return dot > 0 ? b.slice(0, dot) : b;
}
