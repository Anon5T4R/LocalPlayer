import { useRef, useState } from "react";

import { fmtTime } from "../lib/format";
import type { Chapter } from "../lib/types";

interface Props {
  duration: number;
  position: number;
  buffered: number;
  chapters: Chapter[];
  onSeek: (secs: number) => void;
}

export function Seekbar({ duration, position, buffered, chapters, onSeek }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);

  const dur = duration > 0 ? duration : 0;
  const shown = drag !== null ? drag : position;
  const pct = dur > 0 ? Math.min(100, (shown / dur) * 100) : 0;
  const bufPct = dur > 0 ? Math.min(100, (buffered / dur) * 100) : 0;

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
    if (el) setHover({ x: e.clientX - el.getBoundingClientRect().left, t });
  }
  function onUp() {
    if (drag !== null) {
      onSeek(drag);
      setDrag(null);
    }
  }

  return (
    <div className="seek">
      {hover && dur > 0 && (
        <div className="seek-tip" style={{ left: hover.x }}>
          {fmtTime(hover.t)}
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
