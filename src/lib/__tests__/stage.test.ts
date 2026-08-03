import { describe, expect, it } from "vitest";

import { computeStageRect } from "../stage";

const base = { x: 10, y: 20, width: 800, height: 450 };

describe("computeStageRect", () => {
  it("palco cheio, visível, sem prévia", () => {
    expect(computeStageRect(base, 1, { settingsOpen: false, popoverOpen: false, seekPreviewStrip: 0 })).toEqual({
      x: 10,
      y: 20,
      w: 800,
      h: 450,
      visible: true,
    });
  });

  it("converte CSS → pixels físicos (dpr)", () => {
    const r = computeStageRect(base, 1.5, { settingsOpen: false, popoverOpen: false, seekPreviewStrip: 0 });
    expect(r).toEqual({ x: 15, y: 30, w: 1200, h: 675, visible: true });
  });

  it("settings aberto = esconde (tamanho cheio)", () => {
    const r = computeStageRect(base, 1, { settingsOpen: true, popoverOpen: false, seekPreviewStrip: 0 });
    expect(r.visible).toBe(false);
    expect(r.h).toBe(450);
  });

  it("popover aberto = esconde", () => {
    const r = computeStageRect(base, 1, { settingsOpen: false, popoverOpen: true, seekPreviewStrip: 0 });
    expect(r.visible).toBe(false);
  });

  it("modal/popover têm precedência sobre a faixa de prévia", () => {
    const r = computeStageRect(base, 1, { settingsOpen: true, popoverOpen: false, seekPreviewStrip: 100 });
    expect(r.visible).toBe(false);
    expect(r.h).toBe(450);
  });

  it("prévia: encolhe a ALTURA (âncora no topo), mantém x/y/w", () => {
    const r = computeStageRect(base, 1, { settingsOpen: false, popoverOpen: false, seekPreviewStrip: 120 });
    expect(r).toEqual({ x: 10, y: 20, w: 800, h: 330, visible: true });
  });

  it("prévia com dpr fracionário arredonda a faixa PRA CIMA", () => {
    const r = computeStageRect(base, 1.25, { settingsOpen: false, popoverOpen: false, seekPreviewStrip: 90 });
    // 90*1.25 = 112.5 → 113 (nunca menos que o tooltip precisa)
    expect(r.h).toBe(Math.round(450 * 1.25) - 113);
  });

  it("faixa maior que o palco nunca deixa altura negativa", () => {
    const r = computeStageRect({ ...base, height: 50 }, 1, {
      settingsOpen: false,
      popoverOpen: false,
      seekPreviewStrip: 200,
    });
    expect(r.h).toBe(0);
    expect(r.visible).toBe(true);
  });
});
