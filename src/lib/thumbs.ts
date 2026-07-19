// Lógica pura das miniaturas da timeline (a geração em si é o thumbs.rs, que
// roda o mpv headless em background e emite `thumbs-ready` uma a uma). Aqui só
// o que dá pra testar sem mpv: qual índice o mouse está pedindo e qual thumb
// PRONTA está mais perto dele (o tooltip degrada bem enquanto geram).

export const THUMB_COUNT = 50;

/** Fração 0–1 da barra → índice da miniatura correspondente. */
export function thumbIndexFor(frac: number, count: number = THUMB_COUNT): number {
  if (!Number.isFinite(frac) || count <= 0) return 0;
  const f = Math.min(1, Math.max(0, frac));
  return Math.min(count - 1, Math.floor(f * count));
}

/** A miniatura pronta mais próxima do índice pedido (busca pra fora, empate
 *  resolve pro lado de trás). null = nenhuma pronta ainda → tooltip só-tempo. */
export function nearestReady(files: ReadonlyArray<string | null>, idx: number): string | null {
  const n = files.length;
  if (n === 0) return null;
  const i0 = Math.min(n - 1, Math.max(0, idx));
  if (files[i0]) return files[i0];
  for (let d = 1; d < n; d++) {
    const back = i0 - d;
    const fwd = i0 + d;
    if (back >= 0 && files[back]) return files[back];
    if (fwd < n && files[fwd]) return files[fwd];
  }
  return null;
}
