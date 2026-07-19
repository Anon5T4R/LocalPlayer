// Resume PRÓPRIO do LocalPlayer (independente do watch-later do mpv, que só
// salva no quit e falha em troca de arquivo). Puro e testado: a store salva a
// posição a cada 5s de reprodução (e na troca/fechamento) e, ao abrir um
// arquivo com posição salva, decide aqui se retoma. O JSON mora em
// app_data/resume.json (comandos resume_load/resume_save no Rust, gravação
// atômica), limitado a RESUME_MAX entradas (LRU pelo timestamp).

export interface ResumeEntry {
  posMs: number;
  durMs: number;
  /** Último toque (Date.now()) — critério do LRU. */
  ts: number;
}

export type ResumeMap = Record<string, ResumeEntry>;

export const RESUME_MAX = 500;
/** Só retoma se passou daqui — antes disso recomeçar não dói. */
export const RESUME_MIN_POS_MS = 30_000;
/** …e se não tinha praticamente terminado (créditos, últimos %). */
export const RESUME_MAX_FRAC = 0.95;
/** Retoma um tiquinho antes, pra recuperar o contexto. */
export const RESUME_REWIND_MS = 2_000;

/** JSON cru do disco → mapa validado (entrada torta é descartada, não derruba). */
export function parseResume(json: string): ResumeMap {
  try {
    const o: unknown = JSON.parse(json);
    if (!o || typeof o !== "object" || Array.isArray(o)) return {};
    const out: ResumeMap = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      const e = v as Partial<ResumeEntry> | null;
      if (
        e &&
        typeof e.posMs === "number" &&
        Number.isFinite(e.posMs) &&
        typeof e.durMs === "number" &&
        Number.isFinite(e.durMs)
      ) {
        out[k] = { posMs: e.posMs, durMs: e.durMs, ts: typeof e.ts === "number" ? e.ts : 0 };
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Grava/atualiza a entrada de um arquivo, despejando as mais antigas além de `max`. */
export function upsertResume(
  map: ResumeMap,
  path: string,
  posMs: number,
  durMs: number,
  now: number,
  max: number = RESUME_MAX,
): ResumeMap {
  const next: ResumeMap = { ...map, [path]: { posMs, durMs, ts: now } };
  const keys = Object.keys(next);
  if (keys.length > max) {
    keys.sort((a, b) => next[a].ts - next[b].ts); // mais antigo primeiro
    for (const k of keys.slice(0, keys.length - max)) delete next[k];
  }
  return next;
}

/** Remove a entrada (arquivo assistido até o fim). */
export function removeResume(map: ResumeMap, path: string): ResumeMap {
  if (!(path in map)) return map;
  const next = { ...map };
  delete next[path];
  return next;
}

/** Deve retomar deste ponto? (> 30s assistidos E < 95% da duração.) */
export function shouldResume(e: ResumeEntry | undefined | null): boolean {
  if (!e) return false;
  return e.durMs > 0 && e.posMs > RESUME_MIN_POS_MS && e.posMs < e.durMs * RESUME_MAX_FRAC;
}

/** Ponto de retomada: 2s antes da posição salva (nunca negativo). */
export function resumeTargetMs(posMs: number): number {
  return Math.max(0, posMs - RESUME_REWIND_MS);
}
