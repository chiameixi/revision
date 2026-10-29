// Automatic tree layout: columns by provenance depth. Pure; no React.
//
// Column 0 holds the brief and everything the user made that has no parents
// (uploads, free-standing notes). Generated nodes with no parents came from
// the brief, so they sit in column 1 with a dashed edge from the brief.
// Every other node sits one column right of its deepest visible parent.
// User-dragged positions (views.tree.positions) override the computed ones.

import { visibleNodes, visibleParents } from "./graph";
import type { IdeaNode, NodeId, ProjectState, XY } from "./types";

export const BRIEF_ID = "__brief__";

export const CHIP_W = 160;
export const NOTE_W = 140;
export const IMAGE_W = 320;
export const IMAGE_H = 200;
export const BRIEF_W = IMAGE_W;
export const BRIEF_H = 200;
const COL_GAP = 96;
const ROW_GAP = 16;
const PAD = 48;
const COL_STRIDE = IMAGE_W + COL_GAP;

export function chipHeight(title: string): number {
  // ~22 chars per line at 10px in a 160px chip
  const lines = Math.max(1, Math.ceil(title.length / 22));
  return Math.max(32, lines * 18 + 8);
}

export function noteHeight(title: string): number {
  // ~17 chars per line at 11px in a 140px card
  const lines = Math.max(1, Math.ceil(title.length / 17));
  return Math.max(44, lines * 14 + 20);
}

// Anything with an image is drawn as an image card, whatever its role.
export function nodeSize(n: IdeaNode): { w: number; h: number } {
  if (n.image) return { w: IMAGE_W, h: IMAGE_H };
  if (n.role === "concept" || n.role === "motif") return { w: CHIP_W, h: chipHeight(n.title) };
  return { w: NOTE_W, h: noteHeight(n.title) };
}

export interface TreeLayout {
  positions: Record<string, XY>;   // node IDs plus BRIEF_ID
  sizes: Record<string, { w: number; h: number }>;
  briefTargets: NodeId[];          // generated roots, drawn with a dashed edge from the brief
}

export function computeTreeLayout(p: ProjectState): TreeLayout {
  const nodes = visibleNodes(p).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const parents = new Map<NodeId, NodeId[]>(nodes.map((n) => [n.id, visibleParents(p, n.id)]));
  const depth = new Map<string, number>();
  const briefTargets: NodeId[] = [];

  for (const n of nodes) {
    if (parents.get(n.id)!.length > 0) continue;
    if (n.origin.kind === "generated") {
      depth.set(n.id, 1);
      briefTargets.push(n.id);
    } else {
      depth.set(n.id, 0);
    }
  }

  // Relax until stable; provenance has no cycles, but cap passes in case data does.
  for (let pass = 0, changed = true; changed && pass <= nodes.length; pass++) {
    changed = false;
    for (const n of nodes) {
      const ps = parents.get(n.id)!;
      if (ps.length === 0) continue;
      const known = ps.filter((id) => depth.has(id)).map((id) => depth.get(id)!);
      if (known.length === 0) continue;
      const d = Math.max(...known) + 1;
      if (depth.get(n.id) !== d) {
        depth.set(n.id, d);
        changed = true;
      }
    }
  }
  for (const n of nodes) if (!depth.has(n.id)) depth.set(n.id, 0);

  const sizes: TreeLayout["sizes"] = { [BRIEF_ID]: { w: BRIEF_W, h: BRIEF_H } };
  const columns = new Map<number, string[]>([[0, [BRIEF_ID]]]);
  for (const n of nodes) {
    sizes[n.id] = nodeSize(n);
    const d = depth.get(n.id)!;
    if (!columns.has(d)) columns.set(d, []);
    columns.get(d)!.push(n.id);
  }

  const colHeight = (ids: string[]) =>
    ids.reduce((sum, id) => sum + sizes[id].h, 0) + Math.max(0, ids.length - 1) * ROW_GAP;
  const tallest = Math.max(...[...columns.values()].map(colHeight));

  const positions: Record<string, XY> = {};
  for (const [d, ids] of columns) {
    // Column 0 starts at the top so the brief stays put; others are centred.
    let y = d === 0 ? PAD : PAD + (tallest - colHeight(ids)) / 2;
    for (const id of ids) {
      positions[id] = { x: PAD + d * COL_STRIDE, y };
      y += sizes[id].h + ROW_GAP;
    }
  }

  for (const [id, xy] of Object.entries(p.views.tree.positions)) {
    if (positions[id]) positions[id] = xy;
  }

  return { positions, sizes, briefTargets };
}

