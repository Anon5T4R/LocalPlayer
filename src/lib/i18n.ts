import { useSyncExternalStore } from "react";

/**
 * i18n leve da UI (mesmo padrão do LocalPDF/LocalDraw). `pt` é a fonte da
 * verdade das chaves; `en`/`es` como `Record<MessageKey, string>` fazem o
 * compilador recusar chave faltando ou sobrando. Locale num store externo (não
 * React) pra `t()` rodar fora de componente (toasts/erros do store, rótulos
 * gerados de faixa/capítulo…). O App remonta na troca (key={locale} no main.tsx).
 *
 * NÃO passam por aqui (são domínio): nomes de faixa/legenda/áudio vindos do
 * arquivo (o mpv reporta), marca LocalPlayer, endônimos, propriedades/comandos
 * do mpv, chaves de localStorage, teclas de atalho e caminhos. Os rótulos que o
 * app GERA ("Faixa {n}", "(externa)", "Capítulo {n}", "Desligado") são
 * localizados.
 */

export type Locale = "pt" | "en" | "es";

/** Endônimos — NÃO traduzir (cada idioma no seu próprio nome). */
export const LOCALE_LABELS: Record<Locale, string> = {
  pt: "Português",
  en: "English",
  es: "Español",
};

/** Tag BCP-47 por locale (pra toLocaleString/datas/Intl, se preciso). */
const LOCALE_TAGS: Record<Locale, string> = {
  pt: "pt-BR",
  en: "en-US",
  es: "es-ES",
};

const LOCALE_KEY = "localplayer.locale";

