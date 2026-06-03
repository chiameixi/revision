"use client";

/**
 * src/components/ClusterView.tsx
 *
 * Responsibility: Alternative flat view of all cards, grouped into clusters.
 *
 * Default clusters are created automatically by card type (Concepts, Motifs,
 * Visuals, Notes) and displayed as bordered panels with a 2-column tile grid.
 * Visual cards get a portrait image gallery instead of a text tile grid.
 *
 * Custom clusters: the researcher can create named custom clusters and drag
 * cards between them.  Assignments are stored in component state (not
 * persisted to localStorage) so they reset on reload — this is intentional,
 * treating the cluster view as a scratch space for temporary grouping.
 *
 * Drag and drop uses two separate DataTransfer keys:
 * - `card-drag`: contains the full serialised card, used by HighlightsPanel
 *   to accept drops from this view.
 * - `cluster-card`: contains only the card ID, used internally to rearrange
 *   between clusters without re-serialising the whole card.
 *
 * Dropping onto a type cluster (the default kind) removes the manual
 * assignment, returning the card to its natural type group.
 *
 * The `ClusterDetailPanel` mirrors the detail panel in `TreeView` and is not
 * extracted into a shared component because the two panels have slightly
 * different data shapes (LayoutNode vs ClusterItem).
 */

import { useMemo, useState } from "react";
import type { Asset, Generation, Highlight, ResultCard, ActionType, VisualCard } from "@/types";

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
  concept: "Concepts",
  motif: "Motifs",
  visual: "Visuals",
  note: "Your Notes",
};

const TYPE_LABEL_SINGLE: Record<string, string> = {
  concept: "Concept",
  motif: "Motif",
  visual: "Visual",
  note: "Note",
};

const ACTION_LABEL: Record<string, string> = {
  unpack_brief: "Unpack Brief",
  analyze: "Analyze",
  visuals: "Visual Variations",
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
];

