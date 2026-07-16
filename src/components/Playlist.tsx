import { basename } from "../lib/format";
import { t, type MessageKey } from "../lib/i18n";
import { isVideoExt } from "../lib/naturalSort";
import type { Repeat } from "../lib/types";
import { usePlayer } from "../state/store";
import { useUi } from "../state/ui";
import { IconAudio, IconFile, IconRepeat, IconShuffle } from "./icons";

const REPEAT_NEXT: Record<Repeat, Repeat> = { off: "all", all: "one", one: "off" };
// Guarda a CHAVE (não o texto): o rótulo é resolvido via t() em render, pra
// reagir à troca de idioma no remount.
const REPEAT_LABEL_KEY: Record<Repeat, MessageKey> = {
  off: "pl.repeat.off",
  all: "pl.repeat.all",
  one: "pl.repeat.one",
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
        <span className="playlist-title">{t("pl.title", { count: items.length })}</span>
        <div className="playlist-tools">
          <button
            className={shuffle ? "ibtn active" : "ibtn"}
            title={t("pl.shuffle")}
            onClick={() => toggleShuffle()}
          >
            <IconShuffle size={18} />
          </button>
          <button
            className={repeat !== "off" ? "ibtn active" : "ibtn"}
            title={t(REPEAT_LABEL_KEY[repeat])}
            onClick={() => setRepeat(REPEAT_NEXT[repeat])}
          >
            <IconRepeat size={18} />
            {repeat === "one" && <span className="repeat-one">1</span>}
          </button>
          <button className="ibtn" title={t("common.close")} onClick={() => setPlaylistOpen(false)}>
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
