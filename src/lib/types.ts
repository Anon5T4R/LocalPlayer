// Tipos compartilhados do player.

export type TrackType = "video" | "audio" | "sub";

export interface Track {
  id: number;
  type: TrackType;
  title?: string;
  lang?: string;
  selected: boolean;
  external?: boolean;
  codec?: string;
}

export interface Chapter {
  title: string;
  time: number; // segundos
}

export type Repeat = "off" | "one" | "all";
export type ThemePref = "system" | "light" | "dark";

export interface Settings {
  rememberPosition: boolean;
  defaultVolume: number; // 0–130
  defaultSpeed: number;
  /** Embutir o vídeo na janela do app (Windows). Default LIGADO desde que o
   * embed via child window foi validado (3 testes em 2 máquinas do João,
   * 2026-07-16). Segue marcado como "experimental" na UI: em alguns sistemas o
   * child window pode brigar com a composição do WebView2 (tela preta/instável)
   * — nesse caso, desmarcar cai na janela própria do mpv. */
  embedVideo: boolean;
  mpvPath: string; // override do executável (Linux/config)
  theme: ThemePref;
  autoplayNext: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  rememberPosition: true,
  defaultVolume: 90,
  defaultSpeed: 1,
  embedVideo: true,
  mpvPath: "",
  theme: "system",
  autoplayNext: true,
};
