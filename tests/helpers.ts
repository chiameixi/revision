// Small builders so tests read as the graph they describe.

import { emptyProject } from "@/domain/graph";
import type { Edge, EdgeKind, IdeaNode, ProjectState, Role } from "@/domain/types";

export function project(): ProjectState {
  return emptyProject("p_test", "Test", "2026-01-01T00:00:00.000Z");
}

export function node(p: ProjectState, id: string, opts: { role?: Role; hidden?: boolean } = {}): IdeaNode {
  const n: IdeaNode = {
    id,
    role: opts.role ?? "concept",
    title: id,
    hidden: opts.hidden,
    origin: { kind: "user" },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  p.nodes[id] = n;
  return n;
}

export function edge(p: ProjectState, from: string, to: string, kind: EdgeKind = "derived_from", hidden?: boolean): Edge {
  const id = `${from}->${to}:${kind}`;
  const e: Edge = { id, from, to, kind, hidden, origin: { kind: "user" }, createdAt: "2026-01-01T00:00:00.000Z" };
  p.edges[id] = e;
  return e;
}
