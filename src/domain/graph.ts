// Pure helpers over ProjectState. No React, no IO.
// Everything here is derived on demand and never stored.

import type { Edge, EdgeId, IdeaNode, NodeId, ProjectId, ProjectState } from "./types";

export function emptyProject(id: ProjectId, title: string, at: string): ProjectState {
  return {
    id,
    title,
    brief: "",
    createdAt: at,
    updatedAt: at,
    nodes: {},
    edges: {},
    collections: {},
    views: { tree: { positions: {} }, cluster: { positions: {} } },
  };
}

// ── Visibility ────────────────────────────────────────────────────────────────

export function visibleNodes(p: ProjectState): IdeaNode[] {
  return Object.values(p.nodes).filter((n) => !n.hidden);
}

function isVisibleEdge(p: ProjectState, e: Edge): boolean {
  return !e.hidden && !p.nodes[e.from]?.hidden && !p.nodes[e.to]?.hidden
    && !!p.nodes[e.from] && !!p.nodes[e.to];
}

// User-drawn links whose ends are both visible.
export function visibleLinks(p: ProjectState): Edge[] {
  return Object.values(p.edges).filter((e) => e.kind === "link" && isVisibleEdge(p, e));
}

// ── Provenance ────────────────────────────────────────────────────────────────

// Parents via derived_from edges, including hidden nodes (so the tree can bridge
// over them) but not hidden edges: an edge is hidden only when the user removed it.
function rawParents(p: ProjectState, id: NodeId): NodeId[] {
  const out: NodeId[] = [];
  for (const e of Object.values(p.edges)) {
    if (e.kind === "derived_from" && !e.hidden && e.to === id && p.nodes[e.from]) out.push(e.from);
  }
  return out;
}

// Nearest visible ancestors, walking up through removed (hidden) nodes.
// This is what reconnects A → C when B in A → B → C is removed.
export function visibleParents(p: ProjectState, id: NodeId): NodeId[] {
  const result = new Set<NodeId>();
  const visited = new Set<NodeId>([id]);
  const stack = rawParents(p, id);
  while (stack.length) {
    const pid = stack.pop()!;
    if (visited.has(pid)) continue;
    visited.add(pid);
    if (!p.nodes[pid].hidden) result.add(pid);
    else stack.push(...rawParents(p, pid));
  }
  return [...result];
}

export interface TreeEdge {
  from: NodeId;
  to: NodeId;
  bridged: boolean;   // true when it skips over removed nodes
}

// Edges the tree view draws: provenance between visible nodes, bridged over removed ones.
export function treeEdges(p: ProjectState): TreeEdge[] {
  const out: TreeEdge[] = [];
  for (const n of visibleNodes(p)) {
    const direct = new Set(rawParents(p, n.id));
    for (const from of visibleParents(p, n.id)) {
      out.push({ from, to: n.id, bridged: !direct.has(from) });
    }
  }
  return out;
}

// All visible ancestors of a node (for hover / selection highlighting).
export function ancestors(p: ProjectState, id: NodeId): Set<NodeId> {
  const out = new Set<NodeId>();
  const stack = visibleParents(p, id);
  while (stack.length) {
    const a = stack.pop()!;
    if (out.has(a)) continue;
    out.add(a);
    stack.push(...visibleParents(p, a));
  }
  return out;
}

// ── Lookups ───────────────────────────────────────────────────────────────────

export function edgesOf(p: ProjectState, id: NodeId): Edge[] {
  return Object.values(p.edges).filter((e) => e.from === id || e.to === id);
}

export function isEdgeId(p: ProjectState, id: NodeId | EdgeId): boolean {
  return id in p.edges;
}

// Splits a selection (nodes and links) into what still exists and is visible.
export function resolveSelection(p: ProjectState, ids: (NodeId | EdgeId)[]): { nodes: IdeaNode[]; edges: Edge[] } {
  const nodes: IdeaNode[] = [];
  const edges: Edge[] = [];
  for (const id of ids) {
    const n = p.nodes[id];
    if (n && !n.hidden) { nodes.push(n); continue; }
    const e = p.edges[id];
    if (e && isVisibleEdge(p, e)) edges.push(e);
  }
  return { nodes, edges };
}
