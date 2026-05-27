"use client";

import { useMemo, useRef, useState } from "react";
import type { Asset, Generation, Highlight, ResultCard, ActionType, VisualVariationCard } from "@/types";

// ── Layout constants ──────────────────────────────────────────────────────────
const NODE_W = 168;
const NODE_H = 76;
const COL_GAP = 96;
const ROW_GAP = 20;
const PAD = 48;

// ── Styling maps ──────────────────────────────────────────────────────────────
const TYPE_STYLE: Record<string, {
  bg: string; border: string; selectedBorder: string;
  badgeBg: string; badgeText: string; line: string;
}> = {
  insight:              { bg: "#ffffff", border: "#111111", selectedBorder: "#111111", badgeBg: "#111111", badgeText: "#ffffff", line: "#888888" },
  visual_variation:     { bg: "#f5f5f4", border: "#111111", selectedBorder: "#111111", badgeBg: "#333333", badgeText: "#ffffff", line: "#888888" },
  conceptual_variation: { bg: "#ffffff", border: "#444444", selectedBorder: "#111111", badgeBg: "#444444", badgeText: "#ffffff", line: "#888888" },
  concept:              { bg: "#f5f5f4", border: "#333333", selectedBorder: "#111111", badgeBg: "#333333", badgeText: "#ffffff", line: "#888888" },
  note:                 { bg: "#fafaf8", border: "#888888", selectedBorder: "#111111", badgeBg: "#888888", badgeText: "#ffffff", line: "#bbbbbb" },
};

const TYPE_LABEL: Record<string, string> = {
  insight: "Insight",
  visual_variation: "Visual",
  conceptual_variation: "Conceptual",
  concept: "Concept",
  note: "Note",
};

const ACTION_LABEL: Record<string, string> = {
  unpack_brief: "Unpack Brief",
  analyze: "Analyze",
  visual_variations: "Visual Variations",
  conceptual_variations: "Conceptual Vars",
  generate_concept_visuals: "Concept Visuals",
  synthesize: "Synthesize",
  user_added: "Your Idea",
};

