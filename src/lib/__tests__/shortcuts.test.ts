import { describe, expect, it } from "vitest";

import { resolveShortcut } from "../shortcuts";

describe("resolveShortcut", () => {
  it("teclas principais", () => {
    expect(resolveShortcut({ key: " " })).toBe("playpause");
    expect(resolveShortcut({ key: "k" })).toBe("playpause");
    expect(resolveShortcut({ key: "ArrowRight" })).toBe("seekFwd");
    expect(resolveShortcut({ key: "ArrowLeft" })).toBe("seekBack");
    expect(resolveShortcut({ key: "l" })).toBe("seekFwdBig");
    expect(resolveShortcut({ key: "j" })).toBe("seekBackBig");
    expect(resolveShortcut({ key: "f" })).toBe("fullscreen");
    expect(resolveShortcut({ key: "m" })).toBe("mute");
    expect(resolveShortcut({ key: "n" })).toBe("next");
    expect(resolveShortcut({ key: "p" })).toBe("prev");
    expect(resolveShortcut({ key: "Escape" })).toBe("escape");
  });

  it("dígitos viram seekPct", () => {
    expect(resolveShortcut({ key: "0" })).toBe("seekPct:0");
    expect(resolveShortcut({ key: "5" })).toBe("seekPct:50");
    expect(resolveShortcut({ key: "9" })).toBe("seekPct:90");
  });

  it("ignora quando há modificador", () => {
    expect(resolveShortcut({ key: " ", ctrlKey: true })).toBeNull();
    expect(resolveShortcut({ key: "f", metaKey: true })).toBeNull();
    expect(resolveShortcut({ key: "s", altKey: true })).toBeNull();
  });

  it("ignora quando o foco está num campo editável", () => {
    expect(resolveShortcut({ key: " ", inEditable: true })).toBeNull();
    expect(resolveShortcut({ key: "5", inEditable: true })).toBeNull();
  });

  it("tecla sem atalho retorna null", () => {
    expect(resolveShortcut({ key: "q" })).toBeNull();
    expect(resolveShortcut({ key: "F5" })).toBeNull();
  });
});
