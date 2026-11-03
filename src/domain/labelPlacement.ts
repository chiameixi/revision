// Where each connection's word sits on its line. Pure; no React.
//
// A word sits at the middle of its line if that spot is free. A line that skips
// a column runs behind the nodes in it, so its middle can land on a node. The
// word then slides along its line to the nearest free spot.

import type { XY } from "./types";

export interface Box { x: number; y: number; w: number; h: number }

export interface LabelRequest {
  id: string;
  points: XY[];  // along the line, evenly spaced; the middle one is the preferred spot
  w: number;
  h: number;
}

const NODE_CLEARANCE = 6;
const LABEL_CLEARANCE = 2;

// Estimated, because placing needs a size before the word is drawn. Matches
// RelationPill: 12px text, 160px at most, one line.
export function wordSize(word: string): { w: number; h: number } {
  return { w: Math.min(160, word.length * 6.2 + 18), h: 22 };
}

function overlapArea(a: Box, b: Box, clearance: number): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + clearance;
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) + clearance;
  return w > 0 && h > 0 ? w * h : 0;
}

function totalOverlap(box: Box, others: Box[], clearance: number): number {
  return others.reduce((sum, other) => sum + overlapArea(box, other, clearance), 0);
}

const boxAt = (r: LabelRequest, p: XY): Box => ({ x: p.x - r.w / 2, y: p.y - r.h / 2, w: r.w, h: r.h });
const middle = (r: LabelRequest) => (r.points.length - 1) / 2;

// In order of importance, each spot should: stay off nodes, stay off other
// words, stay near the middle. If nowhere is free, it takes the least bad spot.
export function placeLabels(requests: LabelRequest[], nodes: Box[]): Record<string, XY> {
  const usable = requests.filter((r) => r.points.length > 0);
  const midpointFree = (r: LabelRequest) => totalOverlap(boxAt(r, r.points[Math.floor(middle(r))]), nodes, NODE_CLEARANCE) === 0;
  // Words that can stay put choose first, so a word that has to move doesn't push them out.
  const ordered = [...usable.filter(midpointFree), ...usable.filter((r) => !midpointFree(r))];

  const placed: Box[] = [];
  const spots: Record<string, XY> = {};
  for (const r of ordered) {
    let best = { node: Infinity, label: Infinity, distance: Infinity, at: r.points[0] };
    r.points.forEach((at, i) => {
      const box = boxAt(r, at);
      const node = totalOverlap(box, nodes, NODE_CLEARANCE);
      const label = totalOverlap(box, placed, LABEL_CLEARANCE);
      const distance = Math.abs(i - middle(r));
      const better = node - best.node || label - best.label || distance - best.distance;
      if (better < 0) best = { node, label, distance, at };
    });
    spots[r.id] = best.at;
    placed.push(boxAt(r, best.at));
  }
  return spots;
}
