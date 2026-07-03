"use client";

import { useEffect, useRef } from "react";
import type { Asset, ComposerState, ResultCard } from "@/types";
import { DIMENSIONS } from "@/lib/dimensions";
import styles from "./CallComposerModal.module.css";

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
      className="fixed inset-0 bg-black/25 z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div className={`bg-white border border-black w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden ${styles.sq}`}>
        {/* Header */}
        <div className={`px-6 pt-6 pb-5 ${styles.header}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[20px] text-black">{ACTION_LABELS[action]}</h2>
              <p className="text-[13px] italic text-[rgba(0,0,0,0.45)] mt-0.5">{ACTION_DESCRIPTIONS[action]}</p>
            </div>
            <button onClick={onClose} className="text-[rgba(0,0,0,0.3)] hover:text-black text-2xl leading-none mt-0.5 transition-colors">×</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          {/* Brief preview */}
          <div>
            <p className="text-[9px] uppercase tracking-[0.16em] text-[rgba(0,0,0,0.4)] mb-2">Brief</p>
            <div className={`bg-[#f5f4f0] border border-[rgba(0,0,0,0.2)] px-3 py-2.5 text-[14px] text-[#333232] max-h-20 overflow-y-auto leading-relaxed ${styles.sq}`}>
              {brief || <span className="italic text-[rgba(0,0,0,0.3)]">No brief provided</span>}
            </div>
          </div>

          {/* Selected canvas nodes as context */}
          {showSelectedCards && (
            <div>
              <p className="text-[9px] uppercase tracking-[0.16em] text-[rgba(0,0,0,0.4)] mb-2">
                Context from canvas ({state.selectedCardIds.length} of {selectedCards.length} included)
              </p>
              <div className="flex flex-col gap-1.5">
                {selectedCards.map((card) => {
                  const included = state.selectedCardIds.includes(card.id);
                  return (
                    <label
                      key={card.id}
                      className={`flex items-start gap-2.5 px-3 py-2 border cursor-pointer transition-colors ${styles.sq} ${
                        included ? "border-black bg-[#f5f4f0]" : "border-[rgba(0,0,0,0.18)] hover:border-[rgba(0,0,0,0.4)] opacity-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={included}
                        onChange={() => toggleCard(card.id)}
                        className="mt-0.5 w-3.5 h-3.5 accent-black shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-[13px] text-black truncate">{card.title}</p>
                        <p className="text-[11px] italic text-[rgba(0,0,0,0.4)]">{CARD_TYPE_LABEL[card.type] ?? card.type}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* No canvas selection hint */}
          {!showSelectedCards && action !== "generate_concept_visuals" && (
            <div className={`text-[12px] italic text-[rgba(0,0,0,0.35)] bg-[#f5f4f0] border border-[rgba(0,0,0,0.1)] px-3 py-2.5 ${styles.sq}`}>
              No canvas nodes selected — select nodes on the canvas before running an action to include them as context.
            </div>
          )}

          {/* Selected conceptual variation cards */}
          {showConceptCards && (
            <div>
              <p className="text-[9px] uppercase tracking-[0.16em] text-[rgba(0,0,0,0.4)] mb-2">Generating visuals for</p>
              <div className="flex flex-col gap-1.5">
                {(state.conceptCards ?? []).map((card) => (
                  <div key={card.id} className={`bg-[#f5f4f0] border border-black px-3 py-2 ${styles.sq}`}>
                    <p className="text-[13px] text-black">{card.title}</p>
                    <p className="text-[12px] italic text-[rgba(0,0,0,0.5)] mt-0.5 leading-snug">{card.description}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] italic text-[rgba(0,0,0,0.35)] mt-1.5">A 2×2 panel of 4 visuals will be generated for each variation above.</p>
            </div>
          )}

          {/* Drafts */}
          {showDrafts && drafts.length > 0 && (
            <div>
              <p className="text-[9px] uppercase tracking-[0.16em] text-[rgba(0,0,0,0.4)] mb-2">
                Draft Images {action === "generate_concept_visuals" && <span className="normal-case tracking-normal italic text-[rgba(0,0,0,0.3)]">— optional style reference</span>}
              </p>
              <div className="flex flex-wrap gap-2">
                {drafts.map((a) => {
                  const included = state.includedDraftIds.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggleDraft(a.id)}
                      className={`relative w-16 h-16 overflow-hidden border-2 transition-all ${styles.sq} ${
                        included ? "border-black opacity-100" : "border-[rgba(0,0,0,0.2)] opacity-40 hover:opacity-70"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.dataUrl} alt={a.fileName} className="w-full h-full object-cover" />
                      {included && (
                        <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-black text-white text-[9px] flex items-center justify-center">✓</span>
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
              <p className="text-[9px] uppercase tracking-[0.16em] text-[rgba(0,0,0,0.4)] mb-2">Reference Images</p>
              <div className="flex flex-wrap gap-2">
                {refs.map((a) => {
                  const included = state.includedReferenceIds.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggleRef(a.id)}
                      className={`relative w-16 h-16 overflow-hidden border-2 transition-all ${styles.sq} ${
                        included ? "border-black opacity-100" : "border-[rgba(0,0,0,0.2)] opacity-40 hover:opacity-70"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.dataUrl} alt={a.fileName} className="w-full h-full object-cover" />
                      {included && (
                        <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-black text-white text-[9px] flex items-center justify-center">✓</span>
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
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] uppercase tracking-[0.16em] text-[rgba(0,0,0,0.4)]">
                  Arnheim Dimensions ({selectedDimCount} selected)
                </p>
                <button
                  onClick={() => onChange({ ...state, selectedDimensionIds: selectedDimCount === DIMENSIONS.length ? [] : DIMENSIONS.map((d) => d.id) })}
                  className="text-[12px] italic text-black underline hover:no-underline"
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
                      className={`text-[12px] px-2.5 py-1 border transition-colors ${styles.sq} ${
                        selected ? "bg-black text-white border-black" : "text-[rgba(0,0,0,0.55)] border-[rgba(0,0,0,0.25)] hover:border-black hover:text-black"
                      }`}
                    >
                      {dim.label}
                    </button>
                  );
                })}
              </div>
              {selectedDimCount > 0 && (
                <p className="text-[11px] italic text-[rgba(0,0,0,0.35)] mt-1.5">
                  {selectedDimCount} parallel API call{selectedDimCount > 1 ? "s" : ""} will be made.
                </p>
              )}
            </div>
          )}

          {/* Custom instructions */}
          <div>
            <p className="text-[9px] uppercase tracking-[0.16em] text-[rgba(0,0,0,0.4)] mb-2">Additional Instructions (optional)</p>
            <textarea
              ref={textareaRef}
              value={state.userInstructions}
              onChange={(e) => onChange({ ...state, userInstructions: e.target.value })}
              placeholder="Add any specific focus, constraints, or direction for this call…"
              rows={3}
              className={`w-full text-[14px] text-[#333232] bg-[#f5f4f0] border border-[rgba(0,0,0,0.2)] px-3 py-2.5 resize-none outline-none focus:border-black placeholder-[rgba(0,0,0,0.3)] leading-relaxed italic ${styles.sq}`}
            />
          </div>
        </div>

        {/* Footer */}
        <div className={`px-6 pb-6 pt-4 flex items-center justify-between gap-4 ${styles.footer}`}>
          <button onClick={onClose} className="text-[14px] italic text-[rgba(0,0,0,0.45)] hover:text-black transition-colors">Cancel</button>
          <button
            onClick={() => onSend(state)}
            className={`bg-black text-white text-[15px] px-6 py-2.5 hover:opacity-75 transition-opacity ${styles.sq}`}
          >
            Send →
          </button>
        </div>
      </div>
    </div>
  );
}
