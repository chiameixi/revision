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
  Generation,
  GenerateRequest,
  GenerateResponse,
  ResultCard,
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

function formatCardForContext(card: ResultCard): string {
  const lines: string[] = [`[${card.type}] ${card.title}`];
  if (card.type === "concept") {
    lines.push(`Description: ${card.description}`);
    if (card.rationale) lines.push(`Rationale: ${card.rationale}`);
  } else if (card.type === "motif") {
    lines.push(`Visual quality: ${card.visualQuality}`);
    lines.push(`How it conveys the idea: ${card.howItConveysIdea}`);
  } else if (card.type === "visual") {
    lines.push(`Dimension: ${card.dimensionLabel}`);
    if (card.analysisText) lines.push(`Analysis: ${card.analysisText}`);
  } else if (card.type === "note") {
    if (card.body) lines.push(`Note: ${card.body}`);
  }
  return lines.join("\n");
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

  const handleActionClick = useCallback(
    (action: ActionType, selectedCardIds: string[]) => {
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

      setComposerCards(resolveCards(selectedCardIds));
      setComposer({
        open: true,
        action,
        includedDraftIds,
        includedReferenceIds,
        selectedCardIds,
        userInstructions: "",
        selectedDimensionIds: DIMENSIONS.map((d) => d.id),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.assets, state.generations]
  );

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
      const cardSummaries = selectedCards.map(formatCardForContext);

      const body: GenerateRequest = {
        action: cfg.action,
        brief: state.brief,
        userInstructions: cfg.userInstructions,
        draftDataUrls,
        referenceDataUrls,
        highlightSummaries: cardSummaries,
        dimensionIds: cfg.selectedDimensionIds,
        conceptCards: cfg.conceptCards,
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

  const handleGenerateVisuals = useCallback(
    (card: ConceptCard) => {
      const drafts = state.assets.filter((a) => a.type === "draft");
      setComposerCards([card]);
      setComposer({
        open: true,
        action: "generate_concept_visuals",
        includedDraftIds: drafts.map((a) => a.id),
        includedReferenceIds: [],
        selectedCardIds: [card.id],
        userInstructions: "",
        selectedDimensionIds: [],
        conceptCards: [{
          id: card.id,
          title: card.title,
          description: card.description,
          rationale: card.rationale,
        }],
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
        onActionClick={handleActionClick}
        onDismissCard={handleDismissCard}
        onUpdateCard={actions.updateCard}
        onGenerateVisuals={handleGenerateVisuals}
        onBranchFrom={handleBranchFrom}
        onMultiBranchFrom={handleMultiBranchFrom}
        onAddUserNode={handleAddUserNode}
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
