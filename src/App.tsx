import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { HomeView } from "./components/HomeView";
import { PlayerView } from "./components/PlayerView";
import { SettingsModal } from "./components/SettingsModal";
import { Toasts } from "./components/Toasts";
import { getStartupFile, inTauri } from "./lib/backend";
import { t } from "./lib/i18n";
import { resolveShortcut, type Action } from "./lib/shortcuts";
import { usePlayer } from "./state/store";
import { useUi } from "./state/ui";

export default function App() {
  const boot = usePlayer((s) => s.boot);
  const applyRawEvent = usePlayer((s) => s.applyRawEvent);
  const handleMpvExit = usePlayer((s) => s.handleMpvExit);
  const openFile = usePlayer((s) => s.openFile);
  const openFiles = usePlayer((s) => s.openFiles);
  const ready = usePlayer((s) => s.ready);
  const theme = usePlayer((s) => s.settings.theme);
  const hasMedia = usePlayer((s) => s.index >= 0 && !!s.path);
  const settingsOpen = useUi((s) => s.settingsOpen);
  const immersive = useUi((s) => s.immersive);

  // Boot + assinatura dos eventos do mpv e de "abrir com".
  useEffect(() => {
    void boot();
    if (!inTauri()) return;

    const unsubs: Array<Promise<() => void>> = [];
    unsubs.push(listen<unknown>("mpv-event", (e) => applyRawEvent(e.payload)));
    unsubs.push(
      listen("mpv-exit", () => {
        handleMpvExit();
        useUi.getState().toast("info", t("app.mpvExited"));
      }),
    );
    unsubs.push(listen<string>("open-file", (e) => void openFile(e.payload)));
    unsubs.push(
      listen<{ path: string; index: number; file: string; count: number }>(
        "thumbs-ready",
        (e) => usePlayer.getState().applyThumbReady(e.payload),
      ),
    );
    unsubs.push(
      getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type === "drop" && event.payload.paths.length) {
          void openFiles(event.payload.paths);
        }
      }),
    );

    // Arquivo passado no launch ("Abrir com").
    void getStartupFile().then((f) => {
      if (f) void openFile(f);
    });

    // Fechamento do app: melhor-esforço de salvar a posição já (o invoke é
    // async e pode não completar — a gravação periódica de 5s é a garantia).
    const onUnload = () => usePlayer.getState().savePositionNow();
    window.addEventListener("beforeunload", onUnload);

    return () => {
      window.removeEventListener("beforeunload", onUnload);
      for (const u of unsubs) void u.then((fn) => fn());
    };
  }, [boot, applyRawEvent, handleMpvExit, openFile, openFiles]);

  // Tema (claro/escuro/sistema + temas nomeados).
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      if (theme !== "system" && theme !== "light" && theme !== "dark") {
        root.setAttribute("data-theme", theme);
        return;
      }
      const dark =
        theme === "dark" ||
        (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.setAttribute("data-theme", dark ? "dark" : "light");
    };
    apply();
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [theme]);

  // Atalhos globais de teclado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const inEditable =
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
      const action = resolveShortcut({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        inEditable,
      });
      if (!action) return;
      e.preventDefault();
      dispatch(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app" data-immersive={immersive ? "1" : undefined}>
      {ready === "no-mpv" && <MpvBanner />}
      {hasMedia ? <PlayerView /> : <HomeView />}
      {settingsOpen && <SettingsModal />}
      <Toasts />
    </div>
  );
}

function MpvBanner() {
  const isWin = navigator.userAgent.includes("Windows");
  return (
    <div className="mpv-banner">
      <strong>{t("mpv.notFound")}</strong>{" "}
      {isWin ? t("mpv.reinstall") : t("mpv.linuxPre")}
      {!isWin && <code>sudo apt install mpv</code>}
      {!isWin && t("mpv.linuxPost")}
    </div>
  );
}

// Traduz uma Action de atalho em chamadas de store. getState() evita closures velhas.
function dispatch(action: Action) {
  const p = usePlayer.getState();
  const ui = useUi.getState();

  if (action.startsWith("seekPct:")) {
    const pct = Number(action.split(":")[1]);
    p.seekPct(pct);
    return;
  }
  switch (action) {
    case "playpause":
      p.togglePause();
      break;
    case "seekFwd":
      p.seekRel(5);
      break;
    case "seekBack":
      p.seekRel(-5);
      break;
    case "seekFwdBig":
      p.seekRel(30);
      break;
    case "seekBackBig":
      p.seekRel(-30);
      break;
    case "volUp":
      p.nudgeVolume(5);
      break;
    case "volDown":
      p.nudgeVolume(-5);
      break;
    case "mute":
      p.toggleMute();
      break;
    case "fullscreen":
      void toggleFullscreen();
      break;
    case "immersive":
      ui.setImmersive(!ui.immersive);
      break;
    case "next":
      p.next();
      break;
    case "prev":
      p.prev();
      break;
    case "screenshot":
      p.screenshot();
      break;
    case "speedUp":
      p.nudgeSpeed(0.25);
      break;
    case "speedDown":
      p.nudgeSpeed(-0.25);
      break;
    case "speedReset":
      p.resetSpeed();
      break;
    case "abLoop":
      if (p.ab.a === null) p.setAbA();
      else if (p.ab.b === null) p.setAbB();
      else p.clearAb();
      break;
    case "playlist":
      ui.togglePlaylist();
      break;
    case "escape":
      if (ui.fullscreen) void toggleFullscreen();
      else if (ui.immersive) ui.setImmersive(false);
      else if (ui.settingsOpen) ui.setSettingsOpen(false);
      break;
  }
}

export async function toggleFullscreen() {
  const ui = useUi.getState();
  const next = !ui.fullscreen;
  try {
    await getCurrentWindow().setFullscreen(next);
    ui.setFullscreen(next);
    ui.setImmersive(next);
  } catch {
    /* fora do Tauri */
  }
}
