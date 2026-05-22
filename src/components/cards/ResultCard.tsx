"use client";

import { useState } from "react";
import type {
  ConceptualVariationCard as ConceptualVariationCardType,
  NoteCard,
  ResultCard as ResultCardType,
} from "@/types";
import InsightCard from "./InsightCard";
import VisualVariationCard from "./VisualVariationCard";
import ConceptualVariationCard from "./ConceptualVariationCard";
import ConceptCard from "./ConceptCard";

interface Props {
  card: ResultCardType;
  isSaved: boolean;
  onSave: () => void;
  onDismiss: () => void;
  onGenerateVisuals?: (card: ConceptualVariationCardType) => void;
  onUpdate?: (card: ResultCardType) => void;
}

export default function ResultCard({ card, isSaved, onSave, onDismiss, onGenerateVisuals, onUpdate }: Props) {
  switch (card.type) {
    case "insight":
      return (
        <InsightCard
          card={card}
          isSaved={isSaved}
          onSave={onSave}
          onDismiss={onDismiss}
          onUpdate={onUpdate}
        />
      );
    case "visual_variation":
      return (
        <VisualVariationCard
          card={card}
          isSaved={isSaved}
          onSave={onSave}
          onDismiss={onDismiss}
          onUpdate={onUpdate}
        />
      );
    case "conceptual_variation":
      return (
        <ConceptualVariationCard
          card={card}
          isSaved={isSaved}
          onSave={onSave}
          onDismiss={onDismiss}
          onGenerateVisuals={onGenerateVisuals ? () => onGenerateVisuals(card) : undefined}
          onUpdate={onUpdate}
        />
      );
    case "concept":
      return (
        <ConceptCard
          card={card}
          isSaved={isSaved}
          onSave={onSave}
          onDismiss={onDismiss}
          onUpdate={onUpdate}
        />
      );
    case "note":
      return (
        <NoteCardComponent
          card={card}
          isSaved={isSaved}
          onSave={onSave}
          onDismiss={onDismiss}
          onUpdate={onUpdate}
        />
      );
  }
}

function NoteCardComponent({
  card, isSaved, onSave, onDismiss, onUpdate,
}: {
  card: NoteCard;
  isSaved: boolean;
  onSave: () => void;
  onDismiss: () => void;
  onUpdate?: (card: ResultCardType) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(card);

  function startEdit() { setDraft(card); setIsEditing(true); }
  function cancelEdit() { setDraft(card); setIsEditing(false); }
  function commitEdit() { onUpdate?.(draft); setIsEditing(false); }

  if (isEditing) {
    return (
      <div className="bg-white border-2 border-[#111] rounded p-4 flex flex-col gap-3" style={{ boxShadow: "3px 3px 0px #111" }}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest bg-[#111] text-white px-2 py-0.5 rounded-sm">Note</span>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={commitEdit} className="text-xs font-medium text-white bg-[#111] px-2.5 py-1 rounded-sm hover:bg-[#333] transition-colors">Save</button>
            <button onClick={cancelEdit} className="text-xs text-[#888] hover:text-[#111] transition-colors">Cancel</button>
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[#888] mb-0.5">Title</p>
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            className="w-full text-[15px] text-[#111] border border-[#111] rounded px-3 py-2 outline-none focus:ring-1 focus:ring-black bg-white"
          />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[#888] mb-0.5">Body</p>
          <textarea
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            rows={4}
            className="w-full text-sm text-[#111] border border-[#111] rounded px-3 py-2 resize-y outline-none focus:ring-1 focus:ring-black bg-white leading-relaxed"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#111] rounded p-4 flex flex-col gap-3 group hover:shadow-[2px_2px_0px_#111] transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest bg-[#888] text-white px-2 py-0.5 rounded-sm shrink-0">Note</span>
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
      <h3 className="text-[15px] text-[#111] leading-snug">{card.title}</h3>
      {card.body && <p className="text-sm text-[#444] leading-relaxed">{card.body}</p>}
    </div>
  );
}
