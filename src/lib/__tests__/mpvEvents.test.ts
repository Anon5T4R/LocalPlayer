import { beforeAll, describe, expect, it } from "vitest";

import { setLocale } from "../i18n";
import {
  hasRealVideo,
  interpretEvent,
  parseChapters,
  parseTracks,
  trackLabel,
} from "../mpvEvents";

// Os rótulos GERADOS (Capítulo/Faixa) saem no idioma da UI; fixa em pt pro teste
// ser determinístico independentemente do navigator.language do ambiente.
beforeAll(() => setLocale("pt"));

describe("interpretEvent", () => {
  it("property-change", () => {
    expect(
      interpretEvent({ event: "property-change", name: "time-pos", data: 12.5 }),
    ).toEqual({ kind: "prop", name: "time-pos", data: 12.5 });
  });
  it("end-file com motivo", () => {
    expect(interpretEvent({ event: "end-file", reason: "eof" })).toEqual({
      kind: "endFile",
      reason: "eof",
    });
  });
  it("file-loaded / start-file", () => {
    expect(interpretEvent({ event: "file-loaded" }).kind).toBe("fileLoaded");
    expect(interpretEvent({ event: "start-file" }).kind).toBe("startFile");
  });
  it("respostas de comando e lixo são ignoradas", () => {
    expect(interpretEvent({ request_id: 1, error: "success", data: 3 }).kind).toBe("ignore");
    expect(interpretEvent(null).kind).toBe("ignore");
    expect(interpretEvent("x").kind).toBe("ignore");
  });
});

describe("parseTracks", () => {
  const raw = [
    { id: 1, type: "video", selected: true, codec: "h264" },
    { id: 1, type: "audio", selected: true, lang: "por", title: "Dublado" },
    { id: 2, type: "audio", selected: false, lang: "eng" },
    { id: 1, type: "sub", selected: false, lang: "por", external: true },
    { id: 99, type: "attachment" },
  ];
  it("mapeia só faixas conhecidas", () => {
    const t = parseTracks(raw);
    expect(t).toHaveLength(4);
    expect(t[1]).toMatchObject({ id: 1, type: "audio", lang: "por", title: "Dublado", selected: true });
    expect(t[3].external).toBe(true);
  });
  it("lida com dados inválidos", () => {
    expect(parseTracks(undefined)).toEqual([]);
    expect(parseTracks("nao-array")).toEqual([]);
  });
});

describe("hasRealVideo", () => {
  it("vídeo real selecionado", () => {
    expect(hasRealVideo(parseTracks([{ id: 1, type: "video", selected: true, codec: "hevc" }]))).toBe(true);
  });
  it("capa de álbum não conta como vídeo", () => {
    expect(hasRealVideo(parseTracks([{ id: 1, type: "video", selected: true, codec: "mjpeg" }]))).toBe(false);
  });
  it("vídeo não selecionado não conta", () => {
    expect(hasRealVideo(parseTracks([{ id: 1, type: "video", selected: false, codec: "h264" }]))).toBe(false);
  });
});

describe("parseChapters", () => {
  it("mapeia e nomeia os sem título", () => {
    const c = parseChapters([{ title: "Intro", time: 0 }, { time: 90 }]);
    expect(c[0]).toEqual({ title: "Intro", time: 0 });
    expect(c[1]).toEqual({ title: "Capítulo 2", time: 90 });
  });
  it("dados inválidos → vazio", () => {
    expect(parseChapters(null)).toEqual([]);
  });
});

describe("trackLabel", () => {
  it("monta rótulo com idioma e título", () => {
    const [t] = parseTracks([{ id: 2, type: "audio", lang: "eng", title: "Comentários", selected: false }]);
    expect(trackLabel(t)).toBe("ENG · Comentários");
  });
  it("faixa sem metadados", () => {
    const [t] = parseTracks([{ id: 3, type: "sub", selected: false }]);
    expect(trackLabel(t)).toBe("Faixa 3");
  });
});
