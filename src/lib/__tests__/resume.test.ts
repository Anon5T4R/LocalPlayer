import { describe, expect, it } from "vitest";

import {
  parseResume,
  removeResume,
  RESUME_MAX,
  resumeTargetMs,
  shouldResume,
  upsertResume,
  type ResumeMap,
} from "../resume";

describe("shouldResume", () => {
  it("retoma no meio do filme", () => {
    expect(shouldResume({ posMs: 600_000, durMs: 3_600_000, ts: 1 })).toBe(true);
  });
  it("não retoma sem entrada", () => {
    expect(shouldResume(undefined)).toBe(false);
    expect(shouldResume(null)).toBe(false);
  });
  it("não retoma no comecinho (<= 30s)", () => {
    expect(shouldResume({ posMs: 30_000, durMs: 3_600_000, ts: 1 })).toBe(false);
    expect(shouldResume({ posMs: 29_999, durMs: 3_600_000, ts: 1 })).toBe(false);
    expect(shouldResume({ posMs: 30_001, durMs: 3_600_000, ts: 1 })).toBe(true);
  });
  it("não retoma no finzinho (>= 95%)", () => {
    expect(shouldResume({ posMs: 95_000, durMs: 100_000, ts: 1 })).toBe(false);
    expect(shouldResume({ posMs: 94_999, durMs: 100_000, ts: 1 })).toBe(true);
  });
  it("não retoma com duração inválida", () => {
    expect(shouldResume({ posMs: 60_000, durMs: 0, ts: 1 })).toBe(false);
    expect(shouldResume({ posMs: 60_000, durMs: -1, ts: 1 })).toBe(false);
  });
});

describe("resumeTargetMs", () => {
  it("volta 2s pra recuperar contexto", () => {
    expect(resumeTargetMs(60_000)).toBe(58_000);
  });
  it("nunca fica negativo", () => {
    expect(resumeTargetMs(1_000)).toBe(0);
    expect(resumeTargetMs(0)).toBe(0);
  });
});

describe("upsertResume (LRU)", () => {
  it("insere e atualiza sem mutar o mapa original", () => {
    const m0: ResumeMap = {};
    const m1 = upsertResume(m0, "a.mp4", 40_000, 100_000, 10);
    expect(m0).toEqual({});
    expect(m1["a.mp4"]).toEqual({ posMs: 40_000, durMs: 100_000, ts: 10 });
    const m2 = upsertResume(m1, "a.mp4", 50_000, 100_000, 20);
    expect(m2["a.mp4"].posMs).toBe(50_000);
    expect(Object.keys(m2)).toHaveLength(1);
  });

  it("despeja o mais ANTIGO ao passar do limite", () => {
    let m: ResumeMap = {};
    for (let i = 0; i < 5; i++) m = upsertResume(m, `v${i}`, 40_000, 100_000, i, 5);
    // Toca o v0 de novo: agora o mais velho é o v1.
    m = upsertResume(m, "v0", 41_000, 100_000, 100, 5);
    m = upsertResume(m, "novo", 40_000, 100_000, 101, 5);
    expect(Object.keys(m)).toHaveLength(5);
    expect(m["v1"]).toBeUndefined();
    expect(m["v0"]).toBeDefined();
    expect(m["novo"]).toBeDefined();
  });

  it("limite padrão é 500", () => {
    let m: ResumeMap = {};
    for (let i = 0; i < RESUME_MAX + 20; i++) {
      m = upsertResume(m, `v${i}`, 40_000, 100_000, i);
    }
    expect(Object.keys(m)).toHaveLength(RESUME_MAX);
    expect(m["v0"]).toBeUndefined();
    expect(m[`v${RESUME_MAX + 19}`]).toBeDefined();
  });
});

describe("removeResume", () => {
  it("remove sem mutar; caminho ausente devolve o mesmo mapa", () => {
    const m = upsertResume({}, "a.mp4", 40_000, 100_000, 1);
    const r = removeResume(m, "a.mp4");
    expect(r["a.mp4"]).toBeUndefined();
    expect(m["a.mp4"]).toBeDefined();
    expect(removeResume(m, "x.mp4")).toBe(m);
  });
});

describe("parseResume", () => {
  it("aceita o formato gravado", () => {
    const m = upsertResume({}, "a.mp4", 40_000, 100_000, 7);
    expect(parseResume(JSON.stringify(m))).toEqual(m);
  });
  it("lixo não derruba: JSON inválido, não-objeto, entrada torta", () => {
    expect(parseResume("not json")).toEqual({});
    expect(parseResume("[1,2]")).toEqual({});
    expect(parseResume("null")).toEqual({});
    const m = parseResume(
      JSON.stringify({
        ok: { posMs: 40_000, durMs: 100_000, ts: 1 },
        torta: { posMs: "x" },
        semTs: { posMs: 1, durMs: 2 },
      }),
    );
    expect(Object.keys(m).sort()).toEqual(["ok", "semTs"]);
    expect(m["semTs"].ts).toBe(0);
  });
});
