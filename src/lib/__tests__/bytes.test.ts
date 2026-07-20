import { describe, expect, it } from "vitest";
import { fmtBytes } from "../bytes";

describe("fmtBytes", () => {
  it("formata as faixas com a precisão útil pra decidir se vale limpar", () => {
    expect(fmtBytes(0)).toBe("0 B");
    expect(fmtBytes(512)).toBe("512 B");
    expect(fmtBytes(1024)).toBe("1.0 KB");
    expect(fmtBytes(1536)).toBe("1.5 KB");
    expect(fmtBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(fmtBytes(3.2 * 1024 ** 3)).toBe("3.2 GB");
  });

  it("byte inteiro não ganha decimal", () => {
    expect(fmtBytes(1)).toBe("1 B");
    expect(fmtBytes(1023)).toBe("1023 B");
  });

  it("entrada inválida vira 0 B em vez de 'NaN undefined' na tela", () => {
    expect(fmtBytes(NaN)).toBe("0 B");
    expect(fmtBytes(-5)).toBe("0 B");
    expect(fmtBytes(Infinity)).toBe("0 B");
    expect(fmtBytes(undefined as unknown as number)).toBe("0 B");
  });

  it("não estoura a maior unidade", () => {
    expect(fmtBytes(1024 ** 6)).toContain("TB");
  });
});
