import { describe, expect, it } from "vitest";
import { BRIEF_ID, computeTreeLayout, IMAGE_W, nodeSize } from "@/domain/treeLayout";
import { moveNode } from "@/domain/updates";
import { edge, node, project } from "./helpers";
import type { ProjectState } from "@/domain/types";

function generated(p: ProjectState, id: string) {
  const n = node(p, id);
  n.origin = { kind: "generated", action: "expand", runId: "r1" };
  return n;
}

const column = (layout: ReturnType<typeof computeTreeLayout>, id: string) =>
  Math.round((layout.positions[id].x - 48) / (IMAGE_W + 96));

describe("tree layout", () => {
  it("puts the brief and user-made roots in column 0", () => {
    const p = project();
    node(p, "upload");
    const layout = computeTreeLayout(p);
    expect(column(layout, BRIEF_ID)).toBe(0);
    expect(column(layout, "upload")).toBe(0);
    expect(layout.positions.upload.y).toBeGreaterThan(layout.positions[BRIEF_ID].y);
  });

  it("puts generated roots in column 1 and connects them to the brief", () => {
    const p = project();
    generated(p, "c1");
    const layout = computeTreeLayout(p);
    expect(column(layout, "c1")).toBe(1);
    expect(layout.briefTargets).toEqual(["c1"]);
  });

  it("places a node one column right of its deepest parent", () => {
    const p = project();
    generated(p, "A");          // col 1
    node(p, "B");               // col 0
    node(p, "C");
    edge(p, "A", "C"); edge(p, "B", "C");
    expect(column(computeTreeLayout(p), "C")).toBe(2);
  });

  it("leaves out removed nodes but keeps their children connected", () => {
    const p = project();
    node(p, "A"); node(p, "B", { hidden: true }); node(p, "C");
    edge(p, "A", "B"); edge(p, "B", "C");
    const layout = computeTreeLayout(p);
    expect(layout.positions.B).toBeUndefined();
    expect(column(layout, "C")).toBe(1);
  });

  it("uses dragged positions over computed ones", () => {
    let p = project();
    node(p, "A");
    p = moveNode(p, "tree", "A", { x: 999, y: 7 });
    p = moveNode(p, "tree", BRIEF_ID, { x: 1, y: 2 });
    const layout = computeTreeLayout(p);
    expect(layout.positions.A).toEqual({ x: 999, y: 7 });
    expect(layout.positions[BRIEF_ID]).toEqual({ x: 1, y: 2 });
  });

  it("ignores dragged positions for nodes that are no longer shown", () => {
    let p = project();
    node(p, "A", { hidden: true });
    p = moveNode(p, "tree", "A", { x: 5, y: 5 });
    expect(computeTreeLayout(p).positions.A).toBeUndefined();
  });

  it("draws anything with an image as an image card, whatever its role", () => {
    const p = project();
    const n = node(p, "A", { role: "concept" });
    n.image = { imageId: "i1", mimeType: "image/png" };
    expect(nodeSize(n)).toEqual({ w: 320, h: 200 });
  });
});
