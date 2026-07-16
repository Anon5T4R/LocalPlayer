import type { ThemePref } from "../lib/types";
import { usePlayer } from "../state/store";
import { useUi } from "../state/ui";

export function SettingsModal() {
  const settings = usePlayer((s) => s.settings);
  const setSettings = usePlayer((s) => s.setSettings);
  const embedded = usePlayer((s) => s.embedded);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);

  const isWin = navigator.userAgent.includes("Windows");

  return (
    <div className="modal-backdrop" onMouseDown={() => setSettingsOpen(false)}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Configurações</h2>
          <button className="ibtn" onClick={() => setSettingsOpen(false)}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <label className="row">
            <span>Lembrar a posição de cada vídeo</span>
            <input
              type="checkbox"
              checked={settings.rememberPosition}
              onChange={(e) => void setSettings({ rememberPosition: e.target.checked })}
            />
          </label>

          <label className="row">
            <span>Tocar o próximo da pasta ao terminar</span>
            <input
              type="checkbox"
              checked={settings.autoplayNext}
              onChange={(e) => void setSettings({ autoplayNext: e.target.checked })}
            />
          </label>

          <label className="row">
            <span>Volume inicial</span>
            <span className="row-val">
              <input
                type="range"
                min={0}
                max={130}
                value={settings.defaultVolume}
                onChange={(e) => void setSettings({ defaultVolume: Number(e.target.value) })}
              />
              {settings.defaultVolume}%
            </span>
          </label>

          <label className="row">
            <span>Tema</span>
            <select
              value={settings.theme}
              onChange={(e) => void setSettings({ theme: e.target.value as ThemePref })}
            >
              <option value="system">Sistema</option>
              <option value="light">Claro</option>
              <option value="dark">Escuro</option>
            </select>
          </label>

          {isWin && (
            <label className="row">
              <span>
                Embutir o vídeo na janela do app (experimental)
                <small className="row-hint">
                  {embedded ? "Agora: embutido (padrão)." : "Agora: janela própria do vídeo."} Em alguns
                  sistemas o embed fica preto/instável — nesse caso, desmarque. Reinicia a reprodução ao trocar.
                </small>
              </span>
              <input
                type="checkbox"
                checked={settings.embedVideo}
                onChange={(e) => void setSettings({ embedVideo: e.target.checked })}
              />
            </label>
          )}

          {!isWin && (
            <label className="row">
              <span>
                Caminho do mpv
                <small className="row-hint">Vazio = usa o mpv do PATH do sistema.</small>
              </span>
              <input
                type="text"
                className="text-in"
                placeholder="/usr/bin/mpv"
                value={settings.mpvPath}
                onChange={(e) => void setSettings({ mpvPath: e.target.value })}
              />
            </label>
          )}
        </div>

        <div className="modal-foot">
          <p className="shortcuts">
            <strong>Atalhos:</strong> Espaço = play · ← → 5s · J/L 30s · ↑↓ volume · M mudo · F tela cheia · T
            imersivo · N/P faixa · S print · [ ] velocidade · R loop A-B · Tab playlist · 0–9 pular %.
          </p>
        </div>
      </div>
    </div>
  );
}
