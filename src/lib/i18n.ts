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
  "theme.nature": "Natureza",
  "theme.darkblue": "Azul escuro",
  "theme.calmgreen": "Verde calmo",
  "theme.pastelpink": "Rosa pastel",
  "theme.punkprincess": "PunkPrincess",

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
  "ctrl.back10": "Voltar 10s (J = 30s)",
  "ctrl.playpause": "Play/Pause (Espaço)",
  "ctrl.fwd10": "Avançar 10s (L = 30s)",
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
  "toast.resume": "Continuando de {time}",

  // --- rótulos GERADOS (mpvEvents) ---
  "track.n": "Faixa {n}",
  "track.external": "(externa)",
  "chapter.n": "Capítulo {n}",

  // --- Dados e armazenamento (B11) ---
  "storage.section": "Dados e armazenamento",
  "storage.path": "Pasta de dados",
  "storage.open": "Abrir",
  "storage.thumbs": "Cache de miniaturas",
  "storage.thumbsCounts": "{videos} vídeos em cache · {files} miniaturas · {live} ainda em uso",
  "storage.thumbsHint":
    "as prévias que aparecem ao passar o mouse na barra. É cache puro: o que for apagado aqui volta sozinho na próxima vez que o vídeo abrir.",
  "storage.resume": "Onde você parou",
  "storage.resumeCounts": "{n} vídeos com posição salva",
  "storage.resumeHint":
    "a posição de retomada de cada vídeo — isso não se recupera de lugar nenhum, e nenhum botão desta tela apaga.",
  "storage.stale": "Miniaturas de versões antigas",
  "storage.staleCounts": "{n} vídeos ({size})",
  "storage.staleHint":
    "o vídeo continua no lugar, mas foi reeditado ou regravado desde então — estas miniaturas são de uma versão que não existe mais. Risco zero: nada do que está em uso é tocado.",
  "storage.missing": "Miniaturas de vídeos não encontrados",
  "storage.missingCounts": "{n} vídeos ({size})",
  "storage.missingHint":
    "o arquivo não responde mais no caminho de origem. Atenção: se você MOVEU a sua biblioteca (outra pasta, outra letra de unidade), ela conta aqui — o app não tem como distinguir apagado de mudado de lugar. Nesse caso as miniaturas voltam a ser geradas na primeira vez que o vídeo abrir.",
  "storage.unlabeled": "Cache de versões anteriores",
  "storage.unlabeledCounts": "{n} vídeos ({size})",
  "storage.unlabeledHint":
    "pastas criadas antes desta versão, sem a etiqueta que diz a que vídeo pertencem. Como não dá pra saber, elas nunca entram nas limpezas acima — só saem no “limpar tudo”.",
  "storage.tmp": "Sobras de geração interrompida",
  "storage.tmpCounts": "{n} pastas ({size})",
  "storage.tmpHint":
    "pedaços deixados pra trás quando o app foi fechado no meio da geração. Nenhuma miniatura pronta sai junto.",
  "storage.all": "Limpar todo o cache de miniaturas",
  "storage.allHint":
    "apaga as miniaturas de todos os vídeos, inclusive as em uso. Nada além delas sai: a posição de retomada e as suas configurações ficam. Tudo é regerado ao abrir cada vídeo de novo.",
  "storage.clear": "Limpar",
  "storage.confirmTitle": "Confirmar limpeza",
  "storage.confirmStale":
    "Apagar as miniaturas de versões antigas? As miniaturas dos vídeos como estão hoje ficam.",
  "storage.confirmMissing":
    "Apagar as miniaturas dos vídeos que não estão mais no caminho de origem? Se você moveu a biblioteca, elas serão geradas de novo ao abrir cada vídeo. Nenhum vídeo seu é tocado.",
  "storage.confirmTmp": "Apagar as sobras de geração interrompida? Nenhuma miniatura pronta sai.",
  "storage.confirmAll":
    "Apagar TODO o cache de miniaturas? A posição de retomada de cada vídeo e as suas configurações continuam intactas, e as miniaturas voltam sozinhas conforme você for abrindo os vídeos.",
  "storage.confirmYes": "Sim, apagar",
  "storage.cancel": "Cancelar",
  "storage.freed": "Liberado {size} ({n} arquivos).",
  "storage.nothing": "Nada pra limpar aqui.",
  "storage.failed": "Falha na limpeza: {e}",
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
  "theme.nature": "Nature",
  "theme.darkblue": "Dark blue",
  "theme.calmgreen": "Calm green",
  "theme.pastelpink": "Pastel pink",
  "theme.punkprincess": "PunkPrincess",

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
  "ctrl.back10": "Back 10s (J = 30s)",
  "ctrl.playpause": "Play/Pause (Space)",
  "ctrl.fwd10": "Forward 10s (L = 30s)",
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
  "toast.resume": "Resuming from {time}",

  "track.n": "Track {n}",
  "track.external": "(external)",
  "chapter.n": "Chapter {n}",

  "storage.section": "Data and storage",
  "storage.path": "Data folder",
  "storage.open": "Open",
  "storage.thumbs": "Thumbnail cache",
  "storage.thumbsCounts": "{videos} cached videos · {files} thumbnails · {live} still in use",
  "storage.thumbsHint":
    "the previews you see when hovering the seek bar. Pure cache: anything deleted here comes back on its own the next time the video is opened.",
  "storage.resume": "Where you left off",
  "storage.resumeCounts": "{n} videos with a saved position",
  "storage.resumeHint":
    "the resume position of each video — it cannot be recovered from anywhere, and no button on this screen deletes it.",
  "storage.stale": "Thumbnails of older versions",
  "storage.staleCounts": "{n} videos ({size})",
  "storage.staleHint":
    "the video is still there, but it was re-edited or re-encoded since — these thumbnails belong to a version that no longer exists. Zero risk: nothing in use is touched.",
  "storage.missing": "Thumbnails of videos not found",
  "storage.missingCounts": "{n} videos ({size})",
  "storage.missingHint":
    "the file no longer answers at its original path. Careful: if you MOVED your library (another folder, another drive letter), it counts here — the app cannot tell deleted apart from moved. In that case the thumbnails are simply generated again the first time each video is opened.",
  "storage.unlabeled": "Cache from earlier versions",
  "storage.unlabeledCounts": "{n} videos ({size})",
  "storage.unlabeledHint":
    "folders created before this version, without the label saying which video they belong to. Since there is no way to know, they never enter the cleanups above — they only go with “clear everything”.",
  "storage.tmp": "Leftovers from interrupted generation",
  "storage.tmpCounts": "{n} folders ({size})",
  "storage.tmpHint":
    "pieces left behind when the app was closed mid-generation. No finished thumbnail goes with them.",
  "storage.all": "Clear the whole thumbnail cache",
  "storage.allHint":
    "deletes every video's thumbnails, including the ones in use. Nothing else goes: your resume positions and settings stay. Everything is regenerated as you open each video again.",
  "storage.clear": "Clear",
  "storage.confirmTitle": "Confirm cleanup",
  "storage.confirmStale":
    "Delete the thumbnails of older versions? The thumbnails of your videos as they are today stay.",
  "storage.confirmMissing":
    "Delete the thumbnails of videos no longer at their original path? If you moved your library they will be generated again as you open each video. None of your videos are touched.",
  "storage.confirmTmp":
    "Delete the leftovers from interrupted generation? No finished thumbnail goes with them.",
  "storage.confirmAll":
    "Delete the ENTIRE thumbnail cache? Every video's resume position and your settings stay intact, and thumbnails come back on their own as you open the videos.",
  "storage.confirmYes": "Yes, delete",
  "storage.cancel": "Cancel",
  "storage.freed": "Freed {size} ({n} files).",
  "storage.nothing": "Nothing to clean up here.",
  "storage.failed": "Cleanup failed: {e}",
};

