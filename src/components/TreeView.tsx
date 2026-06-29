"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Panel,
  Position,
  BackgroundVariant,
  MarkerType,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  applyNodeChanges,
  applyEdgeChanges,
  useNodes,
  useViewport,
  type Node,
  type Edge as RFEdge,
  type EdgeTypes,
  type NodeTypes,
  type NodeProps,
  type EdgeProps,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Asset, Collection, Generation, ManualEdge, ResultCard, ActionType, VisualCard } from "@/types";

// ── Layout constants ──────────────────────────────────────────────────────────
// Chip nodes (concept / motif): fixed width, height wraps with text
const CHIP_W = 160;
const CHIP_H_MIN = 32;
function chipHeight(title: string): number {
  // ~22 chars per line at 10px medium in 160px chip (paddings ~32px)
  const lines = Math.max(1, Math.ceil(title.length / 22));
  return Math.max(CHIP_H_MIN, lines * 18 + 8);
}
// Note cards: standard rectangle
const NODE_W = 140;
const NODE_H = 44;
// Visual image cards
const VISUAL_NODE_W = 320;
const VISUAL_NODE_H = 200;
const COL_GAP = 96;
const ROW_GAP = 16;
const PAD = 48;
const COL_STRIDE = VISUAL_NODE_W + COL_GAP;

// ── Input node constants ──────────────────────────────────────────────────────
const INPUT_NODE_W = VISUAL_NODE_W;
const BRIEF_NODE_H = 200;
const ASSET_NODE_H = 92;
const INPUT_X_OFFSET = INPUT_NODE_W + COL_GAP;

// ── Node size helper ──────────────────────────────────────────────────────────
function nodeDims(card: ResultCard): { w: number; h: number } {
  if (card.type === "visual" && (card as VisualCard).imageDataUrl) return { w: VISUAL_NODE_W, h: VISUAL_NODE_H };
  if (card.type === "concept" || card.type === "motif") return { w: CHIP_W, h: chipHeight(card.title) };
  return { w: NODE_W, h: NODE_H };
}

// ── Styling maps ──────────────────────────────────────────────────────────────
const TYPE_STYLE: Record<string, {
  bg: string; border: string; selectedBorder: string;
  badgeBg: string; badgeText: string; line: string;
}> = {
  concept: { bg: "#ffffff", border: "#000000", selectedBorder: "#000000", badgeBg: "#000000", badgeText: "#ffffff", line: "rgba(0,0,0,0.45)" },
  motif:   { bg: "#ffffff", border: "#000000", selectedBorder: "#000000", badgeBg: "#000000", badgeText: "#ffffff", line: "rgba(0,0,0,0.45)" },
  visual:  { bg: "#ffffff", border: "#000000", selectedBorder: "#000000", badgeBg: "#000000", badgeText: "#ffffff", line: "rgba(0,0,0,0.35)" },
  note:    { bg: "#ffffff", border: "rgba(0,0,0,0.35)", selectedBorder: "#000000", badgeBg: "rgba(0,0,0,0.5)", badgeText: "#ffffff", line: "rgba(0,0,0,0.25)" },
};

const TYPE_LABEL: Record<string, string> = {
  concept: "Concept",
  motif: "Motif",
  visual: "Visual",
  note: "Note",
  draft: "Draft",
  reference: "Reference",
};

const ACTION_LABEL: Record<string, string> = {
  unpack_brief: "Unpack Brief",
  analyze: "Analyze",
  visual_variations: "Visual Variations",
  conceptual_variations: "Conceptual Vars",
  generate_concept_visuals: "Concept Visuals",
  user_added: "Your Idea",
};

const BRANCH_ACTIONS: { id: ActionType; label: string }[] = [
  { id: "unpack_brief",          label: "Unpack Brief" },
  { id: "analyze",               label: "Analyze" },
  { id: "visual_variations",     label: "Visual Variations" },
  { id: "conceptual_variations", label: "Conceptual Variations" },
];

