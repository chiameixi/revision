import { describe, expect, it } from "vitest";
import { placeLabels, wordSize, type Box, type LabelRequest } from "@/domain/labelPlacement";

// A straight line along y = 100 from x = 0 to x = 800, with a point every 20px.
function line(id: string, y = 100, w = 60, h = 20): LabelRequest {
  return { id, w, h, points: Array.from({ length: 41 }, (_, i) => ({ x: i * 20, y })) };
}

const touches = (at: { x: number; y: number }, r: LabelRequest, b: Box) =>
  at.x + r.w / 2 > b.x && at.x - r.w / 2 < b.x + b.w && at.y + r.h / 2 > b.y && at.y - r.h / 2 < b.y + b.h;

describe("placeLabels", () => {
  it("keeps a word at the middle of its line when that spot is free", () => {
    expect(placeLabels([line("a")], []).a).toEqual({ x: 400, y: 100 });
    expect(placeLabels([line("a")], [{ x: 380, y: 300, w: 40, h: 40 }]).a).toEqual({ x: 400, y: 100 });
  });

  it("slides a word off a node, to the nearest free spot on its line", () => {
    const node = { x: 340, y: 80, w: 160, h: 40 };
    const r = line("a");
    const at = placeLabels([r], [node]).a;
    expect(touches(at, r, node)).toBe(false);
    expect(at.y).toBe(100);
    expect(Math.abs(at.x - 400)).toBeLessThan(140);
  });

  it("clears every node when a line crosses several", () => {
    const nodes = [{ x: 200, y: 80, w: 160, h: 40 }, { x: 380, y: 80, w: 160, h: 40 }, { x: 560, y: 80, w: 160, h: 40 }];
    const r = line("a");
    const at = placeLabels([r], nodes).a;
    for (const n of nodes) expect(touches(at, r, n)).toBe(false);
  });

  it("separates words that want the same spot", () => {
    const a = line("a"), b = line("b");
    const spots = placeLabels([a, b], []);
    expect(spots.a).toEqual({ x: 400, y: 100 });
    expect(Math.abs(spots.b.x - spots.a.x)).toBeGreaterThanOrEqual(60);
  });

  it("doesn't let a word that has to move push out one that can stay", () => {
    // "blocked" wants x = 400 and has a node there; its nearest free spot is the
    // middle of "free", a line running only from x = 500 to x = 700.
    const blocked = line("blocked");
    const free: LabelRequest = { id: "free", w: 60, h: 20, points: Array.from({ length: 11 }, (_, i) => ({ x: 500 + i * 20, y: 100 })) };
    const spots = placeLabels([blocked, free], [{ x: 330, y: 80, w: 200, h: 40 }]);
    expect(spots.free).toEqual({ x: 600, y: 100 });
    expect(Math.abs(spots.blocked.x - 600)).toBeGreaterThanOrEqual(60);
  });

  it("prefers overlapping a word to overlapping a node", () => {
    // The only spot off the node is taken by the other word.
    const node = { x: 100, y: 80, w: 700, h: 40 };
    const taken: LabelRequest = { id: "taken", w: 60, h: 20, points: [{ x: 40, y: 100 }] };
    const r: LabelRequest = { id: "r", w: 60, h: 20, points: [{ x: 40, y: 100 }, { x: 400, y: 100 }, { x: 600, y: 100 }] };
    expect(placeLabels([taken, r], [node]).r).toEqual({ x: 40, y: 100 });
  });

  it("still places a word when nowhere is free, and skips a line with no points", () => {
    const spots = placeLabels([line("a"), { id: "empty", w: 10, h: 10, points: [] }], [{ x: -100, y: 0, w: 1000, h: 200 }]);
    expect(spots.a).toBeDefined();
    expect(spots.empty).toBeUndefined();
  });
});

describe("wordSize", () => {
  it("grows with the word, up to the pill's maximum width", () => {
    expect(wordSize("sea").w).toBeLessThan(wordSize("sea air").w);
    expect(wordSize("x".repeat(80)).w).toBe(160);
  });
});
