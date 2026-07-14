import { useEffect, useRef } from "react";

import { stageRect } from "../lib/backend";
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
  const setImmersive = useUi((s) => s.setImmersive);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);
  const setControlsVisible = useUi((s) => s.setControlsVisible);

  const stageRef = useRef<HTMLDivElement>(null);

  // Sincroniza a child window do vídeo (Windows/embed) com o retângulo do #stage.
  // Coordenadas em pixels FÍSICOS (× devicePixelRatio). Só esconde pra modal/
  // popover aparecer por cima (o mpv cuida de áudio-puro sozinho). O efeito
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
      const ui = useUi.getState();
      const visible = !ui.settingsOpen && !ui.popoverOpen;
      stageRect(
        Math.round(r.left * dpr),
        Math.round(r.top * dpr),
        Math.round(r.width * dpr),
        Math.round(r.height * dpr),
        visible,
      );
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

  // Auto-ocultar controles no modo imersivo (mouse parado por 2,5 s).
  useEffect(() => {
    if (!immersive) {
      setControlsVisible(true);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const show = () => {
      setControlsVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => setControlsVisible(false), 2500);
    };
    show();
    window.addEventListener("mousemove", show);
    return () => {
      window.removeEventListener("mousemove", show);
      clearTimeout(timer);
    };
  }, [immersive, setControlsVisible]);

  const chromeHidden = immersive && !controlsVisible;

  return (
    <div
      className="player"
      data-chrome={chromeHidden ? "hidden" : "shown"}
      data-playlist={playlistOpen && !chromeHidden ? "open" : "closed"}
      onDoubleClick={() => setImmersive(!immersive)}
    >
      {!chromeHidden && (
        <div className="topbar">
          <button className="topbar-back" onClick={() => goHome()} title="Início">
            ‹ Início
          </button>
          <div className="topbar-title" title={title}>
            {title || "LocalPlayer"}
          </div>
          <button className="ibtn" title="Configurações" onClick={() => setSettingsOpen(true)}>
            <IconSettings size={18} />
          </button>
        </div>
      )}

      <div className="stage-wrap">
        <div className="stage" ref={stageRef} onClick={() => usePlayer.getState().togglePause()}>
          {!embedded && (
            <div className="stage-msg">
              <p>🎬 O vídeo está tocando na janela do player.</p>
              <p className="stage-sub">
                Controle por aqui (playlist, legendas, velocidade…) ou direto na janela do vídeo.
              </p>
            </div>
          )}
          {embedded && !hasVideo && (
            <div className="nowplaying">
              <div className={paused ? "np-disc" : "np-disc spin"}>
                <IconAudio size={64} />
              </div>
              <div className="np-title">{title}</div>
              <div className="np-sub">{paused ? "Pausado" : "Tocando"}</div>
            </div>
          )}
        </div>

        {playlistOpen && !chromeHidden && <Playlist />}
      </div>

      {!chromeHidden && <ControlBar />}
    </div>
  );
}
