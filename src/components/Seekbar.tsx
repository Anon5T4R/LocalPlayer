import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

import { fmtTime } from "../lib/format";
import { nearestReady, thumbIndexFor } from "../lib/thumbs";
import type { Chapter } from "../lib/types";
import { useUi } from "../state/ui";

interface Props {
  duration: number;
  position: number;
  buffered: number;
  chapters: Chapter[];
  /** Miniaturas da timeline (null = sem vídeo/ainda gerando; buracos = null). */
  thumbs: ReadonlyArray<string | null> | null;
  onSeek: (secs: number) => void;
}

export function Seekbar({ duration, position, buffered, chapters, thumbs, onSeek }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [hover, setHover] = useState<{ x: number; w: number; t: number } | null>(null);
  const setSeekPreview = useUi((s) => s.setSeekPreview);

  const dur = duration > 0 ? duration : 0;
  const shown = drag !== null ? drag : position;
  const pct = dur > 0 ? Math.min(100, (shown / dur) * 100) : 0;
  const bufPct = dur > 0 ? Math.min(100, (buffered / dur) * 100) : 0;

  // A thumb PRONTA mais próxima do ponto sob o mouse (null = tooltip só-tempo).
  const thumbSrc =
    hover && dur > 0 && thumbs
      ? nearestReady(thumbs, thumbIndexFor(hover.t / dur, thumbs.length))
      : null;

  // O tooltip com thumb fica ACIMA da barra — sobre o palco. No embed (Windows)
  // o vídeo é uma child window nativa SOBRE o webview, então o palco precisa se
  // esconder enquanto a prévia está visível (mesmo trato dos menus/popovers).
  useEffect(() => {
    setSeekPreview(thumbSrc !== null);
  }, [thumbSrc, setSeekPreview]);
  // Desmontou com a prévia aberta (imersivo escondeu os controles)? Solta o palco.
  useEffect(() => () => setSeekPreview(false), [setSeekPreview]);

  function timeAt(clientX: number): number {
    const el = ref.current;
    if (!el || dur <= 0) return 0;
    const r = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    return frac * dur;
  }

  function onDown(e: React.PointerEvent) {
    if (dur <= 0) return;
    // Blindada: com pointer não-ativo (evento sintético) o setPointerCapture
    // lança NotFoundError e mataria o seek inteiro.
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* segue sem captura */
    }
    setDrag(timeAt(e.clientX));
  }
  function onMove(e: React.PointerEvent) {
    const t = timeAt(e.clientX);
    if (drag !== null) setDrag(t);
    const el = ref.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setHover({ x: e.clientX - r.left, w: r.width, t });
    }
  }
  function onUp() {
    if (drag !== null) {
      onSeek(drag);
      setDrag(null);
    }
  }

  // Não deixa o tooltip vazar pelas bordas (thumb de 160px é largo).
  const half = thumbSrc ? 86 : 30;
  const tipLeft = hover ? Math.min(Math.max(hover.x, half), Math.max(half, hover.w - half)) : 0;

  return (
    <div className="seek">
      {hover && dur > 0 && (
        <div className={thumbSrc ? "seek-tip has-thumb" : "seek-tip"} style={{ left: tipLeft }}>
          {thumbSrc && <img className="seek-tip-img" src={convertFileSrc(thumbSrc)} alt="" />}
          <div className="seek-tip-time">{fmtTime(hover.t)}</div>
        </div>
      )}
      <div
        className="seek-track"
        ref={ref}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => setHover(null)}
      >
        <div className="seek-buffered" style={{ width: `${bufPct}%` }} />
        <div className="seek-played" style={{ width: `${pct}%` }} />
        {dur > 0 &&
          chapters.map((c, i) =>
            c.time > 0 && c.time < dur ? (
              <span key={i} className="seek-chapter" style={{ left: `${(c.time / dur) * 100}%` }} title={c.title} />
            ) : null,
          )}
        <div className="seek-thumb" style={{ left: `${pct}%` }} />
      </div>
    </div>
  );
}
