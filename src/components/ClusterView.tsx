"use client";

import {
  useState, useCallback, useMemo, createContext, useContext, useEffect,
} from "react";
import {
  ReactFlow,
  Background,
  useNodesState,
  type Node,
  type NodeProps,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type {
  Asset, Collection, Generation, ResultCard, ActionType, VisualCard,
} from "@/types";

// ── Style maps ────────────────────────────────────────────────────────────────
const TYPE_STYLE: Record<string, {
  bg: string; border: string; selectedBorder: string;
  badgeBg: string; badgeText: string; line: string; clusterBg: string;
}> = {
  concept: { bg: "#ffffff", border: "#000000", selectedBorder: "#000000", badgeBg: "#000000", badgeText: "#ffffff", line: "rgba(0,0,0,0.4)", clusterBg: "#fafaf8" },
  motif:   { bg: "#ffffff", border: "#000000", selectedBorder: "#000000", badgeBg: "#000000", badgeText: "#ffffff", line: "rgba(0,0,0,0.4)", clusterBg: "#fafaf8" },
  visual:  { bg: "#ffffff", border: "#000000", selectedBorder: "#000000", badgeBg: "#000000", badgeText: "#ffffff", line: "rgba(0,0,0,0.3)", clusterBg: "#fafaf8" },
  note:    { bg: "#ffffff", border: "rgba(0,0,0,0.35)", selectedBorder: "#000000", badgeBg: "rgba(0,0,0,0.5)", badgeText: "#ffffff", line: "rgba(0,0,0,0.2)", clusterBg: "#fafaf8" },
};

const TYPE_LABEL_PLURAL: Record<string, string> = {
  concept: "Concepts", motif: "Motifs", visual: "Visuals", note: "Your Notes",
};

const TYPE_LABEL_SINGLE: Record<string, string> = {
  concept: "Concept", motif: "Motif", visual: "Visual", note: "Note",
};

const ACTION_LABEL: Record<string, string> = {
  unpack_brief: "Unpack Brief", analyze: "Analyze", visuals: "Visual Variations",
  conceptual_variations: "Conceptual Vars", generate_concept_visuals: "Concept Visuals",
  synthesize: "Synthesize", user_added: "Your Idea",
};

const BRANCH_ACTIONS: { id: ActionType; label: string }[] = [
  { id: "unpack_brief", label: "Unpack Brief" },
  { id: "analyze", label: "Analyze" },
  { id: "visual_variations", label: "Visual Variations" },
  { id: "conceptual_variations", label: "Conceptual Variations" },
];

export const COLLECTION_COLORS = [
  "#c9a84c", // warm gold
  "#7a9e5e", // sage green
  "#c14f58", // muted rose
  "#4a7a9b", // slate blue
  "#8b6b4a", // warm brown
  "#7b6b8e", // muted violet
  "#4a8b7a", // teal
  "#9b4a4a", // terracotta
];

const CARD_TYPES = ["concept", "motif", "visual", "note"] as const;

// ── Types ─────────────────────────────────────────────────────────────────────
interface ClusterItem {
  card: ResultCard;
  genId: string;
  actionType: ActionType;
}

interface ClusterCtxType {
  allItems: ClusterItem[];
  collections: Collection[];
  selectedItem: ClusterItem | null;
  dragOverId: string | null;
  editingId: string | null;
  editForm: { title: string; description: string };
  onCardClick: (item: ClusterItem) => void;
  onCardDragStart: (e: React.DragEvent, cardId: string) => void;
  onContainerDragOver: (e: React.DragEvent) => void;
  onContainerDragEnter: (e: React.DragEvent, id: string) => void;
  onContainerDragLeave: (e: React.DragEvent) => void;
  onContainerDrop: (e: React.DragEvent, collectionId: string | null) => void;
  onDeleteCollection: (id: string) => void;
  onRemoveCardFromCollection: (collectionId: string, cardId: string) => void;
  onStartEdit: (id: string, title: string, description: string) => void;
  onConfirmEdit: (id: string) => void;
  onCancelEdit: () => void;
  onEditFormChange: (field: "title" | "description", value: string) => void;
  generations: Generation[];
}

const ClusterCtx = createContext<ClusterCtxType | null>(null);
function useClusterCtx() {
  const ctx = useContext(ClusterCtx);
  if (!ctx) throw new Error("ClusterCtx missing");
  return ctx;
}

// ── Mini card tile ────────────────────────────────────────────────────────────
function MiniCard({ item, onRemove }: { item: ClusterItem; onRemove?: () => void }) {
  const { selectedItem, onCardClick, onCardDragStart } = useClusterCtx();
  const isSelected = selectedItem?.card.id === item.card.id;
  const ts = TYPE_STYLE[item.card.type] ?? TYPE_STYLE.concept;
  const isVisual = item.card.type === "visual";
  const isChip = item.card.type === "concept" || item.card.type === "motif";
  const imgSrc = isVisual ? (item.card as VisualCard).imageDataUrl : undefined;

  const borderColor = isSelected ? "#000" : ts.border;
  const shadow = isSelected ? "2px 2px 0px #000" : "none";
  const bgColor = isSelected ? "#f5f4f0" : "#ffffff";

  const sharedDrag = {
    draggable: true,
    onDragStart: (e: React.DragEvent) => { e.stopPropagation(); onCardDragStart(e, item.card.id); },
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); onCardClick(item); },
  };

  // ── Visual image card ───────────────────────────────────────────────────────
  if (isVisual && imgSrc) {
    return (
      <div
        {...sharedDrag}
        className="relative group/minicard overflow-hidden cursor-pointer nodrag nowheel col-span-2"
        style={{ height: 120, border: `1px solid ${borderColor}`, borderRadius: 0, boxShadow: shadow, transition: "all 0.15s ease", userSelect: "none" }}
      >
        {onRemove && (
          <button className="nodrag absolute top-1.5 right-1.5 opacity-0 group-hover/minicard:opacity-100 transition-opacity w-4 h-4 rounded flex items-center justify-center text-[#ccc] hover:text-red-400 hover:bg-red-50 text-[10px] leading-none z-20"
            title="Remove" onClick={(e) => { e.stopPropagation(); onRemove(); }}>✕</button>
        )}
        <div className="absolute top-0 left-0 right-0 p-1.5 flex items-center gap-1.5 z-10 bg-gradient-to-b from-black/30 to-transparent">
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", opacity: 0.8, flexShrink: 0 }} />
          {isSelected && <span className="text-[8px] text-white bg-blue-500/80 px-1 rounded font-bold">✓</span>}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imgSrc} alt={item.card.title} className="w-full h-full object-cover" />
        <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-10">
          <p className="text-[9px] text-white leading-tight truncate font-medium">{item.card.title}</p>
        </div>
      </div>
    );
  }

  // ── Concept / motif chip ────────────────────────────────────────────────────
  if (isChip) {
    return (
      <div
        {...sharedDrag}
        className="relative group/minicard cursor-pointer nodrag nowheel"
        style={{
          minHeight: 28, background: bgColor,
          border: "none",
          borderLeft: item.card.type === "concept" ? `1.5px solid ${borderColor}` : "none",
          borderRadius: 0,
          boxShadow: shadow,
          transition: "all 0.15s ease",
          userSelect: "none",
          display: "flex", alignItems: "center", flexWrap: "wrap",
          gap: 6, paddingLeft: item.card.type === "concept" ? 7 : 8, paddingRight: onRemove ? 22 : 8,
          paddingTop: 4, paddingBottom: 4,
          position: "relative",
        }}
      >
        {item.card.type === "motif" && (
          <>
            <span style={{ position: "absolute", top: 0, left: 0, width: 7, height: 7, borderTop: "1.5px solid #000", borderLeft: "1.5px solid #000" }} />
            <span style={{ position: "absolute", top: 0, right: 0, width: 7, height: 7, borderTop: "1.5px solid #000", borderRight: "1.5px solid #000" }} />
            <span style={{ position: "absolute", bottom: 0, left: 0, width: 7, height: 7, borderBottom: "1.5px solid #000", borderLeft: "1.5px solid #000" }} />
            <span style={{ position: "absolute", bottom: 0, right: 0, width: 7, height: 7, borderBottom: "1.5px solid #000", borderRight: "1.5px solid #000" }} />
          </>
        )}
        <p style={{ fontSize: 10, fontWeight: 500, color: "#2a2a2a", flex: 1, lineHeight: 1.4 }}>
          {item.card.title}
        </p>
        {isSelected && <span style={{ fontSize: 8, color: "#000", flexShrink: 0, marginRight: 2 }}>✓</span>}
        {onRemove && (
          <button className="nodrag absolute right-1.5 opacity-0 group-hover/minicard:opacity-100 transition-opacity w-4 h-4 rounded-full flex items-center justify-center text-[#bbb] hover:text-red-400 text-[9px] leading-none"
            style={{ top: "50%", transform: "translateY(-50%)" }}
            title="Remove" onClick={(e) => { e.stopPropagation(); onRemove(); }}>✕</button>
        )}
      </div>
    );
  }

  // ── Note card ───────────────────────────────────────────────────────────────
  return (
    <div
      {...sharedDrag}
      className="relative group/minicard overflow-hidden cursor-pointer nodrag nowheel"
      style={{ height: 68, background: bgColor, border: `1px solid ${borderColor}`, borderRadius: 0, boxShadow: shadow, transition: "all 0.15s ease", userSelect: "none" }}
    >
      {onRemove && (
        <button className="nodrag absolute top-1.5 right-1.5 opacity-0 group-hover/minicard:opacity-100 transition-opacity w-4 h-4 rounded flex items-center justify-center text-[#ccc] hover:text-red-400 hover:bg-red-50 text-[10px] leading-none z-10"
          title="Remove" onClick={(e) => { e.stopPropagation(); onRemove(); }}>✕</button>
      )}
      <div className="p-2 flex flex-col gap-0.5 h-full">
        <div className="flex items-center gap-1.5 pr-4">
          <span className="text-[8px] uppercase tracking-[0.12em] shrink-0" style={{ color: "rgba(0,0,0,0.4)" }}>
            {TYPE_LABEL_SINGLE[item.card.type]}
          </span>
          {isSelected && <span className="text-[9px] text-black shrink-0">✓</span>}
        </div>
        <p className="text-[10px] text-[#111] leading-tight line-clamp-2 flex-1">{item.card.title}</p>
        <p className="text-[9px] truncate" style={{ color: "rgba(0,0,0,0.3)" }}>{ACTION_LABEL[item.actionType] ?? item.actionType}</p>
      </div>
    </div>
  );
}