const BRANCH_ACTIONS: { id: ActionType; label: string }[] = [
  { id: "unpack_brief",          label: "Unpack Brief" },
  { id: "analyze",               label: "Analyze" },
  { id: "visual_variations",     label: "Visual Variations" },
  { id: "conceptual_variations", label: "Conceptual Variations" },
  { id: "synthesize",            label: "Synthesize" },
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface LayoutNode {
  card: ResultCard;
  genId: string;
  actionType: ActionType;
  parentCardIds: string[];
  includedDraftIds: string[];
  includedReferenceIds: string[];
  x: number;
  y: number;
}

interface Edge {
  fromId: string;
  toId: string;
  toType: string;
}

// ── Layout algorithm ──────────────────────────────────────────────────────────
function computeLayout(generations: Generation[]): {
  nodes: LayoutNode[];
  edges: Edge[];
  width: number;
  height: number;
} {
  interface Entry {
    card: ResultCard;
    genId: string;
    actionType: ActionType;
    parentCardIds: string[];
    includedDraftIds: string[];
    includedReferenceIds: string[];
  }

  const entries: Entry[] = [];
  for (const gen of [...generations].reverse()) {
    for (const card of gen.cards) {
      entries.push({
        card,
        genId: gen.id,
        actionType: gen.actionType,
        parentCardIds: gen.sourceCardIds ?? [],
        includedDraftIds: gen.includedDraftIds ?? [],
        includedReferenceIds: gen.includedReferenceIds ?? [],
      });
    }
  }

  if (entries.length === 0) return { nodes: [], edges: [], width: 0, height: 0 };

  const cardIds = new Set(entries.map((e) => e.card.id));

  // BFS depth assignment
  const depthMap = new Map<string, number>();
  const roots = entries.filter((e) =>
    e.parentCardIds.length === 0 || e.parentCardIds.every((pid) => !cardIds.has(pid))
  );
  for (const r of roots) depthMap.set(r.card.id, 0);

  let changed = true;
  while (changed) {
    changed = false;
    for (const e of entries) {
      if (depthMap.has(e.card.id)) continue;
      const known = e.parentCardIds.filter((pid) => depthMap.has(pid));
      if (known.length > 0) {
        depthMap.set(e.card.id, Math.max(...known.map((pid) => depthMap.get(pid)!)) + 1);
        changed = true;
      }
    }
  }
  for (const e of entries) if (!depthMap.has(e.card.id)) depthMap.set(e.card.id, 0);

  // Group by depth
  const byDepth = new Map<number, Entry[]>();
  for (const e of entries) {
    const d = depthMap.get(e.card.id)!;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(e);
  }

  const maxDepth = Math.max(...byDepth.keys(), 0);
  const maxCount = Math.max(...[...byDepth.values()].map((a) => a.length), 1);

  // Assign positions (centre-aligned within each column)
  const posMap = new Map<string, { x: number; y: number }>();
  for (const [d, entriesAtDepth] of byDepth) {
    const totalH = entriesAtDepth.length * NODE_H + (entriesAtDepth.length - 1) * ROW_GAP;
    const canvasH = maxCount * NODE_H + (maxCount - 1) * ROW_GAP;
    const startY = PAD + (canvasH - totalH) / 2;
    entriesAtDepth.forEach((e, i) =>
      posMap.set(e.card.id, { x: PAD + d * (NODE_W + COL_GAP), y: startY + i * (NODE_H + ROW_GAP) })
    );
  }

  const nodes: LayoutNode[] = entries.map((e) => ({
    ...e,
    x: posMap.get(e.card.id)!.x,
    y: posMap.get(e.card.id)!.y,
  }));

  const edges: Edge[] = [];
  for (const e of entries) {
    for (const pid of e.parentCardIds) {
      if (posMap.has(pid)) edges.push({ fromId: pid, toId: e.card.id, toType: e.card.type });
    }
  }

  return {
    nodes,
    edges,
    width: PAD + (maxDepth + 1) * (NODE_W + COL_GAP) + PAD,
    height: PAD + maxCount * NODE_H + (maxCount - 1) * ROW_GAP + PAD,
  };
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  generations: Generation[];
  savedCardIds: Set<string>;
  highlights: Highlight[];
  assets: Asset[];
  onHoverSources: (cardIds: Set<string>, assetIds: Set<string>) => void;
  onSaveCard: (card: ResultCard) => void;
  onBranchFrom: (card: ResultCard, action: ActionType) => void;
  onDismissCard: (genId: string, cardId: string) => void;
}

export default function TreeView({ generations, savedCardIds, highlights, assets, onHoverSources, onSaveCard, onBranchFrom, onDismissCard }: Props) {
  const { nodes, edges, width, height } = useMemo(() => computeLayout(generations), [generations]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.0);
  const containerRef = useRef<HTMLDivElement>(null);

  const posMap = useMemo(() => new Map(nodes.map((n) => [n.card.id, { x: n.x, y: n.y }])), [nodes]);
  const cardIds = useMemo(() => new Set(nodes.map((n) => n.card.id)), [nodes]);

  const selectedNode = nodes.find((n) => n.card.id === selectedId) ?? null;
  const siblings = selectedNode
    ? nodes.filter((n) => n.genId === selectedNode.genId && n.card.id !== selectedNode.card.id)
    : [];

  // IDs of ancestor nodes (in-tree) of the hovered node
  const hoveredAncestorIds = useMemo(() => {
    if (!hoveredId) return new Set<string>();
    const hNode = nodes.find((n) => n.card.id === hoveredId);
    return new Set((hNode?.parentCardIds ?? []).filter((pid) => cardIds.has(pid)));
  }, [hoveredId, nodes, cardIds]);

  function handleNodeMouseEnter(node: LayoutNode) {
    setHoveredId(node.card.id);
    const offTreeCardIds = node.parentCardIds.filter((pid) => !cardIds.has(pid));
    const assetIds = new Set([...node.includedDraftIds, ...node.includedReferenceIds]);
    onHoverSources(new Set(offTreeCardIds), assetIds);
  }

  function handleNodeMouseLeave() {
    setHoveredId(null);
    onHoverSources(new Set(), new Set());
  }

  function handleFitZoom() {
    const container = containerRef.current;
    if (!container || width === 0 || height === 0) return;
    const { clientWidth, clientHeight } = container;
    setZoom(Math.min((clientWidth - 32) / width, (clientHeight - 32) / height, 1.0));
  }

  const handleRemove = (node: LayoutNode) => {
    onDismissCard(node.genId, node.card.id);
    setSelectedId(null);
  };

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-24 text-[#aaa]">
        <p className="text-sm mb-1">Run an action to see the concept tree.</p>
        <p className="text-xs">Each card becomes a node; edges show what seeded each generation.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Tree canvas ─────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto relative"
        style={{
          background: "radial-gradient(circle, #bbb 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          backgroundColor: "#f0eeea",
        }}
        onClick={() => setSelectedId(null)}
      >
        {/* Zoom controls */}
        <div className="absolute bottom-4 right-4 z-20 flex items-center gap-1 bg-white border border-[#e4e3e0] rounded-lg shadow-sm px-2 py-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.max(0.2, z - 0.1)); }}
            className="text-[13px] text-[#555] hover:text-[#111] w-6 h-6 flex items-center justify-center transition-colors"
            title="Zoom out"
          >−</button>
          <span className="text-[10px] text-[#888] w-10 text-center tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.min(2.0, z + 0.1)); }}
            className="text-[13px] text-[#555] hover:text-[#111] w-6 h-6 flex items-center justify-center transition-colors"
            title="Zoom in"
          >+</button>
          <div className="w-px h-4 bg-[#e4e3e0] mx-0.5" />
          <button
            onClick={(e) => { e.stopPropagation(); setZoom(1.0); }}
            className="text-[10px] text-[#888] hover:text-[#111] px-1 transition-colors"
            title="Reset zoom"
          >1:1</button>
          <button
            onClick={(e) => { e.stopPropagation(); handleFitZoom(); }}
            className="text-[10px] text-[#888] hover:text-[#111] px-1 transition-colors"
            title="Fit all nodes in view"
          >Fit</button>
        </div>

        {/* Scaled content wrapper */}
        <div style={{ width: Math.max(width * zoom, 1), height: Math.max(height * zoom, 1), minWidth: "100%", minHeight: "100%" }}>
        <div
          className="relative"
          style={{ width: Math.max(width, 1), height: Math.max(height, 1), transform: `scale(${zoom})`, transformOrigin: "top left" }}
        >
          {/* SVG edges */}
          <svg
            className="absolute inset-0 pointer-events-none"
            width={width}
            height={height}
            style={{ overflow: "visible" }}
          >
            <defs>
              {Object.entries(TYPE_STYLE).map(([type, s]) => (
                <marker key={type} id={`arrow-${type}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill={s.line} opacity={0.6} />
                </marker>
              ))}
              <marker id="arrow-amber" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#f59e0b" opacity={0.9} />
              </marker>
            </defs>
            {edges.map((edge, i) => {
              const from = posMap.get(edge.fromId);
              const to = posMap.get(edge.toId);
              if (!from || !to) return null;
              const x1 = from.x + NODE_W;
              const y1 = from.y + NODE_H / 2;
              const x2 = to.x - 6;
              const y2 = to.y + NODE_H / 2;
              const mid = x1 + (x2 - x1) * 0.5;
              const s = TYPE_STYLE[edge.toType] ?? TYPE_STYLE.insight;
              const isActive = hoveredId === edge.toId || hoveredId === edge.fromId;
              return (
                <path
                  key={i}
                  d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={isActive ? "#f59e0b" : s.line}
                  strokeWidth={isActive ? 2.5 : 1.5}
                  strokeOpacity={isActive ? 0.9 : 0.55}
                  markerEnd={isActive ? `url(#arrow-amber)` : `url(#arrow-${edge.toType})`}
                  style={{ transition: "stroke 0.15s, stroke-width 0.15s" }}
                />
              );
            })}
          </svg>

          {/* Nodes */}
          {nodes.map((node) => {
            const s = TYPE_STYLE[node.card.type] ?? TYPE_STYLE.insight;
            const isSelected = node.card.id === selectedId;
            const isHovered = node.card.id === hoveredId;
            const isAncestor = hoveredAncestorIds.has(node.card.id);
            const isSaved = savedCardIds.has(node.card.id);
            const hasImage =
              node.card.type === "visual_variation" && !!(node.card as VisualVariationCard).imageDataUrl;

            return (
              <div
                key={node.card.id}
                className="absolute cursor-pointer select-none group"
                draggable={true}
                onDragStart={(e) => {
                  e.stopPropagation();
                  e.dataTransfer.setData("card-drag", JSON.stringify({ card: node.card, genId: node.genId }));
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onMouseEnter={() => handleNodeMouseEnter(node)}
                onMouseLeave={handleNodeMouseLeave}
                style={{
                  left: node.x,
                  top: node.y,
                  width: NODE_W,
                  height: NODE_H,
                  background: isAncestor ? "#fffbeb" : isSelected ? s.bg : "#ffffff",
                  border: `1.5px solid ${isAncestor ? "#f59e0b" : isSelected ? s.selectedBorder : s.border}`,
                  borderRadius: 10,
                  boxShadow: isAncestor
                    ? "0 0 0 3px rgba(251,191,36,0.3)"
                    : isSelected
                    ? "3px 3px 0px #111111"
                    : isHovered
                    ? "2px 2px 0px #888"
                    : "1px 1px 0px #cccccc",
                  transition: "all 0.15s ease",
                  overflow: "hidden",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(isSelected ? null : node.card.id);
                }}
              >
                {/* Remove button — visible on hover */}
                <button
                  className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 rounded flex items-center justify-center text-[#ccc] hover:text-red-400 hover:bg-red-50 text-[10px] leading-none z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(node);
                  }}
                  title="Remove from tree"
                >
                  ✕
                </button>

                {hasImage ? (
                  /* Image node: thumbnail on right, text on left */
                  <div className="flex h-full overflow-hidden">
                    <div className="flex-1 p-2.5 flex flex-col gap-1 min-w-0 pr-1">
                      <div className="flex items-center gap-1.5 pr-1">
                        <span
                          className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0"
                          style={{ background: s.badgeBg, color: s.badgeText }}
                        >
                          {TYPE_LABEL[node.card.type]}
                        </span>
                        {isSaved && <span className="text-[10px] text-amber-400 shrink-0" title="Saved">★</span>}
                      </div>
                      <p className="text-[10px] font-medium text-[#333] leading-tight line-clamp-2 flex-1">
                        {node.card.title}
                      </p>
                      <p className="text-[9px] text-[#bbb] truncate">
                        {ACTION_LABEL[node.actionType] ?? node.actionType}
                      </p>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={(node.card as VisualVariationCard).imageDataUrl}
                      alt={node.card.title}
                      className="w-[68px] shrink-0 h-full object-cover"
                      style={{ borderRadius: "0 8px 8px 0" }}
                    />
                  </div>
                ) : (
                  /* Text-only node */
                  <div className="p-2.5 flex flex-col gap-1 h-full">
                    <div className="flex items-center gap-1.5 pr-4">
                      <span
                        className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0"
                        style={{ background: s.badgeBg, color: s.badgeText }}
                      >
                        {TYPE_LABEL[node.card.type]}
                      </span>
                      {isSaved && <span className="text-[10px] text-amber-400 shrink-0" title="Saved">★</span>}
                    </div>
                    <p className="text-[11px] font-medium text-[#333] leading-tight line-clamp-2 flex-1">
                      {node.card.title}
                    </p>
                    <p className="text-[9px] text-[#bbb] truncate">
                      {ACTION_LABEL[node.actionType] ?? node.actionType}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </div>
      </div>

      {/* ── Detail / gallery panel ────────────────────────────────────────── */}
      {selectedNode ? (
        <DetailPanel
          node={selectedNode}
          siblings={siblings}
          highlights={highlights}
          assets={assets}
          isSaved={savedCardIds.has(selectedNode.card.id)}
          onSave={() => onSaveCard(selectedNode.card)}
          onBranch={(action) => {
            onBranchFrom(selectedNode.card, action);
            setSelectedId(null);
          }}
          onRemove={() => handleRemove(selectedNode)}
          onSelectSibling={(id) => setSelectedId(id)}
          onClose={() => setSelectedId(null)}
          savedCardIds={savedCardIds}
        />
      ) : (
        <div className="w-[200px] shrink-0 border-l border-[#e4e3e0] bg-white/60 flex items-center justify-center">
          <p className="text-[10px] text-[#ccc] text-center px-4 leading-relaxed">
            Click a node to see details and actions
          </p>
        </div>
      )}
    </div>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function DetailPanel({
  node,
  siblings,
  highlights,
  assets,
  isSaved,
  onSave,
  onBranch,
  onRemove,
  onSelectSibling,
  onClose,
  savedCardIds,
}: {
  node: LayoutNode;
  siblings: LayoutNode[];
  highlights: Highlight[];
  assets: Asset[];
  isSaved: boolean;
  onSave: () => void;
  onBranch: (action: ActionType) => void;
  onRemove: () => void;
  onSelectSibling: (id: string) => void;
  onClose: () => void;
  savedCardIds: Set<string>;
}) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const s = TYPE_STYLE[node.card.type] ?? TYPE_STYLE.insight;

  const card = node.card;
  const isVisual = card.type === "visual_variation";
  const mainImage = isVisual ? (card as VisualVariationCard).imageDataUrl : undefined;

  const sourceHighlights = node.parentCardIds
    .map((pid) => highlights.find((h) => h.card.id === pid))
    .filter((h): h is Highlight => h !== undefined);

  const sourceDrafts = node.includedDraftIds
    .map((id) => assets.find((a) => a.id === id))
    .filter((a): a is Asset => a !== undefined);

  const sourceRefs = node.includedReferenceIds
    .map((id) => assets.find((a) => a.id === id))
    .filter((a): a is Asset => a !== undefined);

  // Siblings that are visual variations with images (for gallery strip)
  const imageSiblings = siblings.filter(
    (sib): sib is LayoutNode & { card: VisualVariationCard } =>
      sib.card.type === "visual_variation" && !!(sib.card as VisualVariationCard).imageDataUrl
  );

  return (
    <>
      <aside className="w-[272px] shrink-0 h-full border-l border-[#e4e3e0] bg-white flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#f0efec] shrink-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <span
              className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
              style={{ background: s.badgeBg, color: s.badgeText }}
            >
              {TYPE_LABEL[card.type]}
            </span>
            <div className="flex items-center gap-1.5 shrink-0 -mt-0.5">
              <button
                onClick={onRemove}
                className="text-[11px] text-[#ccc] hover:text-red-400 transition-colors"
                title="Remove from tree"
              >
                ✕ Remove
              </button>
              <span className="text-[#e4e3e0]">|</span>
              <button
                onClick={onClose}
                className="text-[11px] text-[#bbb] hover:text-[#555] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
          <p className="text-[12px] font-semibold text-[#222] leading-snug">{card.title}</p>
          <p className="text-[10px] text-[#bbb] mt-0.5">{ACTION_LABEL[node.actionType]}</p>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* All sources */}
          {(sourceHighlights.length > 0 || sourceDrafts.length > 0 || sourceRefs.length > 0) && (
            <div className="px-4 py-3 border-b border-[#f0efec]">
              <p className="text-[9px] text-[#bbb] uppercase tracking-wide font-semibold mb-2">
                Sources
              </p>
              <div className="flex flex-col gap-1.5">
                {sourceHighlights.map((h) => (
                  <div key={h.card.id} className="px-2.5 py-2 rounded-lg" style={{ background: "#fffbeb", border: "1px solid #f0d89a" }}>
                    <p className="text-[9px] text-[#b45309] uppercase tracking-wide font-semibold mb-0.5">
                      ★ highlight · {h.card.type.replace("_", " ")}
                    </p>
                    <p className="text-[10px] font-medium text-[#333] leading-snug line-clamp-2">{h.card.title}</p>
                  </div>
                ))}
                {sourceDrafts.map((a) => (
                  <div key={a.id} className="px-2.5 py-2 rounded-lg flex items-center gap-2" style={{ background: "#f5f5f4", border: "1px solid #ccc" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.dataUrl} alt={a.fileName} className="w-8 h-8 rounded object-cover shrink-0" />
                    <div>
                      <p className="text-[9px] text-[#888] uppercase tracking-wide font-semibold mb-0.5">✎ draft</p>
                      <p className="text-[10px] text-[#333] truncate max-w-[160px]">{a.fileName}</p>
                    </div>
                  </div>
                ))}
                {sourceRefs.map((a) => (
                  <div key={a.id} className="px-2.5 py-2 rounded-lg flex items-center gap-2" style={{ background: "#f0f0ff", border: "1px solid #c5c5e8" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.dataUrl} alt={a.fileName} className="w-8 h-8 rounded object-cover shrink-0" />
                    <div>
                      <p className="text-[9px] text-[#4444aa] uppercase tracking-wide font-semibold mb-0.5">◈ reference</p>
                      <p className="text-[10px] text-[#333] truncate max-w-[160px]">{a.fileName}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Main image */}
          {mainImage && (
            <div className="border-b border-[#f0efec]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mainImage}
                alt={card.title}
                className="w-full object-cover cursor-zoom-in"
                onClick={() => setLightboxSrc(mainImage)}
              />
              <p className="text-[9px] text-[#bbb] px-3 py-1.5">
                Click to enlarge · {(card as VisualVariationCard).dimensionLabel}
              </p>
            </div>
          )}

          {/* Image gallery strip for visual siblings */}
          {imageSiblings.length > 0 && (
            <div className="border-b border-[#f0efec] p-3">
              <p className="text-[9px] text-[#bbb] uppercase tracking-wide font-semibold mb-2">
                Images from same generation
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {imageSiblings.map((sib) => {
                  const sibCard = sib.card as VisualVariationCard;
                  return (
                    <div key={sib.card.id} className="relative group/img aspect-square rounded overflow-hidden bg-[#f7f6f3]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={sibCard.imageDataUrl}
                        alt={sibCard.title}
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={() => onSelectSibling(sib.card.id)}
                      />
                      <button
                        className="absolute inset-0 bg-black/0 group-hover/img:bg-black/30 transition-colors flex items-center justify-center"
                        onClick={() => setLightboxSrc(sibCard.imageDataUrl!)}
                        title={`${sibCard.dimensionLabel} — zoom`}
                      >
                        <span className="text-white text-[10px] opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/40 px-1.5 py-0.5 rounded">
                          ⤢
                        </span>
                      </button>
                      <div
                        className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent px-1.5 py-1 opacity-0 group-hover/img:opacity-100 transition-opacity cursor-pointer"
                        onClick={() => onSelectSibling(sib.card.id)}
                      >
                        <p className="text-white text-[8px] leading-tight truncate">
                          {sibCard.dimensionLabel}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Card details */}
          <div className="p-4 border-b border-[#f0efec] flex flex-col gap-3">
            <CardDetails card={card} />
          </div>

          {/* Text siblings (non-image) */}
          {siblings.filter((s) => !(imageSiblings as LayoutNode[]).includes(s)).length > 0 && (
            <div className="p-3 border-b border-[#f0efec]">
              <p className="text-[9px] text-[#bbb] uppercase tracking-wide font-semibold mb-2">
                From same generation ({siblings.length})
              </p>
              <div className="flex flex-col gap-1.5">
                {siblings
                  .filter((sib) => !(imageSiblings as LayoutNode[]).includes(sib))
                  .map((sib) => {
                    const sibStyle = TYPE_STYLE[sib.card.type] ?? TYPE_STYLE.insight;
                    const sibSaved = savedCardIds.has(sib.card.id);
                    return (
                      <button
                        key={sib.card.id}
                        onClick={() => onSelectSibling(sib.card.id)}
                        className="text-left px-2.5 py-2 rounded-lg border transition-colors hover:opacity-80"
                        style={{ borderColor: sibStyle.border, background: sibStyle.bg }}
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span
                            className="text-[8px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded"
                            style={{ background: sibStyle.badgeBg, color: sibStyle.badgeText }}
                          >
                            {TYPE_LABEL[sib.card.type]}
                          </span>
                          {sibSaved && <span className="text-[9px] text-amber-400">★</span>}
                        </div>
                        <p className="text-[10px] font-medium text-[#333] leading-snug line-clamp-2">
                          {sib.card.title}
                        </p>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="p-3 flex flex-col gap-1">
            {!isSaved && (
              <button
                onClick={onSave}
                className="w-full text-left text-[11px] px-3 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 font-medium transition-colors mb-1"
              >
                ★ Save to Highlights
              </button>
            )}
            {isSaved && (
              <p className="text-[10px] text-amber-500 px-1 mb-1">★ Saved to highlights</p>
            )}
            <p className="text-[9px] text-[#bbb] uppercase tracking-wide font-semibold px-1 pt-1 pb-0.5">
              Branch from here
            </p>
            {BRANCH_ACTIONS.map((a) => (
              <button
                key={a.id}
                onClick={() => onBranch(a.id)}
                className="w-full text-left text-[11px] px-3 py-1.5 rounded-lg hover:bg-blue-50 hover:text-[#2563eb] text-[#555] transition-colors"
              >
                {a.label} →
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-8"
          onClick={() => setLightboxSrc(null)}
        >
          <div className="relative max-w-4xl max-h-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setLightboxSrc(null)}
              className="absolute -top-9 right-0 text-white/60 hover:text-white text-sm transition-colors"
            >
              ✕ Close
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxSrc}
              alt="Full size"
              className="max-w-full max-h-[82vh] object-contain rounded-xl shadow-2xl"
            />
          </div>
        </div>
      )}
    </>
  );
}

// ── Card detail fields ────────────────────────────────────────────────────────
function CardDetails({ card }: { card: ResultCard }) {
  switch (card.type) {
    case "insight":
      return (
        <>
          <Field label="Summary" value={card.summary} />
          <Field label="Evidence" value={card.evidence} />
          <Field label="Implication" value={card.implication} />
        </>
      );
    case "visual_variation":
      return (
        <>
          <Field label="Dimension" value={card.dimensionLabel} />
          <Field label="Analysis" value={card.analysisText} />
          {card.error && <Field label="Error" value={card.error} isError />}
        </>
      );
    case "conceptual_variation":
      return (
        <>
          <Field label="Core Idea" value={card.coreIdea} />
          <Field label="How It Differs" value={card.howItDiffers} />
          <Field label="Why It May Work" value={card.whyItMayWork} />
          <Field label="Best Use Case" value={card.bestUseCase} />
          <Field label="Tradeoffs" value={card.tradeoffs} />
          <Field label="Next Step" value={card.nextStep} />
        </>
      );
    case "concept":
      return (
        <>
          <Field label="Core Idea" value={card.coreIdea} />
          <Field label="Interaction" value={card.interactionDirection} />
          <Field label="Visual Direction" value={card.visualDirection} />
          <Field label="Best For" value={card.bestFor} />
          <Field label="Risks" value={card.risks} />
          <Field label="Next Step" value={card.nextStep} />
        </>
      );
    case "note":
      return <Field label="Note" value={card.body} />;
  }
}

function Field({ label, value, isError }: { label: string; value: string; isError?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[9px] font-semibold uppercase tracking-wide text-[#bbb] mb-0.5">{label}</p>
      <p className={`text-[11px] leading-relaxed ${isError ? "text-red-500" : "text-[#444]"}`}>{value}</p>
    </div>
  );
}
