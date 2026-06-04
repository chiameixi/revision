"use client";

/**
 * src/components/CenterPanel.tsx
 *
 * Responsibility: The main content area — action toolbar, view-mode toggle
 * (Feed / Tree / Clusters), and the active view itself.
 *
 * The toolbar dispatches action identifiers up to `page.tsx` via
 * `onActionClick`, which then opens the `CallComposerModal`.  The panel
 * receives already-filtered `generations` (dismissed cards removed) so it
 * never needs to know about the dismiss set directly.
 *
 * View modes:
 * - Feed: chronological stack of `GenerationBlock` components.
 * - Tree: `TreeView` renders a BFS-depth-based node graph.
 * - Clusters: `ClusterView` groups cards by type with drag-to-regroup.
 *
 * `GenerationBlock` resolves source references (highlight cards, draft/ref
 * assets) from the IDs stored on the generation and shows them as provenance
 * chips in the block header.  Hovering a block emits those IDs so
 * `InputsSidebar` and `HighlightsPanel` can highlight the corresponding items.
 */

import { useState } from "react";
import type { ActionType, Asset, ConceptCard, Generation, Highlight, ResultCard } from "@/types";
import ResultCardComponent from "./cards/ResultCard";
import TreeView from "./TreeView";
import ClusterView from "./ClusterView";

interface Props {
  generations: Generation[];
  isGenerating: boolean;
  generatingAction: ActionType | null;
  savedCardIds: Set<string>;
  highlights: Highlight[];
  assets: Asset[];
  hoveredSourceIds: Set<string>;
  onHoverSources: (cardIds: Set<string>, assetIds: Set<string>) => void;
  onActionClick: (action: ActionType) => void;
  onSaveCard: (card: ResultCard) => void;
  onDismissCard: (genId: string, cardId: string) => void;
  onUpdateCard: (card: ResultCard) => void;
  onGenerateVisuals: (card: ConceptCard) => void;
  onBranchFrom: (card: ResultCard, action: ActionType) => void;
  onAddUserCard: (title: string, body: string) => void;
  onAddAsReference: (dataUrl: string, label: string) => void;
}

const TOOLBAR_ACTIONS: { id: ActionType; label: string; desc: string }[] = [
  { id: "unpack_brief",          label: "Unpack Brief",           desc: "Turn brief into idea directions" },
  { id: "analyze",               label: "Analyze",                desc: "Extract visual motifs from images" },
  { id: "visual_variations",     label: "Visual Variations",      desc: "Arnheim dimension variations" },
  { id: "conceptual_variations", label: "Conceptual Variations",  desc: "Deeper concept alternatives" },
];

const ACTION_LABELS: Record<ActionType, string> = {
  unpack_brief:            "Unpack Brief",
  analyze:                 "Analyze",
  visual_variations:       "Visual Variations",
  conceptual_variations:   "Conceptual Variations",
  generate_concept_visuals: "Generate Concept Visuals",
  user_added:              "Your Idea",
};

