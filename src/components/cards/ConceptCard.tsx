"use client";

import { useState } from "react";
import type { ConceptCard as ConceptCardType, ResultCard } from "@/types";
import styles from "./ConceptCard.module.css";

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
      <p className="text-[9px] uppercase tracking-[0.16em] text-[rgba(0,0,0,0.4)] mb-1">{label}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className={`w-full text-[14px] text-black border border-black px-3 py-2 resize-y outline-none bg-white leading-relaxed ${styles.sq}`}
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
      <div className={`bg-white p-4 flex flex-col gap-3 ${styles.card}`}>
        <div className="flex items-center justify-between">
          <ConceptLabel />
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={commitEdit} className="text-[12px] text-white bg-black px-3 py-1 hover:opacity-70 transition-opacity">Save</button>
            <button onClick={cancelEdit} className="text-[12px] text-[rgba(0,0,0,0.45)] hover:text-black transition-colors">Cancel</button>
          </div>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-[0.16em] text-[rgba(0,0,0,0.4)] mb-1">Title</p>
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            className={`w-full text-[16px] text-black border border-black px-3 py-2 outline-none bg-white ${styles.sq}`}
          />
        </div>
        <EditField label="Description" value={draft.description} onChange={(v) => setDraft({ ...draft, description: v })} />
        <EditField label="Rationale" value={draft.rationale} onChange={(v) => setDraft({ ...draft, rationale: v })} rows={2} />
      </div>
    );
  }

  return (
    <div className={`bg-white p-4 flex flex-col gap-3 group ${styles.card}`}>
      <div className="flex items-start justify-between gap-2">
        <ConceptLabel />
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

      <h3 className="text-[17px] text-black leading-snug">{card.title}</h3>
      <p className="text-[14px] text-[#333232] leading-relaxed">{card.description}</p>

      <button onClick={() => setExpanded((e) => !e)} className="text-[12px] italic text-[rgba(0,0,0,0.45)] hover:text-black text-left transition-colors">
        {expanded ? "Hide rationale" : "Why this works →"}
      </button>

      {expanded && (
        <div className="pt-3 border-t border-[rgba(0,0,0,0.1)]">
          <p className="text-[9px] uppercase tracking-[0.16em] text-[rgba(0,0,0,0.4)] mb-1.5">Rationale</p>
          <p className="text-[14px] text-[#333232] leading-relaxed">{card.rationale}</p>
        </div>
      )}

      {onGenerateVisuals && (
        <div className="pt-2 border-t border-[rgba(0,0,0,0.1)]">
          <button
            onClick={onGenerateVisuals}
            className={`text-[12px] text-black border border-dashed border-[rgba(0,0,0,0.5)] hover:border-black px-3 py-1.5 transition-colors w-full ${styles.sq}`}
          >
            Generate Visuals →
          </button>
        </div>
      )}
    </div>
  );
}

function ConceptLabel() {
  return (
    <span className={`inline-flex items-center justify-center shrink-0 bg-white ${styles.label}`}>
      <span className={`text-[15px] text-black ${styles.labelText}`}>Concept</span>
    </span>
  );
}
