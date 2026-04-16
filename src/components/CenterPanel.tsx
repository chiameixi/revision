"use client";

import type { ActionType, ConceptualVariationCard, Generation, ResultCard } from "@/types";
import ResultCardComponent from "./cards/ResultCard";

interface Props {
  generations: Generation[];
  isGenerating: boolean;
  generatingAction: ActionType | null;
  savedCardIds: Set<string>;
  onActionClick: (action: ActionType) => void;
  onSaveCard: (card: ResultCard) => void;
  onDismissCard: (genId: string, cardId: string) => void;
  onGenerateVisuals: (card: ConceptualVariationCard) => void;
}

const TOOLBAR_ACTIONS: { id: ActionType; label: string; desc: string }[] = [
  { id: "unpack_brief", label: "Unpack Brief", desc: "Turn brief into idea directions" },
  { id: "analyze_draft", label: "Analyze Draft", desc: "Examine your draft" },
  { id: "analyze_references", label: "Analyze References", desc: "Extract patterns from refs" },
  { id: "visual_variations", label: "Visual Variations", desc: "Arnheim dimension variations" },
  { id: "conceptual_variations", label: "Conceptual Variations", desc: "Deeper concept alternatives" },
  { id: "synthesize", label: "Synthesize", desc: "Combine highlights into concepts" },
];

const ACTION_LABELS: Record<ActionType, string> = {
  unpack_brief: "Unpack Brief",
  analyze_draft: "Analyze Draft",
  analyze_references: "Analyze References",
  visual_variations: "Visual Variations",
  conceptual_variations: "Conceptual Variations",
  generate_concept_visuals: "Generate Concept Visuals",
  synthesize: "Synthesize",
};

export default function CenterPanel({
  generations,
  isGenerating,
  generatingAction,
  savedCardIds,
  onActionClick,
  onSaveCard,
  onDismissCard,
  onGenerateVisuals,
}: Props) {
  return (
    <main className="flex-1 min-w-0 h-screen flex flex-col overflow-hidden">
      {/* Action toolbar */}
      <div className="px-5 pt-5 pb-4 border-b border-[#e4e3e0] bg-white">
        <div className="flex flex-wrap gap-2">
          {TOOLBAR_ACTIONS.map((action) => (
            <button
              key={action.id}
              onClick={() => onActionClick(action.id)}
              disabled={isGenerating}
              title={action.desc}
              className="text-[12px] font-medium px-3.5 py-1.5 rounded-full border border-[#e4e3e0] text-[#333] hover:border-[#2563eb]/50 hover:text-[#2563eb] hover:bg-blue-50/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-6">
        {isGenerating && (
          <div className="flex items-center gap-3 text-sm text-[#888] bg-white border border-[#e4e3e0] rounded-xl px-4 py-3">
            <span className="inline-block w-4 h-4 border-2 border-[#2563eb] border-t-transparent rounded-full animate-spin" />
            Running {generatingAction ? ACTION_LABELS[generatingAction] : "generation"}…
          </div>
        )}

        {generations.length === 0 && !isGenerating && (
          <div className="flex flex-col items-center justify-center h-full text-center py-24 text-[#bbb]">
            <p className="text-sm mb-1">Add inputs on the left, then choose an action above.</p>
            <p className="text-xs">Results will appear here as structured cards.</p>
          </div>
        )}

        {generations.map((gen) => (
          <GenerationBlock
            key={gen.id}
            gen={gen}
            savedCardIds={savedCardIds}
            onSaveCard={onSaveCard}
            onDismissCard={(cardId) => onDismissCard(gen.id, cardId)}
            onGenerateVisuals={onGenerateVisuals}
          />
        ))}
      </div>
    </main>
  );
}

function GenerationBlock({
  gen,
  savedCardIds,
  onSaveCard,
  onDismissCard,
  onGenerateVisuals,
}: {
  gen: Generation;
  savedCardIds: Set<string>;
  onSaveCard: (card: ResultCard) => void;
  onDismissCard: (cardId: string) => void;
  onGenerateVisuals: (card: ConceptualVariationCard) => void;
}) {
  const label = ACTION_LABELS[gen.actionType] ?? gen.actionType;
  const time = new Date(gen.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const isImageGrid = gen.actionType === "visual_variations" || gen.actionType === "generate_concept_visuals";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[11px] text-[#aaa]">
        <span className="font-semibold text-[#888]">{label}</span>
        <span>·</span>
        <span>{time}</span>
        {gen.cards.length > 0 && (
          <>
            <span>·</span>
            <span>{gen.cards.length} card{gen.cards.length !== 1 ? "s" : ""}</span>
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
              onGenerateVisuals={onGenerateVisuals}
            />
          ))}
        </div>
      )}
    </div>
  );
}
