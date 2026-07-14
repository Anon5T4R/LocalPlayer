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
  /** EXPERIMENTAL: embutir o vídeo na janela do app (Windows). O padrão é a
   * janela própria do mpv — o embed via child window briga com a composição do
   * WebView2 em alguns sistemas (tela preta/instável; visto na máquina do João). */
  embedVideo: boolean;
  mpvPath: string; // override do executável (Linux/config)
  theme: ThemePref;
  autoplayNext: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  rememberPosition: true,
  defaultVolume: 90,
  defaultSpeed: 1,
  embedVideo: false,
  mpvPath: "",
  theme: "system",
  autoplayNext: true,
};
