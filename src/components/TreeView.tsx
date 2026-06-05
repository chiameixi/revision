"use client";

import { useCallback, useMemo, useState, useRef } from "react";
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
  type Node,
  type Edge as RFEdge,
  type NodeTypes,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Asset, Generation, Highlight, ResultCard, ActionType, VisualCard } from "@/types";

// ── Layout constants ──────────────────────────────────────────────────────────
const NODE_W = 168;
const NODE_H = 76;
const VISUAL_NODE_W = 224;
const VISUAL_NODE_H = 132;
const COL_GAP = 96;
const ROW_GAP = 20;
const PAD = 48;
const COL_STRIDE = VISUAL_NODE_W + COL_GAP;

// ── Node size helper ──────────────────────────────────────────────────────────
function nodeDims(card: ResultCard): { w: number; h: number } {
  if (card.type === "visual" && (card as VisualCard).imageDataUrl) {
    return { w: VISUAL_NODE_W, h: VISUAL_NODE_H };
  }
  return { w: NODE_W, h: NODE_H };
}

// ── Styling maps ──────────────────────────────────────────────────────────────
const TYPE_STYLE: Record<string, {
  bg: string; border: string; selectedBorder: string;
  badgeBg: string; badgeText: string; line: string;
}> = {
  concept: { bg: "#fffbf5", border: "#b45309", selectedBorder: "#78350f", badgeBg: "#b45309", badgeText: "#ffffff", line: "#d97706" },
  motif:   { bg: "#f0fdf4", border: "#16a34a", selectedBorder: "#166534", badgeBg: "#166534", badgeText: "#ffffff", line: "#4ade80" },
  visual:  { bg: "#fafafa", border: "#333333", selectedBorder: "#111111", badgeBg: "#111111", badgeText: "#ffffff", line: "#888888" },
  note:    { bg: "#fafaf8", border: "#888888", selectedBorder: "#111111", badgeBg: "#888888", badgeText: "#ffffff", line: "#bbbbbb" },
};

const TYPE_LABEL: Record<string, string> = {
  concept: "Concept",
  motif: "Motif",
  visual: "Visual",
  note: "Note",
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
  isSaved: boolean;
  isMultiSelected: boolean;
  onRemove: (genId: string, cardId: string) => void;
  onQuickBranch: (action: ActionType) => void;
};

