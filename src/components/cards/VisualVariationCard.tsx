"use client";

import type { VisualVariationCard as VisualVariationCardType } from "@/types";

interface Props {
  card: VisualVariationCardType;
  isSaved: boolean;
  onSave: () => void;
  onDismiss: () => void;
}

export default function VisualVariationCard({ card, isSaved, onSave, onDismiss }: Props) {
  return (
    <div className="bg-white border border-[#e4e3e0] rounded-xl overflow-hidden flex flex-col">
      <div className="flex items-start justify-between gap-2 p-4 pb-3">
        <span className="text-[10px] font-medium tracking-widest uppercase text-[#2563eb] bg-blue-50 px-2 py-0.5 rounded">
          Visual · {card.dimensionLabel}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onSave}
            disabled={isSaved}
            className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
              isSaved
                ? "text-[#999] border-[#e4e3e0] cursor-default"
                : "text-[#2563eb] border-[#2563eb]/30 hover:bg-[#2563eb]/5"
            }`}
          >
            {isSaved ? "Saved" : "Save"}
          </button>
          <button onClick={onDismiss} className="text-[#ccc] hover:text-[#999] text-lg leading-none">×</button>
        </div>
      </div>

      {card.error ? (
        <div className="mx-4 mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
          Generation failed: {card.error}
        </div>
      ) : (
        <>
          {card.imageDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.imageDataUrl}
              alt={`${card.dimensionLabel} variations`}
              className="w-full object-contain border-t border-[#f0efec]"
            />
          ) : (
            <div className="mx-4 mb-3 h-32 bg-[#f7f6f3] border border-[#e4e3e0] rounded-lg flex items-center justify-center text-sm text-[#aaa]">
              No image generated
            </div>
          )}

          {card.analysisText && (
            <div className="p-4 pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#aaa] mb-1">Analysis</p>
              <p className="text-sm text-[#555] leading-relaxed">{card.analysisText}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