// ── Custom cluster palette ────────────────────────────────────────────────────
const PALETTE = [
  { clusterBg: "#ffffff", border: "#111111", badgeBg: "#111111", badgeText: "#ffffff" },
  { clusterBg: "#f5f5f4", border: "#333333", badgeBg: "#333333", badgeText: "#ffffff" },
  { clusterBg: "#fafaf8", border: "#555555", badgeBg: "#555555", badgeText: "#ffffff" },
  { clusterBg: "#f5f5f4", border: "#222222", badgeBg: "#222222", badgeText: "#ffffff" },
  { clusterBg: "#ffffff", border: "#444444", badgeBg: "#444444", badgeText: "#ffffff" },
  { clusterBg: "#fafaf8", border: "#888888", badgeBg: "#888888", badgeText: "#ffffff" },
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface CustomCluster { id: string; name: string; colorIdx: number }

interface ClusterItem {
  card: ResultCard;
  genId: string;
  actionType: ActionType;
}

interface Props {
  generations: Generation[];
  savedCardIds: Set<string>;
  highlights: Highlight[];
  assets: Asset[];
  onHoverSources: (cardIds: Set<string>, assetIds: Set<string>) => void;
  onSaveCard: (card: ResultCard) => void;
  onBranchFrom: (card: ResultCard, action: ActionType) => void;
  onDismissCard: (genId: string, cardId: string) => void;
  onAddUserCard: (title: string, body: string) => void;
  onAddAsReference: (dataUrl: string, label: string) => void;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ClusterView({ generations, savedCardIds, highlights, assets, onHoverSources, onSaveCard, onBranchFrom, onDismissCard, onAddUserCard, onAddAsReference }: Props) {
  const [selectedItem, setSelectedItem] = useState<ClusterItem | null>(null);
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null);
  const [addTitle, setAddTitle] = useState("");
  const [addBody, setAddBody] = useState("");

  // Custom clusters + drag state
  const [customClusters, setCustomClusters] = useState<CustomCluster[]>([]);
  const [cardAssignments, setCardAssignments] = useState<Record<string, string>>({}); // cardId → customClusterId
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [creatingCluster, setCreatingCluster] = useState(false);
  const [newClusterName, setNewClusterName] = useState("");
  const [newClusterColorIdx, setNewClusterColorIdx] = useState(0);

  const allItems: ClusterItem[] = generations.flatMap((gen) =>
    gen.cards.map((card) => ({ card, genId: gen.id, actionType: gen.actionType }))
  );

  function handleCardMouseEnter(genId: string) {
    const gen = generations.find((g) => g.id === genId);
    if (!gen) return;
    const cardIds = new Set(gen.sourceCardIds ?? []);
    const assetIds = new Set([...(gen.includedDraftIds ?? []), ...(gen.includedReferenceIds ?? [])]);
    if (cardIds.size > 0 || assetIds.size > 0) onHoverSources(cardIds, assetIds);
  }

  function handleCardMouseLeave() {
    onHoverSources(new Set(), new Set());
  }

  function submitAddCard(groupType: string) {
    if (!addTitle.trim()) return;
    onAddUserCard(addTitle.trim(), addBody.trim());
    setAddTitle(""); setAddBody(""); setAddingToGroup(null);
  }

  function handleDrop(e: React.DragEvent, targetId: string | null) {
    e.preventDefault();
    setDragOverId(null);
    try {
      const raw = e.dataTransfer.getData("cluster-card");
      if (!raw) return;
      const { cardId } = JSON.parse(raw) as { cardId: string };
      // null targetId means the card was dropped on a type cluster — remove the
      // manual assignment so it reverts to its default type group.
      if (targetId === null) {
        setCardAssignments((prev) => { const next = { ...prev }; delete next[cardId]; return next; });
      } else {
        setCardAssignments((prev) => ({ ...prev, [cardId]: targetId }));
      }
    } catch {}
  }

  function handleDragEnter(e: React.DragEvent, id: string) {
    e.preventDefault();
    if (e.dataTransfer.types.includes("cluster-card")) setDragOverId(id);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (e.relatedTarget && (e.currentTarget as Element).contains(e.relatedTarget as Node)) return;
    setDragOverId(null);
  }

  function createCluster() {
    if (!newClusterName.trim()) return;
    setCustomClusters((prev) => [...prev, { id: crypto.randomUUID(), name: newClusterName.trim(), colorIdx: newClusterColorIdx }]);
    setNewClusterName(""); setCreatingCluster(false);
  }

  function deleteCluster(id: string) {
    setCustomClusters((prev) => prev.filter((c) => c.id !== id));
    setCardAssignments((prev) => { const next = { ...prev }; Object.keys(next).forEach((k) => { if (next[k] === id) delete next[k]; }); return next; });
  }

  const TYPES: ResultCard["type"][] = ["concept", "motif", "visual", "note"];
  // Exclude cards that have been manually assigned to a custom cluster
  const groups = TYPES.map((type) => ({
    type,
    items: allItems.filter((c) => c.card.type === type && !cardAssignments[c.card.id]),
  })).filter((g) => g.items.length > 0);

  if (groups.length === 0 && customClusters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-24 text-[#bbb]">
        <p className="text-sm mb-1">Run an action to see clusters.</p>
        <p className="text-xs">Cards are grouped here by type.</p>
      </div>
    );
  }

  const genSiblings = selectedItem
    ? allItems.filter((c) => c.genId === selectedItem.genId && c.card.id !== selectedItem.card.id)
    : [];

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Cluster canvas ────────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-auto p-6"
        style={{
          background: "radial-gradient(circle, #bbb 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          backgroundColor: "#f0eeea",
        }}
        onClick={() => setSelectedItem(null)}
      >
        <div className="flex flex-wrap gap-5 items-start" onClick={(e) => e.stopPropagation()}>
          {/* ── Custom clusters ─────────────────────────────────────────── */}
          {customClusters.map((cc) => {
            const p = PALETTE[cc.colorIdx];
            const ccItems = allItems.filter((c) => cardAssignments[c.card.id] === cc.id);
            const isDragOver = dragOverId === cc.id;
            return (
              <div
                key={cc.id}
                className="rounded-2xl flex-shrink-0 transition-all"
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={(e) => handleDragEnter(e, cc.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, cc.id)}
                style={{
                  background: isDragOver ? p.badgeBg : p.clusterBg,
                  border: `1.5px solid ${p.border}`,
                  outline: isDragOver ? `2px dashed ${p.badgeText}88` : "none",
                  outlineOffset: 2,
                  padding: "14px",
                  width: 308,
                  minHeight: 80,
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: p.badgeBg, color: p.badgeText }}>
                    {cc.name}
                  </span>
                  <span className="text-[10px] text-[#aaa] flex-1">{ccItems.length}</span>
                  <button
                    onClick={() => deleteCluster(cc.id)}
                    className="text-[10px] text-[#ccc] hover:text-red-400 transition-colors px-1"
                    title="Delete cluster"
                  >✕</button>
                </div>

                {ccItems.length === 0 ? (
                  <div className="flex items-center justify-center rounded-xl border-2 border-dashed py-6 transition-colors" style={{ borderColor: isDragOver ? p.badgeText : p.border }}>
                    <p className="text-[10px]" style={{ color: isDragOver ? p.badgeText : "#bbb" }}>
                      {isDragOver ? "Drop here" : "Drag cards here"}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5">
                    {ccItems.map((item) => {
                      const ts = TYPE_STYLE[item.card.type] ?? TYPE_STYLE.concept;
                      const isSelected = selectedItem?.card.id === item.card.id;
                      const isSaved = savedCardIds.has(item.card.id);
                      const isVis = item.card.type === "visual";
                      const imgSrc = isVis ? (item.card as VisualCard).imageDataUrl : undefined;
                      return (
                        <div
                          key={item.card.id}
                          className="rounded-xl overflow-hidden cursor-pointer transition-all"
                          draggable={true}
                          onDragStart={(e) => {
                            e.dataTransfer.setData("card-drag", JSON.stringify({ card: item.card, genId: item.genId }));
                            e.dataTransfer.setData("cluster-card", JSON.stringify({ cardId: item.card.id }));
                            e.dataTransfer.effectAllowed = "copyMove";
                          }}
                          onMouseEnter={() => handleCardMouseEnter(item.genId)}
                          onMouseLeave={handleCardMouseLeave}
                          style={{
                            background: isSelected ? ts.bg : "#ffffff",
                            border: `1.5px solid ${isSelected ? ts.selectedBorder : ts.border}`,
                            boxShadow: isSelected ? "3px 3px 0px #111" : "1px 1px 0px #ccc",
                          }}
                          onClick={() => setSelectedItem(isSelected ? null : item)}
                        >
                          {imgSrc && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={imgSrc} alt={item.card.title} className="w-full h-14 object-cover" />
                          )}
                          <div className="p-2">
                            <div className="flex items-center gap-1 mb-0.5">
                              <span className="text-[8px] font-bold uppercase tracking-wide px-1 py-0.5 rounded shrink-0" style={{ background: ts.badgeBg, color: ts.badgeText }}>
                                {TYPE_LABEL_SINGLE[item.card.type]}
                              </span>
                              {isSaved && <span className="text-[9px] text-amber-400 shrink-0">★</span>}
                            </div>
                            <p className="text-[10px] font-medium text-[#333] leading-tight line-clamp-2">{item.card.title}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* ── New Cluster button / form ────────────────────────────────── */}
          <div className="flex-shrink-0 self-start">
            {creatingCluster ? (
              <div className="rounded-2xl border border-[#e4e3e0] bg-white p-4 flex flex-col gap-3 w-[240px]">
                <p className="text-[11px] font-semibold text-[#333]">New Cluster</p>
                <input
                  autoFocus
                  placeholder="Cluster name…"
                  value={newClusterName}
                  onChange={(e) => setNewClusterName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createCluster()}
                  className="text-[11px] border border-[#e4e3e0] rounded-lg px-2.5 py-1.5 outline-none focus:border-[#2563eb]/40"
                />
                <div className="flex gap-1.5">
                  {PALETTE.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => setNewClusterColorIdx(i)}
                      className="w-5 h-5 rounded-full border-2 transition-all"
                      style={{
                        background: p.badgeBg,
                        borderColor: newClusterColorIdx === i ? p.badgeText : "transparent",
                        outline: newClusterColorIdx === i ? `2px solid ${p.badgeText}44` : "none",
                        outlineOffset: 1,
                      }}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={createCluster} className="text-[11px] text-white bg-[#333] hover:bg-[#111] rounded-lg px-3 py-1 font-medium transition-colors">
                    Create
                  </button>
                  <button onClick={() => { setCreatingCluster(false); setNewClusterName(""); }} className="text-[11px] text-[#aaa] hover:text-[#555] transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreatingCluster(true)}
                className="rounded-2xl border-2 border-dashed border-[#e4e3e0] hover:border-[#aaa] text-[11px] text-[#bbb] hover:text-[#555] px-5 py-4 transition-colors font-medium"
              >
                + New Cluster
              </button>
            )}
          </div>

          {/* ── Type clusters ────────────────────────────────────────────── */}
          {groups.map((group) => {
            const s = TYPE_STYLE[group.type];
            const isVisualGroup = group.type === "visual";

            return (
              <div
                key={group.type}
                className="rounded-2xl flex-shrink-0 transition-all"
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={(e) => handleDragEnter(e, `type::${group.type}`)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, null)}
                style={{
                  background: s.clusterBg,
                  border: `1.5px solid ${dragOverId === `type::${group.type}` ? s.selectedBorder : s.border}`,
                  outline: dragOverId === `type::${group.type}` ? `2px dashed ${s.line}` : "none",
                  outlineOffset: 2,
                  padding: "14px",
                  width: isVisualGroup ? 364 : 308,
                }}
              >
                {/* Cluster header */}
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                    style={{ background: s.badgeBg, color: s.badgeText }}
                  >
                    {TYPE_LABEL_PLURAL[group.type]}
                  </span>
                  <span className="text-[10px] text-[#aaa] flex-1">{group.items.length}</span>
                  {group.type !== "visual" && (
                    <button
                      onClick={() => { setAddingToGroup(group.type); setAddTitle(""); setAddBody(""); }}
                      className="text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors"
                      style={{ color: s.badgeText, background: `${s.badgeBg}cc` }}
                    >
                      + Add
                    </button>
                  )}
                </div>

                {/* Inline add form */}
                {addingToGroup === group.type && (
                  <div className="mb-3 flex flex-col gap-1.5 p-2.5 rounded-xl border bg-white" style={{ borderColor: s.border }}>
                    <input
                      autoFocus
                      placeholder="Title…"
                      value={addTitle}
                      onChange={(e) => setAddTitle(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && submitAddCard(group.type)}
                      className="text-[11px] font-medium border border-[#e4e3e0] rounded-lg px-2 py-1.5 outline-none focus:border-[#2563eb]/40 bg-[#fafaf9]"
                    />
                    <textarea
                      placeholder="Description…"
                      value={addBody}
                      onChange={(e) => setAddBody(e.target.value)}
                      rows={2}
                      className="text-[11px] border border-[#e4e3e0] rounded-lg px-2 py-1.5 resize-none outline-none focus:border-[#2563eb]/40 bg-[#fafaf9]"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => submitAddCard(group.type)}
                        className="text-[10px] text-white rounded-lg px-2.5 py-1 font-medium transition-colors"
                        style={{ background: s.badgeText }}
                      >Add</button>
                      <button
                        onClick={() => setAddingToGroup(null)}
                        className="text-[10px] text-[#aaa] hover:text-[#555] transition-colors"
                      >Cancel</button>
                    </div>
                  </div>
                )}

                {/* Visual variations: portrait image gallery */}
                {isVisualGroup ? (
                  <div className="grid grid-cols-3 gap-2">
                    {group.items.map((item) => {
                      const visCard = item.card as VisualCard;
                      const isSelected = selectedItem?.card.id === item.card.id;
                      const isSaved = savedCardIds.has(item.card.id);
                      return (
                        <div
                          key={item.card.id}
                          className="relative rounded-xl overflow-hidden cursor-pointer group/tile"
                          draggable={true}
                          onDragStart={(e) => {
                            e.dataTransfer.setData("card-drag", JSON.stringify({ card: item.card, genId: item.genId }));
                            e.dataTransfer.setData("cluster-card", JSON.stringify({ cardId: item.card.id }));
                            e.dataTransfer.effectAllowed = "copyMove";
                          }}
                          onMouseEnter={() => handleCardMouseEnter(item.genId)}
                          onMouseLeave={handleCardMouseLeave}
                          style={{
                            aspectRatio: "2/3",
                            background: visCard.imageDataUrl ? "transparent" : s.bg,
                            border: `2px solid ${isSelected ? s.selectedBorder : "transparent"}`,
                            boxShadow: isSelected
                              ? `0 0 0 2px ${s.line}44`
                              : "0 1px 4px rgba(0,0,0,0.10)",
                          }}
                          onClick={() => setSelectedItem(isSelected ? null : item)}
                        >
                          {visCard.imageDataUrl ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={visCard.imageDataUrl}
                                alt={visCard.title}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/tile:opacity-100 transition-opacity" />
                              <p className="absolute bottom-0 left-0 right-0 px-1.5 py-1.5 text-white text-[8px] leading-tight truncate opacity-0 group-hover/tile:opacity-100 transition-opacity">
                                {visCard.dimensionLabel}
                              </p>
                            </>
                          ) : (
                            <div className="flex items-center justify-center h-full p-2">
                              <p className="text-[9px] text-[#888] text-center leading-tight">
                                {visCard.dimensionLabel ?? "No image"}
                              </p>
                            </div>
                          )}
                          {isSaved && (
                            <span className="absolute top-1 right-1 text-[10px] text-amber-400 drop-shadow">★</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Text cards: 2-col compact tiles */
                  <div className="grid grid-cols-2 gap-1.5">
                    {group.items.map((item) => {
                      const isSelected = selectedItem?.card.id === item.card.id;
                      const isSaved = savedCardIds.has(item.card.id);
                      return (
                        <div
                          key={item.card.id}
                          className="rounded-xl p-2.5 cursor-pointer transition-all"
                          draggable={true}
                          onDragStart={(e) => {
                            e.dataTransfer.setData("card-drag", JSON.stringify({ card: item.card, genId: item.genId }));
                            e.dataTransfer.setData("cluster-card", JSON.stringify({ cardId: item.card.id }));
                            e.dataTransfer.effectAllowed = "copyMove";
                          }}
                          onMouseEnter={() => handleCardMouseEnter(item.genId)}
                          onMouseLeave={handleCardMouseLeave}
                          style={{
                            background: isSelected ? s.bg : "#ffffff",
                            border: `1.5px solid ${isSelected ? s.selectedBorder : s.border}`,
                            boxShadow: isSelected ? "3px 3px 0px #111" : "1px 1px 0px #ccc",
                            minHeight: 68,
                          }}
                          onClick={() => setSelectedItem(isSelected ? null : item)}
                        >
                          <div className="flex items-start justify-between gap-1 mb-1">
                            <p className="text-[9px] text-[#bbb] truncate flex-1">
                              {ACTION_LABEL[item.actionType]}
                            </p>
                            {isSaved && <span className="text-[9px] text-amber-400 shrink-0">★</span>}
                          </div>
                          <p className="text-[11px] font-medium text-[#333] leading-tight line-clamp-2">
                            {item.card.title}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Detail panel ─────────────────────────────────────────────────── */}
      {selectedItem ? (
        <ClusterDetailPanel
          item={selectedItem}
          genSiblings={genSiblings}
          highlights={highlights}
          assets={assets}
          sourceCardIds={generations.find((g) => g.id === selectedItem.genId)?.sourceCardIds ?? []}
          sourceDraftIds={generations.find((g) => g.id === selectedItem.genId)?.includedDraftIds ?? []}
          sourceRefIds={generations.find((g) => g.id === selectedItem.genId)?.includedReferenceIds ?? []}
          isSaved={savedCardIds.has(selectedItem.card.id)}
          savedCardIds={savedCardIds}
          onSave={() => onSaveCard(selectedItem.card)}
          onBranch={(action) => {
            onBranchFrom(selectedItem.card, action);
            setSelectedItem(null);
          }}
          onRemove={() => {
            onDismissCard(selectedItem.genId, selectedItem.card.id);
            setSelectedItem(null);
          }}
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
  );
}

// ── Cluster detail panel ──────────────────────────────────────────────────────
function ClusterDetailPanel({
  item,
  genSiblings,
  highlights,
  assets,
  sourceCardIds,
  sourceDraftIds,
  sourceRefIds,
  isSaved,
  savedCardIds,
  onSave,
  onBranch,
  onRemove,
  onSelectSibling,
  onClose,
  onAddAsReference,
}: {
  item: ClusterItem;
  genSiblings: ClusterItem[];
  highlights: Highlight[];
  assets: Asset[];
  sourceCardIds: string[];
  sourceDraftIds: string[];
  sourceRefIds: string[];
  isSaved: boolean;
  savedCardIds: Set<string>;
  onSave: () => void;
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

  const sourceHighlights = sourceCardIds
    .map((pid) => highlights.find((h) => h.card.id === pid))
    .filter((h): h is Highlight => h !== undefined);

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
            <span
              className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
              style={{ background: s.badgeBg, color: s.badgeText }}
            >
              {TYPE_LABEL_SINGLE[card.type]}
            </span>
            <div className="flex items-center gap-1.5 shrink-0 -mt-0.5">
              <button
                onClick={onRemove}
                className="text-[11px] text-[#ccc] hover:text-red-400 transition-colors"
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
          <p className="text-[10px] text-[#bbb] mt-0.5">{ACTION_LABEL[item.actionType]}</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* All sources */}
          {(sourceHighlights.length > 0 || sourceDrafts.length > 0 || sourceRefs.length > 0) && (
            <div className="px-4 py-3 border-b border-[#f0efec]">
              <p className="text-[9px] text-[#bbb] uppercase tracking-wide font-semibold mb-2">Sources</p>
              <div className="flex flex-col gap-1.5">
                {sourceHighlights.map((h) => (
                  <div key={h.card.id} className="px-2.5 py-2 rounded-lg" style={{ background: "#fffbeb", border: "1px solid #f0d89a" }}>
                    <p className="text-[9px] text-[#b45309] uppercase tracking-wide font-semibold mb-0.5">★ highlight · {h.card.type.replace("_", " ")}</p>
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

          {mainImage && (
            <div className="border-b border-[#f0efec]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mainImage}
                alt={card.title}
                className="w-full object-cover cursor-zoom-in"
                onClick={() => setLightboxSrc(mainImage)}
              />
              <div className="px-3 py-2 flex items-center justify-between gap-2">
                <p className="text-[9px] text-[#bbb]">
                  Click to enlarge · {(card as VisualCard).dimensionLabel}
                </p>
                <button
                  onClick={() => onAddAsReference(mainImage, (card as VisualCard).dimensionLabel)}
                  className="text-[9px] text-[#555] hover:text-[#111] border border-[#ccc] hover:border-[#888] px-2 py-0.5 rounded transition-colors shrink-0"
                >
                  + Use as Input
                </button>
              </div>
            </div>
          )}

          {imageSiblings.length > 0 && (
            <div className="border-b border-[#f0efec] p-3">
              <p className="text-[9px] text-[#bbb] uppercase tracking-wide font-semibold mb-2">
                Images from same generation
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {imageSiblings.map((sib) => {
                  const sibCard = sib.card as VisualCard;
                  return (
                    <div
                      key={sib.card.id}
                      className="relative group/img aspect-square rounded overflow-hidden bg-[#f7f6f3]"
                    >
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

          <div className="p-4 border-b border-[#f0efec] flex flex-col gap-3">
            <CardDetails card={card} />
          </div>

          {textSiblings.length > 0 && (
            <div className="p-3 border-b border-[#f0efec]">
              <p className="text-[9px] text-[#bbb] uppercase tracking-wide font-semibold mb-2">
                From same generation ({genSiblings.length})
              </p>
              <div className="flex flex-col gap-1.5">
                {textSiblings.map((sib) => {
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
                        <span
                          className="text-[8px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded"
                          style={{ background: sibStyle.badgeBg, color: sibStyle.badgeText }}
                        >
                          {TYPE_LABEL_SINGLE[sib.card.type]}
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

          <div className="p-3 flex flex-col gap-1">
            {!isSaved ? (
              <button
                onClick={onSave}
                className="w-full text-left text-[11px] px-3 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 font-medium transition-colors mb-1"
              >
                ★ Save to Highlights
              </button>
            ) : (
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
