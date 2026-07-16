import { t } from "../lib/i18n";
import type { ThemePref } from "../lib/types";
import { usePlayer } from "../state/store";
import { useUi } from "../state/ui";
import LocalePicker from "./LocalePicker";

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
          <h2>{t("settings.title")}</h2>
          <button className="ibtn" onClick={() => setSettingsOpen(false)}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <label className="row">
            <span>{t("set.rememberPos")}</span>
            <input
              type="checkbox"
              checked={settings.rememberPosition}
              onChange={(e) => void setSettings({ rememberPosition: e.target.checked })}
            />
          </label>

          <label className="row">
            <span>{t("set.autoplayNext")}</span>
            <input
              type="checkbox"
              checked={settings.autoplayNext}
              onChange={(e) => void setSettings({ autoplayNext: e.target.checked })}
            />
          </label>

          <label className="row">
            <span>{t("set.defaultVolume")}</span>
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
            <span>{t("theme.title")}</span>
            <select
              value={settings.theme}
              onChange={(e) => void setSettings({ theme: e.target.value as ThemePref })}
            >
              <option value="system">{t("theme.system")}</option>
              <option value="light">{t("theme.light")}</option>
              <option value="dark">{t("theme.dark")}</option>
            </select>
          </label>

          <label className="row">
            <span>{t("lang.title")}</span>
            <LocalePicker />
          </label>

          {isWin && (
            <label className="row">
              <span>
                {t("set.embed")}
                <small className="row-hint">
                  {embedded ? t("set.embedNowOn") : t("set.embedNowOff")} {t("set.embedHint")}
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
                {t("set.mpvPath")}
                <small className="row-hint">{t("set.mpvPathHint")}</small>
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
            <strong>{t("set.shortcutsLabel")}</strong> {t("set.shortcutsBody")}
          </p>
        </div>
      </div>
    </div>
  );
}
