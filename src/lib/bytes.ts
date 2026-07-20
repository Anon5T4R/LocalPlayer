/** Formatação de tamanhos em disco (painel "Dados e armazenamento"). */

const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/**
 * "0 B", "512 B", "1.4 MB", "2.9 GB" — base 1024.
 *
 * Bytes inteiros ficam sem decimal (não existe "512.0 B"); a partir de KB
 * mostra uma casa, que é a precisão útil quando o número serve pra decidir se
 * vale a pena limpar. Entrada inválida (NaN, negativo, undefined vindo de um
 * campo novo do backend) vira "0 B" em vez de "NaN undefined" na tela.
 */
export function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return unit === 0 ? `${Math.round(value)} B` : `${value.toFixed(1)} ${UNITS[unit]}`;
}
