"use client";

import { useState } from "react";
import type { ConceptualVariationCard as ConceptualVariationCardType } from "@/types";

interface Props {
  card: ConceptualVariationCardType;
  isSaved: boolean;
  onSave: () => void;
  onDismiss: () => void;
  onGenerateVisuals?: () => void;
}

export default function ConceptualVariationCard({ card, isSaved, onSave, onDismiss, onGenerateVisuals }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white border border-[#e4e3e0] rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-medium tracking-widest uppercase text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
          Conceptual
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

      <h3 className="font-semibold text-[15px] text-[#111]">{card.title}</h3>
      <p className="text-sm text-[#444] leading-relaxed">{card.coreIdea}</p>

      <button
        onClick={() => setExpanded((e) => !e)}
        className="text-xs text-[#2563eb] hover:underline text-left"
      >
        {expanded ? "Show less" : "Show more"}
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 pt-1 border-t border-[#f0efec]">
          <Field label="How it differs" value={card.howItDiffers} />
          <Field label="Why it may work" value={card.whyItMayWork} />
          <Field label="Best use case" value={card.bestUseCase} />
          <Field label="Tradeoffs" value={card.tradeoffs} />
          <Field label="Next step" value={card.nextStep} />
        </div>
      )}

      {onGenerateVisuals && (
        <div className="pt-1 border-t border-[#f0efec]">
          <button
            onClick={onGenerateVisuals}
            className="text-xs font-medium text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors w-full"
          >
            Generate Visuals →
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#aaa] mb-0.5">{label}</p>
      <p className="text-sm text-[#555] leading-relaxed">{value}</p>
    </div>
  );
}
