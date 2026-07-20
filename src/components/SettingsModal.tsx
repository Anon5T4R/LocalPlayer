import { useCallback, useEffect, useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import * as backend from "../lib/backend";
import { fmtBytes } from "../lib/bytes";
import { t, type MessageKey } from "../lib/i18n";
import type { ThemePref } from "../lib/types";
import { usePlayer } from "../state/store";
import { useUi } from "../state/ui";
import LocalePicker from "./LocalePicker";

/** As quatro limpezas do painel; `confirm` é a pergunta que precede cada uma. */
type CleanKind = "stale" | "missing" | "tmp" | "all";
const CONFIRM: Record<CleanKind, MessageKey> = {
  stale: "storage.confirmStale",
  missing: "storage.confirmMissing",
  tmp: "storage.confirmTmp",
  all: "storage.confirmAll",
};

export function SettingsModal() {
  const settings = usePlayer((s) => s.settings);
  const setSettings = usePlayer((s) => s.setSettings);
  const embedded = usePlayer((s) => s.embedded);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);
  const toast = useUi((s) => s.toast);

  const isWin = navigator.userAgent.includes("Windows");

  const [info, setInfo] = useState<backend.StorageInfo | null>(null);
  const [confirm, setConfirm] = useState<CleanKind | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!backend.inTauri()) return;
    try {
      setInfo(await backend.storageInfo());
    } catch {
      setInfo(null);
    }
  }, []);

  // Remede a cada abertura: o cache cresce enquanto o usuário assiste.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runClean(kind: CleanKind) {
    setConfirm(null);
    setBusy(true);
    try {
      const freed =
        kind === "stale"
          ? await backend.storageClearStale()
          : kind === "missing"
            ? await backend.storageClearMissing()
            : kind === "tmp"
              ? await backend.storageClearTmp()
              : await backend.storageClearAllThumbs();
      toast(
        "success",
        freed.files === 0
          ? t("storage.nothing")
          : t("storage.freed", { size: fmtBytes(freed.bytes), n: freed.files }),
      );
      await refresh();
    } catch (e) {
      toast("error", t("storage.failed", { e: String(e) }));
    } finally {
      setBusy(false);
    }
  }

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
              <option value="nature">{t("theme.nature")}</option>
              <option value="darkblue">{t("theme.darkblue")}</option>
              <option value="calmgreen">{t("theme.calmgreen")}</option>
              <option value="pastelpink">{t("theme.pastelpink")}</option>
              <option value="punkprincess">{t("theme.punkprincess")}</option>
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

          {info && (
            <div className="storage">
              <h3>{t("storage.section")}</h3>

              <div className="storage-row">
                <div className="storage-label">
                  <span>{t("storage.path")}</span>
                  <code className="storage-dir" title={info.dir}>
                    {info.dir}
                  </code>
                </div>
                <button className="btn" onClick={() => void openPath(info.dir).catch(() => {})}>
                  {t("storage.open")}
                </button>
              </div>

              <div className="storage-row">
                <div className="storage-label">
                  <span>
                    {t("storage.thumbs")} — <strong>{fmtBytes(info.thumbsBytes)}</strong>
                  </span>
                  <small>
                    {t("storage.thumbsCounts", {
                      videos: info.cachedVideos,
                      files: info.thumbsFiles,
                      live: info.liveCount,
                    })}
                  </small>
                  <small>{t("storage.thumbsHint")}</small>
                </div>
              </div>

              {/* Medido e nunca apagado — o artefato caro daqui. */}
              <div className="storage-row">
                <div className="storage-label">
                  <span>
                    {t("storage.resume")} — <strong>{fmtBytes(info.resumeBytes)}</strong>
                  </span>
                  <small>{t("storage.resumeCounts", { n: info.resumeEntries })}</small>
                  <small>{t("storage.resumeHint")}</small>
                </div>
              </div>

              <div className="storage-row">
                <div className="storage-label">
                  <span>{t("storage.stale")}</span>
                  <small>
                    {t("storage.staleCounts", {
                      n: info.staleCount,
                      size: fmtBytes(info.staleBytes),
                    })}
                  </small>
                  <small>{t("storage.staleHint")}</small>
                </div>
                <button
                  className="btn"
                  disabled={busy || info.staleCount === 0}
                  onClick={() => setConfirm("stale")}
                >
                  {t("storage.clear")}
                </button>
              </div>

              <div className="storage-row">
                <div className="storage-label">
                  <span>{t("storage.missing")}</span>
                  <small>
                    {t("storage.missingCounts", {
                      n: info.missingCount,
                      size: fmtBytes(info.missingBytes),
                    })}
                  </small>
                  <small>{t("storage.missingHint")}</small>
                </div>
                <button
                  className="btn"
                  disabled={busy || info.missingCount === 0}
                  onClick={() => setConfirm("missing")}
                >
                  {t("storage.clear")}
                </button>
              </div>

              {/* Só aparece se houver: numa instalação nova esta linha nunca
                  existe, e explicar um balde vazio só confunde. */}
              {info.unlabeledCount > 0 && (
                <div className="storage-row">
                  <div className="storage-label">
                    <span>{t("storage.unlabeled")}</span>
                    <small>
                      {t("storage.unlabeledCounts", {
                        n: info.unlabeledCount,
                        size: fmtBytes(info.unlabeledBytes),
                      })}
                    </small>
                    <small>{t("storage.unlabeledHint")}</small>
                  </div>
                </div>
              )}

              <div className="storage-row">
                <div className="storage-label">
                  <span>{t("storage.tmp")}</span>
                  <small>
                    {t("storage.tmpCounts", { n: info.tmpCount, size: fmtBytes(info.tmpBytes) })}
                  </small>
                  <small>{t("storage.tmpHint")}</small>
                </div>
                <button
                  className="btn"
                  disabled={busy || info.tmpCount === 0}
                  onClick={() => setConfirm("tmp")}
                >
                  {t("storage.clear")}
                </button>
              </div>

              <div className="storage-row">
                <div className="storage-label">
                  <span>{t("storage.all")}</span>
                  <small>{t("storage.allHint")}</small>
                </div>
                <button
                  className="btn danger"
                  disabled={busy || info.thumbsFiles === 0}
                  onClick={() => setConfirm("all")}
                >
                  {t("storage.clear")}
                </button>
              </div>

              {confirm && (
                <div className="storage-confirm">
                  <strong>{t("storage.confirmTitle")}</strong>
                  <p>{t(CONFIRM[confirm])}</p>
                  <div className="storage-confirm-actions">
                    <button className="btn" onClick={() => setConfirm(null)}>
                      {t("storage.cancel")}
                    </button>
                    <button className="btn danger" onClick={() => void runClean(confirm)}>
                      {t("storage.confirmYes")}
                    </button>
                  </div>
                </div>
              )}
            </div>
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
