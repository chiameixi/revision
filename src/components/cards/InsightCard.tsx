"use client";

import { useState } from "react";
import type { InsightCard as InsightCardType } from "@/types";

interface Props {
  card: InsightCardType;
  isSaved: boolean;
  onSave: () => void;
  onDismiss: () => void;
  onUpdate?: (card: InsightCardType) => void;
}

function EditField({ label, value, onChange, multiline }: {
  label: string; value: string; onChange: (v: string) => void; multiline?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-[#888] mb-0.5">{label}</p>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full text-sm text-[#111] border border-[#111] rounded px-3 py-2 resize-y outline-none focus:ring-1 focus:ring-black bg-white leading-relaxed"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full text-[15px] text-[#111] border border-[#111] rounded px-3 py-2 outline-none focus:ring-1 focus:ring-black bg-white"
        />
      )}
    </div>
  );
}

export default function InsightCard({ card, isSaved, onSave, onDismiss, onUpdate }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(card);

  function startEdit() { setDraft(card); setIsEditing(true); }
  function cancelEdit() { setDraft(card); setIsEditing(false); }
  function commitEdit() { onUpdate?.(draft); setIsEditing(false); }

  if (isEditing) {
    return (
      <div className="bg-white border-2 border-[#111] rounded p-4 flex flex-col gap-3" style={{ boxShadow: "3px 3px 0px #111" }}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest bg-[#111] text-white px-2 py-0.5 rounded-sm">Insight</span>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={commitEdit} className="text-xs font-medium text-white bg-[#111] px-2.5 py-1 rounded-sm hover:bg-[#333] transition-colors">Save</button>
            <button onClick={cancelEdit} className="text-xs text-[#888] hover:text-[#111] transition-colors">Cancel</button>
          </div>
        </div>
        <EditField label="Title" value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })} />
        <EditField label="Summary" value={draft.summary} onChange={(v) => setDraft({ ...draft, summary: v })} multiline />
        <EditField label="Evidence" value={draft.evidence} onChange={(v) => setDraft({ ...draft, evidence: v })} multiline />
        <EditField label="Implication" value={draft.implication} onChange={(v) => setDraft({ ...draft, implication: v })} multiline />
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#111] rounded p-4 flex flex-col gap-3 group hover:shadow-[2px_2px_0px_#111] transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest bg-[#111] text-white px-2 py-0.5 rounded-sm shrink-0">Insight</span>
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
      <p className="text-sm text-[#444] leading-relaxed">{card.summary}</p>

      {card.evidence && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[#888] mb-0.5">Evidence</p>
          <p className="text-sm text-[#555] leading-relaxed">{card.evidence}</p>
        </div>
      )}
      {card.implication && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[#888] mb-0.5">Implication</p>
          <p className="text-sm text-[#444] leading-relaxed">{card.implication}</p>
        </div>
      )}
    </div>
  );
}
