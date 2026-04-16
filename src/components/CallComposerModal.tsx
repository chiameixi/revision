"use client";

import { useEffect, useRef } from "react";
import type { Asset, ComposerState, Highlight } from "@/types";
import { DIMENSIONS } from "@/lib/dimensions";

const ACTION_LABELS: Record<string, string> = {
  unpack_brief: "Unpack Brief",
  analyze_draft: "Analyze Draft",
  analyze_references: "Analyze References",
  visual_variations: "Generate Visual Variations",
  conceptual_variations: "Generate Conceptual Variations",
  generate_concept_visuals: "Generate Concept Visuals",
  synthesize: "Synthesize Selected Ideas",
};

const ACTION_DESCRIPTIONS: Record<string, string> = {
  unpack_brief: "Unpack your brief into goals, constraints, tensions, and idea directions.",
  analyze_draft: "Analyze your draft for strengths, blind spots, and next directions.",
  analyze_references: "Extract reusable patterns and ideas from your references.",
  visual_variations: "Generate per-Arnheim-dimension visual variations with images (one call per selected dimension).",
  conceptual_variations: "Generate deeper conceptual alternatives grounded in your materials.",
  generate_concept_visuals: "Generate a 2×2 panel of 4 visuals for each selected conceptual variation.",
  synthesize: "Combine your saved highlights into coherent concept directions.",
};

interface Props {
  state: ComposerState;
  brief: string;
  assets: Asset[];
  highlights: Highlight[];
  onChange: (s: ComposerState) => void;
  onClose: () => void;
  onSend: (s: ComposerState) => void;
}

