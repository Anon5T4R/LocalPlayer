import { useEffect, useRef } from "react";

import { toggleFullscreen } from "../App";
import { stageRect } from "../lib/backend";
import { computeStageRect } from "../lib/stage";
import { t } from "../lib/i18n";
import { usePlayer } from "../state/store";
import { useUi } from "../state/ui";
import { ControlBar } from "./ControlBar";
import { Playlist } from "./Playlist";
import { IconAudio, IconSettings } from "./icons";

export function PlayerView() {
  const embedded = usePlayer((s) => s.embedded);
  const hasVideo = usePlayer((s) => s.hasVideo);
  const title = usePlayer((s) => s.title);
  const paused = usePlayer((s) => s.paused);
  const goHome = usePlayer((s) => s.goHome);

  const immersive = useUi((s) => s.immersive);
  const controlsVisible = useUi((s) => s.controlsVisible);
  const playlistOpen = useUi((s) => s.playlistOpen);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);
  const setControlsVisible = useUi((s) => s.setControlsVisible);

  const stageRef = useRef<HTMLDivElement>(null);

  // Sincroniza a child window do vídeo (Windows/embed) com o retângulo do #stage.
  // Coordenadas em pixels FÍSICOS (× devicePixelRatio). O vídeo some SÓ pra
  // modal/popover (o mpv cuida de áudio-puro sozinho); com o tooltip de prévia
  // aberto a faixa no rodapé do palco ENCOLHE o retângulo (âncora no topo) em
  // vez de esconder — o vídeo continua visível (ver computeStageRect). O efeito
  // depende SÓ de `embedded` e lê o resto via getState/subscribe — esconder no
  // cleanup a cada dep era uma corrida (comandos async chegam fora de ordem) que
  // deixava o vídeo invisível; agora o hide só acontece no unmount real.
  useEffect(() => {
    if (!embedded) return;
    const el = stageRef.current;
    if (!el) return;
    const report = () => {
      const r = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const rect = computeStageRect(r, dpr, useUi.getState());
      stageRect(rect.x, rect.y, rect.w, rect.h, rect.visible);
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    window.addEventListener("resize", report);
    const unsub = useUi.subscribe(report);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", report);
      unsub();
      stageRect(0, 0, 0, 0, false);
    };
  }, [embedded]);

  // Auto-ocultar controles no modo imersivo (mouse parado por 3 s). O cursor
  // some junto via CSS (data-chrome="hidden") e reaparece ao mover; sobre a
  // área do vídeo embutido quem esconde é o próprio mpv (--cursor-autohide).
  useEffect(() => {
    if (!immersive) {
      setControlsVisible(true);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const show = () => {
      setControlsVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => setControlsVisible(false), 3000);
    };
    show();
    window.addEventListener("mousemove", show);
    return () => {
      window.removeEventListener("mousemove", show);
      clearTimeout(timer);
    };
  }, [immersive, setControlsVisible]);

  const chromeHidden = immersive && !controlsVisible;

  // Duplo-clique no PALCO ALTERNA fullscreen (padrão de players). Fica só no
  // palco — nos controles/playlist o duplo-clique é das próprias ações (avançar,
  // selecionar...). No Windows a child window do vídeo ENGOLIRIA o clique antes
  // do WebView; o backend emite `video-dblclick` (embutido, ver App.tsx) e o
  // fullscreen é alternado por lá. toggleFullscreen mantém ui.fullscreen +
  // immersive em sincronia com o F e o botão da barra.
  return (
    <div
      className="player"
      data-chrome={chromeHidden ? "hidden" : "shown"}
      data-playlist={playlistOpen && !chromeHidden ? "open" : "closed"}
    >
      {!chromeHidden && (
        <div className="topbar">
          <button className="topbar-back" onClick={() => goHome()} title={t("player.home")}>
            ‹ {t("player.home")}
          </button>
          <div className="topbar-title" title={title}>
            {title || "LocalPlayer"}
          </div>
          <button className="ibtn" title={t("settings.title")} onClick={() => setSettingsOpen(true)}>
            <IconSettings size={18} />
          </button>
        </div>
      )}

      <div className="stage-wrap">
        <div
          className="stage"
          ref={stageRef}
          onClick={() => usePlayer.getState().togglePause()}
          onDoubleClick={() => void toggleFullscreen()}
        >
          {!embedded && (
            <div className="stage-msg">
              <p>{t("player.extWindow")}</p>
              <p className="stage-sub">{t("player.extWindowSub")}</p>
            </div>
          )}
          {embedded && !hasVideo && (
            <div className="nowplaying">
              <div className={paused ? "np-disc" : "np-disc spin"}>
                <IconAudio size={64} />
              </div>
              <div className="np-title">{title}</div>
              <div className="np-sub">{paused ? t("player.paused") : t("player.playing")}</div>
            </div>
          )}
        </div>

        {playlistOpen && !chromeHidden && <Playlist />}
      </div>

      {!chromeHidden && <ControlBar />}
    </div>
  );
}
