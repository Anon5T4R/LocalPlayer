import { basename } from "../lib/format";
import { isVideoExt } from "../lib/naturalSort";
import type { Repeat } from "../lib/types";
import { usePlayer } from "../state/store";
import { useUi } from "../state/ui";
import { IconAudio, IconFile, IconRepeat, IconShuffle } from "./icons";

const REPEAT_NEXT: Record<Repeat, Repeat> = { off: "all", all: "one", one: "off" };
const REPEAT_LABEL: Record<Repeat, string> = {
  off: "Repetir: desligado",
  all: "Repetir: tudo",
  one: "Repetir: uma",
};

export function Playlist() {
  const items = usePlayer((s) => s.items);
  const index = usePlayer((s) => s.index);
  const repeat = usePlayer((s) => s.repeat);
  const shuffle = usePlayer((s) => s.shuffle);
  const playIndex = usePlayer((s) => s.playIndex);
  const setRepeat = usePlayer((s) => s.setRepeat);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const setPlaylistOpen = useUi((s) => s.setPlaylistOpen);

  return (
    <aside className="playlist">
      <div className="playlist-head">
        <span className="playlist-title">Playlist · {items.length}</span>
        <div className="playlist-tools">
          <button
            className={shuffle ? "ibtn active" : "ibtn"}
            title="Aleatório"
            onClick={() => toggleShuffle()}
          >
            <IconShuffle size={18} />
          </button>
          <button
            className={repeat !== "off" ? "ibtn active" : "ibtn"}
            title={REPEAT_LABEL[repeat]}
            onClick={() => setRepeat(REPEAT_NEXT[repeat])}
          >
            <IconRepeat size={18} />
            {repeat === "one" && <span className="repeat-one">1</span>}
          </button>
          <button className="ibtn" title="Fechar" onClick={() => setPlaylistOpen(false)}>
            ✕
          </button>
        </div>
      </div>
      <ul className="playlist-items">
        {items.map((p, i) => (
          <li key={p + i}>
            <button
              className={i === index ? "pl-item current" : "pl-item"}
              onClick={() => void playIndex(i)}
              title={p}
            >
              <span className="pl-icon">{isVideoExt(p) ? <IconFile size={16} /> : <IconAudio size={16} />}</span>
              <span className="pl-name">{basename(p)}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