export default function CallComposerModal({
  state,
  brief,
  assets,
  highlights,
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

  // Close on backdrop click
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

  function toggleHighlight(id: string) {
    const next = state.includedHighlightIds.includes(id)
      ? state.includedHighlightIds.filter((x) => x !== id)
      : [...state.includedHighlightIds, id];
    onChange({ ...state, includedHighlightIds: next });
  }

  function toggleDimension(id: string) {
    const next = state.selectedDimensionIds.includes(id)
      ? state.selectedDimensionIds.filter((x) => x !== id)
      : [...state.selectedDimensionIds, id];
    onChange({ ...state, selectedDimensionIds: next });
  }

  const selectedDimCount = state.selectedDimensionIds.length;
  const showDrafts = ["analyze_draft", "visual_variations", "conceptual_variations", "generate_concept_visuals"].includes(action);
  const showRefs = ["analyze_references", "conceptual_variations"].includes(action);
  const showDimensions = action === "visual_variations";
  const showConceptCards = action === "generate_concept_visuals" && (state.conceptCards ?? []).length > 0;
  const showHighlights = highlights.length > 0 && action !== "generate_concept_visuals";

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-[#e4e3e0]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[15px] font-semibold text-[#111]">{ACTION_LABELS[action]}</h2>
              <p className="text-xs text-[#888] mt-0.5">{ACTION_DESCRIPTIONS[action]}</p>
            </div>
            <button onClick={onClose} className="text-[#ccc] hover:text-[#999] text-2xl leading-none mt-0.5">×</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-5">
          {/* Brief preview */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#aaa] mb-1.5">Brief</p>
            <div className="bg-[#f7f6f3] border border-[#e4e3e0] rounded-lg px-3 py-2.5 text-sm text-[#555] max-h-20 overflow-y-auto leading-relaxed">
              {brief || <span className="text-[#bbb] italic">No brief provided</span>}
            </div>
          </div>

          {/* Selected conceptual variation cards */}
          {showConceptCards && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#aaa] mb-1.5">
                Generating visuals for
              </p>
              <div className="flex flex-col gap-1.5">
                {(state.conceptCards ?? []).map((card) => (
                  <div key={card.id} className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    <p className="text-xs font-semibold text-emerald-800">{card.title}</p>
                    <p className="text-[11px] text-emerald-700 mt-0.5 leading-snug">{card.coreIdea}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-[#aaa] mt-1.5">
                A 2×2 panel of 4 visuals will be generated for each variation above.
              </p>
            </div>
          )}

          {/* Drafts */}
          {showDrafts && drafts.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#aaa] mb-1.5">
                Draft Images {action === "generate_concept_visuals" && <span className="normal-case tracking-normal font-normal text-[#bbb]">— optional style reference</span>}
              </p>
              <div className="flex flex-wrap gap-2">
                {drafts.map((a) => {
                  const included = state.includedDraftIds.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggleDraft(a.id)}
                      className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                        included ? "border-[#2563eb] opacity-100" : "border-transparent opacity-40 hover:opacity-70"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.dataUrl} alt={a.fileName} className="w-full h-full object-cover" />
                      {included && (
                        <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-[#2563eb] rounded-full text-white text-[9px] flex items-center justify-center">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {drafts.length > 0 && !state.includedDraftIds.length && action !== "unpack_brief" && (
                <p className="text-xs text-amber-600 mt-1">Select at least one draft image.</p>
              )}
            </div>
          )}

          {/* References */}
          {showRefs && refs.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#aaa] mb-1.5">
                Reference Images
              </p>
              <div className="flex flex-wrap gap-2">
                {refs.map((a) => {
                  const included = state.includedReferenceIds.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggleRef(a.id)}
                      className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                        included ? "border-[#2563eb] opacity-100" : "border-transparent opacity-40 hover:opacity-70"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.dataUrl} alt={a.fileName} className="w-full h-full object-cover" />
                      {included && (
                        <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-[#2563eb] rounded-full text-white text-[9px] flex items-center justify-center">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dimensions (visual variations only) */}
          {showDimensions && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#aaa]">
                  Arnheim Dimensions ({selectedDimCount} selected)
                </p>
                <button
                  onClick={() => onChange({ ...state, selectedDimensionIds: selectedDimCount === DIMENSIONS.length ? [] : DIMENSIONS.map((d) => d.id) })}
                  className="text-[11px] text-[#2563eb] hover:underline"
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
                      className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                        selected
                          ? "bg-[#2563eb] text-white border-[#2563eb]"
                          : "text-[#666] border-[#e4e3e0] hover:border-[#2563eb]/40"
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

          {/* Highlights */}
          {showHighlights && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#aaa] mb-1.5">
                Include Highlights ({state.includedHighlightIds.length} selected)
              </p>
              <div className="flex flex-col gap-1.5">
                {highlights.map((h) => {
                  const included = state.includedHighlightIds.includes(h.id);
                  return (
                    <label
                      key={h.id}
                      className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                        included ? "border-[#2563eb]/30 bg-blue-50/50" : "border-[#e4e3e0] hover:bg-[#fafaf8]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={included}
                        onChange={() => toggleHighlight(h.id)}
                        className="mt-0.5 w-3.5 h-3.5 accent-[#2563eb] shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[#333] truncate">{h.card.title}</p>
                        <p className="text-[11px] text-[#999]">{h.card.type.replace("_", " ")}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Custom instructions */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#aaa] mb-1.5">
              Additional Instructions (optional)
            </p>
            <textarea
              ref={textareaRef}
              value={state.userInstructions}
              onChange={(e) => onChange({ ...state, userInstructions: e.target.value })}
              placeholder="Add any specific focus, constraints, or direction for this call..."
              rows={3}
              className="w-full text-sm text-[#333] bg-[#fafaf8] border border-[#e4e3e0] rounded-lg px-3 py-2.5 resize-none outline-none focus:border-[#2563eb]/40 placeholder-[#bbb] leading-relaxed"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-4 border-t border-[#e4e3e0] flex items-center justify-between gap-4">
          <button onClick={onClose} className="text-sm text-[#888] hover:text-[#555]">
            Cancel
          </button>
          <button
            onClick={() => onSend(state)}
            className="bg-[#111] text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-[#333] transition-colors"
          >
            Send →
          </button>
        </div>
      </div>
    </div>
  );
}
