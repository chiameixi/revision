// Pure updates: (project, ...args) → new project. Never modifies its input. No React, no IO.
// The store wraps each one with logging and saving; these only change data.
//
// Removal never deletes: hiding a node sets node.hidden, and its edges and
// collection memberships disappear from views because graph.ts filters them.
// Unhiding brings everything back.

import type {
  CollectionId,
  Collection,
  Edge,
  EdgeId,
  IdeaNode,
  NodeId,
  ProjectState,
  Role,
  XY,
} from "./types";
import type { Usage } from "./wire";
import { costUsd } from "./pricing";

export type NodePatch = Partial<Pick<IdeaNode, "title" | "body" | "details" | "image">>;
export type CollectionPatch = Partial<Pick<Collection, "title" | "description" | "color">>;

function patchNode(p: ProjectState, id: NodeId, patch: Partial<IdeaNode>): ProjectState {
  const n = p.nodes[id];
  if (!n) return p;
  return { ...p, nodes: { ...p.nodes, [id]: { ...n, ...patch } } };
}

function patchEdge(p: ProjectState, id: EdgeId, patch: Partial<Edge>): ProjectState {
  const e = p.edges[id];
  if (!e) return p;
  return { ...p, edges: { ...p.edges, [id]: { ...e, ...patch } } };
}

function patchCollection(p: ProjectState, id: CollectionId, fn: (c: Collection) => Collection): ProjectState {
  const c = p.collections[id];
  if (!c) return p;
  return { ...p, collections: { ...p.collections, [id]: fn(c) } };
}

// ── Project ───────────────────────────────────────────────────────────────────

export function setTitle(p: ProjectState, title: string): ProjectState {
  return { ...p, title };
}

export function setBrief(p: ProjectState, brief: string): ProjectState {
  return { ...p, brief };
}

// ── Nodes ─────────────────────────────────────────────────────────────────────

// Adds nodes and edges together, e.g. a new node plus its edges from parents,
// or a finished run's outputs plus their provenance.
export function addNodesAndEdges(p: ProjectState, nodes: IdeaNode[], edges: Edge[] = []): ProjectState {
  const nextNodes = { ...p.nodes };
  for (const n of nodes) nextNodes[n.id] = n;
  const nextEdges = { ...p.edges };
  for (const e of edges) {
    if (nextNodes[e.from] && nextNodes[e.to]) nextEdges[e.id] = e;
  }
  return { ...p, nodes: nextNodes, edges: nextEdges };
}

export function editNode(p: ProjectState, id: NodeId, patch: NodePatch): ProjectState {
  return patchNode(p, id, patch);
}

export function retagNode(p: ProjectState, id: NodeId, role: Role): ProjectState {
  return patchNode(p, id, { role });
}

export function hideNode(p: ProjectState, id: NodeId): ProjectState {
  return patchNode(p, id, { hidden: true });
}

export function unhideNode(p: ProjectState, id: NodeId): ProjectState {
  return patchNode(p, id, { hidden: false });
}

// Clears the canvas within this project: hides every node and resets the tree
// layout. Nothing is deleted, so it can be undone.
export function clearNodes(p: ProjectState): ProjectState {
  const visible = Object.values(p.nodes).filter((n) => !n.hidden);
  if (visible.length === 0) return p;
  const nodes = { ...p.nodes };
  for (const n of visible) nodes[n.id] = { ...n, hidden: true };
  return { ...p, nodes, views: { ...p.views, tree: { positions: {} } } };
}

// ── Edges ─────────────────────────────────────────────────────────────────────

export function hasLink(p: ProjectState, from: NodeId, to: NodeId): boolean {
  return Object.values(p.edges).some(
    (e) => e.kind === "link" && !e.hidden && ((e.from === from && e.to === to) || (e.from === to && e.to === from)),
  );
}

export function labelEdge(p: ProjectState, id: EdgeId, label: string): ProjectState {
  return patchEdge(p, id, { label: label || undefined });
}

// Removes one edge only. Siblings from the same run keep theirs.
export function hideEdge(p: ProjectState, id: EdgeId): ProjectState {
  return patchEdge(p, id, { hidden: true });
}

// ── Collections ───────────────────────────────────────────────────────────────

export function addCollection(p: ProjectState, c: Collection): ProjectState {
  return { ...p, collections: { ...p.collections, [c.id]: c } };
}

export function updateCollection(p: ProjectState, id: CollectionId, patch: CollectionPatch): ProjectState {
  return patchCollection(p, id, (c) => ({ ...c, ...patch }));
}

export function deleteCollection(p: ProjectState, id: CollectionId): ProjectState {
  if (!p.collections[id]) return p;
  const { [id]: _removed, ...rest } = p.collections;
  return { ...p, collections: rest };
}

export function addToCollection(p: ProjectState, id: CollectionId, nodeIds: NodeId[]): ProjectState {
  return patchCollection(p, id, (c) => {
    const seen = new Set(c.nodeIds);
    const added = nodeIds.filter((n) => p.nodes[n] && !seen.has(n) && seen.add(n));
    return { ...c, nodeIds: [...c.nodeIds, ...added] };
  });
}

export function removeFromCollection(p: ProjectState, id: CollectionId, nodeId: NodeId): ProjectState {
  return patchCollection(p, id, (c) => ({ ...c, nodeIds: c.nodeIds.filter((n) => n !== nodeId) }));
}

// Moves a node out of one collection (or none) into another (or none).
export function moveToCollection(
  p: ProjectState,
  nodeId: NodeId,
  from: CollectionId | null,
  to: CollectionId | null,
): ProjectState {
  let next = from ? removeFromCollection(p, from, nodeId) : p;
  if (to) next = addToCollection(next, to, [nodeId]);
  return next;
}

// ── Usage ─────────────────────────────────────────────────────────────────────

// Adds one request's model use to the project's running total.
export function addUsage(p: ProjectState, u: Usage): ProjectState {
  if (u.calls === 0) return p;
  const prev = p.usage ?? { calls: 0, inputTokens: 0, outputTokens: 0, imageTokens: 0, costUsd: 0 };
  return {
    ...p,
    usage: {
      calls: prev.calls + u.calls,
      inputTokens: prev.inputTokens + u.inputTokens,
      outputTokens: prev.outputTokens + u.outputTokens,
      imageTokens: prev.imageTokens + u.imageTokens,
      costUsd: prev.costUsd + (costUsd(u) ?? 0),
    },
  };
}

// ── Layout ────────────────────────────────────────────────────────────────────

export function moveNode(p: ProjectState, view: "tree" | "cluster", id: string, xy: XY): ProjectState {
  const v = p.views[view];
  return { ...p, views: { ...p.views, [view]: { positions: { ...v.positions, [id]: xy } } } };
}

export function resetLayout(p: ProjectState, view: "tree" | "cluster"): ProjectState {
  return { ...p, views: { ...p.views, [view]: { positions: {} } } };
}
