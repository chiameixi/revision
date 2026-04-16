"use client";

import { useState } from "react";
import type { ConceptCard as ConceptCardType } from "@/types";

interface Props {
  card: ConceptCardType;
  isSaved: boolean;
  onSave: () => void;
  onDismiss: () => void;
}

export default function ConceptCard({ card, isSaved, onSave, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white border border-[#e4e3e0] rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-medium tracking-widest uppercase text-violet-700 bg-violet-50 px-2 py-0.5 rounded">
          Concept
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
          <Field label="Interaction direction" value={card.interactionDirection} />
          <Field label="Visual direction" value={card.visualDirection} />
          <Field label="Best for" value={card.bestFor} />
          <Field label="Risks" value={card.risks} />
          <Field label="Next step" value={card.nextStep} />
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