const pt = {
  // --- comuns / idioma / tema / configurações ---
  "lang.title": "Idioma",
  "common.close": "Fechar",
  "settings.title": "Configurações",
  "theme.title": "Tema",
  "theme.system": "Sistema",
  "theme.light": "Claro",
  "theme.dark": "Escuro",

  // --- banner do mpv ausente ---
  "mpv.notFound": "mpv não encontrado.",
  "mpv.reinstall": "O runtime deveria vir com o instalador — reinstale pelo LocalHub.",
  "mpv.linuxPre": "No Linux o LocalPlayer usa o mpv do sistema: instale com ",
  "mpv.linuxPost": " e reabra o app.",

  // --- App (toasts) ---
  "app.mpvExited": "O mpv foi encerrado.",

  // --- HomeView ---
  "home.sub": "Seu player de vídeo e áudio — 100% local, sem nuvem.",
  "home.openFile": "Abrir arquivo",
  "home.openFolder": "Abrir pasta",
  "home.dragHint": "…ou arraste um arquivo pra cá.",
  "home.recents": "Recentes",
  "home.noMediaFolder": "Nenhum arquivo de mídia nessa pasta.",

  // --- filtros de diálogo de arquivo ---
  "dlg.media": "Mídia",
  "dlg.all": "Todos",
  "dlg.subtitles": "Legendas",

  // --- PlayerView ---
  "player.home": "Início",
  "player.extWindow": "🎬 O vídeo está tocando na janela do player.",
  "player.extWindowSub":
    "Controle por aqui (playlist, legendas, velocidade…) ou direto na janela do vídeo.",
  "player.paused": "Pausado",
  "player.playing": "Tocando",

  // --- ControlBar (títulos/menus) ---
  "ctrl.prev": "Anterior (P)",
  "ctrl.playpause": "Play/Pause (Espaço)",
  "ctrl.next": "Próximo (N)",
  "ctrl.mute": "Mudo (M)",
  "ctrl.speed": "Velocidade ({speed})",
  "ctrl.audioTrack": "Faixa de áudio",
  "ctrl.subtitles": "Legendas",
  "ctrl.subOff": "Desligado",
  "ctrl.loadSubFile": "+ Carregar arquivo…",
  "ctrl.chapters": "Capítulos",
  "ctrl.abLoop": "Loop A-B (R)",
  "ctrl.screenshot": "Print da tela (S)",
  "ctrl.playlist": "Playlist (Tab)",
  "ctrl.fullscreen": "Tela cheia (F)",

  // --- Playlist ---
  "pl.title": "Playlist · {count}",
  "pl.shuffle": "Aleatório",
  "pl.repeat.off": "Repetir: desligado",
  "pl.repeat.all": "Repetir: tudo",
  "pl.repeat.one": "Repetir: uma",

  // --- SettingsModal ---
  "set.rememberPos": "Lembrar a posição de cada vídeo",
  "set.autoplayNext": "Tocar o próximo da pasta ao terminar",
  "set.defaultVolume": "Volume inicial",
  "set.embed": "Embutir o vídeo na janela do app (experimental)",
  "set.embedNowOn": "Agora: embutido (padrão).",
  "set.embedNowOff": "Agora: janela própria do vídeo.",
  "set.embedHint":
    "Em alguns sistemas o embed fica preto/instável — nesse caso, desmarque. Reinicia a reprodução ao trocar.",
  "set.mpvPath": "Caminho do mpv",
  "set.mpvPathHint": "Vazio = usa o mpv do PATH do sistema.",
  "set.shortcutsLabel": "Atalhos:",
  "set.shortcutsBody":
    "Espaço = play · ← → 5s · J/L 30s · ↑↓ volume · M mudo · F tela cheia · T imersivo · N/P faixa · S print · [ ] velocidade · R loop A-B · Tab playlist · 0–9 pular %.",

  // --- store (erros/toasts) ---
  "err.mpvStart": "Não deu pra iniciar o mpv: {e}",
  "err.notMedia": "Formato não reconhecido como mídia.",
  "err.noMedia": "Nenhum arquivo de mídia reconhecido.",
  "err.openFail": "Falha ao abrir: {e}",
  "toast.noSubs": "Sem legendas nesta mídia.",
  "toast.screenshotSaved": "Print salvo (pasta de imagens do mpv).",
  "toast.abA": "Ponto A do loop marcado.",
  "toast.abNeedA": "Marque o ponto A primeiro (tecla R).",
  "toast.abOn": "Loop A-B ativo.",

  // --- rótulos GERADOS (mpvEvents) ---
  "track.n": "Faixa {n}",
  "track.external": "(externa)",
  "chapter.n": "Capítulo {n}",
} as const;

export type MessageKey = keyof typeof pt;

