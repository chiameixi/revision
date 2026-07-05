"use client";

import { useState, useMemo, useCallback } from "react";
import { useProject } from "@/lib/store";
import { DIMENSIONS } from "@/lib/dimensions";
import CenterPanel from "@/components/CenterPanel";
import CallComposerModal from "@/components/CallComposerModal";
import type {
  ActionType,
  Asset,
  ComposerState,
  ConceptCard,
  ConceptCardRef,
  Generation,
  GenerateRequest,
  GenerateResponse,
  ResultCard,
  TypedContext,
  VisualCard,
} from "@/types";

const DEFAULT_COMPOSER: ComposerState = {
  open: false,
  action: null,
  includedDraftIds: [],
  includedReferenceIds: [],
  selectedCardIds: [],
  userInstructions: "",
  selectedDimensionIds: DIMENSIONS.map((d) => d.id),
};

// Format a single card as a text summary for its section in typedContext
function formatConceptForContext(card: ConceptCard): string {
  const lines = [`[concept] ${card.title}`, `Description: ${card.description}`];
  if (card.rationale) lines.push(`Rationale: ${card.rationale}`);
  return lines.join("\n");
}

function formatMotifForContext(card: ResultCard & { type: "motif" }): string {
  return [
    `[motif] ${card.title}`,
    `Visual quality: ${card.visualQuality}`,
    `How it conveys the idea: ${card.howItConveysIdea}`,
  ].join("\n");
}

function formatVisualForContext(card: ResultCard & { type: "visual" }): string {
  const lines = [`[visual] ${card.title}`, `Dimension: ${card.dimensionLabel}`];
  if (card.analysisText) lines.push(`Analysis: ${card.analysisText}`);
  return lines.join("\n");
}

// Build TypedContext from selected cards, splitting by card type.
// For conceptual_variations: ConceptCards go into conceptCards (to render, one image batch each).
// For all other actions: ConceptCards go into typedContext.concepts as context.
function buildTypedContext(
  cards: ResultCard[],
  action: ActionType
): { typedContext: TypedContext; conceptCards: ConceptCardRef[] } {
  const typedContext: TypedContext = { concepts: [], motifs: [], visuals: [], notes: [] };
  const conceptCards: ConceptCardRef[] = [];

  for (const card of cards) {
    if (card.type === "concept") {
      if (action === "conceptual_variations") {
        conceptCards.push({ id: card.id, title: card.title, description: card.description, rationale: card.rationale });
      } else {
        typedContext.concepts.push(formatConceptForContext(card));
      }
    } else if (card.type === "motif") {
      typedContext.motifs.push(formatMotifForContext(card));
    } else if (card.type === "visual") {
      typedContext.visuals.push({
        text: formatVisualForContext(card),
        imageDataUrl: card.imageDataUrl,
        imageMimeType: card.imageMimeType,
      });
    } else if (card.type === "note") {
      const parts = [card.title, card.body].filter(Boolean).join(": ");
      if (parts) typedContext.notes.push(parts);
    }
  }

  return { typedContext, conceptCards };
}

