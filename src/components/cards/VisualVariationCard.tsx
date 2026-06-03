"use client";

/**
 * src/components/cards/VisualVariationCard.tsx  (exported as `VisualCard`)
 *
 * Responsibility: Renders a single visual card — a model-generated image
 * paired with a textual analysis.  Used for both Visual Variations
 * (per-Arnheim-dimension 5×3 panels) and Generate Concept Visuals
 * (per-concept 2×2 panels).
 *
 * The card shows the full generated image inline (no fixed height), which
 * makes these cards taller than concept or motif cards.  This size difference
 * is reflected in `VISUAL_NODE_H`/`VISUAL_NODE_W` in `TreeView.tsx`.
 *
 * "Use as Reference Input": clicking this button calls `onAddAsReference`
 * with the image's data URL and the dimension/concept label.  The parent
 * (`page.tsx → handleAddAsReference`) creates a new reference `Asset` and
 * adds it to the store, making the image immediately available in
 * InputsSidebar for inclusion in future calls.  The `added` flag disables the
 * button after one click to prevent duplicate assets.
 */

import { useState } from "react";
import type { VisualCard as VisualCardType, ResultCard } from "@/types";

interface Props {
  card: VisualCardType;
  isSaved: boolean;
  onSave: () => void;
  onDismiss: () => void;
  onAddAsReference?: (dataUrl: string, label: string) => void;
  onUpdate?: (card: ResultCard) => void;
}

export default function VisualCard({ card, isSaved, onSave, onDismiss, onAddAsReference, onUpdate }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(card);
  const [added, setAdded] = useState(false);

  function startEdit() { setDraft(card); setIsEditing(true); }
  function cancelEdit() { setDraft(card); setIsEditing(false); }
  function commitEdit() { onUpdate?.(draft); setIsEditing(false); }

  function handleAddAsReference() {
    if (!card.imageDataUrl || !onAddAsReference) return;
    onAddAsReference(card.imageDataUrl, card.dimensionLabel);
    setAdded(true);
  }

  if (isEditing) {
    return (
      <div className="bg-white border-2 border-[#111] rounded overflow-hidden flex flex-col" style={{ boxShadow: "3px 3px 0px #111" }}>
        <div className="flex items-center justify-between p-4 pb-3">
          <span className="text-[10px] uppercase tracking-widest bg-[#111] text-white px-2 py-0.5 rounded-sm">
            Visual · {card.dimensionLabel}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={commitEdit} className="text-xs font-medium text-white bg-[#111] px-2.5 py-1 rounded-sm hover:bg-[#333] transition-colors">Save</button>
            <button onClick={cancelEdit} className="text-xs text-[#888] hover:text-[#111] transition-colors">Cancel</button>
          </div>
        </div>
        {card.imageDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.imageDataUrl} alt={card.title} className="w-full object-contain border-t border-[#ddd] opacity-60" />
        )}
        <div className="p-4 flex flex-col gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#888] mb-0.5">Title</p>
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="w-full text-[15px] text-[#111] border border-[#111] rounded px-3 py-2 outline-none focus:ring-1 focus:ring-black bg-white"
            />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#888] mb-0.5">Analysis</p>
            <textarea
              value={draft.analysisText}
              onChange={(e) => setDraft({ ...draft, analysisText: e.target.value })}
              rows={4}
              className="w-full text-sm text-[#111] border border-[#111] rounded px-3 py-2 resize-y outline-none focus:ring-1 focus:ring-black bg-white leading-relaxed"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#111] rounded overflow-hidden flex flex-col group hover:shadow-[2px_2px_0px_#111] transition-shadow">
      <div className="flex items-start justify-between gap-2 p-4 pb-3">
        <span className="text-[10px] uppercase tracking-widest bg-[#111] text-white px-2 py-0.5 rounded-sm shrink-0">
          Visual · {card.dimensionLabel}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {onUpdate && (
            <button onClick={startEdit} className="text-[#ccc] hover:text-[#111] text-sm transition-colors opacity-0 group-hover:opacity-100" title="Edit">✎</button>
          )}
          <button
            onClick={onSave}
            disabled={isSaved}
            className={`text-xs px-2.5 py-1 rounded-sm border transition-colors ${
              isSaved ? "text-[#aaa] border-[#ccc] cursor-default" : "text-[#111] border-[#111] hover:bg-[#111] hover:text-white"
            }`}
          >
            {isSaved ? "Saved" : "Save"}
          </button>
          <button onClick={onDismiss} className="text-[#bbb] hover:text-[#111] text-lg leading-none">×</button>
        </div>
      </div>

      {card.error ? (
        <div className="mx-4 mb-4 text-sm text-[#111] bg-[#f5f5f4] border border-[#ccc] rounded p-3">
          Generation failed: {card.error}
        </div>
      ) : (
        <>
          {card.imageDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.imageDataUrl} alt={`${card.dimensionLabel} variations`} className="w-full object-contain border-t border-[#eee]" />
          ) : (
            <div className="mx-4 mb-3 h-32 bg-[#f5f5f4] border border-[#ccc] rounded flex items-center justify-center text-sm text-[#aaa]">
              No image generated
            </div>
          )}
          {card.analysisText && (
            <div className="p-4 pt-3">
              <p className="text-[10px] uppercase tracking-widest text-[#888] mb-1">Analysis</p>
              <p className="text-sm text-[#444] leading-relaxed">{card.analysisText}</p>
            </div>
          )}
          {card.imageDataUrl && onAddAsReference && (
            <div className="px-4 pb-4">
              <button
                onClick={handleAddAsReference}
                disabled={added}
                className={`text-xs w-full px-3 py-1.5 rounded-sm border transition-colors ${
                  added
                    ? "text-[#aaa] border-[#ccc] cursor-default"
                    : "text-[#555] border-[#ccc] hover:border-[#555] hover:text-[#111]"
                }`}
              >
                {added ? "✓ Added to inputs" : "+ Use as Reference Input"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