// ── Layout algorithm ──────────────────────────────────────────────────────────
function computeLayout(generations: Generation[]): {
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

  const edges: GraphEdge[] = [];
  for (const e of entries) {
    for (const pid of e.parentCardIds) {
      if (posMap.has(pid)) edges.push({ fromId: pid, toId: e.card.id, toType: e.card.type });
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
  const { card, isSelected, isHovered, isAncestor, isMultiSelected, isSaved, onRemove, genId, actionType } = data;
  const s = TYPE_STYLE[card.type] ?? TYPE_STYLE.concept;

  const borderColor = isMultiSelected ? "#2563eb"
    : isAncestor ? "#f59e0b"
    : isSelected ? s.selectedBorder
    : s.border;
  const shadow = isMultiSelected ? "0 0 0 3px rgba(37,99,235,0.25)"
    : isAncestor ? "0 0 0 3px rgba(251,191,36,0.3)"
    : isSelected ? "3px 3px 0px #111111"
    : isHovered ? "2px 2px 0px #888"
    : "1px 1px 0px #cccccc";

  return (
    <>
      <Handle type="target" position={Position.Left} style={{ opacity: 0, pointerEvents: "none" }} />
      <div
        className="relative group"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("card-drag", JSON.stringify({ card, genId }));
          e.dataTransfer.effectAllowed = "copy";
        }}
        style={{
          width: NODE_W,
          height: NODE_H,
          background: isMultiSelected ? "#eff6ff" : isAncestor ? "#fffbeb" : isSelected ? s.bg : "#ffffff",
          border: `1.5px solid ${borderColor}`,
          borderRadius: 10,
          boxShadow: shadow,
          transition: "all 0.15s ease",
          overflow: "hidden",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <button
          className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 rounded flex items-center justify-center text-[#ccc] hover:text-red-400 hover:bg-red-50 text-[10px] leading-none z-10"
          onClick={(e) => { e.stopPropagation(); onRemove(genId, card.id); }}
          title="Remove from tree"
        >✕</button>
        <div className="p-2.5 flex flex-col gap-1 h-full">
          <div className="flex items-center gap-1.5 pr-4">
            <span
              className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0"
              style={{ background: s.badgeBg, color: s.badgeText }}
            >
              {TYPE_LABEL[card.type]}
            </span>
            {isMultiSelected && <span className="text-[9px] text-blue-600 shrink-0">✓</span>}
            {isSaved && <span className="text-[10px] text-amber-400 shrink-0" title="Saved">★</span>}
          </div>
          <p className="text-[11px] font-medium text-[#333] leading-tight line-clamp-2 flex-1">
            {card.title}
          </p>
          <p className="text-[9px] text-[#bbb] truncate">
            {ACTION_LABEL[actionType] ?? actionType}
          </p>
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: "none" }} />
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
  const { card, isSelected, isHovered, isAncestor, isMultiSelected, isSaved, onRemove, onQuickBranch, genId } = data;
  const s = TYPE_STYLE.visual;
  const visualCard = card as VisualCard;

  const borderColor = isMultiSelected ? "#2563eb"
    : isAncestor ? "#f59e0b"
    : isSelected ? s.selectedBorder
    : s.border;
  const shadow = isMultiSelected ? "0 0 0 3px rgba(37,99,235,0.25)"
    : isAncestor ? "0 0 0 3px rgba(251,191,36,0.3)"
    : isSelected ? "3px 3px 0px #111111"
    : isHovered ? "2px 2px 0px #888"
    : "1px 1px 0px #cccccc";

  return (
    <>
      <Handle type="target" position={Position.Left} style={{ opacity: 0, pointerEvents: "none" }} />
      <div
        className="relative group"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("card-drag", JSON.stringify({ card, genId }));
          e.dataTransfer.effectAllowed = "copy";
        }}
        style={{
          width: VISUAL_NODE_W,
          height: VISUAL_NODE_H,
          border: `1.5px solid ${borderColor}`,
          borderRadius: 10,
          boxShadow: shadow,
          transition: "all 0.15s ease",
          overflow: "hidden",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        {/* Remove button */}
        <button
          className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 rounded flex items-center justify-center text-[#ccc] hover:text-red-400 hover:bg-red-50 text-[10px] leading-none z-20"
          onClick={(e) => { e.stopPropagation(); onRemove(genId, card.id); }}
          title="Remove from tree"
        >✕</button>

        {/* Top badge */}
        <div className="absolute top-0 left-0 right-0 p-2 flex items-center gap-1.5 z-10 bg-gradient-to-b from-black/30 to-transparent">
          <span className="text-[8px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 bg-black/50 text-white">
            {TYPE_LABEL[card.type]}
          </span>
          {isMultiSelected && <span className="text-[9px] text-white bg-blue-500/80 px-1 py-0.5 rounded shrink-0 font-bold">✓</span>}
          {isSaved && <span className="text-[9px] text-amber-300 shrink-0 drop-shadow">★</span>}
        </div>

        {/* Image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={visualCard.imageDataUrl}
          alt={card.title}
          className="w-full h-full object-cover"
        />

        {/* Bottom overlay: title always visible, quick actions appear on hover */}
        <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/80 via-black/50 to-transparent z-10 transition-all duration-150">
          <p className="text-[9px] text-white leading-tight truncate font-medium mb-1">
            {card.title}
          </p>
          {/* Quick branch buttons — visible on hover */}
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
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: "none" }} />
    </>
  );
}

const nodeTypes: NodeTypes = {
  textCard: TextCardNode,
  visualCard: VisualCardNode,
};

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  generations: Generation[];
  savedCardIds: Set<string>;
  highlights: Highlight[];
  assets: Asset[];
  hoveredSourceIds: Set<string>;
  onHoverSources: (cardIds: Set<string>, assetIds: Set<string>) => void;
  onSaveCard: (card: ResultCard) => void;
  onBranchFrom: (card: ResultCard, action: ActionType) => void;
  onMultiBranchFrom: (cards: ResultCard[], action: ActionType) => void;
  onAddUserNode: (card: ResultCard, parentCardIds: string[]) => void;
  onClearTree: () => void;
  onDismissCard: (genId: string, cardId: string) => void;
  onAddAsReference: (dataUrl: string, label: string) => void;
}