const es: Record<MessageKey, string> = {
  "lang.title": "Idioma",
  "common.close": "Cerrar",
  "settings.title": "Configuración",
  "theme.title": "Tema",
  "theme.system": "Sistema",
  "theme.light": "Claro",
  "theme.dark": "Oscuro",
  "theme.nature": "Naturaleza",
  "theme.darkblue": "Azul oscuro",
  "theme.calmgreen": "Verde tranquilo",
  "theme.pastelpink": "Rosa pastel",
  "theme.punkprincess": "PunkPrincess",

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
  "ctrl.back10": "Retroceder 10s (J = 30s)",
  "ctrl.playpause": "Play/Pause (Espacio)",
  "ctrl.fwd10": "Avanzar 10s (L = 30s)",
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
  "toast.resume": "Continuando desde {time}",

  "track.n": "Pista {n}",
  "track.external": "(externa)",
  "chapter.n": "Capítulo {n}",

  "storage.section": "Datos y almacenamiento",
  "storage.path": "Carpeta de datos",
  "storage.open": "Abrir",
  "storage.thumbs": "Caché de miniaturas",
  "storage.thumbsCounts": "{videos} videos en caché · {files} miniaturas · {live} aún en uso",
  "storage.thumbsHint":
    "las vistas previas que aparecen al pasar el mouse por la barra. Es caché puro: lo que se borre aquí vuelve solo la próxima vez que se abra el video.",
  "storage.resume": "Dónde te quedaste",
  "storage.resumeCounts": "{n} videos con posición guardada",
  "storage.resumeHint":
    "la posición de reanudación de cada video — eso no se recupera de ninguna parte, y ningún botón de esta pantalla lo borra.",
  "storage.stale": "Miniaturas de versiones antiguas",
  "storage.staleCounts": "{n} videos ({size})",
  "storage.staleHint":
    "el video sigue en su lugar, pero fue reeditado o vuelto a codificar desde entonces — estas miniaturas son de una versión que ya no existe. Riesgo cero: nada de lo que está en uso se toca.",
  "storage.missing": "Miniaturas de videos no encontrados",
  "storage.missingCounts": "{n} videos ({size})",
  "storage.missingHint":
    "el archivo ya no responde en su ruta de origen. Atención: si MOVISTE tu biblioteca (otra carpeta, otra letra de unidad), cuenta aquí — la app no puede distinguir borrado de movido. En ese caso las miniaturas simplemente se generan de nuevo la primera vez que abras cada video.",
  "storage.unlabeled": "Caché de versiones anteriores",
  "storage.unlabeledCounts": "{n} videos ({size})",
  "storage.unlabeledHint":
    "carpetas creadas antes de esta versión, sin la etiqueta que dice a qué video pertenecen. Como no hay forma de saberlo, nunca entran en las limpiezas de arriba — solo salen con «limpiar todo».",
  "storage.tmp": "Restos de generación interrumpida",
  "storage.tmpCounts": "{n} carpetas ({size})",
  "storage.tmpHint":
    "trozos que quedaron cuando la app se cerró a mitad de la generación. Ninguna miniatura terminada se va con ellos.",
  "storage.all": "Limpiar toda la caché de miniaturas",
  "storage.allHint":
    "borra las miniaturas de todos los videos, incluidas las en uso. Nada más se va: tus posiciones de reanudación y tus ajustes se quedan. Todo se regenera al abrir cada video de nuevo.",
  "storage.clear": "Limpiar",
  "storage.confirmTitle": "Confirmar limpieza",
  "storage.confirmStale":
    "¿Borrar las miniaturas de versiones antiguas? Las miniaturas de tus videos tal como están hoy se quedan.",
  "storage.confirmMissing":
    "¿Borrar las miniaturas de los videos que ya no están en su ruta de origen? Si moviste tu biblioteca se generarán de nuevo al abrir cada video. Ninguno de tus videos se toca.",
  "storage.confirmTmp":
    "¿Borrar los restos de generación interrumpida? Ninguna miniatura terminada se va con ellos.",
  "storage.confirmAll":
    "¿Borrar TODA la caché de miniaturas? La posición de reanudación de cada video y tus ajustes quedan intactos, y las miniaturas vuelven solas a medida que abras los videos.",
  "storage.confirmYes": "Sí, borrar",
  "storage.cancel": "Cancelar",
  "storage.freed": "Liberado {size} ({n} archivos).",
  "storage.nothing": "Nada que limpiar aquí.",
  "storage.failed": "Error en la limpieza: {e}",
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
