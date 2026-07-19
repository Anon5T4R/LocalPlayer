import { describe, expect, it } from "vitest";

import { nearestReady, THUMB_COUNT, thumbIndexFor } from "../thumbs";

describe("thumbIndexFor", () => {
  it("mapeia a fração pro índice da fatia", () => {
    expect(thumbIndexFor(0)).toBe(0);
    expect(thumbIndexFor(0.5, 50)).toBe(25);
    expect(thumbIndexFor(0.999, 50)).toBe(49);
  });
  it("clampa: 1.0 e além caem na última; negativo na primeira", () => {
    expect(thumbIndexFor(1)).toBe(THUMB_COUNT - 1);
    expect(thumbIndexFor(2)).toBe(THUMB_COUNT - 1);
    expect(thumbIndexFor(-0.5)).toBe(0);
    expect(thumbIndexFor(NaN)).toBe(0);
  });
});

describe("nearestReady", () => {
  const f = (n: number, ready: number[]): (string | null)[] => {
    const a: (string | null)[] = Array(n).fill(null);
    for (const i of ready) a[i] = `t${i}.jpg`;
    return a;
  };

  it("exata quando pronta", () => {
    expect(nearestReady(f(10, [3]), 3)).toBe("t3.jpg");
  });
  it("busca pra fora, empate resolve pra trás", () => {
    expect(nearestReady(f(10, [2, 8]), 4)).toBe("t2.jpg"); // 2 está a d=2, 8 a d=4
    expect(nearestReady(f(10, [3, 5]), 4)).toBe("t3.jpg"); // empate d=1 → trás
  });
  it("índice fora do range é clampado antes de buscar", () => {
    expect(nearestReady(f(10, [9]), 42)).toBe("t9.jpg");
    expect(nearestReady(f(10, [0]), -3)).toBe("t0.jpg");
  });
  it("nada pronto (ou lista vazia) = null → tooltip só-tempo", () => {
    expect(nearestReady(f(10, []), 4)).toBeNull();
    expect(nearestReady([], 0)).toBeNull();
  });
});
