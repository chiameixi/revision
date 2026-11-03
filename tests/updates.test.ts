import { describe, expect, it } from "vitest";
import * as u from "@/domain/updates";
import { makeCollection } from "@/domain/builders";
import { treeEdges, visibleLinks, visibleNodes } from "@/domain/graph";
import { edge, node, project } from "./helpers";

describe("updates don't change their input", () => {
  it("returns a new project and leaves the old one alone", () => {
    const p = project();
    node(p, "A");
    const next = u.hideNode(p, "A");
    expect(next).not.toBe(p);
    expect(p.nodes.A.hidden).toBeUndefined();
    expect(next.nodes.A.hidden).toBe(true);
  });

  it("returns the same project when the target doesn't exist", () => {
    const p = project();
    expect(u.hideNode(p, "ghost")).toBe(p);
    expect(u.editNode(p, "ghost", { title: "x" })).toBe(p);
  });
});

describe("hiding nodes", () => {
  it("hides the node's edges from view without touching them", () => {
    const p = project();
    node(p, "A"); node(p, "B"); node(p, "C");
    edge(p, "A", "B", "link");
    edge(p, "B", "C");
    const next = u.hideNode(p, "B");
    expect(visibleLinks(next)).toEqual([]);
    expect(Object.values(next.edges).every((e) => !e.hidden)).toBe(true);
  });

  it("brings everything back on unhide", () => {
    const p = project();
    node(p, "A"); node(p, "B");
    edge(p, "A", "B");
    const back = u.unhideNode(u.hideNode(p, "B"), "B");
    expect(visibleNodes(back).map((n) => n.id)).toEqual(["A", "B"]);
    expect(treeEdges(back)).toEqual([{ from: "A", to: "B", bridged: false }]);
  });
});

describe("edges", () => {
  it("hides one provenance edge without affecting its siblings", () => {
    const p = project();
    node(p, "A"); node(p, "B"); node(p, "C");
    const ab = edge(p, "A", "B");
    edge(p, "A", "C");
    const next = u.hideEdge(p, ab.id);
    expect(next.edges[ab.id].hidden).toBe(true);
    expect(treeEdges(next).map((e) => `${e.from}->${e.to}`)).toEqual(["A->C"]);
  });

  it("detects an existing link in either direction", () => {
    const p = project();
    node(p, "A"); node(p, "B");
    edge(p, "A", "B", "link");
    expect(u.hasLink(p, "B", "A")).toBe(true);
  });

  it("skips edges whose ends don't exist", () => {
    const p = project();
    node(p, "A");
    const next = u.addNodesAndEdges(p, [], [{ id: "e1", from: "A", to: "ghost", kind: "link", origin: { kind: "user" }, createdAt: "" }]);
    expect(next.edges).toEqual({});
  });

  it("clears a label when given an empty string", () => {
    const p = project();
    node(p, "A"); node(p, "B");
    const e = edge(p, "A", "B", "link");
    const set = u.setRelation(p, e.id, { word: " tension ", explanation: " pulls apart " });
    expect(set.edges[e.id].relation).toEqual({ word: "tension", explanation: "pulls apart" });
    expect(u.setRelation(set, e.id, { word: "", explanation: " " }).edges[e.id].relation).toBeUndefined();
  });
});

describe("retag", () => {
  it("changes the role in place and keeps the content", () => {
    const p = project();
    node(p, "A", { role: "concept" });
    const next = u.retagNode(p, "A", "motif");
    expect(next.nodes.A).toMatchObject({ id: "A", role: "motif", title: "A" });
  });
});

describe("collections", () => {
  it("adds only new, existing nodes, in order", () => {
    const p = project();
    node(p, "A"); node(p, "B");
    const c = makeCollection("Keep", "#f59e0b", []);
    let next = u.addCollection(p, c);
    next = u.addToCollection(next, c.id, ["B", "A", "B", "ghost"]);
    expect(next.collections[c.id].nodeIds).toEqual(["B", "A"]);
  });

  it("moves a node from one collection to another", () => {
    const p = project();
    node(p, "A");
    const c1 = makeCollection("One", "#000");
    const c2 = makeCollection("Two", "#fff");
    let next = u.addCollection(u.addCollection(p, c1), c2);
    next = u.addToCollection(next, c1.id, ["A"]);
    next = u.moveToCollection(next, "A", c1.id, c2.id);
    expect(next.collections[c1.id].nodeIds).toEqual([]);
    expect(next.collections[c2.id].nodeIds).toEqual(["A"]);
  });

  it("deletes a collection without touching its nodes", () => {
    const p = project();
    node(p, "A");
    const c = makeCollection("Keep", "#000", ["A"]);
    const next = u.deleteCollection(u.addCollection(p, c), c.id);
    expect(next.collections).toEqual({});
    expect(next.nodes.A).toBeDefined();
  });
});

describe("layout", () => {
  it("stores positions per view", () => {
    const p = project();
    const next = u.moveNode(p, "tree", "A", { x: 1, y: 2 });
    expect(next.views.tree.positions).toEqual({ A: { x: 1, y: 2 } });
    expect(next.views.cluster.positions).toEqual({});
  });

  it("resets one view only", () => {
    let p = project();
    p = u.moveNode(u.moveNode(p, "tree", "A", { x: 1, y: 2 }), "cluster", "A", { x: 3, y: 4 });
    const next = u.resetLayout(p, "tree");
    expect(next.views.tree.positions).toEqual({});
    expect(next.views.cluster.positions).toEqual({ A: { x: 3, y: 4 } });
  });
});

describe("clearing the tree", () => {
  it("hides every node and resets the tree layout, keeping everything else", () => {
    let p = project();
    node(p, "A"); node(p, "B");
    edge(p, "A", "B", "link");
    p = u.moveNode(p, "tree", "A", { x: 1, y: 1 });
    p = u.moveNode(p, "cluster", "A", { x: 2, y: 2 });
    const next = u.clearNodes(p);
    expect(visibleNodes(next)).toEqual([]);
    expect(Object.keys(next.nodes)).toEqual(["A", "B"]);
    expect(Object.keys(next.edges)).toHaveLength(1);
    expect(next.views.tree.positions).toEqual({});
    expect(next.views.cluster.positions).toEqual({ A: { x: 2, y: 2 } });
  });

  it("does nothing on an already empty tree", () => {
    const p = project();
    expect(u.clearNodes(p)).toBe(p);
  });
});
