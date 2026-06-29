"use client";

import { useState } from "react";
import type { ActionType, Asset, Collection, ConceptCard, Generation, ResultCard } from "@/types";
import ResultCardComponent from "./cards/ResultCard";
import TreeView from "./TreeView";
import ClusterView from "./ClusterView";

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
  onDismissCard: (genId: string, cardId: string) => void;
  onUpdateCard: (card: ResultCard) => void;
  onGenerateVisuals: (card: ConceptCard) => void;
  onBranchFrom: (card: ResultCard, action: ActionType) => void;
  onMultiBranchFrom: (cards: ResultCard[], action: ActionType) => void;
  onAddUserNode: (card: ResultCard, parentCardIds: string[]) => void;
  onDuplicateCard: (originalCard: ResultCard, parentCardIds: string[]) => void;
  onClearTree: () => void;
  onAddUserCard: (title: string, body: string) => void;
  onAddAsReference: (dataUrl: string, label: string) => void;
  onBriefChange: (v: string) => void;
  onTitleChange: (v: string) => void;
  onAddAsset: (asset: Asset) => void;
  onRemoveAsset: (id: string) => void;
  collections: Collection[];
  onAddCollection: (col: Collection) => void;
  onRemoveCollection: (id: string) => void;
  onUpdateCollection: (id: string, patch: Partial<Pick<Collection, "title" | "description" | "color">>) => void;
  onAddCardsToCollection: (collectionId: string, cardIds: string[]) => void;
  onRemoveProvenanceEdge: (fromId: string, toCardId: string) => void;
  manualEdges: import("@/types").ManualEdge[];
  onAddManualEdge: (edge: import("@/types").ManualEdge) => void;
  onRemoveManualEdge: (id: string) => void;
  onMoveCardToCollection: (cardId: string, toCollectionId: string | null) => void;
  onRemoveCardFromCollection: (collectionId: string, cardId: string) => void;
}

const ACTION_LABELS: Record<ActionType, string> = {
  unpack_brief:             "Unpack Brief",
  analyze:                  "Analyze",
  visual_variations:        "Visual Variations",
  conceptual_variations:    "Conceptual Variations",
  generate_concept_visuals: "Generate Concept Visuals",
  user_added:               "Your Idea",
};

