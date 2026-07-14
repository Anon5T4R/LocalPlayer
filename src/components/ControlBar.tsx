import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

import { toggleFullscreen } from "../App";
import { mpvAddSub } from "../lib/backend";
import { fmtSpeed, fmtTime, fmtVolume } from "../lib/format";
import { trackLabel } from "../lib/mpvEvents";
import { usePlayer } from "../state/store";
import { useUi } from "../state/ui";
import { Seekbar } from "./Seekbar";
import {
  IconAudio,
  IconCamera,
  IconCaptions,
  IconChapters,
  IconExitFullscreen,
  IconFullscreen,
  IconList,
  IconLoop,
  IconMute,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconSpeed,
  IconVolume,
} from "./icons";

type Menu = "audio" | "sub" | "chapters" | "speed" | null;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function ControlBar() {
  // Lição paga (v0.1.2, React #185): NUNCA assinar a store inteira (`useUi()`)
  // e usá-la como dep de efeito que faz set — cada set cria estado novo →
  // re-render → efeito → set → loop infinito que derruba o React (tela preta).
  // Selectors individuais + actions (estáveis) quebram o ciclo.
  const p = usePlayer();
  const playlistOpen = useUi((s) => s.playlistOpen);
  const fullscreen = useUi((s) => s.fullscreen);
  const togglePlaylist = useUi((s) => s.togglePlaylist);
  const setPopoverOpen = useUi((s) => s.setPopoverOpen);
  const [menu, setMenu] = useState<Menu>(null);

  useEffect(() => {
    setPopoverOpen(menu !== null);
  }, [menu, setPopoverOpen]);

  const audios = p.tracks.filter((t) => t.type === "audio");
  const subs = p.tracks.filter((t) => t.type === "sub");
  const abState = p.ab.a !== null && p.ab.b !== null ? "on" : p.ab.a !== null ? "half" : "off";

  async function addSub() {
    const sel = await open({
      multiple: false,
      filters: [{ name: "Legendas", extensions: ["srt", "ass", "ssa", "vtt", "sub"] }],
    });
    if (typeof sel === "string") {
      await mpvAddSub(sel).catch(() => {});
      setMenu(null);
    }
  }

  function cycleAb() {
    if (p.ab.a === null) p.setAbA();
    else if (p.ab.b === null) p.setAbB();
    else p.clearAb();
  }

  return (
    <div className="controls" onMouseDown={(e) => e.stopPropagation()}>
      <Seekbar
        duration={p.duration}
        position={p.position}
        buffered={p.buffered}
        chapters={p.chapters}
        onSeek={(s) => p.seekAbs(s)}
      />

      <div className="controls-row">
        <div className="controls-left">
          <IconBtn title="Anterior (P)" onClick={() => p.prev()}>
            <IconPrev />
          </IconBtn>
          <button className="play-btn" title="Play/Pause (Espaço)" onClick={() => p.togglePause()}>
            {p.paused ? <IconPlay size={26} /> : <IconPause size={26} />}
          </button>
          <IconBtn title="Próximo (N)" onClick={() => p.next()}>
            <IconNext />
          </IconBtn>

          <div className="time">
            <span>{fmtTime(p.position)}</span>
            <span className="time-sep">/</span>
            <span className="time-dur">{fmtTime(p.duration)}</span>
          </div>
        </div>

        <div className="controls-right">
          <div className="vol">
            <IconBtn title="Mudo (M)" onClick={() => p.toggleMute()}>
              {p.muted || p.volume === 0 ? <IconMute /> : <IconVolume />}
            </IconBtn>
            <input
              className="vol-slider"
              type="range"
              min={0}
              max={130}
              value={p.muted ? 0 : p.volume}
              onChange={(e) => p.setVolume(Number(e.target.value))}
              title={fmtVolume(p.volume)}
            />
          </div>

          <MenuBtn
            title={`Velocidade (${fmtSpeed(p.speed)})`}
            active={p.speed !== 1}
            open={menu === "speed"}
            onToggle={() => setMenu(menu === "speed" ? null : "speed")}
            icon={<IconSpeed />}
            label={fmtSpeed(p.speed)}
          >
            {SPEEDS.map((s) => (
              <button key={s} className={p.speed === s ? "mi active" : "mi"} onClick={() => { p.setSpeed(s); setMenu(null); }}>
                {fmtSpeed(s)}
              </button>
            ))}
          </MenuBtn>

          {audios.length > 0 && (
            <MenuBtn
              title="Faixa de áudio"
              active={false}
              open={menu === "audio"}
              onToggle={() => setMenu(menu === "audio" ? null : "audio")}
              icon={<IconAudio />}
            >
              {audios.map((t) => (
                <button
                  key={t.id}
                  className={p.aid === t.id ? "mi active" : "mi"}
                  onClick={() => { p.setTrack("aid", t.id); setMenu(null); }}
                >
                  {trackLabel(t)}
                </button>
              ))}
            </MenuBtn>
          )}

          <MenuBtn
            title="Legendas"
            active={p.sid !== "no"}
            open={menu === "sub"}
            onToggle={() => setMenu(menu === "sub" ? null : "sub")}
            icon={<IconCaptions />}
          >
            <button className={p.sid === "no" ? "mi active" : "mi"} onClick={() => { p.setTrack("sid", "no"); setMenu(null); }}>
              Desligado
            </button>
            {subs.map((t) => (
              <button
                key={t.id}
                className={p.sid === t.id ? "mi active" : "mi"}
                onClick={() => { p.setTrack("sid", t.id); setMenu(null); }}
              >
                {trackLabel(t)}
              </button>
            ))}
            <button className="mi mi-add" onClick={addSub}>
              + Carregar arquivo…
            </button>
          </MenuBtn>

          {p.chapters.length > 0 && (
            <MenuBtn
              title="Capítulos"
              active={false}
              open={menu === "chapters"}
              onToggle={() => setMenu(menu === "chapters" ? null : "chapters")}
              icon={<IconChapters />}
            >
              {p.chapters.map((c, i) => (
                <button
                  key={i}
                  className={p.chapterIndex === i ? "mi active" : "mi"}
                  onClick={() => { p.seekAbs(c.time); setMenu(null); }}
                >
                  <span className="mi-time">{fmtTime(c.time)}</span> {c.title}
                </button>
              ))}
            </MenuBtn>
          )}

          <IconBtn title="Loop A-B (R)" onClick={cycleAb} active={abState !== "off"}>
            <IconLoop />
          </IconBtn>

          {p.hasVideo && (
            <IconBtn title="Print da tela (S)" onClick={() => p.screenshot()}>
              <IconCamera />
            </IconBtn>
          )}

          <IconBtn title="Playlist (Tab)" onClick={() => togglePlaylist()} active={playlistOpen}>
            <IconList />
          </IconBtn>

          <IconBtn title="Tela cheia (F)" onClick={() => void toggleFullscreen()}>
            {fullscreen ? <IconExitFullscreen /> : <IconFullscreen />}
          </IconBtn>
        </div>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  active,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button className={active ? "ibtn active" : "ibtn"} title={title} onClick={onClick}>
      {children}
    </button>
  );
}

function MenuBtn({
  icon,
  label,
  title,
  active,
  open,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  label?: string;
  title: string;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggle();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onToggle]);

  return (
    <div className="menuwrap" ref={ref}>
      <button className={active || open ? "ibtn active" : "ibtn"} title={title} onClick={onToggle}>
        {icon}
        {label && <span className="ibtn-label">{label}</span>}
      </button>
      {open && <div className="menu">{children}</div>}
    </div>
  );
}