// ── Collection node ───────────────────────────────────────────────────────────
function CollectionNodeComponent({ data }: NodeProps) {
  const {
    allItems, collections, dragOverId, editingId, editForm,
    onContainerDragOver, onContainerDragEnter, onContainerDragLeave, onContainerDrop,
    onDeleteCollection, onRemoveCardFromCollection, onStartEdit, onConfirmEdit, onCancelEdit, onEditFormChange,
  } = useClusterCtx();

  const collectionId = data.collectionId as string;
  const collection = collections.find((c) => c.id === collectionId);
  if (!collection) return null;

  const items = allItems.filter((item) => collection.cardIds.includes(item.card.id));
  const isEditing = editingId === collectionId;
  const isDragOver = dragOverId === collectionId;
  const color = collection.color;

  return (
    <div
      className="overflow-hidden transition-shadow"
      style={{
        width: 320,
        background: isDragOver ? `${color}10` : "#fff",
        border: `1.5px solid ${isDragOver ? color : "rgba(0,0,0,0.18)"}`,
        borderRadius: 0,
        boxShadow: isDragOver ? `2px 2px 0px ${color}` : "none",
      }}
      onDragOver={onContainerDragOver}
      onDragEnter={(e) => onContainerDragEnter(e, collectionId)}
      onDragLeave={onContainerDragLeave}
      onDrop={(e) => onContainerDrop(e, collectionId)}
    >
      {/* Header — acts as drag handle for the RF node */}
      <div
        className="px-3 py-2.5 flex items-center gap-2 cursor-grab"
        style={{ background: `${color}16`, borderBottom: `1px solid ${color}55` }}
      >
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
        {isEditing ? (
          <input
            autoFocus
            value={editForm.title}
            onChange={(e) => onEditFormChange("title", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onConfirmEdit(collectionId);
              if (e.key === "Escape") onCancelEdit();
            }}
            className="nodrag flex-1 text-[11px] font-semibold bg-transparent border-b border-[#2563eb] outline-none min-w-0"
          />
        ) : (
          <span className="flex-1 text-[11px] font-semibold text-[#222] truncate">{collection.title}</span>
        )}
        <span className="text-[9px] text-[#aaa] shrink-0">{items.length}</span>
        <button
          className="nodrag text-[9px] text-[#ccc] hover:text-[#555] transition-colors"
          title="Rename"
          onClick={() => onStartEdit(collectionId, collection.title, collection.description)}
        >✎</button>
        <button
          className="nodrag text-[9px] text-[#ccc] hover:text-red-400 transition-colors ml-0.5"
          title="Delete"
          onClick={() => onDeleteCollection(collectionId)}
        >✕</button>
      </div>

      {/* Edit form */}
      {isEditing && (
        <div className="nodrag px-3 py-2 bg-white border-b border-[#f0efec]">
          <input
            placeholder="Description (optional)…"
            value={editForm.description}
            onChange={(e) => onEditFormChange("description", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onConfirmEdit(collectionId);
              if (e.key === "Escape") onCancelEdit();
            }}
            className="w-full text-[10px] bg-transparent border-b border-[#e4e3e0] outline-none text-[#666]"
          />
          <div className="flex gap-2 mt-1.5">
            <button onClick={() => onConfirmEdit(collectionId)} className="text-[9px] text-white bg-[#333] rounded px-2 py-0.5 nodrag">Save</button>
            <button onClick={onCancelEdit} className="text-[9px] text-[#aaa] nodrag">Cancel</button>
          </div>
        </div>
      )}
      {!isEditing && collection.description && (
        <div className="px-3 py-1.5 border-b border-[#f0efec]">
          <p className="text-[9px] text-[#888] leading-snug">{collection.description}</p>
        </div>
      )}

      {/* Cards */}
      <div className="nodrag nowheel p-2.5">
        {items.length === 0 ? (
          <div
            className="flex items-center justify-center py-5 border border-dashed"
            style={{ borderColor: `${color}70`, borderRadius: 0 }}
          >
            <p className="text-[10px] text-[#bbb]">{isDragOver ? "Drop here ↓" : "Drag cards here"}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {items.map((item) => (
              <MiniCard
                key={item.card.id}
                item={item}
                onRemove={() => onRemoveCardFromCollection(collectionId, item.card.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Type-group node (unassigned cards by type) ────────────────────────────────
function TypeGroupNodeComponent({ data }: NodeProps) {
  const {
    allItems, collections, dragOverId,
    onContainerDragOver, onContainerDragEnter, onContainerDragLeave, onContainerDrop,
  } = useClusterCtx();

  const typeName = data.typeName as string;
  const items = allItems.filter((item) => item.card.type === typeName);

  const s = TYPE_STYLE[typeName] ?? TYPE_STYLE.concept;
  const isDragOver = dragOverId === `type::${typeName}`;

  if (items.length === 0) {
    return (
      <div
        className="overflow-hidden opacity-35"
        style={{ width: 320, background: s.clusterBg, border: `1px dashed rgba(0,0,0,0.3)`, borderRadius: 0 }}
        onDragOver={onContainerDragOver}
        onDragEnter={(e) => onContainerDragEnter(e, `type::${typeName}`)}
        onDragLeave={onContainerDragLeave}
        onDrop={(e) => onContainerDrop(e, null)}
      >
        <div className="px-3 py-3 flex items-center gap-2 cursor-grab">
          <span className="text-[9px] uppercase tracking-[0.14em]" style={{ color: "rgba(0,0,0,0.45)" }}>
            {TYPE_LABEL_PLURAL[typeName]}
          </span>
          <span className="text-[9px] italic" style={{ color: "rgba(0,0,0,0.3)" }}>none yet</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden transition-shadow"
      style={{
        width: 320,
        background: isDragOver ? "#f5f4f0" : s.clusterBg,
        border: `1px solid ${isDragOver ? "#000" : "rgba(0,0,0,0.18)"}`,
        borderRadius: 0,
        boxShadow: isDragOver ? "2px 2px 0px rgba(0,0,0,0.4)" : "none",
      }}
      onDragOver={onContainerDragOver}
      onDragEnter={(e) => onContainerDragEnter(e, `type::${typeName}`)}
      onDragLeave={onContainerDragLeave}
      onDrop={(e) => onContainerDrop(e, null)}
    >
      <div
        className="px-3 py-2.5 flex items-center gap-2 cursor-grab"
        style={{ background: "rgba(0,0,0,0.04)", borderBottom: "1px solid rgba(0,0,0,0.1)" }}
      >
        <span className="text-[9px] uppercase tracking-[0.14em]" style={{ color: "rgba(0,0,0,0.5)" }}>
          {TYPE_LABEL_PLURAL[typeName]}
        </span>
        <span className="text-[9px] flex-1" style={{ color: "rgba(0,0,0,0.3)" }}>{items.length}</span>
      </div>
      <div className="nodrag nowheel p-2.5">
        <div className="grid grid-cols-2 gap-2">
          {items.map((item) => <MiniCard key={item.card.id} item={item} />)}
        </div>
      </div>
    </div>
  );
}

const nodeTypes = { collection: CollectionNodeComponent, typeGroup: TypeGroupNodeComponent };

// ── Build RF nodes helper ─────────────────────────────────────────────────────
function buildRfNodes(
  collections: Collection[],
  prevPositions: Map<string, { x: number; y: number }>,
): Node[] {
  const COL_W = 360;
  const nodes: Node[] = [];

  collections.forEach((col, i) => {
    nodes.push({
      id: col.id,
      type: "collection",
      position: prevPositions.get(col.id) ?? { x: (i % 2) * COL_W + 20, y: Math.floor(i / 2) * 420 + 20 },
      style: { width: 320 },
      data: { collectionId: col.id },
    });
  });

  const colRows = Math.max(1, Math.ceil(collections.length / 2));
  const typeBaseY = colRows * 420 + 32;
  CARD_TYPES.forEach((t, i) => {
    const id = `type::${t}`;
    nodes.push({
      id,
      type: "typeGroup",
      position: prevPositions.get(id) ?? { x: (i % 2) * COL_W + 20, y: typeBaseY + Math.floor(i / 2) * 360 },
      style: { width: 320 },
      data: { typeName: t },
    });
  });

  return nodes;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  generations: Generation[];
  assets: Asset[];
  onHoverSources: (cardIds: Set<string>, assetIds: Set<string>) => void;
  onBranchFrom: (card: ResultCard, action: ActionType) => void;
  onDismissCard: (genId: string, cardId: string) => void;
  onAddUserCard: (title: string, body: string) => void;
  onAddAsReference: (dataUrl: string, label: string) => void;
  collections: Collection[];
  onAddCollection: (col: Collection) => void;
  onRemoveCollection: (id: string) => void;
  onUpdateCollection: (id: string, patch: Partial<Pick<Collection, "title" | "description" | "color">>) => void;
  onAddCardsToCollection: (collectionId: string, cardIds: string[]) => void;
  onMoveCardToCollection: (cardId: string, toCollectionId: string | null) => void;
  onRemoveCardFromCollection: (collectionId: string, cardId: string) => void;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ClusterView({
  generations, assets,
  onHoverSources, onBranchFrom, onDismissCard,
  onAddUserCard: _onAddUserCard, onAddAsReference,
  collections, onAddCollection, onRemoveCollection, onUpdateCollection,
  onAddCardsToCollection: _onAddCardsToCollection, onMoveCardToCollection, onRemoveCardFromCollection,
}: Props) {
  const [selectedItem, setSelectedItem] = useState<ClusterItem | null>(null);
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
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", description: "" });
  const [newColForm, setNewColForm] = useState({
    open: false, title: "", description: "", colorIdx: 0,
  });

  const [rfNodes, setRfNodes, onRfNodesChange] = useNodesState<Node>(
    buildRfNodes(collections, new Map())
  );

  // Sync RF node list when collections are added / removed (positions preserved)
  useEffect(() => {
    setRfNodes((prev) => {
      const prevPositions = new Map(prev.map((n) => [n.id, n.position]));
      return buildRfNodes(collections, prevPositions);
    });
  }, [collections, setRfNodes]);

  const allItems: ClusterItem[] = useMemo(() =>
    generations.flatMap((gen) =>
      gen.cards.map((card) => ({ card, genId: gen.id, actionType: gen.actionType }))
    ),
    [generations]
  );

  const genSiblings = selectedItem
    ? allItems.filter((c) => c.genId === selectedItem.genId && c.card.id !== selectedItem.card.id)
    : [];

  // ── Drag handlers ─────────────────────────────────────────────────────────
  const onCardDragStart = useCallback((e: React.DragEvent, cardId: string) => {
    e.dataTransfer.setData("cluster-card-id", cardId);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const onContainerDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("cluster-card-id")) e.preventDefault();
  }, []);

  const onContainerDragEnter = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("cluster-card-id")) setDragOverId(id);
  }, []);

  const onContainerDragLeave = useCallback((e: React.DragEvent) => {
    if (e.relatedTarget && (e.currentTarget as Element).contains(e.relatedTarget as unknown as Element)) return;
    setDragOverId(null);
  }, []);

  const onContainerDrop = useCallback((e: React.DragEvent, collectionId: string | null) => {
    e.preventDefault();
    setDragOverId(null);
    const cardId = e.dataTransfer.getData("cluster-card-id");
    if (!cardId) return;
    onMoveCardToCollection(cardId, collectionId);
  }, [onMoveCardToCollection]);

  // ── Collection edit ───────────────────────────────────────────────────────
  const onDeleteCollection = useCallback((id: string) => {
    onRemoveCollection(id);
    if (selectedItem && collections.find((c) => c.id === id)?.cardIds.includes(selectedItem.card.id)) {
      setSelectedItem(null);
    }
  }, [onRemoveCollection, selectedItem, collections]);

  const onStartEdit = useCallback((id: string, title: string, description: string) => {
    setEditingId(id); setEditForm({ title, description });
  }, []);

  const onConfirmEdit = useCallback((id: string) => {
    if (!editForm.title.trim()) return;
    onUpdateCollection(id, { title: editForm.title.trim(), description: editForm.description.trim() });
    setEditingId(null);
  }, [editForm, onUpdateCollection]);

  const onCancelEdit = useCallback(() => setEditingId(null), []);

  const onEditFormChange = useCallback((field: "title" | "description", value: string) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  // ── New collection ────────────────────────────────────────────────────────
  function createCollection() {
    if (!newColForm.title.trim()) return;
    onAddCollection({
      id: crypto.randomUUID(),
      title: newColForm.title.trim(),
      description: newColForm.description.trim(),
      cardIds: [],
      color: COLLECTION_COLORS[newColForm.colorIdx],
      createdAt: new Date().toISOString(),
    });
    setNewColForm({ open: false, title: "", description: "", colorIdx: 0 });
  }

  const onCardClick = useCallback((item: ClusterItem) => {
    setSelectedItem((prev) => prev?.card.id === item.card.id ? null : item);
  }, []);

  const ctxValue: ClusterCtxType = useMemo(() => ({
    allItems, collections, selectedItem, dragOverId, editingId, editForm,
    onCardClick, onCardDragStart, onContainerDragOver, onContainerDragEnter,
    onContainerDragLeave, onContainerDrop, onDeleteCollection, onRemoveCardFromCollection,
    onStartEdit, onConfirmEdit, onCancelEdit, onEditFormChange, generations,
  }), [
    allItems, collections, selectedItem, dragOverId, editingId, editForm,
    onCardClick, onCardDragStart, onContainerDragOver, onContainerDragEnter,
    onContainerDragLeave, onContainerDrop, onDeleteCollection, onRemoveCardFromCollection,
    onStartEdit, onConfirmEdit, onCancelEdit, onEditFormChange, generations,
  ]);

  if (allItems.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-center py-24 text-[#bbb]">
        <div>
          <p className="text-sm mb-1">Run an action to see cards.</p>
          <p className="text-xs">Create collections to organize them.</p>
        </div>
      </div>
    );
  }

  return (
    <ClusterCtx.Provider value={ctxValue}>
      <div className="flex h-full w-full overflow-hidden">
        {/* ── RF Canvas ────────────────────────────────────────────────────── */}
        <div className="flex-1 h-full overflow-hidden">
          <ReactFlow
            nodes={rfNodes}
            edges={[]}
            nodeTypes={nodeTypes}
            onNodesChange={onRfNodesChange}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            nodesDraggable={true}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnScroll
            zoomOnScroll={false}
            minZoom={0.3}
            maxZoom={2}
            onClick={() => { setSelectedItem(null); setEditingId(null); }}
          >
            <Background color="#bbb" gap={24} size={1} />

            {/* New collection button */}
            <Panel position="top-right">
              {newColForm.open ? (
                <div className="bg-white border border-[rgba(0,0,0,0.18)] shadow-lg p-4 w-64 flex flex-col gap-3" style={{ borderRadius: 0 }}>
                  <p className="text-[11px] uppercase tracking-[0.12em] text-[rgba(0,0,0,0.5)]">New Collection</p>
                  <input
                    autoFocus
                    placeholder="Collection title…"
                    value={newColForm.title}
                    onChange={(e) => setNewColForm((p) => ({ ...p, title: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && createCollection()}
                    className="text-[11px] border border-[rgba(0,0,0,0.2)] px-2.5 py-1.5 outline-none focus:border-black"
                    style={{ borderRadius: 0 }}
                  />
                  <input
                    placeholder="Description (optional)…"
                    value={newColForm.description}
                    onChange={(e) => setNewColForm((p) => ({ ...p, description: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && createCollection()}
                    className="text-[11px] border border-[rgba(0,0,0,0.2)] px-2.5 py-1.5 outline-none focus:border-black"
                    style={{ borderRadius: 0 }}
                  />
                  <div className="flex gap-1.5 flex-wrap">
                    {COLLECTION_COLORS.map((color, i) => (
                      <button
                        key={color}
                        onClick={() => setNewColForm((p) => ({ ...p, colorIdx: i }))}
                        className="w-5 h-5 border-2 transition-transform"
                        style={{
                          borderRadius: 0,
                          background: color,
                          borderColor: newColForm.colorIdx === i ? "#333" : "transparent",
                          transform: newColForm.colorIdx === i ? "scale(1.2)" : "scale(1)",
                        }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={createCollection}
                      className="text-[11px] text-white bg-black hover:bg-[#333] px-3 py-1 transition-colors"
                      style={{ borderRadius: 0 }}
                    >Create</button>
                    <button
                      onClick={() => setNewColForm((p) => ({ ...p, open: false, title: "", description: "" }))}
                      className="text-[11px] text-[rgba(0,0,0,0.4)] hover:text-black transition-colors"
                    >Cancel</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setNewColForm((p) => ({ ...p, open: true }))}
                  className="bg-white border border-[rgba(0,0,0,0.2)] hover:border-black text-[11px] text-[rgba(0,0,0,0.5)] hover:text-black px-4 py-2 transition-colors"
                  style={{ borderRadius: 0 }}
                >
                  + New Collection
                </button>
              )}
            </Panel>
          </ReactFlow>
        </div>

        {/* ── Detail panel ─────────────────────────────────────────────────── */}
        {selectedItem && (
          <div style={{ width: panelWidth, flexShrink: 0, position: "relative", display: "flex" }}>
            <div
              onPointerDown={handlePanelResizeStart}
              style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, cursor: "col-resize", zIndex: 10 }}
              className="hover:bg-blue-300/40 transition-colors"
            />
            <ClusterDetailPanel
              item={selectedItem}
              genSiblings={genSiblings}
              assets={assets}
              sourceCardIds={generations.find((g) => g.id === selectedItem.genId)?.sourceCardIds ?? []}
              sourceDraftIds={generations.find((g) => g.id === selectedItem.genId)?.includedDraftIds ?? []}
              sourceRefIds={generations.find((g) => g.id === selectedItem.genId)?.includedReferenceIds ?? []}
              onBranch={(action) => { onBranchFrom(selectedItem.card, action); setSelectedItem(null); }}
              onRemove={() => { onDismissCard(selectedItem.genId, selectedItem.card.id); setSelectedItem(null); }}
              onSelectSibling={(id) => {
                const found = allItems.find((c) => c.card.id === id);
                if (found) setSelectedItem(found);
              }}
              onClose={() => setSelectedItem(null)}
              onAddAsReference={onAddAsReference}
            />
          </div>
        )}
      </div>
    </ClusterCtx.Provider>
  );
}

// ── Cluster detail panel ──────────────────────────────────────────────────────
function ClusterDetailPanel({
  item, genSiblings, assets,
  sourceCardIds: _sourceCardIds, sourceDraftIds, sourceRefIds,
  onBranch, onRemove, onSelectSibling, onClose, onAddAsReference,
}: {
  item: ClusterItem;
  genSiblings: ClusterItem[];
  assets: Asset[];
  sourceCardIds: string[];
  sourceDraftIds: string[];
  sourceRefIds: string[];
  onBranch: (action: ActionType) => void;
  onRemove: () => void;
  onSelectSibling: (id: string) => void;
  onClose: () => void;
  onAddAsReference: (dataUrl: string, label: string) => void;
}) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const { card } = item;
  const s = TYPE_STYLE[card.type] ?? TYPE_STYLE.concept;
  const isVisual = card.type === "visual";
  const mainImage = isVisual ? (card as VisualCard).imageDataUrl : undefined;

  const sourceDrafts = sourceDraftIds
    .map((id) => assets.find((a) => a.id === id))
    .filter((a): a is Asset => a !== undefined);

  const sourceRefs = sourceRefIds
    .map((id) => assets.find((a) => a.id === id))
    .filter((a): a is Asset => a !== undefined);

  const imageSiblings = genSiblings.filter(
    (sib): sib is ClusterItem & { card: VisualCard } =>
      sib.card.type === "visual" && !!(sib.card as VisualCard).imageDataUrl
  );
  const textSiblings = genSiblings.filter((sib) => !(imageSiblings as ClusterItem[]).includes(sib));

  return (
    <>
      <aside className="w-full h-full border-l border-[#e4e3e0] bg-white flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-[#f0efec] shrink-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: s.badgeBg, color: s.badgeText }}>
              {TYPE_LABEL_SINGLE[card.type]}
            </span>
            <div className="flex items-center gap-1.5 shrink-0 -mt-0.5">
              <button onClick={onRemove} className="text-[11px] text-[#ccc] hover:text-red-400 transition-colors">✕ Remove</button>
              <span className="text-[#e4e3e0]">|</span>
              <button onClick={onClose} className="text-[11px] text-[#bbb] hover:text-[#555] transition-colors">Close</button>
            </div>
          </div>
          <p className="text-[12px] font-semibold text-[#222] leading-snug">{card.title}</p>
          <p className="text-[10px] text-[#bbb] mt-0.5">{ACTION_LABEL[item.actionType]}</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {(sourceDrafts.length > 0 || sourceRefs.length > 0) && (
            <div className="px-4 py-3 border-b border-[#f0efec]">
              <p className="text-[9px] text-[#bbb] uppercase tracking-wide font-semibold mb-2">Sources</p>
              <div className="flex flex-col gap-1.5">
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

          {mainImage && (
            <div className="border-b border-[#f0efec]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mainImage} alt={card.title} className="w-full object-cover cursor-zoom-in" onClick={() => setLightboxSrc(mainImage)} />
              <div className="px-3 py-2 flex items-center justify-between gap-2">
                <p className="text-[9px] text-[#bbb]">Click to enlarge · {(card as VisualCard).dimensionLabel}</p>
                <button
                  onClick={() => onAddAsReference(mainImage, (card as VisualCard).dimensionLabel)}
                  className="text-[9px] text-[#555] hover:text-[#111] border border-[#ccc] hover:border-[#888] px-2 py-0.5 rounded transition-colors shrink-0"
                >+ Use as Input</button>
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
                      <button className="absolute inset-0 bg-black/0 group-hover/img:bg-black/30 transition-colors flex items-center justify-center" onClick={() => setLightboxSrc(sibCard.imageDataUrl!)}>
                        <span className="text-white text-[10px] opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/40 px-1.5 py-0.5 rounded">⤢</span>
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent px-1.5 py-1 opacity-0 group-hover/img:opacity-100 transition-opacity cursor-pointer" onClick={() => onSelectSibling(sib.card.id)}>
                        <p className="text-white text-[8px] leading-tight truncate">{sibCard.dimensionLabel}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="p-4 border-b border-[#f0efec] flex flex-col gap-3">
            <CardDetails card={card} />
          </div>

          {textSiblings.length > 0 && (
            <div className="p-3 border-b border-[#f0efec]">
              <p className="text-[9px] text-[#bbb] uppercase tracking-wide font-semibold mb-2">From same generation ({genSiblings.length})</p>
              <div className="flex flex-col gap-1.5">
                {textSiblings.map((sib) => {
                  const sibStyle = TYPE_STYLE[sib.card.type] ?? TYPE_STYLE.concept;
                  return (
                    <button key={sib.card.id} onClick={() => onSelectSibling(sib.card.id)} className="text-left px-2.5 py-2 rounded-lg border transition-colors hover:opacity-80" style={{ borderColor: sibStyle.border, background: sibStyle.bg }}>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[8px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded" style={{ background: sibStyle.badgeBg, color: sibStyle.badgeText }}>{TYPE_LABEL_SINGLE[sib.card.type]}</span>
                      </div>
                      <p className="text-[10px] font-medium text-[#333] leading-snug line-clamp-2">{sib.card.title}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="p-3 flex flex-col gap-1">
            <p className="text-[9px] text-[#bbb] uppercase tracking-wide font-semibold px-1 pt-1 pb-0.5">Branch from here</p>
            {BRANCH_ACTIONS.map((a) => (
              <button key={a.id} onClick={() => onBranch(a.id)} className="w-full text-left text-[11px] px-3 py-1.5 rounded-lg hover:bg-blue-50 hover:text-[#2563eb] text-[#555] transition-colors">
                {a.label} →
              </button>
            ))}
          </div>
        </div>
      </aside>

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
      return (<><Field label="Description" value={card.description} /><Field label="Rationale" value={card.rationale} /></>);
    case "motif":
      return (<><Field label="Visual Quality" value={card.visualQuality} /><Field label="How It Conveys The Idea" value={card.howItConveysIdea} /><Field label="Category" value={card.category} /></>);
    case "visual":
      return (<><Field label="Dimension" value={card.dimensionLabel} /><Field label="Analysis" value={card.analysisText} />{card.error && <Field label="Error" value={card.error} isError />}</>);
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
