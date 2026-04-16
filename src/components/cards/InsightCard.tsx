"use client";

import type { InsightCard as InsightCardType } from "@/types";

interface Props {
  card: InsightCardType;
  isSaved: boolean;
  onSave: () => void;
  onDismiss: () => void;
}

export default function InsightCard({ card, isSaved, onSave, onDismiss }: Props) {
  return (
    <div className="bg-white border border-[#e4e3e0] rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-medium tracking-widest uppercase text-[#999] bg-[#f5f4f1] px-2 py-0.5 rounded">
          Insight
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onSave}
            disabled={isSaved}
            title={isSaved ? "Saved to Highlights" : "Save to Highlights"}
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

      <h3 className="font-semibold text-[15px] text-[#111]">{card.title}</h3>

      <p className="text-sm text-[#444] leading-relaxed">{card.summary}</p>

      {card.evidence && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#aaa] mb-0.5">Evidence</p>
          <p className="text-sm text-[#666] leading-relaxed">{card.evidence}</p>
        </div>
      )}

      {card.implication && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#aaa] mb-0.5">Implication</p>
          <p className="text-sm text-[#555] leading-relaxed">{card.implication}</p>
        </div>
      )}
    </div>
  );
}
