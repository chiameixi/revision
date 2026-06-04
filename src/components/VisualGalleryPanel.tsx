"use client";

import { useState } from "react";
import type { VisualCard, ResultCard } from "@/types";

interface Props {
  visuals: VisualCard[];
  savedCardIds: Set<string>;
  selectedCardId: string | null;
  onSaveCard: (card: ResultCard) => void;
  onDismissCard: (card: ResultCard) => void;
  onAddAsReference: (dataUrl: string, label: string) => void;
  onHoverCard: (cardId: string | null) => void;
}

export default function VisualGalleryPanel({
  visuals,
  savedCardIds,
  selectedCardId,
  onSaveCard,
  onDismissCard,
  onAddAsReference,
  onHoverCard,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (visuals.length === 0) {
    return (
      <aside className="w-2/5 shrink-0 h-full border-l border-[#e4e3e0] bg-white/50 flex items-center justify-center">
        <p className="text-[10px] text-[#ccc] text-center px-4">
          No visuals in this path. Select a node in the tree to filter.
        </p>
      </aside>
    );
  }

  return (
    <aside className="w-2/5 shrink-0 h-full border-l border-[#e4e3e0] bg-white flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-[#f0efec] shrink-0">
        <h3 className="text-sm font-semibold text-[#111]">Visuals</h3>
        <p className="text-[10px] text-[#bbb] mt-0.5">{visuals.length} image{visuals.length !== 1 ? "s" : ""}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">
        {visuals.map((visual) => {
          const isSaved = savedCardIds.has(visual.id);
          const isSelected = visual.id === selectedCardId;
          const isExpanded = expandedId === visual.id;

          return (
            <div
              key={visual.id}
              className="flex flex-col rounded-lg border transition-all"
              style={{
                borderColor: isSelected ? "#111" : "#ddd",
                background: isSelected ? "#fffbf5" : "#ffffff",
                boxShadow: isSelected ? "0 2px 8px rgba(0,0,0,0.1)" : "none",
              }}
              onMouseEnter={() => onHoverCard(visual.id)}
              onMouseLeave={() => onHoverCard(null)}
            >
              {visual.imageDataUrl && (
                <div className="relative aspect-video overflow-hidden rounded-t-[5px] bg-[#f5f5f4]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={visual.imageDataUrl}
                    alt={visual.title}
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : visual.id)}
                  />
                  <div className="absolute top-0 left-0 right-0 p-2 bg-gradient-to-b from-black/40 to-transparent">
                    <span className="text-[8px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 bg-black/50 text-white">
                      {visual.dimensionLabel}
                    </span>
                  </div>
                </div>
              )}

              <div className="p-3 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-[11px] font-medium text-[#333] line-clamp-2 flex-1">
                    {visual.title}
                  </h4>
                  {isSaved && <span className="text-amber-400 text-[10px] shrink-0">★</span>}
                </div>

                {isExpanded && (
                  <div className="flex flex-col gap-2 py-2 border-t border-[#eee] text-[10px]">
                    {visual.analysisText && (
                      <div>
                        <p className="text-[9px] uppercase tracking-wide text-[#bbb] font-semibold mb-0.5">Analysis</p>
                        <p className="text-[10px] leading-relaxed text-[#666]">{visual.analysisText}</p>
                      </div>
                    )}
                    {visual.error && (
                      <div className="text-red-600 text-[9px]">
                        <p className="font-semibold mb-0.5">Error</p>
                        <p>{visual.error}</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-1 pt-1">
                  <button
                    onClick={() => onSaveCard(visual)}
                    disabled={isSaved}
                    className={`flex-1 text-[9px] px-2 py-1 rounded-sm border transition-colors ${
                      isSaved
                        ? "text-[#aaa] border-[#ddd] cursor-default"
                        : "text-[#555] border-[#ddd] hover:border-[#111] hover:text-[#111]"
                    }`}
                  >
                    {isSaved ? "Saved" : "Save"}
                  </button>
                  {visual.imageDataUrl && (
                    <button
                      onClick={() => onAddAsReference(visual.imageDataUrl!, visual.dimensionLabel)}
                      className="flex-1 text-[9px] px-2 py-1 rounded-sm border text-[#555] border-[#ddd] hover:border-[#111] hover:text-[#111] transition-colors"
                      title="Add as reference input"
                    >
                      Use
                    </button>
                  )}
                  <button
                    onClick={() => onDismissCard(visual)}
                    className="text-[#bbb] hover:text-red-400 text-[11px] px-2 py-1 rounded-sm transition-colors"
                    title="Dismiss"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