export default function TreeView({ generations, savedCardIds, highlights, assets, hoveredSourceIds, onHoverSources, onSaveCard, onBranchFrom, onMultiBranchFrom, onAddUserNode, onClearTree, onDismissCard, onAddAsReference }: Props) {
  const { nodes, edges } = useMemo(() => computeLayout(generations), [generations]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [multiSelectedIds, setMultiSelectedIds] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [addNodeState, setAddNodeState] = useState<{ parentIds: string[] } | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const cardIds = useMemo(() => new Set(nodes.map((n) => n.card.id)), [nodes]);

  const selectedNode = nodes.find((n) => n.card.id === selectedId) ?? null;
  const siblings = selectedNode
    ? nodes.filter((n) => n.genId === selectedNode.genId && n.card.id !== selectedNode.card.id)
    : [];

  const hoveredAncestorIds = useMemo(() => {
    if (!hoveredId) return new Set<string>();
    const hNode = nodes.find((n) => n.card.id === hoveredId);
    return new Set((hNode?.parentCardIds ?? []).filter((pid) => cardIds.has(pid)));
  }, [hoveredId, nodes, cardIds]);

  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);

  const handleRemove = useCallback((genId: string, cardId: string) => {
    onDismissCard(genId, cardId);
    setSelectedId(null);
  }, [onDismissCard]);

  // Used by quick-branch buttons on visual nodes — includes the image as a reference
  // so the next AI call can see it, then branches from the card.
  const handleQuickBranch = useCallback((card: ResultCard, action: ActionType) => {
    if (card.type === "visual" && (card as VisualCard).imageDataUrl) {
      onAddAsReference(
        (card as VisualCard).imageDataUrl!,
        (card as VisualCard).dimensionLabel || card.title,
      );
    }
    onBranchFrom(card, action);
  }, [onAddAsReference, onBranchFrom]);

  const handleMultiAction = useCallback((action: ActionType) => {
    const cards = nodes
      .filter((n) => multiSelectedIds.has(n.card.id))
      .map((n) => n.card);
    if (cards.length === 0) return;
    onMultiBranchFrom(cards, action);
    setMultiSelectedIds(new Set());
    setSelectedId(null);
  }, [nodes, multiSelectedIds, onMultiBranchFrom]);

  const rfNodes = useMemo((): Node[] =>
    nodes.map((node): Node => {
      const hasImage = node.card.type === "visual" && !!(node.card as VisualCard).imageDataUrl;
      const { w, h } = nodeDims(node.card);
      return {
        id: node.card.id,
        type: hasImage ? "visualCard" : "textCard",
        position: { x: node.x, y: node.y },
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
          // Amber glow when: ancestor of hovered node, OR this node used a currently-hovered highlight as input
          isAncestor: hoveredAncestorIds.has(node.card.id)
            || node.parentCardIds.some((pid) => hoveredSourceIds.has(pid)),
          isSaved: savedCardIds.has(node.card.id),
          isMultiSelected: multiSelectedIds.has(node.card.id),
          onRemove: handleRemove,
          onQuickBranch: (action) => handleQuickBranch(node.card, action),
        } satisfies CardNodeData,
        width: w,
        height: h,
      };
    }),
    [nodes, cardIds, selectedId, multiSelectedIds, hoveredId, hoveredAncestorIds, hoveredSourceIds, savedCardIds, handleRemove, handleQuickBranch]
  );

  const rfEdges = useMemo((): RFEdge[] =>
    edges.map((edge): RFEdge => {
      const s = TYPE_STYLE[edge.toType] ?? TYPE_STYLE.concept;
      const isActive = hoveredId === edge.toId || hoveredId === edge.fromId
        || hoveredSourceIds.has(edge.fromId);
      return {
        id: `${edge.fromId}-${edge.toId}`,
        source: edge.fromId,
        target: edge.toId,
        type: "default",
        style: {
          stroke: isActive ? "#f59e0b" : s.line,
          strokeWidth: isActive ? 2.5 : 1.5,
          strokeOpacity: isActive ? 0.9 : 0.55,
        },
        markerEnd: {
          type: MarkerType.Arrow,
          color: isActive ? "#f59e0b" : s.line,
          width: 12,
          height: 12,
          strokeWidth: 0,
        },
      };
    }),
    [edges, hoveredId, hoveredSourceIds]
  );

  const handleNodeClick = useCallback((event: React.MouseEvent, rfNode: Node) => {
    if (event.shiftKey) {
      // Shift+click: toggle this node in/out of the multi-selection
      setMultiSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(rfNode.id)) next.delete(rfNode.id);
        else next.add(rfNode.id);
        return next;
      });
      setSelectedId(null); // drop single-select while multi-selecting
    } else {
      // Normal click: single select, clear multi-selection
      setSelectedId((prev) => (prev === rfNode.id ? null : rfNode.id));
      setMultiSelectedIds(new Set());
    }
  }, []);

  const handleNodeMouseEnter = useCallback((_: React.MouseEvent, rfNode: Node) => {
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

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-24 text-[#aaa]">
        <p className="text-sm mb-1">Run an action to see the concept tree.</p>
        <p className="text-xs">Each card becomes a node; edges show what seeded each generation.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* ── React Flow canvas ────────────────────────────────────────────── */}
      <div className="flex-1 h-full" style={{ background: "#f0eeea" }}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          onNodeClick={handleNodeClick}
          onNodeMouseEnter={handleNodeMouseEnter}
          onNodeMouseLeave={handleNodeMouseLeave}
          onPaneClick={() => { setSelectedId(null); setMultiSelectedIds(new Set()); }}
          onInit={(instance) => {
            rfInstanceRef.current = instance;
            instance.fitView({ padding: 0.15 });
          }}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.2}
          maxZoom={2.0}
          nodesDraggable={false}
          connectOnClick={false}
          nodesConnectable={false}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1}
            color="#bbb"
          />
          <Controls showInteractive={false} />

          {/* Top-right panel: Add node + Clear all */}
          <Panel position="top-right">
            <div className="flex items-center gap-1.5 mr-2 mt-2">
              <button
                onClick={() => {
                  setAddNodeState({ parentIds: multiSelectedIds.size > 0 ? [...multiSelectedIds] : [] });
                  setSelectedId(null);
                  setConfirmingClear(false);
                }}
                className="bg-white border border-[#e4e3e0] rounded-lg px-2.5 py-1.5 text-[11px] text-[#555] hover:text-[#111] hover:border-[#888] shadow-sm transition-colors flex items-center gap-1"
                title="Add a new node"
              >
                <span className="text-[14px] leading-none font-light">+</span>
                Add node
              </button>

              {confirmingClear ? (
                <div className="bg-white border border-red-200 rounded-lg px-2.5 py-1.5 shadow-sm flex items-center gap-2">
                  <span className="text-[10px] text-red-500">Clear all?</span>
                  <button
                    onClick={() => { onClearTree(); setConfirmingClear(false); setSelectedId(null); setMultiSelectedIds(new Set()); }}
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
                  className="bg-white border border-[#e4e3e0] rounded-lg px-2.5 py-1.5 text-[11px] text-[#aaa] hover:text-red-500 hover:border-red-200 shadow-sm transition-colors"
                  title="Clear all nodes"
                >
                  Clear all
                </button>
              )}
            </div>
          </Panel>

          {/* Multi-select action bar */}
          {multiSelectedIds.size > 0 && (
            <Panel position="bottom-center">
              <div className="flex items-center gap-2 bg-white border border-[#222] rounded-lg shadow-lg px-3 py-2 mb-2 text-[11px]">
                <span className="text-[#555] font-medium pr-1">
                  {multiSelectedIds.size} selected
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
                <button
                  onClick={() => setMultiSelectedIds(new Set())}
                  className="text-[#aaa] hover:text-[#555] transition-colors px-1"
                  title="Clear selection"
                >
                  ✕ Clear
                </button>
              </div>
            </Panel>
          )}
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
        />
      )}

      {/* ── Detail panel ─────────────────────────────────────────────────── */}
      {selectedNode ? (
        <DetailPanel
          node={selectedNode}
          siblings={siblings}
          highlights={highlights}
          assets={assets}
          isSaved={savedCardIds.has(selectedNode.card.id)}
          onSave={() => onSaveCard(selectedNode.card)}
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
          onRemove={() => handleRemove(selectedNode.genId, selectedNode.card.id)}
          onSelectSibling={(id) => setSelectedId(id)}
          onClose={() => setSelectedId(null)}
          savedCardIds={savedCardIds}
          onAddAsReference={onAddAsReference}
          onAddChild={() => setAddNodeState({ parentIds: [selectedNode.card.id] })}
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

// ── Add node modal ────────────────────────────────────────────────────────────
const NODE_TYPE_OPTIONS = ["concept", "motif", "visual", "note"] as const;
type UserNodeType = (typeof NODE_TYPE_OPTIONS)[number];

function AddNodeModal({
  nodes,
  initialParentIds,
  onAdd,
  onClose,
}: {
  nodes: LayoutNode[];
  initialParentIds: string[];
  onAdd: (card: ResultCard, parentIds: string[]) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [cardType, setCardType] = useState<UserNodeType>("concept");
  const [parentIds, setParentIds] = useState<Set<string>>(new Set(initialParentIds));

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
    switch (cardType) {
      case "concept": return { id, type: "concept", title: t, description: b, rationale: "", createdAt: now };
      case "motif":   return { id, type: "motif",   title: t, visualQuality: b, howItConveysIdea: "", category: "style", createdAt: now };
      case "visual":  return { id, type: "visual",  title: t, dimensionLabel: t, analysisText: b, createdAt: now };
      case "note": default: return { id, type: "note", title: t, body: b, createdAt: now };
    }
  }

  function handleSubmit() {
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
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[13px] font-semibold text-[#111]">Add node</h2>
          <button onClick={onClose} className="text-[#bbb] hover:text-[#555] text-base leading-none">✕</button>
        </div>

        {/* Type selector */}
        <div className="flex gap-1.5 mb-4">
          {NODE_TYPE_OPTIONS.map((t) => {
            const s = TYPE_STYLE[t] ?? TYPE_STYLE.concept;
            const active = cardType === t;
            return (
              <button
                key={t}
                onClick={() => setCardType(t)}
                className="text-[9px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded transition-colors"
                style={active ? { background: s.badgeBg, color: s.badgeText } : { background: "#f5f5f3", color: "#888" }}
              >
                {TYPE_LABEL[t]}
              </button>
            );
          })}
        </div>

        {/* Title */}
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
          placeholder="Title (required)"
          className="w-full text-[13px] border border-[#e4e3e0] rounded-lg px-3 py-2 mb-3 focus:outline-none focus:border-[#aaa] placeholder:text-[#ccc]"
        />

        {/* Body */}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="w-full text-[12px] border border-[#e4e3e0] rounded-lg px-3 py-2 mb-4 resize-none focus:outline-none focus:border-[#aaa] placeholder:text-[#ccc]"
        />

        {/* Parent selection */}
        {nodes.length > 0 && (
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

        {/* Footer */}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-[11px] text-[#888] hover:text-[#333] px-3 py-1.5 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim()}
            className="text-[11px] bg-[#111] text-white px-4 py-1.5 rounded-lg hover:bg-[#333] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add node
          </button>
        </div>
      </div>
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
  onAddAsReference,
  onAddChild,
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
  onAddAsReference: (dataUrl: string, label: string) => void;
  onAddChild: () => void;
}) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const s = TYPE_STYLE[node.card.type] ?? TYPE_STYLE.concept;

  const card = node.card;
  const isVisual = card.type === "visual";
  const mainImage = isVisual ? (card as VisualCard).imageDataUrl : undefined;

  const sourceHighlights = node.parentCardIds
    .map((pid) => highlights.find((h) => h.card.id === pid))
    .filter((h): h is Highlight => h !== undefined);

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
      <aside className="w-[272px] shrink-0 h-full border-l border-[#e4e3e0] bg-white flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#f0efec] shrink-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: s.badgeBg, color: s.badgeText }}>
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

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* Sources */}
          {(sourceHighlights.length > 0 || sourceDrafts.length > 0 || sourceRefs.length > 0) && (
            <div className="px-4 py-3 border-b border-[#f0efec]">
              <p className="text-[9px] text-[#bbb] uppercase tracking-wide font-semibold mb-2">Sources</p>
              <div className="flex flex-col gap-1.5">
                {sourceHighlights.map((h) => (
                  <div key={h.card.id} className="px-2.5 py-2 rounded-lg" style={{ background: "#fffbeb", border: "1px solid #f0d89a" }}>
                    <p className="text-[9px] text-[#b45309] uppercase tracking-wide font-semibold mb-0.5">★ highlight · {h.card.type}</p>
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

          {/* Image siblings gallery strip */}
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

          {/* Card details */}
          <div className="p-4 border-b border-[#f0efec] flex flex-col gap-3">
            <CardDetails card={card} />
          </div>

          {/* Text siblings */}
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
                    const sibSaved = savedCardIds.has(sib.card.id);
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
                          {sibSaved && <span className="text-[9px] text-amber-400">★</span>}
                        </div>
                        <p className="text-[10px] font-medium text-[#333] leading-snug line-clamp-2">{sib.card.title}</p>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="p-3 flex flex-col gap-1">
            {!isSaved && (
              <button onClick={onSave} className="w-full text-left text-[11px] px-3 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 font-medium transition-colors mb-1">
                ★ Save to Highlights
              </button>
            )}
            {isSaved && <p className="text-[10px] text-amber-500 px-1 mb-1">★ Saved to highlights</p>}
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

      {/* Lightbox */}
      {lightboxSrc && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-8" onClick={() => setLightboxSrc(null)}>
          <div className="relative max-w-4xl max-h-full" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setLightboxSrc(null)} className="absolute -top-9 right-0 text-white/60 hover:text-white text-sm transition-colors">✕ Close</button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightboxSrc} alt="Full size" className="max-w-full max-h-[82vh] object-contain rounded-xl shadow-2xl" />
          </div>
        </div>
      )}
    </>
  );
}

// ── Card detail fields ────────────────────────────────────────────────────────
function CardDetails({ card }: { card: ResultCard }) {
  switch (card.type) {
    case "concept":
      return (
        <>
          <Field label="Description" value={card.description} />
          <Field label="Rationale" value={card.rationale} />
        </>
      );
    case "motif":
      return (
        <>
          <Field label="Visual Quality" value={card.visualQuality} />
          <Field label="How It Conveys The Idea" value={card.howItConveysIdea} />
          <Field label="Category" value={card.category} />
        </>
      );
    case "visual":
      return (
        <>
          <Field label="Dimension" value={card.dimensionLabel} />
          <Field label="Analysis" value={card.analysisText} />
          {card.error && <Field label="Error" value={card.error} isError />}
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