const en: Record<MessageKey, string> = {
  "lang.title": "Language",
  "common.close": "Close",
  "settings.title": "Settings",
  "theme.title": "Theme",
  "theme.system": "System",
  "theme.light": "Light",
  "theme.dark": "Dark",

  "mpv.notFound": "mpv not found.",
  "mpv.reinstall": "The runtime should ship with the installer — reinstall it from LocalHub.",
  "mpv.linuxPre": "On Linux, LocalPlayer uses the system mpv: install it with ",
  "mpv.linuxPost": " and reopen the app.",

  "app.mpvExited": "mpv was shut down.",

  "home.sub": "Your video and audio player — 100% local, no cloud.",
  "home.openFile": "Open file",
  "home.openFolder": "Open folder",
  "home.dragHint": "…or drag a file here.",
  "home.recents": "Recent",
  "home.noMediaFolder": "No media file in that folder.",

  "dlg.media": "Media",
  "dlg.all": "All",
  "dlg.subtitles": "Subtitles",

  "player.home": "Home",
  "player.extWindow": "🎬 The video is playing in the player window.",
  "player.extWindowSub":
    "Control it from here (playlist, subtitles, speed…) or right in the video window.",
  "player.paused": "Paused",
  "player.playing": "Playing",

  "ctrl.prev": "Previous (P)",
  "ctrl.playpause": "Play/Pause (Space)",
  "ctrl.next": "Next (N)",
  "ctrl.mute": "Mute (M)",
  "ctrl.speed": "Speed ({speed})",
  "ctrl.audioTrack": "Audio track",
  "ctrl.subtitles": "Subtitles",
  "ctrl.subOff": "Off",
  "ctrl.loadSubFile": "+ Load file…",
  "ctrl.chapters": "Chapters",
  "ctrl.abLoop": "A-B loop (R)",
  "ctrl.screenshot": "Screenshot (S)",
  "ctrl.playlist": "Playlist (Tab)",
  "ctrl.fullscreen": "Fullscreen (F)",

  "pl.title": "Playlist · {count}",
  "pl.shuffle": "Shuffle",
  "pl.repeat.off": "Repeat: off",
  "pl.repeat.all": "Repeat: all",
  "pl.repeat.one": "Repeat: one",

  "set.rememberPos": "Remember each video's position",
  "set.autoplayNext": "Play the next file in the folder when one ends",
  "set.defaultVolume": "Startup volume",
  "set.embed": "Embed the video in the app window (experimental)",
  "set.embedNowOn": "Now: embedded (default).",
  "set.embedNowOff": "Now: separate video window.",
  "set.embedHint":
    "On some systems the embed goes black/unstable — if so, uncheck it. Switching restarts playback.",
  "set.mpvPath": "mpv path",
  "set.mpvPathHint": "Empty = use the mpv on the system PATH.",
  "set.shortcutsLabel": "Shortcuts:",
  "set.shortcutsBody":
    "Space = play · ← → 5s · J/L 30s · ↑↓ volume · M mute · F fullscreen · T immersive · N/P track · S screenshot · [ ] speed · R A-B loop · Tab playlist · 0–9 jump %.",

  "err.mpvStart": "Couldn't start mpv: {e}",
  "err.notMedia": "Format not recognized as media.",
  "err.noMedia": "No media file recognized.",
  "err.openFail": "Failed to open: {e}",
  "toast.noSubs": "No subtitles in this media.",
  "toast.screenshotSaved": "Screenshot saved (mpv's images folder).",
  "toast.abA": "Loop point A set.",
  "toast.abNeedA": "Set point A first (R key).",
  "toast.abOn": "A-B loop active.",

  "track.n": "Track {n}",
  "track.external": "(external)",
  "chapter.n": "Chapter {n}",
};

