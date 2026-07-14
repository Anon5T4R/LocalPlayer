import { describe, expect, it } from "vitest";

import { basename, fmtSpeed, fmtTime, fmtVolume, stem } from "../format";

describe("fmtTime", () => {
  it("minutos:segundos", () => {
    expect(fmtTime(0)).toBe("0:00");
    expect(fmtTime(5)).toBe("0:05");
    expect(fmtTime(65)).toBe("1:05");
    expect(fmtTime(600)).toBe("10:00");
  });
  it("horas quando passa de 1h", () => {
    expect(fmtTime(3661)).toBe("1:01:01");
    expect(fmtTime(36000)).toBe("10:00:00");
  });
  it("trata inválidos como zero", () => {
    expect(fmtTime(NaN)).toBe("0:00");
    expect(fmtTime(-10)).toBe("0:00");
    expect(fmtTime(Infinity)).toBe("0:00");
  });
});

describe("fmtSpeed / fmtVolume", () => {
  it("velocidade", () => {
    expect(fmtSpeed(1)).toBe("1x");
    expect(fmtSpeed(1.5)).toBe("1.5x");
    expect(fmtSpeed(0.25)).toBe("0.25x");
    expect(fmtSpeed(0)).toBe("1x");
  });
  it("volume", () => {
    expect(fmtVolume(90)).toBe("90%");
    expect(fmtVolume(0)).toBe("0%");
    expect(fmtVolume(-3)).toBe("0%");
  });
});

describe("basename / stem", () => {
  it("caminho windows", () => {
    expect(basename("C:\\vídeos\\ep 1.mkv")).toBe("ep 1.mkv");
    expect(stem("C:\\vídeos\\ep 1.mkv")).toBe("ep 1");
  });
  it("caminho unix", () => {
    expect(basename("/home/joao/a.mp4")).toBe("a.mp4");
    expect(stem("/home/joao/a.mp4")).toBe("a");
  });
  it("sem extensão", () => {
    expect(stem("/x/LEIAME")).toBe("LEIAME");
  });
});
