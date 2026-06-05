"use client";

/**
 * app/page.tsx
 *
 * Responsibility: Root page component and central state coordinator for the
 * design workspace.
 *
 * All cross-panel state (hover highlights, composer modal, generation loading
 * status, dismissed cards) lives here.  The page composes the three-panel
 * layout and wires together the data flow between panels:
 *
 *   InputsSidebar  ←─ assets, brief, hoveredAssetIds
 *        ↕
 *   CenterPanel    ←─ generations (filtered), actions, hover callbacks
 *        ↕
 *   HighlightsPanel ←─ highlights, hover callbacks
 *        ↕
 *   CallComposerModal ─── triggers handleSend → POST /api/generate
 *
 * Key design decisions:
 * - `dismissed` is local component state (not persisted) so refreshing the
 *   page restores all cards.  It maps genId → Set<cardId>.
 * - `hoveredSourceIds` / `hoveredAssetIds` are derived from mouse events on
 *   generation blocks and passed down to HighlightsPanel / InputsSidebar to
 *   draw attention to provenance.
 * - `formatHighlightForContext` converts a saved highlight into a compact
 *   plain-text summary rather than sending JSON, keeping the model prompt
 *   readable and avoiding extra tokens for fields the model doesn't need.
 * - `handleGenerateVisuals` is a shortcut that pre-populates the composer
 *   with a single concept card and opens it directly from a ConceptCard's
 *   "Generate Visuals →" button.
 * - `handleBranchFrom` saves the card as a highlight first so it appears in
 *   the composer's highlights checklist when the modal opens.
 */