export default function CenterPanel({
  generations,
  allGenerations,
  isGenerating,
  generatingAction,
  assets,
  brief,
  title,
  hoveredSourceIds,
  onHoverSources,
  onDismissCard,
  onUpdateCard,
  onGenerateVisuals,
  onBranchFrom,
  onMultiBranchFrom,
  onAddUserNode,
  onDuplicateCard,
  onClearTree,
  onAddUserCard,
  onAddAsReference,
  onBriefChange,
  onTitleChange,
  onAddAsset,
  onRemoveAsset,
  collections,
  onAddCollection,
  onRemoveCollection,
  onUpdateCollection,
  onAddCardsToCollection,
  onMoveCardToCollection,
  onRemoveCardFromCollection,
  manualEdges,
  onRemoveProvenanceEdge,
  onAddManualEdge,
  onRemoveManualEdge,
}: Props) {
  const [view, setView] = useState<"feed" | "tree" | "clusters">("feed");

  return (
    <main className="flex-1 min-w-0 h-screen flex flex-col overflow-hidden">
      {/* View toggle */}
      <div className="px-5 pt-2.5 pb-2.5 bg-white" style={{ borderBottom: "1px solid rgba(0,0,0,0.1)" }}>
        <div className="flex items-center gap-1">
          {(["feed", "tree", "clusters"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`text-[12px] px-2.5 py-1 transition-colors capitalize tracking-wide ${
                view === v
                  ? "text-black border-b border-black"
                  : "text-[rgba(0,0,0,0.35)] hover:text-black"
              }`}
              style={{ borderRadius: 0 }}
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
            allGenerations={allGenerations}
            isGenerating={isGenerating}
            generatingAction={generatingAction}
            assets={assets}
            brief={brief}
            title={title}
            hoveredSourceIds={hoveredSourceIds}
            onHoverSources={onHoverSources}
            onBranchFrom={onBranchFrom}
            onMultiBranchFrom={onMultiBranchFrom}
            onAddUserNode={onAddUserNode}
            onDuplicateCard={onDuplicateCard}
            onClearTree={onClearTree}
            onDismissCard={onDismissCard}
            onUpdateCard={onUpdateCard}
            onAddAsReference={onAddAsReference}
            onBriefChange={onBriefChange}
            onTitleChange={onTitleChange}
            onAddAsset={onAddAsset}
            onRemoveAsset={onRemoveAsset}
            collections={collections}
            onAddCollection={onAddCollection}
            onAddCardsToCollection={onAddCardsToCollection}
            manualEdges={manualEdges}
            onRemoveProvenanceEdge={onRemoveProvenanceEdge}
            onAddManualEdge={onAddManualEdge}
            onRemoveManualEdge={onRemoveManualEdge}
          />
        </div>
      )}

      {/* Cluster view */}
      {view === "clusters" && (
        <div className="flex-1 overflow-hidden flex">
          <ClusterView
            generations={generations}
            assets={assets}
            onHoverSources={onHoverSources}
            onBranchFrom={onBranchFrom}
            onDismissCard={onDismissCard}
            onAddUserCard={onAddUserCard}
            onAddAsReference={onAddAsReference}
            collections={collections}
            onAddCollection={onAddCollection}
            onRemoveCollection={onRemoveCollection}
            onUpdateCollection={onUpdateCollection}
            onAddCardsToCollection={onAddCardsToCollection}
            onMoveCardToCollection={onMoveCardToCollection}
            onRemoveCardFromCollection={onRemoveCardFromCollection}
          />
        </div>
      )}

      {/* Feed */}
      {view === "feed" && (
        <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-8">
          {isGenerating && (
            <div className="flex items-center gap-3 text-[14px] text-[#333232] bg-white border border-black px-4 py-3" style={{ borderRadius: 0 }}>
              <span className="inline-block w-3.5 h-3.5 border border-black border-t-transparent rounded-full animate-spin" />
              {generatingAction ? ACTION_LABELS[generatingAction] : "Generating"}…
            </div>
          )}

          {generations.length === 0 && !isGenerating && (
            <div className="flex flex-col items-center justify-center h-full text-center py-24 text-[rgba(0,0,0,0.3)]">
              <p className="text-[15px] italic mb-1">Add inputs on the left, then choose an action above.</p>
              <p className="text-[13px]">Results will appear here as structured cards.</p>
            </div>
          )}

          {generations.map((gen) => (
            <GenerationBlock
              key={gen.id}
              gen={gen}
              assets={assets}
              onHoverSources={onHoverSources}
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
  assets,
  onHoverSources,
  onDismissCard,
  onUpdateCard,
  onGenerateVisuals,
  onAddAsReference,
}: {
  gen: Generation;
  assets: Asset[];
  onHoverSources: (cardIds: Set<string>, assetIds: Set<string>) => void;
  onDismissCard: (cardId: string) => void;
  onUpdateCard: (card: ResultCard) => void;
  onGenerateVisuals: (card: ConceptCard) => void;
  onAddAsReference: (dataUrl: string, label: string) => void;
}) {
  const label = ACTION_LABELS[gen.actionType] ?? gen.actionType;
  const time = new Date(gen.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const isImageGrid = gen.actionType === "visual_variations" || gen.actionType === "generate_concept_visuals";

  const sourceDrafts = (gen.includedDraftIds ?? [])
    .map((id) => assets.find((a) => a.id === id))
    .filter((a): a is Asset => a !== undefined);

  const sourceRefs = (gen.includedReferenceIds ?? [])
    .map((id) => assets.find((a) => a.id === id))
    .filter((a): a is Asset => a !== undefined);

  const hasAnySources = sourceDrafts.length > 0 || sourceRefs.length > 0;

  function truncate(s: string, n = 22) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  function handleMouseEnter() {
    if (hasAnySources) {
      onHoverSources(new Set(), new Set([...sourceDrafts, ...sourceRefs].map((a) => a.id)));
    }
  }

  return (
    <div className="flex flex-col gap-4" onMouseEnter={handleMouseEnter} onMouseLeave={() => onHoverSources(new Set(), new Set())}>
      {/* Generation header */}
      <div className="flex items-center gap-3 text-[12px] text-[rgba(0,0,0,0.38)]">
        <span className="italic text-[rgba(0,0,0,0.55)]">{label}</span>
        <span>·</span>
        <span>{time}</span>
        {gen.cards.length > 0 && (
          <>
            <span>·</span>
            <span>{gen.cards.length} card{gen.cards.length !== 1 ? "s" : ""}</span>
          </>
        )}
        {(gen.sourceCardIds ?? []).length > 0 && (
          <>
            <span>·</span>
            <span>{gen.sourceCardIds!.length} node{gen.sourceCardIds!.length > 1 ? "s" : ""} as context</span>
          </>
        )}
        {hasAnySources && (
          <>
            <span>·</span>
            {sourceDrafts.map((a) => (
              <span key={a.id} className="italic" title={`Draft: ${a.fileName}`}>
                ✎ {truncate(a.fileName)}
              </span>
            ))}
            {sourceRefs.map((a) => (
              <span key={a.id} className="italic" title={`Reference: ${a.fileName}`}>
                ◈ {truncate(a.fileName)}
              </span>
            ))}
          </>
        )}
      </div>

      {gen.error && (
        <div className="text-[13px] text-black bg-white border border-black px-4 py-3" style={{ borderRadius: 0 }}>
          {gen.error}
        </div>
      )}

      {gen.cards.length > 0 && (
        <div className={`grid gap-3 ${isImageGrid ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}>
          {gen.cards.map((card) => (
            <ResultCardComponent
              key={card.id}
              card={card}
              isSaved={false}
              onSave={() => {}}
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
