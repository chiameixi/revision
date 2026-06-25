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
  concept: { bg: "#fffbf5", border: "#b45309", selectedBorder: "#78350f", badgeBg: "#b45309", badgeText: "#ffffff", line: "#d97706", clusterBg: "#fffbf5" },
  motif:   { bg: "#f0fdf4", border: "#16a34a", selectedBorder: "#166534", badgeBg: "#166534", badgeText: "#ffffff", line: "#4ade80", clusterBg: "#f0fdf4" },
  visual:  { bg: "#fafafa", border: "#333333", selectedBorder: "#111111", badgeBg: "#111111", badgeText: "#ffffff", line: "#888888", clusterBg: "#fafafa" },
  note:    { bg: "#fafaf8", border: "#888888", selectedBorder: "#111111", badgeBg: "#888888", badgeText: "#ffffff", line: "#bbbbbb", clusterBg: "#fafaf8" },
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
  "#f59e0b", "#10b981", "#3b82f6", "#ef4444",
  "#8b5cf6", "#f97316", "#14b8a6", "#ec4899",
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
  const imgSrc = isVisual ? (item.card as VisualCard).imageDataUrl : undefined;

  return (
    <div
      className="relative group/minicard rounded-lg overflow-hidden cursor-pointer transition-all nodrag nowheel"
      draggable
      onDragStart={(e) => { e.stopPropagation(); onCardDragStart(e, item.card.id); }}
      onClick={(e) => { e.stopPropagation(); onCardClick(item); }}
      style={{
        background: isSelected ? ts.bg : "#ffffff",
        border: `1.5px solid ${isSelected ? ts.selectedBorder : ts.border}`,
        boxShadow: isSelected ? "3px 3px 0px #111" : "1px 1px 0px #ccc",
      }}
    >
      {imgSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imgSrc} alt={item.card.title} className="w-full h-12 object-cover" />
      )}
      <div className="p-1.5">
        <div className="flex items-center gap-1 mb-0.5">
          <span
            className="text-[8px] font-bold uppercase tracking-wide px-1 py-0.5 rounded shrink-0"
            style={{ background: ts.badgeBg, color: ts.badgeText }}
          >
            {TYPE_LABEL_SINGLE[item.card.type]}
          </span>

        </div>
        <p className="text-[10px] font-medium text-[#333] leading-tight line-clamp-2">{item.card.title}</p>
      </div>
      {onRemove && (
        <button
          className="nodrag absolute top-0.5 right-0.5 w-3.5 h-3.5 flex items-center justify-center rounded-full bg-white/80 text-[8px] text-[#bbb] hover:text-red-400 hover:bg-white opacity-0 group-hover/minicard:opacity-100 transition-opacity"
          title="Remove from collection"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        >✕</button>
      )}
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
      className="rounded-2xl overflow-hidden transition-shadow"
      style={{
        width: 296,
        background: isDragOver ? `${color}18` : "#fff",
        border: `2px solid ${isDragOver ? color : "#e4e3e0"}`,
        boxShadow: isDragOver ? `0 0 0 3px ${color}33` : "0 2px 8px rgba(0,0,0,0.08)",
      }}
      onDragOver={onContainerDragOver}
      onDragEnter={(e) => onContainerDragEnter(e, collectionId)}
      onDragLeave={onContainerDragLeave}
      onDrop={(e) => onContainerDrop(e, collectionId)}
    >
      {/* Header — acts as drag handle for the RF node */}
      <div
        className="px-3 py-2.5 flex items-center gap-2 cursor-grab"
        style={{ background: `${color}22`, borderBottom: `1px solid ${color}44` }}
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
            className="flex items-center justify-center py-5 rounded-lg border-2 border-dashed"
            style={{ borderColor: `${color}55` }}
          >
            <p className="text-[10px] text-[#bbb]">{isDragOver ? "Drop here ↓" : "Drag cards here"}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
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
        className="rounded-2xl overflow-hidden opacity-40"
        style={{ width: 296, background: s.clusterBg, border: `1.5px dashed ${s.border}` }}
        onDragOver={onContainerDragOver}
        onDragEnter={(e) => onContainerDragEnter(e, `type::${typeName}`)}
        onDragLeave={onContainerDragLeave}
        onDrop={(e) => onContainerDrop(e, null)}
      >
        <div className="px-3 py-3 flex items-center gap-2 cursor-grab">
          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full" style={{ background: s.badgeBg, color: s.badgeText }}>
            {TYPE_LABEL_PLURAL[typeName]}
          </span>
          <span className="text-[9px] text-[#bbb]">none yet</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl overflow-hidden transition-shadow"
      style={{
        width: 296,
        background: isDragOver ? "#eff6ff" : s.clusterBg,
        border: `1.5px solid ${isDragOver ? "#2563eb" : s.border}`,
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      }}
      onDragOver={onContainerDragOver}
      onDragEnter={(e) => onContainerDragEnter(e, `type::${typeName}`)}
      onDragLeave={onContainerDragLeave}
      onDrop={(e) => onContainerDrop(e, null)}
    >
      <div
        className="px-3 py-2.5 flex items-center gap-2 cursor-grab"
        style={{ background: `${s.badgeBg}18`, borderBottom: `1px solid ${s.border}44` }}
      >
        <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full" style={{ background: s.badgeBg, color: s.badgeText }}>
          {TYPE_LABEL_PLURAL[typeName]}
        </span>
        <span className="text-[9px] text-[#aaa] flex-1">{items.length}</span>
      </div>
      <div className="nodrag nowheel p-2.5">
        <div className="grid grid-cols-2 gap-1.5">
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
  const COL_W = 340;
  const nodes: Node[] = [];

  collections.forEach((col, i) => {
    nodes.push({
      id: col.id,
      type: "collection",
      position: prevPositions.get(col.id) ?? { x: (i % 2) * COL_W + 20, y: Math.floor(i / 2) * 420 + 20 },
      style: { width: 296 },
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
      style: { width: 296 },
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
                <div className="bg-white rounded-2xl border border-[#e4e3e0] shadow-lg p-4 w-64 flex flex-col gap-3">
                  <p className="text-[11px] font-semibold text-[#333]">New Collection</p>
                  <input
                    autoFocus
                    placeholder="Collection title…"
                    value={newColForm.title}
                    onChange={(e) => setNewColForm((p) => ({ ...p, title: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && createCollection()}
                    className="text-[11px] border border-[#e4e3e0] rounded-lg px-2.5 py-1.5 outline-none focus:border-[#3b82f6]/60"
                  />
                  <input
                    placeholder="Description (optional)…"
                    value={newColForm.description}
                    onChange={(e) => setNewColForm((p) => ({ ...p, description: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && createCollection()}
                    className="text-[11px] border border-[#e4e3e0] rounded-lg px-2.5 py-1.5 outline-none focus:border-[#3b82f6]/60"
                  />
                  <div className="flex gap-1.5 flex-wrap">
                    {COLLECTION_COLORS.map((color, i) => (
                      <button
                        key={color}
                        onClick={() => setNewColForm((p) => ({ ...p, colorIdx: i }))}
                        className="w-5 h-5 rounded-full border-2 transition-transform"
                        style={{
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
                      className="text-[11px] text-white bg-[#333] hover:bg-[#111] rounded-lg px-3 py-1 font-medium transition-colors"
                    >Create</button>
                    <button
                      onClick={() => setNewColForm((p) => ({ ...p, open: false, title: "", description: "" }))}
                      className="text-[11px] text-[#aaa] hover:text-[#555] transition-colors"
                    >Cancel</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setNewColForm((p) => ({ ...p, open: true }))}
                  className="bg-white rounded-xl border border-[#e4e3e0] shadow-sm hover:shadow-md text-[11px] text-[#555] hover:text-[#111] font-medium px-4 py-2 transition-all"
                >
                  + New Collection
                </button>
              )}
            </Panel>
          </ReactFlow>
        </div>

        {/* ── Detail panel ─────────────────────────────────────────────────── */}
        {selectedItem ? (
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
        ) : (
          <div className="w-[200px] shrink-0 border-l border-[#e4e3e0] bg-white/60 flex items-center justify-center">
            <p className="text-[10px] text-[#ccc] text-center px-4 leading-relaxed">
              Click a card to see details and actions
            </p>
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
      <aside className="w-[272px] shrink-0 h-full border-l border-[#e4e3e0] bg-white flex flex-col overflow-hidden">
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
