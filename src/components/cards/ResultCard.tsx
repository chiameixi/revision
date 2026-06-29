"use client";

import { useState } from "react";
import type { ConceptCard as ConceptCardType, NoteCard, ResultCard as ResultCardType } from "@/types";
import ConceptCard from "./ConceptCard";
import MotifCard from "./MotifCard";
import VisualCard from "./VisualVariationCard";

interface Props {
  card: ResultCardType;
  isSaved: boolean;
  onSave: () => void;
  onDismiss: () => void;
  onGenerateVisuals?: (card: ConceptCardType) => void;
  onAddAsReference?: (dataUrl: string, label: string) => void;
  onUpdate?: (card: ResultCardType) => void;
}

export default function ResultCard({ card, isSaved, onSave, onDismiss, onGenerateVisuals, onAddAsReference, onUpdate }: Props) {
  switch (card.type) {
    case "concept":
      return (
        <ConceptCard
          card={card}
          isSaved={isSaved}
          onSave={onSave}
          onDismiss={onDismiss}
          onGenerateVisuals={onGenerateVisuals ? () => onGenerateVisuals(card) : undefined}
          onUpdate={onUpdate}
        />
      );
    case "motif":
      return (
        <MotifCard
          card={card}
          isSaved={isSaved}
          onSave={onSave}
          onDismiss={onDismiss}
          onUpdate={onUpdate}
        />
      );
    case "visual":
      return (
        <VisualCard
          card={card}
          isSaved={isSaved}
          onSave={onSave}
          onDismiss={onDismiss}
          onAddAsReference={onAddAsReference}
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
      <div className="bg-white border-2 border-black p-4 flex flex-col gap-3" style={{ borderRadius: 0 }}>
        <div className="flex items-center justify-between">
          <NoteLabel />
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={commitEdit} className="text-[12px] text-white bg-black px-3 py-1 hover:opacity-70 transition-opacity">Save</button>
            <button onClick={cancelEdit} className="text-[12px] text-[rgba(0,0,0,0.45)] hover:text-black transition-colors">Cancel</button>
          </div>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-[0.16em] text-[rgba(0,0,0,0.4)] mb-1">Title</p>
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="w-full text-[16px] text-black border border-black px-3 py-2 outline-none bg-white" style={{ borderRadius: 0 }} />
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-[0.16em] text-[rgba(0,0,0,0.4)] mb-1">Body</p>
          <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={4} className="w-full text-[14px] text-black border border-black px-3 py-2 resize-y outline-none bg-white leading-relaxed" style={{ borderRadius: 0 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-black p-4 flex flex-col gap-3 group" style={{ borderRadius: 0 }}>
      <div className="flex items-start justify-between gap-2">
        <NoteLabel />
        <div className="flex items-center gap-2 shrink-0">
          {onUpdate && (
            <button onClick={startEdit} className="text-[rgba(0,0,0,0.2)] hover:text-black text-sm transition-colors opacity-0 group-hover:opacity-100" title="Edit">✎</button>
          )}
          <button onClick={onSave} disabled={isSaved} className={`text-[11px] px-2 py-0.5 border transition-colors ${isSaved ? "text-[rgba(0,0,0,0.3)] border-[rgba(0,0,0,0.2)] cursor-default" : "text-black border-black hover:bg-black hover:text-white"}`} style={{ borderRadius: 0 }}>
            {isSaved ? "Saved" : "Save"}
          </button>
          <button onClick={onDismiss} className="text-[rgba(0,0,0,0.3)] hover:text-black text-lg leading-none transition-colors">×</button>
        </div>
      </div>
      <h3 className="text-[17px] text-black leading-snug">{card.title}</h3>
      {card.body && <p className="text-[14px] text-[#333232] leading-relaxed">{card.body}</p>}
    </div>
  );
}

function NoteLabel() {
  return <span className="text-[11px] uppercase tracking-[0.16em] text-[rgba(0,0,0,0.45)]">Note</span>;
}
