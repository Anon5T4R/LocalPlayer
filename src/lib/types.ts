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
  separateWindow: boolean; // força janela própria do mpv (Plano B) mesmo no Windows
  mpvPath: string; // override do executável (Linux/config)
  theme: ThemePref;
  autoplayNext: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  rememberPosition: true,
  defaultVolume: 90,
  defaultSpeed: 1,
  separateWindow: false,
  mpvPath: "",
  theme: "system",
  autoplayNext: true,
};
