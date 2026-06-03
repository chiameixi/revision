"use client";

/**
 * src/components/cards/ConceptCard.tsx
 *
 * Responsibility: Renders a single concept card (abstract idea / design
 * direction) produced by `unpack_brief`, `conceptual_variations`, or
 * `synthesize`.
 *
 * Fields: title, description (always visible), rationale (collapsible behind
 * "Why this works"), and an optional "Generate Visuals →" button that triggers
 * `generate_concept_visuals` for this specific card.
 *
 * The card has an inline edit mode (pencil icon on hover) that allows the
 * researcher to refine the title, description, or rationale.  Changes are
 * committed through `onUpdate` which patches the card everywhere it appears
 * (generation feed and highlights) via `store.updateCard`.
 */

import { useState } from "react";
import type { ConceptCard as ConceptCardType, ResultCard } from "@/types";

interface Props {
  card: ConceptCardType;
  isSaved: boolean;
  onSave: () => void;
  onDismiss: () => void;
  onGenerateVisuals?: () => void;
  onUpdate?: (card: ResultCard) => void;
}

function EditField({ label, value, onChange, rows = 3 }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-[#888] mb-0.5">{label}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full text-sm text-[#111] border border-[#b45309] rounded px-3 py-2 resize-y outline-none focus:ring-1 focus:ring-[#b45309] bg-white leading-relaxed"
      />
    </div>
  );
}

export default function ConceptCard({ card, isSaved, onSave, onDismiss, onGenerateVisuals, onUpdate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(card);

  function startEdit() { setDraft(card); setIsEditing(true); }
  function cancelEdit() { setDraft(card); setIsEditing(false); }
  function commitEdit() { onUpdate?.(draft); setIsEditing(false); }

  if (isEditing) {
    return (
      <div className="bg-[#fffbf5] border-2 border-[#b45309] rounded p-4 flex flex-col gap-3" style={{ boxShadow: "3px 3px 0px #b45309" }}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest bg-[#b45309] text-white px-2 py-0.5 rounded-sm">Concept</span>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={commitEdit} className="text-xs font-medium text-white bg-[#b45309] px-2.5 py-1 rounded-sm hover:bg-[#92400e] transition-colors">Save</button>
            <button onClick={cancelEdit} className="text-xs text-[#888] hover:text-[#111] transition-colors">Cancel</button>
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[#888] mb-0.5">Title</p>
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            className="w-full text-[15px] text-[#111] border border-[#b45309] rounded px-3 py-2 outline-none focus:ring-1 focus:ring-[#b45309] bg-white"
          />
        </div>
        <EditField label="Description" value={draft.description} onChange={(v) => setDraft({ ...draft, description: v })} />
        <EditField label="Rationale" value={draft.rationale} onChange={(v) => setDraft({ ...draft, rationale: v })} rows={2} />
      </div>
    );
  }

  return (
    <div className="bg-[#fffbf5] border border-[#b45309] rounded p-4 flex flex-col gap-3 group hover:shadow-[2px_2px_0px_#b45309] transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest bg-[#b45309] text-white px-2 py-0.5 rounded-sm shrink-0">Concept</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {onUpdate && (
            <button onClick={startEdit} className="text-[#ccc] hover:text-[#b45309] text-sm transition-colors opacity-0 group-hover:opacity-100" title="Edit">✎</button>
          )}
          <button
            onClick={onSave}
            disabled={isSaved}
            className={`text-xs px-2.5 py-1 rounded-sm border transition-colors ${
              isSaved ? "text-[#aaa] border-[#ccc] cursor-default" : "text-[#b45309] border-[#b45309] hover:bg-[#b45309] hover:text-white"
            }`}
          >
            {isSaved ? "Saved" : "Save"}
          </button>
          <button onClick={onDismiss} className="text-[#bbb] hover:text-[#111] text-lg leading-none">×</button>
        </div>
      </div>

      <h3 className="text-[15px] text-[#111] leading-snug">{card.title}</h3>
      <p className="text-sm text-[#444] leading-relaxed">{card.description}</p>

      <button onClick={() => setExpanded((e) => !e)} className="text-xs text-[#999] hover:text-[#b45309] underline text-left transition-colors">
        {expanded ? "Hide rationale" : "Why this works"}
      </button>

      {expanded && (
        <div className="pt-2 border-t border-[#f0d89a]">
          <p className="text-[10px] uppercase tracking-widest text-[#b45309] mb-1">Rationale</p>
          <p className="text-sm text-[#555] leading-relaxed">{card.rationale}</p>
        </div>
      )}

      {onGenerateVisuals && (
        <div className="pt-1 border-t border-[#f0d89a]">
          <button
            onClick={onGenerateVisuals}
            className="text-xs text-[#b45309] border border-[#b45309] bg-white hover:bg-[#b45309] hover:text-white px-3 py-1.5 rounded-sm transition-colors w-full"
          >
            Generate Visuals →
          </button>
        </div>
      )}
    </div>
  );
}