export default function CenterPanel({
  generations,
  isGenerating,
  generatingAction,
  savedCardIds,
  highlights,
  assets,
  hoveredSourceIds,
  onHoverSources,
  onActionClick,
  onSaveCard,
  onDismissCard,
  onUpdateCard,
  onGenerateVisuals,
  onBranchFrom,
  onAddUserCard,
  onAddAsReference,
}: Props) {
  const [view, setView] = useState<"feed" | "tree" | "clusters">("feed");

  return (
    <main className="flex-1 min-w-0 h-screen flex flex-col overflow-hidden">
      {/* Action toolbar */}
      <div className="px-5 pt-5 pb-4 border-b bg-white" style={{ borderColor: "#ccc9c0" }}>
        <div className="flex flex-wrap gap-2 mb-3">
          {TOOLBAR_ACTIONS.map((action) => (
            <button
              key={action.id}
              onClick={() => onActionClick(action.id)}
              disabled={isGenerating}
              title={action.desc}
              className="text-[12px] px-3.5 py-1.5 rounded-sm border border-[#111] text-[#111] bg-white hover:bg-[#111] hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {action.label}
            </button>
          ))}
        </div>
        {/* View toggle */}
        <div className="flex items-center gap-1">
          {(["feed", "tree", "clusters"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`text-[11px] px-3 py-1 rounded-sm border transition-colors capitalize ${
                view === v
                  ? "bg-[#111] text-white border-[#111]"
                  : "text-[#888] border-transparent hover:border-[#ccc] hover:text-[#111]"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Tree view */}
      {view === "tree" && (
        <div className="flex-1 overflow-hidden flex">
          <TreeView
            generations={generations}
            savedCardIds={savedCardIds}
            highlights={highlights}
            assets={assets}
            hoveredSourceIds={hoveredSourceIds}
            onHoverSources={onHoverSources}
            onSaveCard={onSaveCard}
            onBranchFrom={onBranchFrom}
            onDismissCard={onDismissCard}
            onAddAsReference={onAddAsReference}
          />
        </div>
      )}

      {/* Cluster view */}
      {view === "clusters" && (
        <div className="flex-1 overflow-hidden flex">
          <ClusterView
            generations={generations}
            savedCardIds={savedCardIds}
            highlights={highlights}
            assets={assets}
            onHoverSources={onHoverSources}
            onSaveCard={onSaveCard}
            onBranchFrom={onBranchFrom}
            onDismissCard={onDismissCard}
            onAddUserCard={onAddUserCard}
            onAddAsReference={onAddAsReference}
          />
        </div>
      )}

      {/* Feed */}
      {view === "feed" && (
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-6">
          {isGenerating && (
            <div className="flex items-center gap-3 text-sm text-[#555] bg-white border border-[#111] rounded-sm px-4 py-3">
              <span className="inline-block w-4 h-4 border-2 border-[#111] border-t-transparent rounded-full animate-spin" />
              Running {generatingAction ? ACTION_LABELS[generatingAction] : "generation"}…
            </div>
          )}

          {generations.length === 0 && !isGenerating && (
            <div className="flex flex-col items-center justify-center h-full text-center py-24 text-[#aaa]">
              <p className="text-sm mb-1">Add inputs on the left, then choose an action above.</p>
              <p className="text-xs">Results will appear here as structured cards.</p>
            </div>
          )}

          {generations.map((gen) => (
            <GenerationBlock
              key={gen.id}
              gen={gen}
              savedCardIds={savedCardIds}
              highlights={highlights}
              assets={assets}
              onHoverSources={onHoverSources}
              onSaveCard={onSaveCard}
              onDismissCard={(cardId) => onDismissCard(gen.id, cardId)}
              onUpdateCard={onUpdateCard}
              onGenerateVisuals={onGenerateVisuals}
              onAddAsReference={onAddAsReference}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function GenerationBlock({
  gen,
  savedCardIds,
  highlights,
  assets,
  onHoverSources,
  onSaveCard,
  onDismissCard,
  onUpdateCard,
  onGenerateVisuals,
  onAddAsReference,
}: {
  gen: Generation;
  savedCardIds: Set<string>;
  highlights: Highlight[];
  assets: Asset[];
  onHoverSources: (cardIds: Set<string>, assetIds: Set<string>) => void;
  onSaveCard: (card: ResultCard) => void;
  onDismissCard: (cardId: string) => void;
  onUpdateCard: (card: ResultCard) => void;
  onGenerateVisuals: (card: ConceptCard) => void;
  onAddAsReference: (dataUrl: string, label: string) => void;
}) {
  const label = ACTION_LABELS[gen.actionType] ?? gen.actionType;
  const time = new Date(gen.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  // Visual/concept-visual actions return image cards; use a wider 3-col grid.
  const isImageGrid = gen.actionType === "visual_variations" || gen.actionType === "generate_concept_visuals";

  const sourceHighlights = (gen.sourceCardIds ?? [])
    .map((id) => highlights.find((h) => h.card.id === id))
    .filter((h): h is Highlight => h !== undefined);

  const sourceDrafts = (gen.includedDraftIds ?? [])
    .map((id) => assets.find((a) => a.id === id))
    .filter((a): a is Asset => a !== undefined);

  const sourceRefs = (gen.includedReferenceIds ?? [])
    .map((id) => assets.find((a) => a.id === id))
    .filter((a): a is Asset => a !== undefined);

  const hasAnySources = sourceHighlights.length > 0 || sourceDrafts.length > 0 || sourceRefs.length > 0;

  function handleMouseEnter() {
    if (hasAnySources) {
      onHoverSources(
        new Set(sourceHighlights.map((h) => h.card.id)),
        new Set([...sourceDrafts, ...sourceRefs].map((a) => a.id))
      );
    }
  }

  function handleMouseLeave() {
    onHoverSources(new Set(), new Set());
  }

  function truncate(s: string, n = 24) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  return (
    <div className="flex flex-col gap-3" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <div className="flex items-center gap-2 text-[11px] text-[#aaa] flex-wrap">
        <span className="font-semibold text-[#888]">{label}</span>
        <span>·</span>
        <span>{time}</span>
        {gen.cards.length > 0 && (
          <>
            <span>·</span>
            <span>{gen.cards.length} card{gen.cards.length !== 1 ? "s" : ""}</span>
          </>
        )}
        {hasAnySources && (
          <>
            <span>·</span>
            <span className="text-[10px] text-[#bbb]">from</span>
            {sourceHighlights.map((h) => (
              <span key={h.card.id} className="text-[10px] px-1.5 py-0.5 rounded-sm border" style={{ background: "#fffbeb", borderColor: "#f0d89a", color: "#92721a" }} title={h.card.title}>
                {truncate(h.card.title)}
              </span>
            ))}
            {sourceDrafts.map((a) => (
              <span key={a.id} className="text-[10px] px-1.5 py-0.5 rounded-sm border" style={{ background: "#f5f5f4", borderColor: "#ccc", color: "#555" }} title={`Draft: ${a.fileName}`}>
                ✎ {truncate(a.fileName)}
              </span>
            ))}
            {sourceRefs.map((a) => (
              <span key={a.id} className="text-[10px] px-1.5 py-0.5 rounded-sm border" style={{ background: "#f0f0ff", borderColor: "#c5c5e8", color: "#4444aa" }} title={`Reference: ${a.fileName}`}>
                ◈ {truncate(a.fileName)}
              </span>
            ))}
          </>
        )}
      </div>

      {gen.error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          {gen.error}
        </div>
      )}

      {gen.cards.length > 0 && (
        <div className={`grid gap-3 ${isImageGrid ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}>
          {gen.cards.map((card) => (
            <ResultCardComponent
              key={card.id}
              card={card}
              isSaved={savedCardIds.has(card.id)}
              onSave={() => onSaveCard(card)}
              onDismiss={() => onDismissCard(card.id)}
              onUpdate={onUpdateCard}
              onGenerateVisuals={onGenerateVisuals}
              onAddAsReference={onAddAsReference}
            />
          ))}
        </div>
      )}
    </div>
  );
}
