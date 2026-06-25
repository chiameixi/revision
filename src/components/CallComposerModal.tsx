"use client";

import { useEffect, useRef } from "react";
import type { Asset, ComposerState, ResultCard } from "@/types";
import { DIMENSIONS } from "@/lib/dimensions";

const ACTION_LABELS: Record<string, string> = {
  unpack_brief: "Unpack Brief",
  analyze: "Analyze",
  visual_variations: "Generate Visual Variations",
  conceptual_variations: "Generate Conceptual Variations",
  generate_concept_visuals: "Generate Concept Visuals",
};

const ACTION_DESCRIPTIONS: Record<string, string> = {
  unpack_brief: "Unpack your brief into goals, constraints, tensions, and idea directions.",
  analyze: "Analyze your drafts and references for strengths, blind spots, patterns, and next directions.",
  visual_variations: "Generate per-Arnheim-dimension visual variations with images (one call per selected dimension).",
  conceptual_variations: "Generate deeper conceptual alternatives grounded in your materials.",
  generate_concept_visuals: "Generate a 2×2 panel of 4 visuals for each selected conceptual variation.",
};

const CARD_TYPE_LABEL: Record<string, string> = {
  concept: "Concept", motif: "Motif", visual: "Visual", note: "Note",
};

interface Props {
  state: ComposerState;
  brief: string;
  assets: Asset[];
  selectedCards: ResultCard[];
  onChange: (s: ComposerState) => void;
  onClose: () => void;
  onSend: (s: ComposerState) => void;
}