export default function WorkspacePage() {
  const { state, actions, ready } = useProject();
  const [composer, setComposer] = useState<ComposerState>(DEFAULT_COMPOSER);
  const [composerCards, setComposerCards] = useState<ResultCard[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingAction, setGeneratingAction] = useState<ActionType | null>(null);
  const [hoveredSourceIds, setHoveredSourceIds] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Record<string, Set<string>>>({});

  const handleHoverSources = useCallback((cardIds: Set<string>, _assetIds: Set<string>) => {
    setHoveredSourceIds(cardIds);
  }, []);

  function resolveCards(cardIds: string[]): ResultCard[] {
    const all = state.generations.flatMap((g) => g.cards);
    return cardIds.flatMap((id) => {
      const found = all.find((c) => c.id === id);
      return found ? [found] : [];
    });
  }

  const handleSend = useCallback(
    async (cfg: ComposerState) => {
      if (!cfg.action) return;
      setComposer((c) => ({ ...c, open: false }));
      setIsGenerating(true);
      setGeneratingAction(cfg.action);

      const draftDataUrls = state.assets
        .filter((a) => a.type === "draft" && cfg.includedDraftIds.includes(a.id))
        .map((a) => a.dataUrl);

      const referenceDataUrls = state.assets
        .filter((a) => a.type === "reference" && cfg.includedReferenceIds.includes(a.id))
        .map((a) => a.dataUrl);

      const allCards = state.generations.flatMap((g) => g.cards);
      const selectedCards = allCards.filter((c) => cfg.selectedCardIds.includes(c.id));
      const { typedContext, conceptCards } = buildTypedContext(selectedCards, cfg.action);

      const body: GenerateRequest = {
        action: cfg.action,
        brief: state.brief,
        userInstructions: cfg.userInstructions,
        draftDataUrls,
        referenceDataUrls,
        typedContext,
        dimensionIds: cfg.selectedDimensionIds,
        conceptCards: conceptCards.length ? conceptCards : undefined,
      };

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const data: GenerateResponse = await res.json();

        const gen: Generation = {
          id: crypto.randomUUID(),
          actionType: cfg.action,
          cards: data.cards ?? [],
          createdAt: new Date().toISOString(),
          error: data.error,
          sourceCardIds: [...new Set(cfg.selectedCardIds)],
          includedDraftIds: cfg.includedDraftIds,
          includedReferenceIds: cfg.includedReferenceIds,
        };
        actions.addGeneration(gen);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Network error.";
        actions.addGeneration({
          id: crypto.randomUUID(),
          actionType: cfg.action,
          cards: [],
          createdAt: new Date().toISOString(),
          error: message,
        });
      } finally {
        setIsGenerating(false);
        setGeneratingAction(null);
      }
    },
    [state, actions]
  );

  // Opens the conceptual_variations modal with the given ConceptCard pre-selected
  // (it will be extracted as a conceptCard to render in handleSend).
  const handleGenerateVisuals = useCallback(
    (card: ConceptCard) => {
      const drafts = state.assets.filter((a) => a.type === "draft");
      setComposerCards([card]);
      setComposer({
        open: true,
        action: "conceptual_variations",
        includedDraftIds: drafts.map((a) => a.id),
        includedReferenceIds: [],
        selectedCardIds: [card.id],
        userInstructions: "",
        selectedDimensionIds: [],
      });
    },
    [state.assets]
  );

  const handleAddAsReference = useCallback(
    (dataUrl: string, label: string) => {
      const asset: Asset = {
        id: crypto.randomUUID(),
        type: "reference",
        fileName: `${label} (generated)`,
        dataUrl,
        note: "",
      };
      actions.addAsset(asset);
    },
    [actions]
  );

  const handleBranchFrom = useCallback(
    (card: ResultCard, action: ActionType) => {
      const drafts = state.assets.filter((a) => a.type === "draft");
      const refs = state.assets.filter((a) => a.type === "reference");

      let includedDraftIds: string[] = [];
      let includedReferenceIds: string[] = [];
      if (["analyze", "visual_variations", "conceptual_variations"].includes(action)) {
        includedDraftIds = drafts.map((a) => a.id);
      }
      if (["analyze", "conceptual_variations"].includes(action)) {
        includedReferenceIds = refs.map((a) => a.id);
      }

      setComposerCards([card]);
      setComposer({
        open: true,
        action,
        includedDraftIds,
        includedReferenceIds,
        selectedCardIds: [card.id],
        userInstructions: "",
        selectedDimensionIds: DIMENSIONS.map((d) => d.id),
      });
    },
    [state.assets]
  );

  const handleMultiBranchFrom = useCallback(
    (cards: ResultCard[], action: ActionType) => {
      const newRefAssets: Asset[] = cards
        .filter((c): c is VisualCard => c.type === "visual" && !!(c as VisualCard).imageDataUrl)
        .map((c) => ({
          id: crypto.randomUUID(),
          type: "reference" as const,
          fileName: (c as VisualCard).dimensionLabel || c.title,
          dataUrl: (c as VisualCard).imageDataUrl!,
          note: "",
          createdAt: new Date().toISOString(),
        }));
      newRefAssets.forEach((a) => actions.addAsset(a));

      const drafts = state.assets.filter((a) => a.type === "draft");
      const refs = state.assets.filter((a) => a.type === "reference");
      const includedDraftIds = ["analyze", "visual_variations", "conceptual_variations"].includes(action)
        ? drafts.map((a) => a.id) : [];
      const includedReferenceIds = [
        ...( ["analyze", "conceptual_variations"].includes(action) ? refs.map((a) => a.id) : [] ),
        ...newRefAssets.map((a) => a.id),
      ];

      setComposerCards(cards);
      setComposer({
        open: true,
        action,
        includedDraftIds,
        includedReferenceIds,
        selectedCardIds: cards.map((c) => c.id),
        userInstructions: "",
        selectedDimensionIds: DIMENSIONS.map((d) => d.id),
      });
    },
    [actions, state.assets]
  );

  const handleClearTree = useCallback(() => {
    actions.clearGenerations();
    setDismissed({});
  }, [actions]);

  const handleAddUserNode = useCallback(
    (card: ResultCard, parentCardIds: string[]) => {
      actions.addGeneration({
        id: crypto.randomUUID(),
        actionType: "user_added",
        cards: [card],
        sourceCardIds: parentCardIds,
        includedDraftIds: [],
        includedReferenceIds: [],
        createdAt: new Date().toISOString(),
      });
    },
    [actions]
  );

  const handleDuplicateCard = useCallback(
    (originalCard: ResultCard, parentCardIds: string[]) => {
      const dupedId = crypto.randomUUID();
      const duped = { ...originalCard, id: dupedId, createdAt: new Date().toISOString() };
      actions.addGeneration({
        id: crypto.randomUUID(),
        actionType: "user_added",
        cards: [duped],
        sourceCardIds: parentCardIds,
        includedDraftIds: [],
        includedReferenceIds: [],
        createdAt: new Date().toISOString(),
      });
      actions.adoptChildGenerations(originalCard.id, dupedId);
      // Duplicate any manual edges that involve the original node
      for (const edge of state.manualEdges) {
        if (edge.fromCardId === originalCard.id || edge.toCardId === originalCard.id) {
          actions.addManualEdge({
            id: crypto.randomUUID(),
            fromCardId: edge.fromCardId === originalCard.id ? dupedId : edge.fromCardId,
            toCardId: edge.toCardId === originalCard.id ? dupedId : edge.toCardId,
          });
        }
      }
    },
    [actions, state.manualEdges]
  );

  const handleAddUserCard = useCallback(
    (title: string, body: string) => {
      const card = { id: crypto.randomUUID(), type: "note" as const, title, body, createdAt: new Date().toISOString() };
      actions.addGeneration({ id: crypto.randomUUID(), actionType: "user_added", cards: [card], createdAt: new Date().toISOString() });
    },
    [actions]
  );

  const handleDismissCard = useCallback((genId: string, cardId: string) => {
    setDismissed((prev) => {
      const set = new Set(prev[genId] ?? []);
      set.add(cardId);
      return { ...prev, [genId]: set };
    });
  }, []);

  const visibleGenerations = useMemo(
    () =>
      state.generations.map((gen) => ({
        ...gen,
        cards: gen.cards.filter((c) => !dismissed[gen.id]?.has(c.id)),
      })),
    [state.generations, dismissed]
  );

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-[#aaa]">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f0eeea]">
      <CenterPanel
        generations={visibleGenerations}
        allGenerations={state.generations}
        isGenerating={isGenerating}
        generatingAction={generatingAction}
        assets={state.assets}
        brief={state.brief}
        title={state.title}
        hoveredSourceIds={hoveredSourceIds}
        onHoverSources={handleHoverSources}
        onDismissCard={handleDismissCard}
        onUpdateCard={actions.updateCard}
        onGenerateVisuals={handleGenerateVisuals}
        onBranchFrom={handleBranchFrom}
        onMultiBranchFrom={handleMultiBranchFrom}
        onAddUserNode={handleAddUserNode}
        onDuplicateCard={handleDuplicateCard}
        onClearTree={handleClearTree}
        onAddUserCard={handleAddUserCard}
        onAddAsReference={handleAddAsReference}
        onBriefChange={actions.setBrief}
        onTitleChange={actions.setTitle}
        onAddAsset={actions.addAsset}
        onRemoveAsset={actions.removeAsset}
        collections={state.collections}
        onAddCollection={actions.addCollection}
        onRemoveCollection={actions.removeCollection}
        onUpdateCollection={actions.updateCollection}
        onAddCardsToCollection={actions.addCardsToCollection}
        onMoveCardToCollection={actions.moveCardToCollection}
        onRemoveCardFromCollection={actions.removeCardFromCollection}
        onRemoveProvenanceEdge={actions.removeProvenanceEdge}
        manualEdges={state.manualEdges}
        onAddManualEdge={actions.addManualEdge}
        onRemoveManualEdge={actions.removeManualEdge}
      />

      {composer.open && (
        <CallComposerModal
          state={composer}
          brief={state.brief}
          assets={state.assets}
          selectedCards={composerCards}
          onChange={setComposer}
          onClose={() => setComposer((c) => ({ ...c, open: false }))}
          onSend={handleSend}
        />
      )}
    </div>
  );
}
