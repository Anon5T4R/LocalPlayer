import { describe, expect, it } from "vitest";

import { buildPlaylist, extOf, isMedia, isVideoExt, naturalCompare } from "../naturalSort";

describe("extOf / isMedia", () => {
  it("extensão em minúsculas", () => {
    expect(extOf("A.MP4")).toBe("mp4");
    expect(extOf("/x/y.FLAC")).toBe("flac");
    expect(extOf("semponto")).toBe("");
  });
  it("reconhece mídia", () => {
    expect(isMedia("a.mkv")).toBe(true);
    expect(isMedia("a.mp3")).toBe(true);
    expect(isMedia("a.txt")).toBe(false);
    expect(isMedia("a.exe")).toBe(false);
  });
  it("distingue vídeo de áudio", () => {
    expect(isVideoExt("a.mp4")).toBe(true);
    expect(isVideoExt("a.mp3")).toBe(false);
  });
});

describe("naturalCompare", () => {
  it("ordem numérica natural", () => {
    const arr = ["ep10.mkv", "ep2.mkv", "ep1.mkv"];
    arr.sort(naturalCompare);
    expect(arr).toEqual(["ep1.mkv", "ep2.mkv", "ep10.mkv"]);
  });
  it("ignora caixa e acento", () => {
    expect(naturalCompare("Ália.mp3", "alia.mp3")).toBe(0);
  });
  it("compara pelo nome, não pelo caminho", () => {
    expect(naturalCompare("/z/a.mp4", "/a/b.mp4")).toBeLessThan(0);
  });
});

describe("buildPlaylist", () => {
  it("filtra não-mídia e ordena", () => {
    const files = [
      "/v/nota.txt",
      "/v/ep10.mp4",
      "/v/ep1.mp4",
      "/v/capa.jpg",
      "/v/ep2.mp4",
    ];
    expect(buildPlaylist(files)).toEqual(["/v/ep1.mp4", "/v/ep2.mp4", "/v/ep10.mp4"]);
  });
  it("lista vazia quando não há mídia", () => {
    expect(buildPlaylist(["/v/a.txt", "/v/b.zip"])).toEqual([]);
  });
});