export default function CallComposerModal({
  state,
  brief,
  assets,
  selectedCards,
  onChange,
  onClose,
  onSend,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const drafts = assets.filter((a) => a.type === "draft");
  const refs = assets.filter((a) => a.type === "reference");
  const action = state.action!;

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  function toggleDraft(id: string) {
    const next = state.includedDraftIds.includes(id)
      ? state.includedDraftIds.filter((x) => x !== id)
      : [...state.includedDraftIds, id];
    onChange({ ...state, includedDraftIds: next });
  }

  function toggleRef(id: string) {
    const next = state.includedReferenceIds.includes(id)
      ? state.includedReferenceIds.filter((x) => x !== id)
      : [...state.includedReferenceIds, id];
    onChange({ ...state, includedReferenceIds: next });
  }

  function toggleCard(id: string) {
    const next = state.selectedCardIds.includes(id)
      ? state.selectedCardIds.filter((x) => x !== id)
      : [...state.selectedCardIds, id];
    onChange({ ...state, selectedCardIds: next });
  }

  function toggleDimension(id: string) {
    const next = state.selectedDimensionIds.includes(id)
      ? state.selectedDimensionIds.filter((x) => x !== id)
      : [...state.selectedDimensionIds, id];
    onChange({ ...state, selectedDimensionIds: next });
  }

  const selectedDimCount = state.selectedDimensionIds.length;
  const showDrafts = ["analyze", "visual_variations", "conceptual_variations", "generate_concept_visuals"].includes(action);
  const showRefs = ["analyze", "conceptual_variations"].includes(action);
  const showDimensions = action === "visual_variations";
  const showConceptCards = action === "generate_concept_visuals" && (state.conceptCards ?? []).length > 0;
  const showSelectedCards = selectedCards.length > 0 && action !== "generate_concept_visuals";

  return (
    <div
      className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white border-2 border-[#111] w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden" style={{ boxShadow: "4px 4px 0px #111" }}>
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b" style={{ borderColor: "#ccc" }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[15px] text-[#111]">{ACTION_LABELS[action]}</h2>
              <p className="text-xs text-[#888] mt-0.5">{ACTION_DESCRIPTIONS[action]}</p>
            </div>
            <button onClick={onClose} className="text-[#aaa] hover:text-[#111] text-2xl leading-none mt-0.5">×</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-5">
          {/* Brief preview */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#888] mb-1.5">Brief</p>
            <div className="bg-[#f5f5f4] border border-[#ccc] rounded px-3 py-2.5 text-sm text-[#555] max-h-20 overflow-y-auto leading-relaxed">
              {brief || <span className="text-[#bbb] italic">No brief provided</span>}
            </div>
          </div>

          {/* Selected canvas nodes as context */}
          {showSelectedCards && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#888] mb-1.5">
                Context from canvas ({state.selectedCardIds.length} of {selectedCards.length} included)
              </p>
              <div className="flex flex-col gap-1.5">
                {selectedCards.map((card) => {
                  const included = state.selectedCardIds.includes(card.id);
                  return (
                    <label
                      key={card.id}
                      className={`flex items-start gap-2.5 px-3 py-2 rounded-sm border cursor-pointer transition-colors ${
                        included ? "border-[#111] bg-[#f5f5f4]" : "border-[#ccc] hover:border-[#888] opacity-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={included}
                        onChange={() => toggleCard(card.id)}
                        className="mt-0.5 w-3.5 h-3.5 accent-black shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs text-[#111] truncate">{card.title}</p>
                        <p className="text-[11px] text-[#999]">{CARD_TYPE_LABEL[card.type] ?? card.type}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* No canvas selection hint */}
          {!showSelectedCards && action !== "generate_concept_visuals" && (
            <div className="text-[11px] text-[#bbb] bg-[#fafafa] border border-[#eee] rounded px-3 py-2.5">
              No canvas nodes selected — select nodes on the canvas before running an action to include them as context.
            </div>
          )}

          {/* Selected conceptual variation cards */}
          {showConceptCards && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#888] mb-1.5">Generating visuals for</p>
              <div className="flex flex-col gap-1.5">
                {(state.conceptCards ?? []).map((card) => (
                  <div key={card.id} className="bg-[#f5f5f4] border border-[#111] rounded px-3 py-2">
                    <p className="text-xs text-[#111]">{card.title}</p>
                    <p className="text-[11px] text-[#555] mt-0.5 leading-snug">{card.description}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-[#aaa] mt-1.5">A 2×2 panel of 4 visuals will be generated for each variation above.</p>
            </div>
          )}

          {/* Drafts */}
          {showDrafts && drafts.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#888] mb-1.5">
                Draft Images {action === "generate_concept_visuals" && <span className="normal-case tracking-normal text-[#bbb]">— optional style reference</span>}
              </p>
              <div className="flex flex-wrap gap-2">
                {drafts.map((a) => {
                  const included = state.includedDraftIds.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggleDraft(a.id)}
                      className={`relative w-16 h-16 rounded overflow-hidden border-2 transition-all ${
                        included ? "border-[#111] opacity-100" : "border-[#ccc] opacity-40 hover:opacity-70"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.dataUrl} alt={a.fileName} className="w-full h-full object-cover" />
                      {included && (
                        <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-[#111] rounded-full text-white text-[9px] flex items-center justify-center">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* References */}
          {showRefs && refs.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#888] mb-1.5">Reference Images</p>
              <div className="flex flex-wrap gap-2">
                {refs.map((a) => {
                  const included = state.includedReferenceIds.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggleRef(a.id)}
                      className={`relative w-16 h-16 rounded overflow-hidden border-2 transition-all ${
                        included ? "border-[#111] opacity-100" : "border-[#ccc] opacity-40 hover:opacity-70"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.dataUrl} alt={a.fileName} className="w-full h-full object-cover" />
                      {included && (
                        <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-[#111] rounded-full text-white text-[9px] flex items-center justify-center">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dimensions */}
          {showDimensions && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] uppercase tracking-widest text-[#888]">
                  Arnheim Dimensions ({selectedDimCount} selected)
                </p>
                <button
                  onClick={() => onChange({ ...state, selectedDimensionIds: selectedDimCount === DIMENSIONS.length ? [] : DIMENSIONS.map((d) => d.id) })}
                  className="text-[11px] text-[#111] underline hover:no-underline"
                >
                  {selectedDimCount === DIMENSIONS.length ? "Deselect all" : "Select all"}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DIMENSIONS.map((dim) => {
                  const selected = state.selectedDimensionIds.includes(dim.id);
                  return (
                    <button
                      key={dim.id}
                      onClick={() => toggleDimension(dim.id)}
                      className={`text-[11px] px-2.5 py-1 rounded-sm border transition-colors ${
                        selected ? "bg-[#111] text-white border-[#111]" : "text-[#555] border-[#ccc] hover:border-[#111]"
                      }`}
                    >
                      {dim.label}
                    </button>
                  );
                })}
              </div>
              {selectedDimCount > 0 && (
                <p className="text-[11px] text-[#aaa] mt-1.5">
                  {selectedDimCount} parallel API call{selectedDimCount > 1 ? "s" : ""} will be made.
                </p>
              )}
            </div>
          )}

          {/* Custom instructions */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#888] mb-1.5">Additional Instructions (optional)</p>
            <textarea
              ref={textareaRef}
              value={state.userInstructions}
              onChange={(e) => onChange({ ...state, userInstructions: e.target.value })}
              placeholder="Add any specific focus, constraints, or direction for this call..."
              rows={3}
              className="w-full text-sm text-[#333] bg-[#fafaf8] border border-[#ccc] rounded px-3 py-2.5 resize-none outline-none focus:border-[#111] placeholder-[#bbb] leading-relaxed"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-4 border-t flex items-center justify-between gap-4" style={{ borderColor: "#ccc" }}>
          <button onClick={onClose} className="text-sm text-[#888] hover:text-[#111]">Cancel</button>
          <button
            onClick={() => onSend(state)}
            className="bg-[#111] text-white text-sm px-5 py-2.5 rounded-sm hover:bg-[#333] transition-colors"
            style={{ boxShadow: "2px 2px 0px #555" }}
          >
            Send →
          </button>
        </div>
      </div>
    </div>
  );
}