const es: Record<MessageKey, string> = {
  "lang.title": "Idioma",
  "common.close": "Cerrar",
  "settings.title": "Configuración",
  "theme.title": "Tema",
  "theme.system": "Sistema",
  "theme.light": "Claro",
  "theme.dark": "Oscuro",

  "mpv.notFound": "mpv no encontrado.",
  "mpv.reinstall": "El runtime debería venir con el instalador — reinstálalo desde LocalHub.",
  "mpv.linuxPre": "En Linux, LocalPlayer usa el mpv del sistema: instálalo con ",
  "mpv.linuxPost": " y vuelve a abrir la app.",

  "app.mpvExited": "mpv se cerró.",

  "home.sub": "Tu reproductor de vídeo y audio — 100% local, sin nube.",
  "home.openFile": "Abrir archivo",
  "home.openFolder": "Abrir carpeta",
  "home.dragHint": "…o arrastra un archivo aquí.",
  "home.recents": "Recientes",
  "home.noMediaFolder": "Ningún archivo de medios en esa carpeta.",

  "dlg.media": "Medios",
  "dlg.all": "Todos",
  "dlg.subtitles": "Subtítulos",

  "player.home": "Inicio",
  "player.extWindow": "🎬 El vídeo se está reproduciendo en la ventana del reproductor.",
  "player.extWindowSub":
    "Contrólalo desde aquí (lista, subtítulos, velocidad…) o directamente en la ventana del vídeo.",
  "player.paused": "Pausado",
  "player.playing": "Reproduciendo",

  "ctrl.prev": "Anterior (P)",
  "ctrl.playpause": "Play/Pause (Espacio)",
  "ctrl.next": "Siguiente (N)",
  "ctrl.mute": "Silencio (M)",
  "ctrl.speed": "Velocidad ({speed})",
  "ctrl.audioTrack": "Pista de audio",
  "ctrl.subtitles": "Subtítulos",
  "ctrl.subOff": "Desactivado",
  "ctrl.loadSubFile": "+ Cargar archivo…",
  "ctrl.chapters": "Capítulos",
  "ctrl.abLoop": "Bucle A-B (R)",
  "ctrl.screenshot": "Captura de pantalla (S)",
  "ctrl.playlist": "Lista (Tab)",
  "ctrl.fullscreen": "Pantalla completa (F)",

  "pl.title": "Lista · {count}",
  "pl.shuffle": "Aleatorio",
  "pl.repeat.off": "Repetir: desactivado",
  "pl.repeat.all": "Repetir: todo",
  "pl.repeat.one": "Repetir: uno",

  "set.rememberPos": "Recordar la posición de cada vídeo",
  "set.autoplayNext": "Reproducir el siguiente de la carpeta al terminar",
  "set.defaultVolume": "Volumen inicial",
  "set.embed": "Incrustar el vídeo en la ventana de la app (experimental)",
  "set.embedNowOn": "Ahora: incrustado (predeterminado).",
  "set.embedNowOff": "Ahora: ventana propia del vídeo.",
  "set.embedHint":
    "En algunos sistemas el incrustado se pone negro/inestable — si es así, desmárcalo. Cambiar reinicia la reproducción.",
  "set.mpvPath": "Ruta de mpv",
  "set.mpvPathHint": "Vacío = usa el mpv del PATH del sistema.",
  "set.shortcutsLabel": "Atajos:",
  "set.shortcutsBody":
    "Espacio = play · ← → 5s · J/L 30s · ↑↓ volumen · M silencio · F pantalla completa · T inmersivo · N/P pista · S captura · [ ] velocidad · R bucle A-B · Tab lista · 0–9 saltar %.",

  "err.mpvStart": "No se pudo iniciar mpv: {e}",
  "err.notMedia": "Formato no reconocido como medio.",
  "err.noMedia": "Ningún archivo de medios reconocido.",
  "err.openFail": "Error al abrir: {e}",
  "toast.noSubs": "Sin subtítulos en este medio.",
  "toast.screenshotSaved": "Captura guardada (carpeta de imágenes de mpv).",
  "toast.abA": "Punto A del bucle marcado.",
  "toast.abNeedA": "Marca primero el punto A (tecla R).",
  "toast.abOn": "Bucle A-B activo.",

  "track.n": "Pista {n}",
  "track.external": "(externa)",
  "chapter.n": "Capítulo {n}",
};

const DICTS: Record<Locale, Record<MessageKey, string>> = { pt, en, es };

/** Palpite de locale pelo idioma do sistema (só no 1º uso). */
export function detectLocale(): Locale {
  const l = (typeof navigator !== "undefined" ? navigator.language : "pt").toLowerCase();
  if (l.startsWith("en")) return "en";
  if (l.startsWith("es")) return "es";
  return "pt";
}

function loadLocale(): Locale {
  const v = typeof localStorage !== "undefined" ? localStorage.getItem(LOCALE_KEY) : null;
  return v === "pt" || v === "en" || v === "es" ? v : detectLocale();
}

let current: Locale = loadLocale();
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale) {
  if (locale === current) return;
  current = locale;
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    /* localStorage indisponível */
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Inscreve o componente nas trocas de locale. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale);
}

/** Tag BCP-47 do locale atual ("pt-BR"/"en-US"/"es-ES"). */
export function localeTag(): string {
  return LOCALE_TAGS[current];
}

/** Traduz uma chave, interpolando placeholders `{param}`. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let msg: string = DICTS[current][key] ?? pt[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      msg = msg.split(`{${k}}`).join(String(v));
    }
  }
  return msg;
}