import { useState, useMemo, useCallback, useRef } from "react";
import { useProject } from "@/lib/store";
import { DIMENSIONS } from "@/lib/dimensions";
import InputsSidebar from "@/components/InputsSidebar";
import CenterPanel from "@/components/CenterPanel";
import HighlightsPanel from "@/components/HighlightsPanel";
import CallComposerModal from "@/components/CallComposerModal";
import type {
  ActionType,
  Asset,
  ComposerState,
  ConceptCard,
  Generation,
  GenerateRequest,
  GenerateResponse,
  NoteCard,
  ResultCard,
  VisualCard,
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
  const lines: string[] = [`[${card.type}] ${card.title}`];
  if (card.type === "concept") {
    lines.push(`Description: ${card.description}`);
    lines.push(`Rationale: ${card.rationale}`);
  } else if (card.type === "motif") {
    lines.push(`Visual quality: ${card.visualQuality}`);
    lines.push(`How it conveys the idea: ${card.howItConveysIdea}`);
  } else if (card.type === "visual") {
    lines.push(`Dimension: ${card.dimensionLabel}`);
    if (card.analysisText) lines.push(`Analysis: ${card.analysisText}`);
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
  const [hoveredSourceIds, setHoveredSourceIds] = useState<Set<string>>(new Set());
  const [hoveredAssetIds, setHoveredAssetIds] = useState<Set<string>>(new Set());

  // Panel resize + collapse state
  const [leftWidth, setLeftWidth] = useState(288);
  const [rightWidth, setRightWidth] = useState(288);
  const [leftHidden, setLeftHidden] = useState(false);
  const [rightHidden, setRightHidden] = useState(false);
  const leftWidthRef = useRef(288);
  const rightWidthRef = useRef(288);
  leftWidthRef.current = leftWidth;
  rightWidthRef.current = rightWidth;

  function startResizeLeft(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = leftWidthRef.current;
    const move = (ev: MouseEvent) => setLeftWidth(Math.min(520, Math.max(160, startW + ev.clientX - startX)));
    const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); document.body.style.cursor = ""; };
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  function startResizeRight(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = rightWidthRef.current;
    const move = (ev: MouseEvent) => setRightWidth(Math.min(520, Math.max(160, startW - (ev.clientX - startX))));
    const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); document.body.style.cursor = ""; };
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  const handleHoverSources = useCallback((cardIds: Set<string>, assetIds: Set<string>) => {
    setHoveredSourceIds(cardIds);
    setHoveredAssetIds(assetIds);
  }, []);

  const [dismissed, setDismissed] = useState<Record<string, Set<string>>>({});

  // Pre-compute the set of saved card IDs so each ResultCard can check
  // `isSaved` in O(1) without scanning the highlights array.
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

      let includedDraftIds: string[] = [];
      let includedReferenceIds: string[] = [];

      // Pre-select images relevant to the action. The composer lets the researcher
      // deselect individual images before sending.
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
      // Convert included highlights to plain-text summaries for the prompt.
      // Track their card IDs separately so the generation can record provenance.
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
      setComposer({
        open: true,
        action: "generate_concept_visuals",
        includedDraftIds: drafts.map((a) => a.id),
        includedReferenceIds: [],
        includedHighlightIds: [],
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
      actions.saveHighlight(card);
      handleActionClick(action);
    },
    [actions, handleActionClick]
  );

  const handleMultiBranchFrom = useCallback(
    (cards: ResultCard[], action: ActionType) => {
      // Save every selected card as a highlight so they appear in the modal's checklist.
      cards.forEach((card) => actions.saveHighlight(card));

      // For visual cards, register the generated image as a reference asset so the
      // AI receives it as a visual input in the next prompt.
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
        ? drafts.map((a) => a.id)
        : [];
      const includedReferenceIds = [
        ...( ["analyze", "conceptual_variations"].includes(action) ? refs.map((a) => a.id) : [] ),
        ...newRefAssets.map((a) => a.id),
      ];

      const alreadyIncluded = state.highlights.filter((h) => h.includeInNextCall).map((h) => h.id);
      const selectedIds = cards.map((c) => c.id);
      const allHighlightIds = [...new Set([...alreadyIncluded, ...selectedIds])];

      setComposer({
        open: true,
        action,
        includedDraftIds,
        includedReferenceIds,
        includedHighlightIds: allHighlightIds,
        userInstructions: "",
        selectedDimensionIds: DIMENSIONS.map((d) => d.id),
      });
    },
    [actions, state.assets, state.highlights, setComposer]
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
      {/* ── Left panel ────────────────────────────────────────────────────── */}
      {leftHidden ? (
        <CollapsedStrip label="Inputs" side="left" onExpand={() => setLeftHidden(false)} />
      ) : (
        <>
          <div className="shrink-0 h-screen overflow-hidden" style={{ width: leftWidth }}>
            <InputsSidebar
              title={state.title}
              brief={state.brief}
              assets={state.assets}
              hoveredAssetIds={hoveredAssetIds}
              onTitleChange={actions.setTitle}
              onBriefChange={actions.setBrief}
              onAddAsset={actions.addAsset}
              onRemoveAsset={actions.removeAsset}
              onCollapse={() => setLeftHidden(true)}
            />
          </div>
          <ResizeHandle onMouseDown={startResizeLeft} />
        </>
      )}

      {/* ── Center panel ──────────────────────────────────────────────────── */}
      <CenterPanel
        generations={visibleGenerations}
        isGenerating={isGenerating}
        generatingAction={generatingAction}
        savedCardIds={savedCardIds}
        highlights={state.highlights}
        assets={state.assets}
        hoveredSourceIds={hoveredSourceIds}
        onHoverSources={handleHoverSources}
        onActionClick={handleActionClick}
        onSaveCard={actions.saveHighlight}
        onDismissCard={handleDismissCard}
        onUpdateCard={actions.updateCard}
        onGenerateVisuals={handleGenerateVisuals}
        onBranchFrom={handleBranchFrom}
        onMultiBranchFrom={handleMultiBranchFrom}
        onAddUserNode={handleAddUserNode}
        onClearTree={handleClearTree}
        onAddUserCard={handleAddUserCard}
        onAddAsReference={handleAddAsReference}
      />

      {/* ── Right panel ───────────────────────────────────────────────────── */}
      {rightHidden ? (
        <CollapsedStrip label="Highlights" side="right" onExpand={() => setRightHidden(false)} />
      ) : (
        <>
          <ResizeHandle onMouseDown={startResizeRight} />
          <div className="shrink-0 h-screen overflow-hidden" style={{ width: rightWidth }}>
            <HighlightsPanel
              highlights={state.highlights}
              onRemove={actions.removeHighlight}
              onToggleInclude={actions.toggleHighlightInclude}
              onTogglePin={actions.toggleHighlightPin}
              onUpdateNote={actions.updateHighlightNote}
              onUpdateCard={actions.updateCard}
              onDropCard={actions.saveHighlight}
              onAddNote={handleAddNote}
              hoveredSourceIds={hoveredSourceIds}
              onCollapse={() => setRightHidden(true)}
            />
          </div>
        </>
      )}

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

// ── Resize handle between panels ──────────────────────────────────────────────
function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      className="shrink-0 h-screen relative cursor-col-resize group select-none"
      style={{ width: 5 }}
      onMouseDown={onMouseDown}
    >
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[#ccc9c0] group-hover:bg-[#999] transition-colors" />
    </div>
  );
}

// ── Collapsed panel strip ─────────────────────────────────────────────────────
function CollapsedStrip({ label, side, onExpand }: {
  label: string;
  side: "left" | "right";
  onExpand: () => void;
}) {
  return (
    <div
      className="shrink-0 h-screen flex flex-col items-center pt-5 pb-4 gap-3 bg-white select-none cursor-pointer group"
      style={{
        width: 36,
        borderRight: side === "left" ? "1px solid #ccc9c0" : undefined,
        borderLeft: side === "right" ? "1px solid #ccc9c0" : undefined,
      }}
      onClick={onExpand}
      title={`Show ${label}`}
    >
      <span
        className="text-[#bbb] group-hover:text-[#555] transition-colors"
        style={{ fontSize: 13, lineHeight: 1 }}
      >
        {side === "left" ? "›" : "‹"}
      </span>
      <span
        className="text-[9px] uppercase tracking-widest text-[#bbb] group-hover:text-[#555] transition-colors font-medium"
        style={{ writingMode: "vertical-lr", transform: side === "left" ? "rotate(180deg)" : undefined }}
      >
        {label}
      </span>
    </div>
  );
}
