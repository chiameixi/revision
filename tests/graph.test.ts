import { describe, expect, it } from "vitest";
import { ancestors, resolveSelection, treeEdges, visibleLinks, visibleNodes, visibleParents } from "@/domain/graph";
import { edge, node, project } from "./helpers";

describe("visibility", () => {
  it("leaves out hidden nodes", () => {
    const p = project();
    node(p, "A");
    node(p, "B", { hidden: true });
    expect(visibleNodes(p).map((n) => n.id)).toEqual(["A"]);
  });

  it("shows a link only when it and both ends are visible", () => {
    const p = project();
    node(p, "A"); node(p, "B"); node(p, "C", { hidden: true });
    edge(p, "A", "B", "link");
    edge(p, "A", "C", "link");
    edge(p, "B", "A", "link", true);
    edge(p, "A", "B");                       // provenance is not a link
    expect(visibleLinks(p).map((e) => e.id)).toEqual(["A->B:link"]);
  });
});

describe("bridging over removed nodes", () => {
  it("reconnects A → C when B in A → B → C is removed", () => {
    const p = project();
    node(p, "A"); node(p, "B", { hidden: true }); node(p, "C");
    edge(p, "A", "B"); edge(p, "B", "C");
    expect(visibleParents(p, "C")).toEqual(["A"]);
    expect(treeEdges(p)).toEqual([{ from: "A", to: "C", bridged: true }]);
  });

  it("walks through several removed nodes in a row", () => {
    const p = project();
    node(p, "A"); node(p, "B", { hidden: true }); node(p, "C", { hidden: true }); node(p, "D");
    edge(p, "A", "B"); edge(p, "B", "C"); edge(p, "C", "D");
    expect(visibleParents(p, "D")).toEqual(["A"]);
  });

  it("marks a direct edge as not bridged even when a removed path also exists", () => {
    const p = project();
    node(p, "A"); node(p, "B", { hidden: true }); node(p, "C");
    edge(p, "A", "B"); edge(p, "B", "C"); edge(p, "A", "C");
    expect(treeEdges(p)).toEqual([{ from: "A", to: "C", bridged: false }]);
  });

  it("ignores user links when working out tree parents", () => {
    const p = project();
    node(p, "A"); node(p, "B");
    edge(p, "A", "B", "link");
    expect(visibleParents(p, "B")).toEqual([]);
  });

  it("doesn't loop forever on a cycle", () => {
    const p = project();
    node(p, "A", { hidden: true }); node(p, "B", { hidden: true }); node(p, "C");
    edge(p, "A", "B"); edge(p, "B", "A"); edge(p, "B", "C");
    expect(visibleParents(p, "C")).toEqual([]);
  });
});

describe("ancestors", () => {
  it("collects all visible ancestors through removed nodes", () => {
    const p = project();
    node(p, "A"); node(p, "B", { hidden: true }); node(p, "C"); node(p, "D");
    edge(p, "A", "B"); edge(p, "B", "C"); edge(p, "C", "D");
    expect([...ancestors(p, "D")].sort()).toEqual(["A", "C"]);
  });
});

describe("resolveSelection", () => {
  it("splits nodes from links and drops removed or missing ones", () => {
    const p = project();
    node(p, "A"); node(p, "B"); node(p, "C", { hidden: true });
    const link = edge(p, "A", "B", "link");
    const { nodes, edges } = resolveSelection(p, ["A", "C", "ghost", link.id]);
    expect(nodes.map((n) => n.id)).toEqual(["A"]);
    expect(edges.map((e) => e.id)).toEqual([link.id]);
  });
});
