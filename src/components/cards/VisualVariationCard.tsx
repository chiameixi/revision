"use client";

import { useState } from "react";
import type { VisualCard as VisualCardType, ResultCard } from "@/types";
import styles from "./VisualVariationCard.module.css";

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
      <div className={`bg-white border-2 border-black overflow-hidden flex flex-col ${styles.sq}`}>
        <div className="flex items-center justify-between p-4 pb-3">
          <VisualLabel label={card.dimensionLabel} />
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={commitEdit} className="text-[12px] text-white bg-black px-3 py-1 hover:opacity-70 transition-opacity">Save</button>
            <button onClick={cancelEdit} className="text-[12px] text-[rgba(0,0,0,0.45)] hover:text-black transition-colors">Cancel</button>
          </div>
        </div>
        {card.imageDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.imageDataUrl} alt={card.title} className="w-full object-contain border-t border-[rgba(0,0,0,0.1)] opacity-60" />
        )}
        <div className="p-4 flex flex-col gap-3">
          <div>
            <p className="text-[9px] uppercase tracking-[0.16em] text-[rgba(0,0,0,0.4)] mb-1">Title</p>
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className={`w-full text-[16px] text-black border border-black px-3 py-2 outline-none bg-white ${styles.sq}`}
            />
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-[0.16em] text-[rgba(0,0,0,0.4)] mb-1">Analysis</p>
            <textarea
              value={draft.analysisText}
              onChange={(e) => setDraft({ ...draft, analysisText: e.target.value })}
              rows={4}
              className={`w-full text-[14px] text-black border border-black px-3 py-2 resize-y outline-none bg-white leading-relaxed ${styles.sq}`}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white border border-black overflow-hidden flex flex-col group ${styles.sq}`}>
      <div className="flex items-start justify-between gap-2 p-4 pb-3">
        <VisualLabel label={card.dimensionLabel} />
        <div className="flex items-center gap-2 shrink-0">
          {onUpdate && (
            <button onClick={startEdit} className="text-[rgba(0,0,0,0.2)] hover:text-black text-sm transition-colors opacity-0 group-hover:opacity-100" title="Edit">✎</button>
          )}
          <button
            onClick={onSave}
            disabled={isSaved}
            className={`text-[11px] px-2 py-0.5 border transition-colors ${styles.sq} ${
              isSaved ? "text-[rgba(0,0,0,0.3)] border-[rgba(0,0,0,0.2)] cursor-default" : "text-black border-black hover:bg-black hover:text-white"
            }`}
          >
            {isSaved ? "Saved" : "Save"}
          </button>
          <button onClick={onDismiss} className="text-[rgba(0,0,0,0.3)] hover:text-black text-lg leading-none transition-colors">×</button>
        </div>
      </div>

      {card.error ? (
        <div className="mx-4 mb-4 text-[13px] text-black bg-[#f5f5f4] border border-[rgba(0,0,0,0.2)] p-3">
          Generation failed: {card.error}
        </div>
      ) : (
        <>
          {card.imageDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.imageDataUrl} alt={`${card.dimensionLabel} variations`} className="w-full object-contain border-t border-[rgba(0,0,0,0.1)]" />
          ) : (
            <div className="mx-4 mb-3 h-32 bg-[#f5f5f4] border border-[rgba(0,0,0,0.15)] flex items-center justify-center text-[13px] text-[rgba(0,0,0,0.35)] italic">
              No image generated
            </div>
          )}
          {card.analysisText && (
            <div className="p-4 pt-3">
              <p className="text-[9px] uppercase tracking-[0.16em] text-[rgba(0,0,0,0.4)] mb-1.5">Analysis</p>
              <p className="text-[14px] text-[#333232] leading-relaxed">{card.analysisText}</p>
            </div>
          )}
          {card.imageDataUrl && onAddAsReference && (
            <div className="px-4 pb-4">
              <button
                onClick={handleAddAsReference}
                disabled={added}
                className={`text-[12px] w-full px-3 py-1.5 border border-dashed transition-colors ${styles.sq} ${
                  added
                    ? "text-[rgba(0,0,0,0.3)] border-[rgba(0,0,0,0.2)] cursor-default"
                    : "text-black border-[rgba(0,0,0,0.4)] hover:border-black"
                }`}
              >
                {added ? "✓ Added to inputs" : "+ Use as Reference"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function VisualLabel({ label }: { label: string }) {
  return (
    <span className="text-[11px] uppercase tracking-[0.14em] text-[rgba(0,0,0,0.5)] shrink-0">
      Visual · {label}
    </span>
  );
}
