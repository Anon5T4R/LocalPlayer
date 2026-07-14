import { open } from "@tauri-apps/plugin-dialog";

import { basename } from "../lib/format";
import { listDir } from "../lib/backend";
import { AUDIO_EXTS, buildPlaylist, VIDEO_EXTS } from "../lib/naturalSort";
import { usePlayer } from "../state/store";
import { useUi } from "../state/ui";
import { IconFile, IconFolder, IconSettings } from "./icons";

export function HomeView() {
  const openFile = usePlayer((s) => s.openFile);
  const openFiles = usePlayer((s) => s.openFiles);
  const recents = usePlayer((s) => s.recents);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);
  const toast = useUi((s) => s.toast);

  async function pickFile() {
    const sel = await open({
      multiple: false,
      filters: [
        { name: "Mídia", extensions: [...VIDEO_EXTS, ...AUDIO_EXTS] },
        { name: "Todos", extensions: ["*"] },
      ],
    });
    if (typeof sel === "string") void openFile(sel);
  }

  async function pickFolder() {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir !== "string") return;
    const files = await listDir(dir).catch(() => [] as string[]);
    const items = buildPlaylist(files);
    if (items.length === 0) {
      toast("info", "Nenhum arquivo de mídia nessa pasta.");
      return;
    }
    void openFiles(items);
  }

  return (
    <div className="home">
      <button className="home-settings" onClick={() => setSettingsOpen(true)} title="Configurações">
        <IconSettings />
      </button>

      <div className="home-hero">
        <div className="home-logo" aria-hidden>
          <svg viewBox="0 0 96 96" width="76" height="76">
            <circle cx="48" cy="48" r="44" className="logo-ring" />
            <path d="M40 34l24 14-24 14z" className="logo-play" />
          </svg>
        </div>
        <h1>LocalPlayer</h1>
        <p className="home-sub">Seu player de vídeo e áudio — 100% local, sem nuvem.</p>

        <div className="home-actions">
          <button className="btn primary" onClick={pickFile}>
            <IconFile /> Abrir arquivo
          </button>
          <button className="btn" onClick={pickFolder}>
            <IconFolder /> Abrir pasta
          </button>
        </div>
        <p className="home-hint">…ou arraste um arquivo pra cá.</p>
      </div>

      {recents.length > 0 && (
        <div className="home-recents">
          <h2>Recentes</h2>
          <ul>
            {recents.map((p) => (
              <li key={p}>
                <button className="recent" onClick={() => void openFile(p)} title={p}>
                  <IconFile size={16} />
                  <span className="recent-name">{basename(p)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