const PICKER_COLORS = [
  "#c9a84c", // warm gold
  "#7a9e5e", // sage green
  "#c14f58", // muted rose
  "#4a7a9b", // slate blue
  "#8b6b4a", // warm brown
  "#7b6b8e", // muted violet
  "#4a8b7a", // teal
  "#9b4a4a", // terracotta
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

interface GraphEdge {
  fromId: string;
  toId: string;
  toType: string;
}

type CardNodeData = {
  card: ResultCard;
  genId: string;
  actionType: ActionType;
  parentCardIds: string[];
  includedDraftIds: string[];
  includedReferenceIds: string[];
  cardIds: Set<string>;
  isSelected: boolean;
  isHovered: boolean;
  isAncestor: boolean;
  isSourceOfSelected: boolean;
  isSaved: boolean;
  isMultiSelected: boolean;
  collectionColors?: string[];
  connectMode: boolean;
  onRemove: (genId: string, cardId: string) => void;
  onQuickBranch: (action: ActionType) => void;
};

type BriefNodeData = {
  title: string;
  brief: string;
  onTitleChange: (v: string) => void;
  onBriefChange: (v: string) => void;
  onAddDraftFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAddReferenceFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  connectMode: boolean;
  isSelected: boolean;
};

type AssetNodeData = {
  asset: Asset;
  onRemove: (id: string) => void;
  connectMode: boolean;
  isSelected: boolean;
};

// ── Layout algorithm ──────────────────────────────────────────────────────────
function computeLayout(generations: Generation[], allGenerations: Generation[]): {
  nodes: LayoutNode[];
  edges: GraphEdge[];
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

  // Build a full ancestry map from all generations (including dismissed cards)
  // so we can bridge edges through removed nodes.
  const allCardParents = new Map<string, string[]>();
  for (const gen of allGenerations) {
    for (const card of gen.cards) {
      allCardParents.set(card.id, gen.sourceCardIds ?? []);
    }
  }

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

  const byDepth = new Map<number, Entry[]>();
  for (const e of entries) {
    const d = depthMap.get(e.card.id)!;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(e);
  }

  const maxDepth = Math.max(...byDepth.keys(), 0);

  function colHeight(col: Entry[]): number {
    if (col.length === 0) return 0;
    return col.reduce((sum, e) => sum + nodeDims(e.card).h, 0) + (col.length - 1) * ROW_GAP;
  }
  const maxColH = Math.max(...[...byDepth.values()].map(colHeight), 1);

  const posMap = new Map<string, { x: number; y: number }>();
  for (const [d, col] of byDepth) {
    const thisH = colHeight(col);
    const startY = PAD + (maxColH - thisH) / 2;
    let y = startY;
    for (const e of col) {
      posMap.set(e.card.id, { x: PAD + d * COL_STRIDE, y });
      y += nodeDims(e.card).h + ROW_GAP;
    }
  }

  const nodes: LayoutNode[] = entries.map((e) => ({
    ...e,
    x: posMap.get(e.card.id)!.x,
    y: posMap.get(e.card.id)!.y,
  }));

  // Walk up the ancestry chain through dismissed (invisible) parents to find
  // the nearest visible ancestors. Prevents disconnected nodes when a parent is removed.
  function resolveVisibleAncestors(cardId: string, visited = new Set<string>()): string[] {
    if (visited.has(cardId)) return [];
    visited.add(cardId);
    if (posMap.has(cardId)) return [cardId];
    const parents = allCardParents.get(cardId) ?? [];
    return parents.flatMap((pid) => resolveVisibleAncestors(pid, visited));
  }

  const edges: GraphEdge[] = [];
  const edgeSet = new Set<string>();
  for (const e of entries) {
    for (const pid of e.parentCardIds) {
      const sources = posMap.has(pid) ? [pid] : resolveVisibleAncestors(pid);
      for (const src of sources) {
        const key = `${src}→${e.card.id}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({ fromId: src, toId: e.card.id, toType: e.card.type });
        }
      }
    }
  }

  return {
    nodes,
    edges,
    width: PAD + (maxDepth + 1) * COL_STRIDE + PAD,
    height: PAD + maxColH + PAD,
  };
}

// ── Custom node components ────────────────────────────────────────────────────
function TextCardNode(props: NodeProps) {
  const data = props.data as unknown as CardNodeData;
  const { card, isSelected, isHovered, isAncestor, isSourceOfSelected, isMultiSelected, isSaved, collectionColors, connectMode, onRemove, genId, actionType } = data;
  const handleStyle = (pos: "left" | "right"): React.CSSProperties => ({
    opacity: connectMode ? 1 : 0,
    pointerEvents: connectMode ? "auto" : "none",
    width: 10, height: 10,
    background: pos === "right" ? "#64748b" : "#94a3b8",
    border: "2px solid white",
    borderRadius: "50%",
  });
  const s = TYPE_STYLE[card.type] ?? TYPE_STYLE.concept;
  const primaryColor = collectionColors?.[0];
  const isChip = card.type === "concept" || card.type === "motif";

  // Editorial gold for source-of-selected; subtle gray for hover-ancestor
  const SOURCE_COLOR = "#2d4f8a";

  const borderColor = isMultiSelected ? primaryColor ?? "#000"
    : isSelected ? "#000"
    : isSourceOfSelected ? SOURCE_COLOR
    : isAncestor ? "rgba(0,0,0,0.4)"
    : primaryColor ?? s.border;
  const shadow = isMultiSelected ? `0 0 0 2px ${primaryColor ?? "rgba(0,0,0,0.4)"}`
    : isSelected ? "2px 2px 0px #000"
    : isSourceOfSelected ? `0 0 0 1.5px ${SOURCE_COLOR}`
    : isAncestor ? "0 0 0 1px rgba(0,0,0,0.2)"
    : isHovered ? "1px 1px 0px #888"
    : "none";
  const bgColor = isMultiSelected ? "#fafaf8"
    : isSourceOfSelected ? "rgba(45,79,138,0.06)"
    : isAncestor ? "#f5f4f0"
    : "#ffffff";

  // ── Chip (concept / motif) ──────────────────────────────────────────────────
  if (isChip) {
    return (
      <>
        <Handle type="target" position={Position.Left} style={handleStyle("left")} />
        <div
          className="relative group"
          style={{
            width: CHIP_W,
            minHeight: CHIP_H_MIN,
            background: bgColor,
            border: "none",
            borderLeft: card.type === "concept" ? `1.5px solid ${borderColor}` : "none",
            borderRadius: 0,
            boxShadow: shadow,
            transition: "all 0.15s ease",
            cursor: "pointer",
            userSelect: "none",
            display: "flex",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 4,
            paddingLeft: card.type === "concept" ? 9 : 10,
            paddingRight: 22,
            paddingTop: 6,
            paddingBottom: 6,
            position: "relative",
          }}
        >
          {/* Motif: 4 corner L-bracket marks */}
          {card.type === "motif" && (
            <>
              {(["tl","tr","bl","br"] as const).map((pos) => {
                const mk: React.CSSProperties = {
                  position: "absolute", width: 8, height: 8,
                  ...(pos === "tl" ? { top: 0, left: 0, borderTop: `1.5px solid ${borderColor}`, borderLeft: `1.5px solid ${borderColor}` } : {}),
                  ...(pos === "tr" ? { top: 0, right: 0, borderTop: `1.5px solid ${borderColor}`, borderRight: `1.5px solid ${borderColor}` } : {}),
                  ...(pos === "bl" ? { bottom: 0, left: 0, borderBottom: `1.5px solid ${borderColor}`, borderLeft: `1.5px solid ${borderColor}` } : {}),
                  ...(pos === "br" ? { bottom: 0, right: 0, borderBottom: `1.5px solid ${borderColor}`, borderRight: `1.5px solid ${borderColor}` } : {}),
                };
                return <span key={pos} style={mk} />;
              })}
            </>
          )}
          {/* Collection dots */}
          {collectionColors && collectionColors.length > 0 && !isMultiSelected && !isSelected && (
            <div className="flex gap-0.5 shrink-0">
              {collectionColors.map((c) => (
                <div key={c} className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
              ))}
            </div>
          )}
          <p style={{ fontSize: 10, fontWeight: 500, color: "#2a2a2a", flex: 1, lineHeight: 1.4 }}>
            {card.title}
          </p>
          {(isMultiSelected || isSelected) && (
            <span style={{ fontSize: 8, color: "#000", flexShrink: 0, marginRight: 2 }}>✓</span>
          )}
          {isSaved && !isSelected && !isMultiSelected && (
            <span style={{ fontSize: 9, color: "rgba(0,0,0,0.55)", flexShrink: 0, marginRight: 2 }}>★</span>
          )}
          <button
            className="absolute right-1.5 opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 flex items-center justify-center text-[rgba(0,0,0,0.3)] hover:text-black text-[9px] leading-none"
            style={{ top: "50%", transform: "translateY(-50%)" }}
            onClick={(e) => { e.stopPropagation(); onRemove(genId, card.id); }}
            title="Remove from tree"
          >✕</button>
        </div>
        <Handle type="source" position={Position.Right} style={handleStyle("right")} />
      </>
    );
  }

  // ── Note card ───────────────────────────────────────────────────────────────
  return (
    <>
      <Handle type="target" position={Position.Left} style={handleStyle("left")} />
      <div
        className="relative group"
        style={{
          width: NODE_W,
          height: NODE_H,
          background: bgColor,
          border: `1px solid ${borderColor}`,
          borderRadius: 0,
          boxShadow: shadow,
          transition: "all 0.15s ease",
          overflow: "hidden",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        {collectionColors && collectionColors.length > 0 && !isMultiSelected && !isSelected && (
          <div className="absolute top-1.5 left-1.5 flex gap-0.5">
            {collectionColors.map((c) => (
              <div key={c} className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c }} />
            ))}
          </div>
        )}
        {!connectMode && (
          <button
            className="absolute right-1.5 opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 flex items-center justify-center text-[rgba(0,0,0,0.3)] hover:text-black text-[9px] leading-none z-10"
            style={{ top: "50%", transform: "translateY(-50%)" }}
            onClick={(e) => { e.stopPropagation(); onRemove(genId, card.id); }}
            title="Remove from tree"
          >✕</button>
        )}
        <div className="p-2.5 flex flex-col justify-center" style={{ height: NODE_H }}>
          {card.type !== "note" && (
            <div className="flex items-center gap-1.5 pr-4">
              <span
                className="text-[8px] uppercase tracking-[0.14em] shrink-0"
                style={{ color: "rgba(0,0,0,0.45)" }}
              >
                {TYPE_LABEL[card.type]}
              </span>
              {(isMultiSelected || isSelected) && <span className="text-[9px] text-black shrink-0">✓</span>}
              {isSaved && <span className="text-[10px] shrink-0" style={{ color: "rgba(0,0,0,0.5)" }} title="Saved">★</span>}
            </div>
          )}
          <p className="text-[11px] text-[#111] leading-tight line-clamp-2 flex-1">
            {card.title}
          </p>
          {card.type !== "note" && (
            <p className="text-[9px] truncate" style={{ color: "rgba(0,0,0,0.3)" }}>
              {ACTION_LABEL[actionType] ?? actionType}
            </p>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={handleStyle("right")} />
    </>
  );
}

const VISUAL_QUICK_ACTIONS: { id: ActionType; label: string }[] = [
  { id: "analyze",               label: "Analyze" },
  { id: "visual_variations",     label: "Variations" },
  { id: "conceptual_variations", label: "Concepts" },
];

function VisualCardNode(props: NodeProps) {
  const data = props.data as unknown as CardNodeData;
  const { card, isSelected, isHovered, isAncestor, isSourceOfSelected, isMultiSelected, isSaved, collectionColors, connectMode, onRemove, onQuickBranch, genId } = data;
  const handleStyle = (pos: "left" | "right"): React.CSSProperties => ({
    opacity: connectMode ? 1 : 0,
    pointerEvents: connectMode ? "auto" : "none",
    width: 10, height: 10,
    background: pos === "right" ? "#64748b" : "#94a3b8",
    border: "2px solid white",
    borderRadius: "50%",
  });
  const s = TYPE_STYLE.visual;
  const visualCard = card as VisualCard;
  const primaryColor = collectionColors?.[0];
  const SOURCE_COLOR = "#2d4f8a";

  const borderColor = isMultiSelected ? primaryColor ?? "#000"
    : isSelected ? "#000"
    : isSourceOfSelected ? SOURCE_COLOR
    : isAncestor ? "rgba(0,0,0,0.4)"
    : primaryColor ?? s.border;
  const shadow = isMultiSelected ? `0 0 0 2px ${primaryColor ?? "rgba(0,0,0,0.4)"}`
    : isSelected ? "2px 2px 0px #000"
    : isSourceOfSelected ? `0 0 0 1.5px ${SOURCE_COLOR}`
    : isAncestor ? "0 0 0 1px rgba(0,0,0,0.2)"
    : isHovered ? "1px 1px 0px #888"
    : "none";

  return (
    <>
      <Handle type="target" position={Position.Left} style={handleStyle("left")} />
      <div
        className="relative group"
        style={{
          width: VISUAL_NODE_W,
          height: VISUAL_NODE_H,
          border: `1px solid ${borderColor}`,
          borderRadius: 0,
          boxShadow: shadow,
          transition: "all 0.15s ease",
          overflow: "hidden",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <button
          className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 rounded flex items-center justify-center text-[#ccc] hover:text-red-400 hover:bg-red-50 text-[10px] leading-none z-20"
          onClick={(e) => { e.stopPropagation(); onRemove(genId, card.id); }}
          title="Remove from tree"
        >✕</button>

        <div className="absolute top-0 left-0 right-0 p-2 flex items-center gap-1.5 z-10 bg-gradient-to-b from-black/30 to-transparent">
          <span className="text-[8px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 bg-black/50 text-white">
            {TYPE_LABEL[card.type]}
          </span>
          {(isMultiSelected || isSelected) && <span className="text-[9px] text-white shrink-0">✓</span>}
          {isSaved && <span className="text-[9px] text-white/80 shrink-0">★</span>}
          {collectionColors && collectionColors.length > 0 && !isMultiSelected && !isSelected && (
            <div className="flex gap-0.5">
              {collectionColors.map((c) => (
                <div key={c} className="w-2 h-2 rounded-full ring-1 ring-white/50 shrink-0" style={{ background: c }} />
              ))}
            </div>
          )}
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={visualCard.imageDataUrl}
          alt={card.title}
          className="w-full h-full object-cover"
        />

        <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/80 via-black/50 to-transparent z-10 transition-all duration-150">
          <p className="text-[9px] text-white leading-tight truncate font-medium mb-1">
            {card.title}
          </p>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <p className="text-[7px] text-white/60 uppercase tracking-wider font-semibold mb-1">Use for →</p>
            <div className="flex gap-1 flex-wrap">
              {VISUAL_QUICK_ACTIONS.map((a) => (
                <button
                  key={a.id}
                  onClick={(e) => { e.stopPropagation(); onQuickBranch(a.id); }}
                  className="text-[7px] bg-white/20 hover:bg-white/45 text-white px-1.5 py-0.5 rounded transition-colors whitespace-nowrap"
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={handleStyle("right")} />
    </>
  );
}

// ── Brief node ────────────────────────────────────────────────────────────────
function BriefNode(props: NodeProps) {
  const data = props.data as unknown as BriefNodeData;
  const draftInputRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);
  const { isSelected } = data;

  return (
    <>
      <div
        style={{
          width: INPUT_NODE_W,
          minHeight: BRIEF_NODE_H,
          background: "rgba(255,255,255,0.5)",
          border: `1.5px solid #000`,
          borderRadius: 0,
          boxShadow: isSelected ? "2px 2px 0px #000" : "none",
          padding: "12px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <p style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(0,0,0,0.45)", margin: 0, fontFamily: "inherit" }}>
            Project Brief
          </p>
          {isSelected && <span style={{ fontSize: 9, color: "#000" }}>✓</span>}
        </div>
        <input
          className="nodrag nopan"
          value={data.title}
          onChange={(e) => data.onTitleChange(e.target.value)}
          placeholder="Project title"
          style={{
            fontSize: 14, fontWeight: 700, color: "#000", background: "transparent",
            border: "none", borderBottom: "1px solid rgba(0,0,0,0.2)", outline: "none",
            width: "100%", paddingBottom: 4, fontFamily: "inherit",
          }}
        />
        <textarea
          className="nodrag nopan"
          value={data.brief}
          onChange={(e) => data.onBriefChange(e.target.value)}
          placeholder="Describe your design challenge…"
          rows={4}
          style={{
            fontSize: 12, color: "#333232", background: "white",
            border: "1px solid rgba(0,0,0,0.7)", borderRadius: 0, padding: "6px 8px",
            resize: "none", outline: "none", width: "100%", lineHeight: 1.55,
            fontFamily: "inherit",
          }}
        />
        <input
          ref={draftInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={data.onAddDraftFile}
        />
        <input
          ref={refInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={data.onAddReferenceFile}
        />
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className="nodrag nopan"
            onClick={(e) => { e.stopPropagation(); draftInputRef.current?.click(); }}
            style={{
              flex: 1, fontSize: 11, color: "rgba(51,50,50,0.7)", background: "transparent",
              border: "1px dashed rgba(0,0,0,0.35)", borderRadius: 0, padding: "5px 0",
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            + Draft
          </button>
          <button
            className="nodrag nopan"
            onClick={(e) => { e.stopPropagation(); refInputRef.current?.click(); }}
            style={{
              flex: 1, fontSize: 11, color: "rgba(51,50,50,0.7)", background: "transparent",
              border: "1px dashed rgba(0,0,0,0.35)", borderRadius: 0, padding: "5px 0",
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            + References
          </button>
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{
        opacity: data.connectMode ? 1 : 0,
        pointerEvents: data.connectMode ? "auto" : "none",
        width: 10, height: 10, background: "#64748b", border: "2px solid white", borderRadius: "50%",
      }} />
    </>
  );
}

// ── Asset node ────────────────────────────────────────────────────────────────
function AssetNode(props: NodeProps) {
  const data = props.data as unknown as AssetNodeData;
  const { asset, onRemove, isSelected } = data;
  const isDraft = asset.type === "draft";
  const handleStyle: React.CSSProperties = {
    opacity: data.connectMode ? 1 : 0,
    pointerEvents: data.connectMode ? "auto" : "none",
    width: 10, height: 10, background: "#64748b", border: "2px solid white", borderRadius: "50%",
  };

  if (isDraft) {
    return (
      <>
        <div
          className="group"
          style={{
            width: VISUAL_NODE_W,
            height: VISUAL_NODE_H,
            border: `1px solid ${isSelected ? "#000" : "rgba(0,0,0,0.3)"}`,
            borderRadius: 0,
            boxShadow: isSelected ? "2px 2px 0px #000" : "none",
            overflow: "hidden",
            position: "relative",
            cursor: "pointer",
          }}
        >
          <button
            className="nodrag nopan absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 rounded flex items-center justify-center text-[#ccc] hover:text-red-400 hover:bg-red-50 text-[10px] leading-none z-20"
            onClick={(e) => { e.stopPropagation(); onRemove(asset.id); }}
            title="Remove"
          >✕</button>
          <div className="absolute top-0 left-0 right-0 p-2 flex items-center gap-1.5 z-10 bg-gradient-to-b from-black/30 to-transparent">
            <span style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, padding: "2px 6px", borderRadius: 4, background: "rgba(0,0,0,0.45)", color: "white" }}>
              ✎ Draft
            </span>
            {isSelected && <span style={{ fontSize: 9, color: "white", background: "rgba(37,99,235,0.8)", padding: "1px 5px", borderRadius: 4, fontWeight: 700 }}>✓</span>}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={asset.dataUrl} alt={asset.fileName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/70 via-black/40 to-transparent z-10">
            <p style={{ fontSize: 9, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>
              {asset.fileName}
            </p>
          </div>
        </div>
        <Handle type="source" position={Position.Right} style={handleStyle} />
      </>
    );
  }

  return (
    <>
      <div
        className="group"
        style={{
          width: INPUT_NODE_W,
          height: ASSET_NODE_H,
          background: "#fafaf8",
          border: `1px solid ${isSelected ? "#000" : "rgba(0,0,0,0.2)"}`,
          borderRadius: 0,
          boxShadow: isSelected ? "2px 2px 0px #000" : "none",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 10px",
          position: "relative",
        }}
      >
        <button
          className="nodrag nopan absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 rounded flex items-center justify-center text-[#ccc] hover:text-red-400 hover:bg-red-50 text-[10px] leading-none z-10"
          onClick={(e) => { e.stopPropagation(); onRemove(asset.id); }}
          title="Remove"
        >✕</button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset.dataUrl} alt={asset.fileName} style={{ width: 68, height: 68, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
            <p style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(0,0,0,0.45)", margin: 0, fontFamily: "inherit" }}>
              ◈ Reference
            </p>
            {isSelected && <span style={{ fontSize: 9, color: "#000" }}>✓</span>}
          </div>
          <p style={{ fontSize: 10, color: "#444", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {asset.fileName}
          </p>
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={handleStyle} />
    </>
  );
}

const nodeTypes: NodeTypes = {
  textCard: TextCardNode,
  visualCard: VisualCardNode,
  briefNode: BriefNode,
  assetNode: AssetNode,
};

function ProvenanceEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data, selected }: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const { onDelete, color, dashed, isSourceEdge } = (data ?? {}) as { onDelete?: () => void; color?: string; dashed?: boolean; isSourceEdge?: boolean };
  const stroke = selected ? "#000" : (color ?? "#94a3b8");
  const strokeWidth = isSourceEdge ? 2.5 : selected ? 2 : 1.5;
  const strokeOpacity = isSourceEdge ? 0.85 : selected ? 0.9 : 0.45;
  return (
    <>
      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={20} style={{ cursor: "pointer" }} />
      <BaseEdge path={edgePath} markerEnd={markerEnd}
        style={{ stroke, strokeWidth, strokeOpacity, strokeDasharray: dashed ? "5 4" : undefined, transition: "stroke 0.15s, stroke-opacity 0.15s, stroke-width 0.15s" }} />
      {selected && onDelete && (
        <EdgeLabelRenderer>
          <div style={{ position: "absolute", transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`, pointerEvents: "all" }}
            className="nodrag nopan">
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Remove connection"
              className="w-5 h-5 rounded-full bg-white border border-[#ccc] text-[#888] hover:text-red-500 hover:border-red-300 flex items-center justify-center text-[10px] leading-none shadow-sm transition-colors">
              ✕
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

function ManualEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data, selected }: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const { onDelete } = (data ?? {}) as { onDelete?: () => void };
  const stroke = selected ? "#2563eb" : "#64748b";
  return (
    <>
      {/* Invisible wide hit-area so the thin dashed line is easy to click */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ cursor: "pointer" }}
      />
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{ stroke, strokeWidth: 1.5, strokeDasharray: "5 3", transition: "stroke 0.1s" }}
      />
      {(hovered || selected) && onDelete && (
        <EdgeLabelRenderer>
          <div
            style={{ position: "absolute", transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`, pointerEvents: "all" }}
            className="nodrag nopan"
          >
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              title="Remove connection"
              className="w-5 h-5 rounded-full bg-white border border-[#ccc] text-[#888] hover:text-red-500 hover:border-red-300 flex items-center justify-center text-[10px] leading-none shadow-sm transition-colors"
            >
              ✕
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const edgeTypes: EdgeTypes = { manualEdge: ManualEdge, provenanceEdge: ProvenanceEdge };

// Reads positions from ReactFlow's internal store (sync with drag frames, no lag)
function CollectionHalos({ collections }: { collections: Collection[] }) {
  const nodes = useNodes();
  const { x, y, zoom } = useViewport();
  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ width: "100%", height: "100%", zIndex: -1, overflow: "visible", mixBlendMode: "multiply" }}
    >
      <defs>
        <filter id="halo-blur" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="34" />
        </filter>
      </defs>
      <g transform={`translate(${x},${y}) scale(${zoom})`}>
        {collections.map((col) => (
          <g key={col.id}>
            {col.cardIds.flatMap((cid) => {
              const rn = nodes.find((n) => n.id === cid);
              if (!rn) return [];
              const cx = rn.position.x + ((rn.measured?.width ?? rn.width ?? NODE_W) / 2);
              const cy = rn.position.y + ((rn.measured?.height ?? rn.height ?? NODE_H) / 2);
              return [
                <circle key={cid} cx={cx} cy={cy} r={95} fill={col.color} opacity={0.38} filter="url(#halo-blur)" />,
              ];
            })}
          </g>
        ))}
      </g>
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  generations: Generation[];
  allGenerations: Generation[];
  isGenerating: boolean;
  generatingAction: ActionType | null;
  assets: Asset[];
  brief: string;
  title: string;
  hoveredSourceIds: Set<string>;
  onHoverSources: (cardIds: Set<string>, assetIds: Set<string>) => void;
  onBranchFrom: (card: ResultCard, action: ActionType) => void;
  onMultiBranchFrom: (cards: ResultCard[], action: ActionType) => void;
  onAddUserNode: (card: ResultCard, parentCardIds: string[]) => void;
  onDuplicateCard: (originalCard: ResultCard, parentCardIds: string[]) => void;
  onClearTree: () => void;
  onDismissCard: (genId: string, cardId: string) => void;
  onUpdateCard: (card: ResultCard) => void;
  onAddAsReference: (dataUrl: string, label: string) => void;
  onBriefChange: (v: string) => void;
  onTitleChange: (v: string) => void;
  onAddAsset: (asset: Asset) => void;
  onRemoveAsset: (id: string) => void;
  onSelectionChange?: (ids: string[]) => void;
  collections: Collection[];
  onAddCollection: (col: Collection) => void;
  onAddCardsToCollection: (collectionId: string, cardIds: string[]) => void;
  onRemoveProvenanceEdge: (fromId: string, toCardId: string) => void;
  manualEdges: ManualEdge[];
  onAddManualEdge: (edge: ManualEdge) => void;
  onRemoveManualEdge: (id: string) => void;
}

export default function TreeView({
  generations, allGenerations, isGenerating, generatingAction, assets,
  brief, title, hoveredSourceIds, onHoverSources, onBranchFrom,
  onMultiBranchFrom, onAddUserNode, onDuplicateCard, onClearTree, onDismissCard, onUpdateCard, onAddAsReference,
  onBriefChange, onTitleChange, onAddAsset, onRemoveAsset, onSelectionChange,
  collections, onAddCollection, onAddCardsToCollection,
  manualEdges, onAddManualEdge, onRemoveManualEdge, onRemoveProvenanceEdge,
}: Props) {
  const { nodes, edges } = useMemo(
    () => computeLayout(generations, allGenerations),
    [generations, allGenerations]
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedInputId, setSelectedInputId] = useState<string | null>(null);
  const [multiSelectedIds, setMultiSelectedIds] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [addNodeState, setAddNodeState] = useState<{ parentIds: string[] } | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [positionOverrides, setPositionOverrides] = useState<Record<string, { x: number; y: number }>>(() => {
    try { return JSON.parse(localStorage.getItem("treeview-positions") ?? "{}"); } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem("treeview-positions", JSON.stringify(positionOverrides)); } catch {}
  }, [positionOverrides]);
  const [toasts, setToasts] = useState<{ id: string; message: string }[]>([]);
  const seenGenErrorIds = useRef<Set<string>>(new Set());
  const [showCollectionColors, setShowCollectionColors] = useState(false);
  const [connectMode, setConnectMode] = useState(false);
  const [collectionPickerOpen, setCollectionPickerOpen] = useState(false);
  const [creatingInPicker, setCreatingInPicker] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");

  useEffect(() => {
    const newToasts: { id: string; message: string }[] = [];
    for (const gen of generations) {
      if (seenGenErrorIds.current.has(gen.id)) continue;
      seenGenErrorIds.current.add(gen.id);

      if (gen.error) {
        newToasts.push({ id: `${gen.id}-gen`, message: gen.error });
      }

      const failedCards = gen.cards.filter(
        (c) => c.type === "visual" && (c as VisualCard).error
      );
      if (failedCards.length > 0) {
        const label = failedCards.length === 1
          ? `1 visual dimension failed: ${(failedCards[0] as VisualCard).error}`
          : `${failedCards.length} visual dimensions failed`;
        newToasts.push({ id: `${gen.id}-cards`, message: label });
      }
    }
    if (newToasts.length === 0) return;
    setToasts((prev) => [...prev, ...newToasts]);
    const ids = newToasts.map((t) => t.id);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => !ids.includes(t.id)));
    }, 6000);
    return () => clearTimeout(timer);
  }, [generations]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (multiSelectedIds.size > 0) {
      onSelectionChange?.([...multiSelectedIds]);
    } else {
      onSelectionChange?.(selectedId ? [selectedId] : []);
    }
  }, [multiSelectedIds, selectedId, onSelectionChange]);

  const cardIds = useMemo(() => new Set(nodes.map((n) => n.card.id)), [nodes]);

  const cardCollectionsMap = useMemo(() => {
    const map = new Map<string, string[]>(); // cardId → [colors]
    for (const col of collections) {
      for (const cid of col.cardIds) {
        const prev = map.get(cid) ?? [];
        map.set(cid, [...prev, col.color]);
      }
    }
    return map;
  }, [collections]);

  const selectedNode = nodes.find((n) => n.card.id === selectedId) ?? null;
  const effectiveSelectedIds: Set<string> = multiSelectedIds.size > 0
    ? multiSelectedIds
    : (selectedId ? new Set([selectedId]) : new Set<string>());
  const siblings = selectedNode
    ? nodes.filter((n) => n.genId === selectedNode.genId && n.card.id !== selectedNode.card.id)
    : [];

  const selectedInputIsBrief = selectedInputId === "__brief__";
  const selectedInputAsset = selectedInputId?.startsWith("__asset_")
    ? assets.find((a) => a.id === selectedInputId.replace("__asset_", "")) ?? null
    : null;

  const hoveredAncestorIds = useMemo(() => {
    if (!hoveredId) return new Set<string>();
    const hNode = nodes.find((n) => n.card.id === hoveredId);
    return new Set((hNode?.parentCardIds ?? []).filter((pid) => cardIds.has(pid)));
  }, [hoveredId, nodes, cardIds]);

  const selectedAncestorIds = useMemo(() => {
    if (!selectedId) return new Set<string>();
    const selNode = nodes.find((n) => n.card.id === selectedId);
    return new Set((selNode?.parentCardIds ?? []).filter((pid) => cardIds.has(pid)));
  }, [selectedId, nodes, cardIds]);

  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);

  const [panelWidth, setPanelWidth] = useState(272);
  const handlePanelResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = panelWidth;
    const onMove = (ev: PointerEvent) => {
      const delta = startX - ev.clientX;
      setPanelWidth(Math.max(200, Math.min(560, startWidth + delta)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [panelWidth]);

  const handleRemove = useCallback((genId: string, cardId: string) => {
    onDismissCard(genId, cardId);
    setSelectedId(null);
  }, [onDismissCard]);

  const handleQuickBranch = useCallback((card: ResultCard, action: ActionType) => {
    if (card.type === "visual" && (card as VisualCard).imageDataUrl) {
      onAddAsReference(
        (card as VisualCard).imageDataUrl!,
        (card as VisualCard).dimensionLabel || card.title,
      );
    }
    onBranchFrom(card, action);
  }, [onAddAsReference, onBranchFrom]);

  const handleNodeDragStop = useCallback((_evt: MouseEvent | TouchEvent, node: Node) => {
    setPositionOverrides((prev) => ({ ...prev, [node.id]: node.position }));
  }, []);

  const handleMultiAction = useCallback((action: ActionType) => {
    const targetIds = multiSelectedIds.size > 0 ? multiSelectedIds : (selectedId ? new Set([selectedId]) : new Set<string>());
    const cards = nodes
      .filter((n) => targetIds.has(n.card.id))
      .map((n) => n.card);
    onMultiBranchFrom(cards, action);
    setMultiSelectedIds(new Set());
    setSelectedId(null);
    setSelectedInputId(null);
  }, [nodes, multiSelectedIds, selectedId, onMultiBranchFrom]);

  // ── File upload handlers ───────────────────────────────────────────────────
  const handleDraftFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        onAddAsset({ id: crypto.randomUUID(), type: "draft", fileName: file.name, dataUrl: reader.result as string, note: "" });
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  }, [onAddAsset]);

  const handleRefFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        onAddAsset({ id: crypto.randomUUID(), type: "reference", fileName: file.name, dataUrl: reader.result as string, note: "" });
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  }, [onAddAsset]);

  // ── Input nodes (brief + assets) ──────────────────────────────────────────
  const inputRfNodes = useMemo((): Node[] => {
    const result: Node[] = [];
    let y = PAD;

    result.push({
      id: "__brief__",
      type: "briefNode",
      position: positionOverrides["__brief__"] ?? { x: PAD, y },
      data: {
        title, brief, onTitleChange, onBriefChange,
        onAddDraftFile: handleDraftFileChange,
        onAddReferenceFile: handleRefFileChange,
        connectMode,
        isSelected: selectedInputId === "__brief__",
      } satisfies BriefNodeData,
      width: INPUT_NODE_W,
      height: BRIEF_NODE_H,
    });
    y += BRIEF_NODE_H + ROW_GAP;

    for (const asset of assets) {
      const assetH = asset.type === "draft" ? VISUAL_NODE_H : ASSET_NODE_H;
      result.push({
        id: `__asset_${asset.id}`,
        type: "assetNode",
        position: positionOverrides[`__asset_${asset.id}`] ?? { x: PAD, y },
        data: { asset, onRemove: onRemoveAsset, connectMode, isSelected: selectedInputId === `__asset_${asset.id}` } satisfies AssetNodeData,
        width: INPUT_NODE_W,
        height: assetH,
      });
      y += assetH + ROW_GAP;
    }

    return result;
  }, [title, brief, assets, positionOverrides, connectMode, selectedInputId, onTitleChange, onBriefChange, onRemoveAsset, handleDraftFileChange, handleRefFileChange]);

  // ── Generation nodes (shifted right by INPUT_X_OFFSET) ───────────────────
  const rfNodes = useMemo((): Node[] =>
    nodes.map((node): Node => {
      const hasImage = node.card.type === "visual" && !!(node.card as VisualCard).imageDataUrl;
      const { w, h } = nodeDims(node.card);
      return {
        id: node.card.id,
        type: hasImage ? "visualCard" : "textCard",
        position: positionOverrides[node.card.id] ?? { x: node.x + INPUT_X_OFFSET, y: node.y },
        data: {
          card: node.card,
          genId: node.genId,
          actionType: node.actionType,
          parentCardIds: node.parentCardIds,
          includedDraftIds: node.includedDraftIds,
          includedReferenceIds: node.includedReferenceIds,
          cardIds,
          isSelected: node.card.id === selectedId,
          isHovered: node.card.id === hoveredId,
          isAncestor: hoveredAncestorIds.has(node.card.id)
            || node.parentCardIds.some((pid) => hoveredSourceIds.has(pid)),
          isSourceOfSelected: selectedAncestorIds.has(node.card.id),
          isSaved: false,
          isMultiSelected: multiSelectedIds.has(node.card.id),
          collectionColors: showCollectionColors ? cardCollectionsMap.get(node.card.id) : undefined,
          connectMode,
          onRemove: handleRemove,
          onQuickBranch: (action) => handleQuickBranch(node.card, action),
        } satisfies CardNodeData,
        width: w,
        height: h,
      };
    }),
    [nodes, cardIds, positionOverrides, selectedId, multiSelectedIds, hoveredId, hoveredAncestorIds, selectedAncestorIds, hoveredSourceIds, handleRemove, handleQuickBranch, showCollectionColors, cardCollectionsMap, connectMode]
  );

  // ── Generation edges ──────────────────────────────────────────────────────
  const SOURCE_EDGE_COLOR = "#2d4f8a";

  const rfEdges = useMemo((): RFEdge[] =>
    edges.map((edge): RFEdge => {
      const s = TYPE_STYLE[edge.toType] ?? TYPE_STYLE.concept;
      const isSourceEdge = !!selectedId && edge.toId === selectedId;
      const isActive = hoveredId === edge.toId || hoveredId === edge.fromId
        || hoveredSourceIds.has(edge.fromId);
      const color = isSourceEdge ? SOURCE_EDGE_COLOR
        : isActive ? "rgba(0,0,0,0.7)"
        : s.line;
      return {
        id: `${edge.fromId}-${edge.toId}`,
        source: edge.fromId,
        target: edge.toId,
        type: "provenanceEdge",
        selectable: true,
        data: {
          color,
          isSourceEdge,
          onDelete: () => onRemoveProvenanceEdge(edge.fromId, edge.toId),
        },
        markerEnd: {
          type: MarkerType.Arrow,
          color,
          width: isSourceEdge ? 14 : 12,
          height: isSourceEdge ? 14 : 12,
          strokeWidth: 0,
        },
      };
    }),
    [edges, selectedId, hoveredId, hoveredSourceIds, onRemoveProvenanceEdge]
  );

  // ── Input → generation edges ──────────────────────────────────────────────
  const inputRfEdges = useMemo((): RFEdge[] => {
    const result: RFEdge[] = [];

    // Brief → unpack_brief nodes
    for (const node of nodes.filter((n) => n.actionType === "unpack_brief")) {
      result.push({
        id: `__brief__-${node.card.id}`,
        source: "__brief__",
        target: node.card.id,
        type: "default",
        style: { stroke: "rgba(0,0,0,0.3)", strokeWidth: 1.5, strokeOpacity: 0.6, strokeDasharray: "5 4" },
        markerEnd: { type: MarkerType.Arrow, color: "rgba(0,0,0,0.3)", width: 10, height: 10, strokeWidth: 0 },
      });
    }

    // Each asset → generations that explicitly included it
    for (const asset of assets) {
      for (const node of nodes) {
        const included = asset.type === "draft"
          ? node.includedDraftIds.includes(asset.id)
          : node.includedReferenceIds.includes(asset.id);
        if (included) {
          const color = asset.type === "draft" ? "#888" : "#6666cc";
          const fromId = `__asset_${asset.id}`;
          result.push({
            id: `${fromId}-${node.card.id}`,
            source: fromId,
            target: node.card.id,
            type: "provenanceEdge",
            selectable: true,
            data: {
              color,
              dashed: true,
              onDelete: () => onRemoveProvenanceEdge(fromId, node.card.id),
            },
            markerEnd: { type: MarkerType.Arrow, color, width: 10, height: 10, strokeWidth: 0 },
          });
        }
      }
    }

    return result;
  }, [nodes, cardIds, assets, onRemoveProvenanceEdge]);

  const allRfNodes = useMemo(() => [...inputRfNodes, ...rfNodes], [inputRfNodes, rfNodes]);

  const manualRfEdges = useMemo((): RFEdge[] =>
    manualEdges
      .filter((e) => {
        const valid = (id: string) => cardIds.has(id) || id === "__brief__" || id.startsWith("__asset_");
        return valid(e.fromCardId) && valid(e.toCardId);
      })
      .map((e): RFEdge => ({
        id: `manual_${e.id}`,
        source: e.fromCardId,
        target: e.toCardId,
        type: "manualEdge",
        data: { onDelete: () => onRemoveManualEdge(e.id) },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#64748b", width: 12, height: 12, strokeWidth: 0 },
        selectable: true,
        focusable: true,
        deletable: true,
      })),
    [manualEdges, cardIds, onRemoveManualEdge]
  );

  const allRfEdges = useMemo(() => [...inputRfEdges, ...rfEdges, ...manualRfEdges], [inputRfEdges, rfEdges, manualRfEdges]);

  // ── Controlled ReactFlow state (required for drag + edge interaction) ──────
  // We manage displayNodes/displayEdges ourselves so ReactFlow can track
  // in-flight drag positions via applyNodeChanges. The sync effect must
  // PRESERVE current node positions: hoveredId changes cause allRfNodes to
  // recompute mid-drag, and a naive setDisplayNodes(allRfNodes) would reset
  // the dragged position, triggering ReactFlow error #015.
  const [displayNodes, setDisplayNodes] = useState<Node[]>(allRfNodes);
  const [displayEdges, setDisplayEdges] = useState<RFEdge[]>(allRfEdges);

  useEffect(() => {
    setDisplayNodes((current) => {
      const nodeMap = new Map(current.map((n) => [n.id, n]));
      return allRfNodes.map((n) => {
        const existing = nodeMap.get(n.id);
        if (!existing) return n; // new node — use layout position directly
        // Use existing as base so ReactFlow's internal state (measured dimensions,
        // internals map, etc.) survives the re-render. Override only data fields
        // that change (isHovered, connectMode, etc.). Preserve position while the
        // node is actively being dragged; otherwise use the layout/override pos.
        return {
          ...existing,
          data: n.data,
          position: existing.dragging ? existing.position : n.position,
        };
      });
    });
  }, [allRfNodes]);

  useEffect(() => { setDisplayEdges(allRfEdges); }, [allRfEdges]);

  const onNodesChange = useCallback((changes: NodeChange<Node>[]) => {
    setDisplayNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<RFEdge>[]) => {
    for (const change of changes) {
      if (change.type === "remove" && change.id.startsWith("manual_")) {
        onRemoveManualEdge(change.id.slice("manual_".length));
      }
    }
    setDisplayEdges((eds) => applyEdgeChanges(changes, eds));
  }, [onRemoveManualEdge]);

  // ── Event handlers ────────────────────────────────────────────────────────
  const handleNodeClick = useCallback((event: React.MouseEvent, rfNode: Node) => {
    if (rfNode.id === "__brief__" || rfNode.id.startsWith("__asset_")) {
      if (!event.shiftKey) {
        setSelectedInputId((prev) => (prev === rfNode.id ? null : rfNode.id));
        setSelectedId(null);
        setMultiSelectedIds(new Set());
      }
      return;
    }
    setSelectedInputId(null);
    if (event.shiftKey) {
      setMultiSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(rfNode.id)) next.delete(rfNode.id);
        else next.add(rfNode.id);
        return next;
      });
      setSelectedId(null);
    } else {
      setSelectedId((prev) => (prev === rfNode.id ? null : rfNode.id));
      setMultiSelectedIds(new Set());
    }
  }, []);

  const handleNodeMouseEnter = useCallback((_: React.MouseEvent, rfNode: Node) => {
    if (rfNode.id === "__brief__" || rfNode.id.startsWith("__asset_")) return;
    const data = rfNode.data as unknown as CardNodeData;
    setHoveredId(rfNode.id);
    const offTreeCardIds = data.parentCardIds.filter((pid) => !data.cardIds.has(pid));
    onHoverSources(
      new Set(offTreeCardIds),
      new Set([...data.includedDraftIds, ...data.includedReferenceIds])
    );
  }, [onHoverSources]);

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredId(null);
    onHoverSources(new Set(), new Set());
  }, [onHoverSources]);

  const handleConnect = useCallback((connection: Connection) => {
    const { source, target } = connection;
    if (!source || !target || source === target) return;
    onAddManualEdge({ id: crypto.randomUUID(), fromCardId: source, toCardId: target });
  }, [onAddManualEdge]);

  const handleNodesDelete = useCallback((deletedNodes: Node[]) => {
    for (const rfNode of deletedNodes) {
      if (rfNode.id === "__brief__" || rfNode.id.startsWith("__asset_")) continue;
      const layoutNode = nodes.find((n) => n.card.id === rfNode.id);
      if (layoutNode) handleRemove(layoutNode.genId, rfNode.id);
    }
  }, [nodes, handleRemove]);

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* ── React Flow canvas ────────────────────────────────────────────── */}
      <div className="flex-1 h-full" style={{ background: "#f0eeeb" }}>
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onNodeMouseEnter={handleNodeMouseEnter}
          onNodeMouseLeave={handleNodeMouseLeave}
          onPaneClick={() => { setSelectedId(null); setSelectedInputId(null); setMultiSelectedIds(new Set()); setCollectionPickerOpen(false); }}
          onInit={(instance) => {
            rfInstanceRef.current = instance;
            instance.fitView({ padding: 0.15 });
          }}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.2}
          maxZoom={2.0}
          nodesDraggable={true}
          onNodeDragStop={handleNodeDragStop}
          onNodesDelete={handleNodesDelete}
          connectOnClick={false}
          nodesConnectable={connectMode}
          onConnect={handleConnect}
          deleteKeyCode={["Delete", "Backspace"]}
        >
          {showCollectionColors && <CollectionHalos collections={collections} />}

          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1}
            color="rgba(0,0,0,0.15)"
          />
          <Controls showInteractive={false} />

          {/* Empty state hint */}
          {nodes.length === 0 && !isGenerating && (
            <Panel position="top-center">
              <div className="mt-8 text-[12px] italic text-[rgba(0,0,0,0.35)] bg-white/80 border border-[rgba(0,0,0,0.1)] px-4 py-2.5" style={{ borderRadius: 0 }}>
                Fill in your brief and run an action to build the concept tree
              </div>
            </Panel>
          )}

          {/* Top-right: Color toggle + Connect mode + Add node + Clear all */}
          <Panel position="top-right">
            <div className="flex items-center gap-1.5 mr-2 mt-2">
              <button
                onClick={() => setConnectMode((p) => !p)}
                title={connectMode ? "Exit connect mode (Drag handles to connect nodes)" : "Enter connect mode to draw connections between nodes"}
                className={`border px-2.5 py-1.5 text-[11px] transition-colors flex items-center gap-1 ${
                  connectMode
                    ? "bg-black border-black text-white"
                    : "bg-white border-[rgba(0,0,0,0.2)] text-[rgba(0,0,0,0.45)] hover:text-black hover:border-black"
                }`}
              style={{ borderRadius: 0 }}
              >
                <span className="text-[12px] leading-none">⌥</span>
                {connectMode ? "Connecting…" : "Connect"}
              </button>
              {connectMode && (
                <span className="text-[10px] italic text-[rgba(0,0,0,0.4)] bg-white border border-[rgba(0,0,0,0.15)] px-2 py-1" style={{ borderRadius: 0 }}>
                  Drag handle → node · Delete to remove
                </span>
              )}
              {collections.length > 0 && (
                <button
                  onClick={() => setShowCollectionColors((p) => !p)}
                  title={showCollectionColors ? "Hide collection colors" : "Show collection colors"}
                  className={`bg-white border px-2.5 py-1.5 text-[11px] transition-colors flex items-center gap-1 ${
                    showCollectionColors
                      ? "border-black text-black bg-[#f5f4f0]"
                      : "border-[rgba(0,0,0,0.2)] text-[rgba(0,0,0,0.45)] hover:text-black hover:border-black"
                  }`}
                  style={{ borderRadius: 0 }}
                >
                  <span className="text-[12px] leading-none">◉</span>
                  Colors
                </button>
              )}
              <button
                onClick={() => {
                  setAddNodeState({ parentIds: multiSelectedIds.size > 0 ? [...multiSelectedIds] : [] });
                  setSelectedId(null);
                  setConfirmingClear(false);
                }}
                className="bg-white border border-[rgba(0,0,0,0.2)] px-2.5 py-1.5 text-[11px] text-[rgba(0,0,0,0.5)] hover:text-black hover:border-black transition-colors flex items-center gap-1"
                style={{ borderRadius: 0 }}
                title="Add a new node"
              >
                <span className="text-[14px] leading-none font-light">+</span>
                Add node
              </button>

              {confirmingClear ? (
                <div className="bg-white border border-red-200 px-2.5 py-1.5 flex items-center gap-2" style={{ borderRadius: 0 }}>
                  <span className="text-[10px] text-red-500">Clear all?</span>
                  <button
                    onClick={() => { onClearTree(); setConfirmingClear(false); setSelectedId(null); setMultiSelectedIds(new Set()); setPositionOverrides({}); }}
                    className="text-[10px] font-semibold text-red-600 hover:text-red-800 transition-colors"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setConfirmingClear(false)}
                    className="text-[10px] text-[#aaa] hover:text-[#555] transition-colors"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingClear(true)}
                  className="bg-white border border-[rgba(0,0,0,0.2)] px-2.5 py-1.5 text-[11px] text-[rgba(0,0,0,0.35)] hover:text-red-500 hover:border-red-300 transition-colors"
                  style={{ borderRadius: 0 }}
                  title="Clear all nodes"
                >
                  Clear all
                </button>
              )}
            </div>
          </Panel>

          {/* Generating indicator */}
          {isGenerating && (
            <Panel position="top-center">
              <div className="flex items-center gap-2 bg-white border border-[#111] px-3 py-2 mt-2 text-[11px] text-[#555]" style={{ borderRadius: 0 }}>
                <span className="inline-block w-3 h-3 border-2 border-[#555] border-t-transparent rounded-full animate-spin shrink-0" />
                Running {generatingAction ? (ACTION_LABEL[generatingAction] ?? generatingAction) : "generation"}…
              </div>
            </Panel>
          )}

          {/* Selection action bar (single or multi, including input nodes) */}
          {(effectiveSelectedIds.size > 0 || !!selectedInputId) && (
            <Panel position="bottom-center">
              <div className="flex items-center gap-2 bg-white border border-[rgba(0,0,0,0.2)] px-3 py-2 mb-2 text-[11px]" style={{ borderRadius: 0 }}>
                <span className="text-[#555] font-medium pr-1">
                  {effectiveSelectedIds.size > 0 ? effectiveSelectedIds.size : 1} selected
                </span>
                <span className="text-[#ddd]">·</span>
                {BRANCH_ACTIONS.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => handleMultiAction(a.id)}
                    className="px-2.5 py-1 rounded-md bg-[#111] text-white hover:bg-[#333] transition-colors whitespace-nowrap"
                  >
                    {a.label} →
                  </button>
                ))}
                <span className="text-[#ddd]">·</span>
                {/* Collection picker */}
                <div className="relative">
                  <button
                    onClick={() => { setCollectionPickerOpen((p) => !p); setCreatingInPicker(false); }}
                    className={`px-2.5 py-1 rounded-md border transition-colors whitespace-nowrap ${
                      collectionPickerOpen
                        ? "bg-[#f0f0ff] border-[#6666cc] text-[#333]"
                        : "border-[#e4e3e0] text-[#555] hover:border-[#888] hover:text-[#111]"
                    }`}
                  >
                    Collection →
                  </button>
                  {collectionPickerOpen && (
                    <div className="absolute bottom-full left-0 mb-1.5 bg-white border border-[rgba(0,0,0,0.15)] shadow-lg p-1.5 min-w-[180px] z-50" style={{ borderRadius: 0 }}>
                      {collections.length === 0 && !creatingInPicker && (
                        <p className="text-[10px] text-[#aaa] px-2 py-1">No collections yet</p>
                      )}
                      {collections.map((col) => (
                        <button
                          key={col.id}
                          onClick={() => {
                            onAddCardsToCollection(col.id, [...effectiveSelectedIds]);
                            setCollectionPickerOpen(false);
                            setMultiSelectedIds(new Set());
                            setSelectedId(null);
                          }}
                          className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-[#f5f5f4] text-left"
                        >
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: col.color }} />
                          <span className="text-[11px] text-[#333] truncate">{col.title}</span>
                        </button>
                      ))}
                      {creatingInPicker ? (
                        <div className="px-2 py-1.5 flex items-center gap-1.5">
                          <input
                            autoFocus
                            placeholder="Collection name…"
                            value={newCollectionName}
                            onChange={(e) => setNewCollectionName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && newCollectionName.trim()) {
                                const newCol: Collection = {
                                  id: crypto.randomUUID(),
                                  title: newCollectionName.trim(),
                                  description: "",
                                  cardIds: [...effectiveSelectedIds],
                                  color: PICKER_COLORS[collections.length % PICKER_COLORS.length],
                                  createdAt: new Date().toISOString(),
                                };
                                onAddCollection(newCol);
                                setNewCollectionName("");
                                setCreatingInPicker(false);
                                setCollectionPickerOpen(false);
                                setMultiSelectedIds(new Set());
                                setSelectedId(null);
                              }
                              if (e.key === "Escape") { setCreatingInPicker(false); setNewCollectionName(""); }
                            }}
                            className="flex-1 text-[10px] border border-[#e4e3e0] rounded-md px-1.5 py-1 outline-none focus:border-blue-400 min-w-0"
                          />
                        </div>
                      ) : (
                        <button
                          onClick={() => setCreatingInPicker(true)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-[#f5f5f4] text-left border-t border-[#f0efec] mt-1 pt-2"
                        >
                          <span className="text-[11px] text-[#888]">+ New collection</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <span className="text-[#ddd]">·</span>
                <button
                  onClick={() => { setMultiSelectedIds(new Set()); setSelectedId(null); setSelectedInputId(null); }}
                  className="text-[#aaa] hover:text-[#555] transition-colors px-1"
                  title="Clear selection"
                >
                  ✕ Clear
                </button>
              </div>
            </Panel>
          )}

          {/* Error toasts */}
          {toasts.length > 0 && (
            <Panel position="bottom-left">
              <div className="flex flex-col gap-1.5 mb-2 ml-2 max-w-xs">
                {toasts.map((toast) => (
                  <div
                    key={toast.id}
                    className="flex items-start gap-2 bg-white border border-red-200 px-3 py-2 text-[11px]" style={{ borderRadius: 0 }}
                  >
                    <span className="text-red-500 shrink-0 mt-px">⚠</span>
                    <span className="text-[#333] flex-1 leading-snug">{toast.message}</span>
                    <button
                      onClick={() => dismissToast(toast.id)}
                      className="text-[#ccc] hover:text-[#555] transition-colors shrink-0 ml-1 leading-none"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* ── Node type legend ─────────────────────────────────────────── */}
          <Panel position="bottom-left">
            <div className="mb-2 ml-2 bg-white border border-[rgba(0,0,0,0.12)] px-3 py-2.5 flex flex-col gap-2" style={{ borderRadius: 0 }}>
              <p className="text-[8px] uppercase tracking-[0.16em] text-[rgba(0,0,0,0.35)] mb-0.5">Node types</p>
              {/* Concept */}
              <div className="flex items-center gap-2">
                <div style={{ width: 18, height: 14, borderLeft: "1.5px solid #000", flexShrink: 0 }} />
                <span className="text-[10px] text-[rgba(0,0,0,0.6)]">Concept</span>
              </div>
              {/* Motif */}
              <div className="flex items-center gap-2">
                <div className="relative shrink-0" style={{ width: 18, height: 14 }}>
                  <span style={{ position: "absolute", top: 0, left: 0, width: 6, height: 6, borderTop: "1.5px solid #000", borderLeft: "1.5px solid #000" }} />
                  <span style={{ position: "absolute", top: 0, right: 0, width: 6, height: 6, borderTop: "1.5px solid #000", borderRight: "1.5px solid #000" }} />
                  <span style={{ position: "absolute", bottom: 0, left: 0, width: 6, height: 6, borderBottom: "1.5px solid #000", borderLeft: "1.5px solid #000" }} />
                  <span style={{ position: "absolute", bottom: 0, right: 0, width: 6, height: 6, borderBottom: "1.5px solid #000", borderRight: "1.5px solid #000" }} />
                </div>
                <span className="text-[10px] text-[rgba(0,0,0,0.6)]">Motif</span>
              </div>
              {/* Note */}
              <div className="flex items-center gap-2">
                <div style={{ width: 18, height: 14, border: "1px solid rgba(0,0,0,0.25)", flexShrink: 0 }} />
                <span className="text-[10px] text-[rgba(0,0,0,0.6)]">Note</span>
              </div>
              {/* Visual */}
              <div className="flex items-center gap-2">
                <div style={{ width: 18, height: 14, border: "1px solid rgba(0,0,0,0.25)", background: "rgba(0,0,0,0.06)", flexShrink: 0 }} />
                <span className="text-[10px] text-[rgba(0,0,0,0.6)]">Visual</span>
              </div>
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* ── Add-node modal ───────────────────────────────────────────────── */}
      {addNodeState && (
        <AddNodeModal
          nodes={nodes}
          initialParentIds={addNodeState.parentIds}
          onAdd={(card: ResultCard, parentIds: string[]) => {
            onAddUserNode(card, parentIds);
            setAddNodeState(null);
          }}
          onClose={() => setAddNodeState(null)}
          onAddAsset={(asset) => {
            onAddAsset(asset);
            setAddNodeState(null);
          }}
        />
      )}

      {/* ── Detail panel ─────────────────────────────────────────────────── */}
      {(selectedNode || selectedInputIsBrief || selectedInputAsset) && (
        <div style={{ width: panelWidth, flexShrink: 0, position: "relative", display: "flex" }}>
          {/* Drag handle */}
          <div
            onPointerDown={handlePanelResizeStart}
            style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, cursor: "col-resize", zIndex: 10 }}
            className="hover:bg-blue-300/40 transition-colors"
          />
          {selectedNode ? (
            <DetailPanel
              node={selectedNode}
              siblings={siblings}
              assets={assets}
              onUpdateCard={onUpdateCard}
              onBranch={(action) => {
                const card = selectedNode.card;
                if (card.type === "visual" && (card as VisualCard).imageDataUrl) {
                  onAddAsReference(
                    (card as VisualCard).imageDataUrl!,
                    (card as VisualCard).dimensionLabel || card.title,
                  );
                }
                onBranchFrom(card, action);
                setSelectedId(null);
              }}
              onDuplicate={() => onDuplicateCard(selectedNode.card, selectedNode.parentCardIds)}
              onRemove={() => handleRemove(selectedNode.genId, selectedNode.card.id)}
              onSelectSibling={(id) => setSelectedId(id)}
              onClose={() => setSelectedId(null)}
              onAddAsReference={onAddAsReference}
              onAddChild={() => setAddNodeState({ parentIds: [selectedNode.card.id] })}
            />
          ) : selectedInputIsBrief ? (
            <InputDetailPanel
              type="brief"
              title={title}
              brief={brief}
              onTitleChange={onTitleChange}
              onBriefChange={onBriefChange}
              onClose={() => setSelectedInputId(null)}
            />
          ) : selectedInputAsset ? (
            <InputDetailPanel
              type="asset"
              asset={selectedInputAsset}
              onAddAsReference={onAddAsReference}
              onRemove={() => { onRemoveAsset(selectedInputAsset.id); setSelectedInputId(null); }}
              onClose={() => setSelectedInputId(null)}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

// ── Add node modal ────────────────────────────────────────────────────────────
const NODE_TYPE_OPTIONS = ["concept", "motif", "visual", "draft", "reference"] as const;
type UserNodeType = (typeof NODE_TYPE_OPTIONS)[number];

const ASSET_TYPE_BADGE: Record<string, { bg: string; text: string }> = {
  draft:     { bg: "#555", text: "#fff" },
  reference: { bg: "#4444aa", text: "#fff" },
};

function AddNodeModal({
  nodes,
  initialParentIds,
  onAdd,
  onClose,
  onAddAsset,
}: {
  nodes: LayoutNode[];
  initialParentIds: string[];
  onAdd: (card: ResultCard, parentIds: string[]) => void;
  onClose: () => void;
  onAddAsset: (asset: Asset) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [cardType, setCardType] = useState<UserNodeType | null>(null);
  const [parentIds, setParentIds] = useState<Set<string>>(new Set(initialParentIds));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAssetType = cardType === "draft" || cardType === "reference";
  const effectiveType = cardType ?? "note";

  const toggleParent = (id: string) =>
    setParentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function buildCard(): ResultCard {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const t = title.trim();
    const b = body.trim();
    switch (effectiveType) {
      case "concept": return { id, type: "concept", title: t, description: b, rationale: "", createdAt: now };
      case "motif":   return { id, type: "motif",   title: t, visualQuality: b, howItConveysIdea: "", category: "style", createdAt: now };
      case "visual":  return { id, type: "visual",  title: t, dimensionLabel: t, analysisText: b, createdAt: now };
      default:        return { id, type: "note", title: t, body: b, createdAt: now };
    }
  }

  function handleSubmit() {
    if (isAssetType) {
      if (!imageFile) return;
      const reader = new FileReader();
      reader.onload = () => {
        onAddAsset({
          id: crypto.randomUUID(),
          type: cardType as "draft" | "reference",
          fileName: imageFile.name,
          dataUrl: reader.result as string,
          note: "",
        });
        onClose();
      };
      reader.readAsDataURL(imageFile);
      return;
    }
    if (!title.trim()) return;
    onAdd(buildCard(), [...parentIds]);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div
        className="bg-white shadow-xl w-full max-w-md p-5" style={{ borderRadius: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[13px] font-semibold text-[#111]">Add node</h2>
          <button onClick={onClose} className="text-[#bbb] hover:text-[#555] text-base leading-none">✕</button>
        </div>

        {/* Type selector — two rows: card types + asset types */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {NODE_TYPE_OPTIONS.map((t) => {
            const s = TYPE_STYLE[t];
            const assetBadge = ASSET_TYPE_BADGE[t];
            const active = cardType === t;
            const activeBg = s ? s.badgeBg : assetBadge?.bg ?? "#555";
            const activeText = s ? s.badgeText : assetBadge?.text ?? "#fff";
            return (
              <button
                key={t}
                onClick={() => { setCardType(cardType === t ? null : t); setImageFile(null); }}
                className="text-[9px] font-semibold uppercase tracking-wide px-2.5 py-1 transition-colors"
                style={{
                  borderRadius: 0,
                  ...(active
                    ? { background: activeBg, color: activeText }
                    : { background: "#f5f5f3", color: "#888" })
                }}
              >
                {TYPE_LABEL[t]}
              </button>
            );
          })}
          {!cardType && (
            <span className="text-[9px] italic text-[rgba(0,0,0,0.35)] self-center ml-1">
              uncategorized
            </span>
          )}
        </div>

        {/* Asset upload UI */}
        {isAssetType ? (
          <div className="mb-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            />
            {imageFile ? (
              <div className="flex items-center gap-3 border border-[#e4e3e0] rounded-lg px-3 py-2.5 mb-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={URL.createObjectURL(imageFile)}
                  alt={imageFile.name}
                  className="w-12 h-12 object-cover rounded shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-[#333] truncate">{imageFile.name}</p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[10px] text-[#888] hover:text-[#333] underline mt-0.5 transition-colors"
                  >
                    Change image
                  </button>
                </div>
              </div>
            ) : (
              <button
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-[#ccc] rounded-lg py-6 text-[11px] text-[#bbb] hover:border-[#888] hover:text-[#555] transition-colors mb-3"
              >
                Click to upload image
              </button>
            )}
            <p className="text-[10px] text-[#bbb]">
              {cardType === "draft" ? "Drafts are design sketches or wireframes." : "References are inspiration or style images."}
            </p>
          </div>
        ) : (
          /* Card text fields */
          <>
            <input
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
              placeholder="Title (required)"
              className="w-full text-[13px] border border-[#e4e3e0] rounded-lg px-3 py-2 mb-3 focus:outline-none focus:border-[#aaa] placeholder:text-[#ccc]"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full text-[12px] border border-[#e4e3e0] rounded-lg px-3 py-2 mb-4 resize-none focus:outline-none focus:border-[#aaa] placeholder:text-[#ccc]"
            />
          </>
        )}

        {/* Parent node selector — only for card types, not assets */}
        {!isAssetType && nodes.length > 0 && (
          <div className="mb-4">
            <p className="text-[9px] text-[#bbb] uppercase tracking-wide font-semibold mb-1.5">
              Connect to (optional)
            </p>
            <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto border border-[#f0efec] rounded-lg p-1">
              {nodes.map((n) => {
                const s = TYPE_STYLE[n.card.type] ?? TYPE_STYLE.concept;
                const checked = parentIds.has(n.card.id);
                return (
                  <label
                    key={n.card.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                      checked ? "bg-blue-50" : "hover:bg-[#f7f6f3]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleParent(n.card.id)}
                      className="shrink-0 accent-blue-600"
                    />
                    <span
                      className="text-[7px] font-semibold uppercase px-1 py-0.5 rounded shrink-0"
                      style={{ background: s.badgeBg, color: s.badgeText }}
                    >
                      {TYPE_LABEL[n.card.type]}
                    </span>
                    <span className="text-[11px] text-[#333] truncate flex-1">{n.card.title}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-[11px] text-[#888] hover:text-[#333] px-3 py-1.5 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isAssetType ? !imageFile : !title.trim()}
            className="text-[11px] bg-[#111] text-white px-4 py-1.5 rounded-lg hover:bg-[#333] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add node
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Input detail panel (brief / asset nodes) ──────────────────────────────────
type InputDetailPanelProps =
  | { type: "brief"; title: string; brief: string; onTitleChange: (v: string) => void; onBriefChange: (v: string) => void; onClose: () => void; asset?: never; onAddAsReference?: never; onRemove?: never }
  | { type: "asset"; asset: Asset; onAddAsReference: (dataUrl: string, label: string) => void; onRemove: () => void; onClose: () => void; title?: never; brief?: never; onTitleChange?: never; onBriefChange?: never };

function InputDetailPanel(props: InputDetailPanelProps) {
  if (props.type === "brief") {
    const { title, brief, onTitleChange, onBriefChange, onClose } = props;
    return (
      <aside className="w-full h-full border-l border-[#e4e3e0] bg-white flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-[#f0efec] shrink-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
              Project Brief
            </span>
            <button onClick={onClose} className="text-[11px] text-[#bbb] hover:text-[#555] transition-colors shrink-0">Close</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          <div>
            <p className="text-[9px] text-[#bbb] uppercase tracking-wide font-semibold mb-1">Title</p>
            <input
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Project title"
              className="w-full text-[12px] font-semibold text-[#111] bg-[#fafaf8] border border-[#e4e3e0] rounded px-2.5 py-1.5 outline-none focus:border-[#888] placeholder-[#ccc]"
            />
          </div>
          <div>
            <p className="text-[9px] text-[#bbb] uppercase tracking-wide font-semibold mb-1">Brief</p>
            <textarea
              value={brief}
              onChange={(e) => onBriefChange(e.target.value)}
              placeholder="Describe your design challenge..."
              rows={8}
              className="w-full text-[11px] text-[#444] bg-[#fafaf8] border border-[#e4e3e0] rounded px-2.5 py-1.5 resize-none outline-none focus:border-[#888] placeholder-[#ccc] leading-relaxed"
            />
          </div>
        </div>
      </aside>
    );
  }

  const { asset, onAddAsReference, onRemove, onClose } = props;
  const isDraft = asset.type === "draft";

  return (
    <aside className="w-full h-full border-l border-[#e4e3e0] bg-white flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-[#f0efec] shrink-0">
        <div className="flex items-start justify-between gap-2 mb-2">
          <span
            className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
            style={isDraft ? { background: "#f5f5f4", color: "#555" } : { background: "#e8e8f8", color: "#4444aa" }}
          >
            {isDraft ? "✎ Draft" : "◈ Reference"}
          </span>
          <div className="flex items-center gap-1.5 shrink-0 -mt-0.5">
            <button onClick={onRemove} className="text-[11px] text-[#ccc] hover:text-red-400 transition-colors">✕ Remove</button>
            <span className="text-[#e4e3e0]">|</span>
            <button onClick={onClose} className="text-[11px] text-[#bbb] hover:text-[#555] transition-colors">Close</button>
          </div>
        </div>
        <p className="text-[12px] font-semibold text-[#222] leading-snug truncate">{asset.fileName}</p>
      </div>
      <div className="flex-1 overflow-y-auto flex flex-col">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset.dataUrl} alt={asset.fileName} className="w-full object-contain max-h-56 bg-[#f7f6f3]" />
        <div className="p-4 flex flex-col gap-2">
          {isDraft && (
            <button
              onClick={() => onAddAsReference(asset.dataUrl, asset.fileName)}
              className="w-full text-left text-[11px] px-3 py-2 rounded-lg border border-[#ccc] hover:border-[#888] text-[#555] hover:text-[#111] transition-colors"
            >
              + Use as Reference input
            </button>
          )}
          <p className="text-[10px] text-[#bbb] leading-relaxed">
            {isDraft
              ? "Drafts are sent to Analyze and Variation actions. Use as Reference to also include in contextual calls."
              : "References are sent to Analyze and Conceptual Variations actions to ground the generation."}
          </p>
        </div>
      </div>
    </aside>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function DetailPanel({
  node,
  siblings,
  assets,
  onUpdateCard,
  onBranch,
  onDuplicate,
  onRemove,
  onSelectSibling,
  onClose,
  onAddAsReference,
  onAddChild,
}: {
  node: LayoutNode;
  siblings: LayoutNode[];
  assets: Asset[];
  onUpdateCard: (card: ResultCard) => void;
  onBranch: (action: ActionType) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onSelectSibling: (id: string) => void;
  onClose: () => void;
  onAddAsReference: (dataUrl: string, label: string) => void;
  onAddChild: () => void;
}) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [showCrop, setShowCrop] = useState(false);
  const s = TYPE_STYLE[node.card.type] ?? TYPE_STYLE.concept;

  const card = node.card;
  const isVisual = card.type === "visual";
  const mainImage = isVisual ? (card as VisualCard).imageDataUrl : undefined;

  const sourceDrafts = node.includedDraftIds
    .map((id) => assets.find((a) => a.id === id))
    .filter((a): a is Asset => a !== undefined);

  const sourceRefs = node.includedReferenceIds
    .map((id) => assets.find((a) => a.id === id))
    .filter((a): a is Asset => a !== undefined);

  const imageSiblings = siblings.filter(
    (sib): sib is LayoutNode & { card: VisualCard } =>
      sib.card.type === "visual" && !!(sib.card as VisualCard).imageDataUrl
  );

  return (
    <>
      <aside className="w-full h-full border-l border-[#e4e3e0] bg-white flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-[#f0efec] shrink-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <span className="text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5" style={{ background: s.badgeBg, color: s.badgeText, borderRadius: 0 }}>
              {TYPE_LABEL[card.type]}
            </span>
            <div className="flex items-center gap-1.5 shrink-0 -mt-0.5">
              <button onClick={onRemove} className="text-[11px] text-[#ccc] hover:text-red-400 transition-colors">✕ Remove</button>
              <span className="text-[#e4e3e0]">|</span>
              <button onClick={onClose} className="text-[11px] text-[#bbb] hover:text-[#555] transition-colors">Close</button>
            </div>
          </div>
          <p className="text-[12px] font-semibold text-[#222] leading-snug">{card.title}</p>
          <p className="text-[10px] text-[#bbb] mt-0.5">{ACTION_LABEL[node.actionType]}</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {(sourceDrafts.length > 0 || sourceRefs.length > 0) && (
            <div className="px-4 py-3 border-b border-[#f0efec]">
              <p className="text-[9px] text-[#bbb] uppercase tracking-wide font-semibold mb-2">Sources</p>
              <div className="flex flex-col gap-1.5">
                {sourceDrafts.map((a) => (
                  <div key={a.id} className="px-2.5 py-2 flex items-center gap-2" style={{ background: "#f5f5f4", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 0 }}>
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

          {mainImage && (
            <div className="border-b border-[#f0efec]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mainImage} alt={card.title} className="w-full object-cover cursor-zoom-in" onClick={() => setLightboxSrc(mainImage)} />
              <div className="px-3 py-2 flex items-center justify-between gap-2">
                <p className="text-[9px] text-[#bbb]">
                  Click to enlarge · {(card as VisualCard).dimensionLabel}
                </p>
                <button
                  onClick={() => onAddAsReference(mainImage, (card as VisualCard).dimensionLabel)}
                  className="text-[9px] text-[#555] hover:text-[#111] border border-[#ccc] hover:border-[#888] px-2 py-0.5 rounded transition-colors shrink-0"
                  title="Add this image as a reference input"
                >
                  + Use as Input
                </button>
              </div>
            </div>
          )}

          {imageSiblings.length > 0 && (
            <div className="border-b border-[#f0efec] p-3">
              <p className="text-[9px] text-[#bbb] uppercase tracking-wide font-semibold mb-2">Images from same generation</p>
              <div className="grid grid-cols-3 gap-1.5">
                {imageSiblings.map((sib) => {
                  const sibCard = sib.card as VisualCard;
                  return (
                    <div key={sib.card.id} className="relative group/img aspect-square rounded overflow-hidden bg-[#f7f6f3]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={sibCard.imageDataUrl} alt={sibCard.title} className="w-full h-full object-cover cursor-pointer" onClick={() => onSelectSibling(sib.card.id)} />
                      <button
                        className="absolute inset-0 bg-black/0 group-hover/img:bg-black/30 transition-colors flex items-center justify-center"
                        onClick={() => setLightboxSrc(sibCard.imageDataUrl!)}
                        title={`${sibCard.dimensionLabel} — zoom`}
                      >
                        <span className="text-white text-[10px] opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/40 px-1.5 py-0.5 rounded">⤢</span>
                      </button>
                      <div
                        className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent px-1.5 py-1 opacity-0 group-hover/img:opacity-100 transition-opacity cursor-pointer"
                        onClick={() => onSelectSibling(sib.card.id)}
                      >
                        <p className="text-white text-[8px] leading-tight truncate">{sibCard.dimensionLabel}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="p-4 border-b border-[#f0efec] flex flex-col gap-3">
            <EditableCardDetails card={card} onUpdate={onUpdateCard} />
          </div>

          {siblings.filter((s) => !(imageSiblings as LayoutNode[]).includes(s)).length > 0 && (
            <div className="p-3 border-b border-[#f0efec]">
              <p className="text-[9px] text-[#bbb] uppercase tracking-wide font-semibold mb-2">
                From same generation ({siblings.length})
              </p>
              <div className="flex flex-col gap-1.5">
                {siblings
                  .filter((sib) => !(imageSiblings as LayoutNode[]).includes(sib))
                  .map((sib) => {
                    const sibStyle = TYPE_STYLE[sib.card.type] ?? TYPE_STYLE.concept;
                    return (
                      <button
                        key={sib.card.id}
                        onClick={() => onSelectSibling(sib.card.id)}
                        className="text-left px-2.5 py-2 rounded-lg border transition-colors hover:opacity-80"
                        style={{ borderColor: sibStyle.border, background: sibStyle.bg }}
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[8px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded" style={{ background: sibStyle.badgeBg, color: sibStyle.badgeText }}>
                            {TYPE_LABEL[sib.card.type]}
                          </span>
                        </div>
                        <p className="text-[10px] font-medium text-[#333] leading-snug line-clamp-2">{sib.card.title}</p>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          <div className="p-3 flex flex-col gap-1">
            <button
              onClick={onDuplicate}
              className="w-full text-left text-[11px] px-3 py-1.5 rounded-lg hover:bg-[#f5f0ff] hover:text-purple-700 text-[#555] transition-colors"
            >
              ⧉ Duplicate node
            </button>
            <button
              onClick={onAddChild}
              className="w-full text-left text-[11px] px-3 py-1.5 rounded-lg hover:bg-[#f0f9f0] hover:text-green-700 text-[#555] transition-colors"
            >
              + Add child node
            </button>
            <div className="px-1 pt-1 pb-0.5 flex items-baseline gap-1.5">
              <p className="text-[9px] text-[#bbb] uppercase tracking-wide font-semibold">
                {isVisual ? "Generate from this image" : "Branch from here"}
              </p>
              {isVisual && (
                <p className="text-[8px] text-[#c4a35a]">· image included in prompt</p>
              )}
            </div>
            {(isVisual ? VISUAL_QUICK_ACTIONS : BRANCH_ACTIONS).map((a) => (
              <button key={a.id} onClick={() => onBranch(a.id)} className="w-full text-left text-[11px] px-3 py-1.5 rounded-lg hover:bg-blue-50 hover:text-[#2563eb] text-[#555] transition-colors">
                {a.label} →
              </button>
            ))}
          </div>
        </div>
      </aside>

      {lightboxSrc && !showCrop && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-8" onClick={() => setLightboxSrc(null)}>
          <div className="relative max-w-4xl max-h-full" onClick={(e) => e.stopPropagation()}>
            <div className="absolute -top-9 left-0 right-0 flex items-center justify-between">
              <button
                onClick={() => setShowCrop(true)}
                className="text-sm text-white/70 hover:text-white border border-white/30 hover:border-white/70 px-3 py-1 rounded transition-colors"
              >
                ✂ Crop & Edit
              </button>
              <button onClick={() => setLightboxSrc(null)} className="text-white/60 hover:text-white text-sm transition-colors">✕ Close</button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightboxSrc} alt="Full size" className="max-w-full max-h-[82vh] object-contain rounded-xl shadow-2xl" />
          </div>
        </div>
      )}

      {lightboxSrc && showCrop && (
        <CropModal
          src={lightboxSrc}
          onSave={(croppedDataUrl) => {
            onUpdateCard({ ...card, imageDataUrl: croppedDataUrl } as VisualCard);
            setShowCrop(false);
            setLightboxSrc(null);
          }}
          onClose={() => setShowCrop(false)}
        />
      )}
    </>
  );
}

// ── Crop modal ────────────────────────────────────────────────────────────────
function CropModal({ src, onSave, onClose }: { src: string; onSave: (dataUrl: string) => void; onClose: () => void }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const dragRef = useRef<{
    handle: "move" | "nw" | "ne" | "sw" | "se";
    startX: number; startY: number;
    startCrop: { x: number; y: number; w: number; h: number };
  } | null>(null);

  function handleImageLoad() {
    const img = imgRef.current!;
    const w = img.clientWidth;
    const h = img.clientHeight;
    const m = 0.1;
    setCrop({ x: w * m, y: h * m, w: w * (1 - 2 * m), h: h * (1 - 2 * m) });
    setReady(true);
  }

  function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

  function onHandlePointerDown(e: React.PointerEvent, handle: "move" | "nw" | "ne" | "sw" | "se") {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { handle, startX: e.clientX, startY: e.clientY, startCrop: { ...crop } };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current || !imgRef.current) return;
    const { handle, startX, startY, startCrop } = dragRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const maxW = imgRef.current.clientWidth;
    const maxH = imgRef.current.clientHeight;
    const MIN = 20;
    let { x, y, w, h } = startCrop;
    if (handle === "move") {
      x = clamp(x + dx, 0, maxW - w);
      y = clamp(y + dy, 0, maxH - h);
    } else {
      if (handle === "nw") {
        const nx = clamp(x + dx, 0, x + w - MIN); const ny = clamp(y + dy, 0, y + h - MIN);
        w += x - nx; h += y - ny; x = nx; y = ny;
      } else if (handle === "ne") {
        const ny = clamp(y + dy, 0, y + h - MIN);
        w = clamp(w + dx, MIN, maxW - x); h += y - ny; y = ny;
      } else if (handle === "sw") {
        const nx = clamp(x + dx, 0, x + w - MIN);
        w += x - nx; x = nx; h = clamp(h + dy, MIN, maxH - y);
      } else {
        w = clamp(w + dx, MIN, maxW - x); h = clamp(h + dy, MIN, maxH - y);
      }
    }
    setCrop({ x, y, w, h });
  }

  function handleApply() {
    const img = imgRef.current!;
    const sx = img.naturalWidth / img.clientWidth;
    const sy = img.naturalHeight / img.clientHeight;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(crop.w * sx);
    canvas.height = Math.round(crop.h * sy);
    canvas.getContext("2d")!.drawImage(img, Math.round(crop.x * sx), Math.round(crop.y * sy), canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    const mime = src.startsWith("data:image/png") ? "image/png" : "image/jpeg";
    onSave(canvas.toDataURL(mime, 0.92));
  }

  const HANDLE_SIZE = 10;
  const handles: Array<{ id: "nw" | "ne" | "sw" | "se"; left: number; top: number; cursor: string }> = [
    { id: "nw", left: crop.x - HANDLE_SIZE / 2,           top: crop.y - HANDLE_SIZE / 2,           cursor: "nwse-resize" },
    { id: "ne", left: crop.x + crop.w - HANDLE_SIZE / 2,  top: crop.y - HANDLE_SIZE / 2,           cursor: "nesw-resize" },
    { id: "sw", left: crop.x - HANDLE_SIZE / 2,           top: crop.y + crop.h - HANDLE_SIZE / 2,  cursor: "nesw-resize" },
    { id: "se", left: crop.x + crop.w - HANDLE_SIZE / 2,  top: crop.y + crop.h - HANDLE_SIZE / 2,  cursor: "nwse-resize" },
  ];

  return (
    <div className="fixed inset-0 z-[60] bg-black/92 flex flex-col items-center justify-center gap-5 p-8">
      <div className="flex items-center gap-4">
        <p className="text-white/60 text-sm">Drag corners to crop</p>
        <button onClick={handleApply} className="bg-white text-[#111] text-sm px-4 py-1.5 rounded-sm hover:bg-white/90 transition-colors font-medium">
          Save crop
        </button>
        <button onClick={onClose} className="text-white/50 hover:text-white text-sm transition-colors">Cancel</button>
      </div>
      <div
        className="relative inline-block select-none"
        onPointerMove={onPointerMove}
        onPointerUp={() => { dragRef.current = null; }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={src}
          alt="Crop"
          className="block max-w-[80vw] max-h-[70vh] object-contain"
          onLoad={handleImageLoad}
          draggable={false}
        />
        {ready && (
          <>
            {/* Crop box — box-shadow darkens outside the selection */}
            <div
              style={{
                position: "absolute", left: crop.x, top: crop.y, width: crop.w, height: crop.h,
                border: "1.5px solid rgba(255,255,255,0.9)",
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
                cursor: "move",
              }}
              onPointerDown={(e) => onHandlePointerDown(e, "move")}
            >
              {/* Rule-of-thirds grid lines */}
              {[1, 2].map((n) => (
                <div key={`v${n}`} style={{ position: "absolute", left: `${(n / 3) * 100}%`, top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.3)" }} />
              ))}
              {[1, 2].map((n) => (
                <div key={`h${n}`} style={{ position: "absolute", top: `${(n / 3) * 100}%`, left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.3)" }} />
              ))}
            </div>
            {/* Corner handles */}
            {handles.map(({ id, left, top, cursor }) => (
              <div
                key={id}
                style={{
                  position: "absolute", left, top,
                  width: HANDLE_SIZE, height: HANDLE_SIZE,
                  background: "white", border: "1px solid rgba(0,0,0,0.4)",
                  borderRadius: 2, cursor,
                }}
                onPointerDown={(e) => onHandlePointerDown(e, id)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ── Editable card detail fields ───────────────────────────────────────────────
function EditableCardDetails({ card, onUpdate }: { card: ResultCard; onUpdate: (c: ResultCard) => void }) {
  function patch(fields: Partial<ResultCard>) {
    onUpdate({ ...card, ...fields } as ResultCard);
  }

  const titleField = (
    <EditField
      label="Title"
      value={card.title}
      onChange={(v) => patch({ title: v })}
      singleLine
    />
  );

  switch (card.type) {
    case "concept":
      return (
        <>
          {titleField}
          <EditField label="Description" value={card.description} onChange={(v) => patch({ description: v })} />
          <EditField label="Rationale" value={card.rationale} onChange={(v) => patch({ rationale: v })} />
        </>
      );
    case "motif":
      return (
        <>
          {titleField}
          <EditField label="Visual Quality" value={card.visualQuality} onChange={(v) => patch({ visualQuality: v })} />
          <EditField label="How It Conveys The Idea" value={card.howItConveysIdea} onChange={(v) => patch({ howItConveysIdea: v })} />
          <EditField label="Category" value={card.category} onChange={(v) => patch({ category: v })} singleLine />
        </>
      );
    case "visual":
      return (
        <>
          {titleField}
          <EditField label="Dimension" value={card.dimensionLabel} onChange={(v) => patch({ dimensionLabel: v })} singleLine />
          <EditField label="Analysis" value={card.analysisText} onChange={(v) => patch({ analysisText: v })} />
          {card.error && (
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wide text-[#bbb] mb-0.5">Error</p>
              <p className="text-[11px] text-red-500 leading-relaxed">{card.error}</p>
            </div>
          )}
        </>
      );
    case "note":
      return (
        <>
          {titleField}
          <EditField label="Note" value={card.body} onChange={(v) => patch({ body: v })} />
        </>
      );
  }
}

function EditField({
  label, value, onChange, singleLine,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  singleLine?: boolean;
}) {
  const cls = "w-full text-[11px] text-[#333] bg-[#fafaf8] border border-transparent hover:border-[#e4e3e0] focus:border-[#888] rounded px-2 py-1 outline-none leading-relaxed resize-none placeholder-[#ccc] transition-colors";
  return (
    <div>
      <p className="text-[9px] font-semibold uppercase tracking-wide text-[#bbb] mb-0.5 px-2">{label}</p>
      {singleLine ? (
        <input
          className={cls}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <textarea
          className={cls}
          value={value}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
