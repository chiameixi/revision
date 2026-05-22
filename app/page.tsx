"use client";

import { useState, useMemo, useCallback } from "react";
import { useProject } from "@/lib/store";
import { DIMENSIONS } from "@/lib/dimensions";
import InputsSidebar from "@/components/InputsSidebar";
import CenterPanel from "@/components/CenterPanel";
import HighlightsPanel from "@/components/HighlightsPanel";
import CallComposerModal from "@/components/CallComposerModal";
import type {
  ActionType,
  ComposerState,
  ConceptualVariationCard,
  Generation,
  GenerateRequest,
  GenerateResponse,
  NoteCard,
  ResultCard,
} from "@/types";

const DEFAULT_COMPOSER: ComposerState = {
  open: false,
  action: null,
  includedDraftIds: [],
  includedReferenceIds: [],
  includedHighlightIds: [],
  userInstructions: "",
  selectedDimensionIds: DIMENSIONS.map((d) => d.id),
};

function formatHighlightForContext(h: { card: ResultCard; note: string }): string {
  const card = h.card;
  const lines: string[] = [`[${card.type.replace("_", " ")}] ${card.title}`];
  if (card.type === "insight") {
    lines.push(`Summary: ${card.summary}`);
    lines.push(`Implication: ${card.implication}`);
  } else if (card.type === "visual_variation") {
    lines.push(`Dimension: ${card.dimensionLabel}`);
    if (card.analysisText) lines.push(`Analysis: ${card.analysisText}`);
  } else if (card.type === "conceptual_variation") {
    lines.push(`Core idea: ${card.coreIdea}`);
    lines.push(`How it differs: ${card.howItDiffers}`);
  } else if (card.type === "concept") {
    lines.push(`Core idea: ${card.coreIdea}`);
    lines.push(`Best for: ${card.bestFor}`);
  } else if (card.type === "note") {
    if (card.body) lines.push(`Note: ${card.body}`);
  }
  if (h.note) lines.push(`Note: ${h.note}`);
  return lines.join("\n");
}

export default function WorkspacePage() {
  const { state, actions, ready } = useProject();
  const [composer, setComposer] = useState<ComposerState>(DEFAULT_COMPOSER);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingAction, setGeneratingAction] = useState<ActionType | null>(null);
  // Track dismissed cards per generation
  const [dismissed, setDismissed] = useState<Record<string, Set<string>>>({});

  const savedCardIds = useMemo(
    () => new Set(state.highlights.map((h) => h.card.id)),
    [state.highlights]
  );

  const handleActionClick = useCallback(
    (action: ActionType) => {
      const drafts = state.assets.filter((a) => a.type === "draft");
      const refs = state.assets.filter((a) => a.type === "reference");
      const includedHighlights = state.highlights
        .filter((h) => h.includeInNextCall)
        .map((h) => h.id);

      // Default which assets to include based on action
      let includedDraftIds: string[] = [];
      let includedReferenceIds: string[] = [];

      if (["analyze", "visual_variations", "conceptual_variations"].includes(action)) {
        includedDraftIds = drafts.map((a) => a.id);
      }
      if (["analyze", "conceptual_variations"].includes(action)) {
        includedReferenceIds = refs.map((a) => a.id);
      }

      setComposer({
        open: true,
        action,
        includedDraftIds,
        includedReferenceIds,
        includedHighlightIds: includedHighlights,
        userInstructions: "",
        selectedDimensionIds: DIMENSIONS.map((d) => d.id),
      });
    },
    [state.assets, state.highlights]
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

      const includedHighlights = state.highlights.filter((h) =>
        cfg.includedHighlightIds.includes(h.id)
      );
      const highlightSummaries = includedHighlights.map(formatHighlightForContext);
      const sourceCardIds = includedHighlights.map((h) => h.card.id);

      const body: GenerateRequest = {
        action: cfg.action,
        brief: state.brief,
        userInstructions: cfg.userInstructions,
        draftDataUrls,
        referenceDataUrls,
        highlightSummaries,
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
          sourceCardIds,
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
    (card: ConceptualVariationCard) => {
      const drafts = state.assets.filter((a) => a.type === "draft");
      setComposer({
        open: true,
        action: "generate_concept_visuals",
        includedDraftIds: drafts.map((a) => a.id),
        includedReferenceIds: [],
        includedHighlightIds: [],
        userInstructions: "",
        selectedDimensionIds: [],
        conceptCards: [{ id: card.id, title: card.title, coreIdea: card.coreIdea, howItDiffers: card.howItDiffers }],
      });
    },
    [state.assets]
  );

  const handleBranchFrom = useCallback(
    (card: ResultCard, action: ActionType) => {
      actions.saveHighlight(card);
      handleActionClick(action);
    },
    [actions, handleActionClick]
  );

  const handleAddNote = useCallback(
    (title: string, body: string) => {
      const card: NoteCard = { id: crypto.randomUUID(), type: "note", title, body, createdAt: new Date().toISOString() };
      actions.saveHighlight(card);
    },
    [actions]
  );

  const handleAddUserCard = useCallback(
    (title: string, body: string) => {
      const card: NoteCard = { id: crypto.randomUUID(), type: "note", title, body, createdAt: new Date().toISOString() };
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

  // Filter dismissed cards from generations before rendering
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
      <InputsSidebar
        title={state.title}
        brief={state.brief}
        assets={state.assets}
        onTitleChange={actions.setTitle}
        onBriefChange={actions.setBrief}
        onAddAsset={actions.addAsset}
        onRemoveAsset={actions.removeAsset}
      />

      <CenterPanel
        generations={visibleGenerations}
        isGenerating={isGenerating}
        generatingAction={generatingAction}
        savedCardIds={savedCardIds}
        onActionClick={handleActionClick}
        onSaveCard={actions.saveHighlight}
        onDismissCard={handleDismissCard}
        onUpdateCard={actions.updateCard}
        onGenerateVisuals={handleGenerateVisuals}
        onBranchFrom={handleBranchFrom}
        onAddUserCard={handleAddUserCard}
      />

      <HighlightsPanel
        highlights={state.highlights}
        onRemove={actions.removeHighlight}
        onToggleInclude={actions.toggleHighlightInclude}
        onTogglePin={actions.toggleHighlightPin}
        onUpdateNote={actions.updateHighlightNote}
        onUpdateCard={actions.updateCard}
        onDropCard={actions.saveHighlight}
        onAddNote={handleAddNote}
      />

      {composer.open && (
        <CallComposerModal
          state={composer}
          brief={state.brief}
          assets={state.assets}
          highlights={state.highlights}
          onChange={setComposer}
          onClose={() => setComposer((c) => ({ ...c, open: false }))}
          onSend={handleSend}
        />
      )}
    </div>
  );
}
