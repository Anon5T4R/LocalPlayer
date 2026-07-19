import { create } from "zustand";

export interface Toast {
  id: number;
  kind: "info" | "error" | "success";
  text: string;
}

interface UiState {
  toasts: Toast[];
  settingsOpen: boolean;
  playlistOpen: boolean;
  /** Modo imersivo: só o vídeo, controles auto-ocultos. */
  immersive: boolean;
  /** Fullscreen do SO ativo. */
  fullscreen: boolean;
  /** Controles visíveis (some depois de inatividade em imersivo/fullscreen). */
  controlsVisible: boolean;
  /** Algum popover/menu aberto — o embed do vídeo é escondido pra ele aparecer. */
  popoverOpen: boolean;
  /** Tooltip de prévia (thumb) da seekbar visível — mesmo trato do popover:
   *  o embed nativo fica ACIMA do HTML, então esconder é o único jeito de o
   *  tooltip aparecer sobre o palco. */
  seekPreview: boolean;

  toast(kind: Toast["kind"], text: string): void;
  dismissToast(id: number): void;
  setSettingsOpen(open: boolean): void;
  setPlaylistOpen(open: boolean): void;
  togglePlaylist(): void;
  setImmersive(on: boolean): void;
  setFullscreen(on: boolean): void;
  setControlsVisible(on: boolean): void;
  setPopoverOpen(on: boolean): void;
  setSeekPreview(on: boolean): void;
}

let nextToast = 1;

export const useUi = create<UiState>((set) => ({
  toasts: [],
  settingsOpen: false,
  playlistOpen: true,
  immersive: false,
  fullscreen: false,
  controlsVisible: true,
  popoverOpen: false,
  seekPreview: false,

  toast(kind, text) {
    const id = nextToast++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 5000);
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
  setSettingsOpen(open) {
    set({ settingsOpen: open });
  },
  setPlaylistOpen(open) {
    set({ playlistOpen: open });
  },
  togglePlaylist() {
    set((s) => ({ playlistOpen: !s.playlistOpen }));
  },
  setImmersive(on) {
    set({ immersive: on, controlsVisible: true });
  },
  setFullscreen(on) {
    set({ fullscreen: on });
  },
  setControlsVisible(on) {
    set({ controlsVisible: on });
  },
  setPopoverOpen(on) {
    set({ popoverOpen: on });
  },
  setSeekPreview(on) {
    // Dispara em mousemove: só seta se mudou (cada set notifica o report() do
    // PlayerView, que faz IPC stage_rect — sem isto seria um invoke por pixel).
    set((s) => (s.seekPreview === on ? s : { seekPreview: on }));
  },
}));
