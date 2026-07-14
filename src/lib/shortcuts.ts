// Mapa de atalhos de teclado → ação. Puro e testado. Os atalhos são tratados no
// HTML (o mpv está com --input-default-bindings=no e não captura teclado), então
// esta é a ÚNICA fonte de verdade dos atalhos.

export type Action =
  | "playpause"
  | "seekFwd"
  | "seekBack"
  | "seekFwdBig"
  | "seekBackBig"
  | "volUp"
  | "volDown"
  | "mute"
  | "fullscreen"
  | "immersive"
  | "next"
  | "prev"
  | "screenshot"
  | "speedUp"
  | "speedDown"
  | "speedReset"
  | "abLoop"
  | "playlist"
  | "escape"
  | `seekPct:${number}`;

export interface KeyEventLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  /** Se o foco está num campo de texto/input, ignoramos os atalhos. */
  inEditable?: boolean;
}

/** Resolve um evento de tecla numa ação, ou null se não houver atalho. */
export function resolveShortcut(e: KeyEventLike): Action | null {
  if (e.inEditable) return null;
  if (e.ctrlKey || e.metaKey || e.altKey) return null;

  const k = e.key;

  // Dígitos 0–9 → pular pra 0%–90% do vídeo.
  if (k.length === 1 && k >= "0" && k <= "9") {
    return `seekPct:${Number(k) * 10}` as Action;
  }

  switch (k) {
    case " ":
    case "Spacebar":
    case "k":
      return "playpause";
    case "ArrowRight":
      return "seekFwd";
    case "ArrowLeft":
      return "seekBack";
    case "l":
      return "seekFwdBig";
    case "j":
      return "seekBackBig";
    case "ArrowUp":
      return "volUp";
    case "ArrowDown":
      return "volDown";
    case "m":
      return "mute";
    case "f":
      return "fullscreen";
    case "t":
      return "immersive";
    case "n":
      return "next";
    case "p":
      return "prev";
    case "s":
      return "screenshot";
    case "]":
    case ".":
      return "speedUp";
    case "[":
    case ",":
      return "speedDown";
    case "Backspace":
      return "speedReset";
    case "r":
      return "abLoop";
    case "Tab":
      return "playlist";
    case "Escape":
      return "escape";
    default:
      return null;
  }
}
