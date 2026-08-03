// Cálculo puro do retângulo da janela de vídeo (child window no Windows / GLArea
// no Linux) a partir do retângulo CSS do #stage e do estado de UI. Quem aplica é
// o PlayerView via stageRect (IPC); aqui só a matemática, testável sem Tauri.
//
// O caso que importa: com o tooltip de prévia (thumb) aberto, o vídeo NÃO pode
// se esconder inteiro — a child window nativa fica ACIMA do HTML e cobriria o
// tooltip. Em vez disso o retângulo encolhe em altura (ancorado no topo),
// reservando uma faixa no rodapé do palco pra prévia renderizar desobstruída.

export interface StageCss {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StageUi {
  settingsOpen: boolean;
  popoverOpen: boolean;
  /** Altura (px CSS) da faixa de prévia reservada no rodapé do palco. */
  seekPreviewStrip: number;
}

export interface StageRectOut {
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
}

export function computeStageRect(css: StageCss, dpr: number, ui: StageUi): StageRectOut {
  const x = Math.round(css.x * dpr);
  const y = Math.round(css.y * dpr);
  const w = Math.round(css.width * dpr);
  const full = Math.round(css.height * dpr);
  // Modal/popover cobrem o palco inteiro: só o jeito antigo (esconder) funciona.
  if (ui.settingsOpen || ui.popoverOpen) {
    return { x, y, w, h: full, visible: false };
  }
  const strip = Math.ceil(ui.seekPreviewStrip * dpr);
  return { x, y, w, h: Math.max(0, full - strip), visible: true };
}
