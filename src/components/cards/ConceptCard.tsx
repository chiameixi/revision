"use client";

import { useState } from "react";
import type { ConceptCard as ConceptCardType } from "@/types";

interface Props {
  card: ConceptCardType;
  isSaved: boolean;
  onSave: () => void;
  onDismiss: () => void;
  onUpdate?: (card: ConceptCardType) => void;
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
          rows={2}
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

export default function ConceptCard({ card, isSaved, onSave, onDismiss, onUpdate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(card);

  function startEdit() { setDraft(card); setIsEditing(true); }
  function cancelEdit() { setDraft(card); setIsEditing(false); }
  function commitEdit() { onUpdate?.(draft); setIsEditing(false); }

  if (isEditing) {
    return (
      <div className="bg-white border-2 border-[#111] rounded p-4 flex flex-col gap-3" style={{ boxShadow: "3px 3px 0px #111" }}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest bg-[#111] text-white px-2 py-0.5 rounded-sm">Concept</span>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={commitEdit} className="text-xs font-medium text-white bg-[#111] px-2.5 py-1 rounded-sm hover:bg-[#333] transition-colors">Save</button>
            <button onClick={cancelEdit} className="text-xs text-[#888] hover:text-[#111] transition-colors">Cancel</button>
          </div>
        </div>
        <EditField label="Title" value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })} />
        <EditField label="Core idea" value={draft.coreIdea} onChange={(v) => setDraft({ ...draft, coreIdea: v })} multiline />
        <EditField label="Interaction direction" value={draft.interactionDirection} onChange={(v) => setDraft({ ...draft, interactionDirection: v })} multiline />
        <EditField label="Visual direction" value={draft.visualDirection} onChange={(v) => setDraft({ ...draft, visualDirection: v })} multiline />
        <EditField label="Best for" value={draft.bestFor} onChange={(v) => setDraft({ ...draft, bestFor: v })} multiline />
        <EditField label="Risks" value={draft.risks} onChange={(v) => setDraft({ ...draft, risks: v })} multiline />
        <EditField label="Next step" value={draft.nextStep} onChange={(v) => setDraft({ ...draft, nextStep: v })} multiline />
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#111] rounded p-4 flex flex-col gap-3 group hover:shadow-[2px_2px_0px_#111] transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest bg-[#111] text-white px-2 py-0.5 rounded-sm shrink-0">Concept</span>
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
      <p className="text-sm text-[#444] leading-relaxed">{card.coreIdea}</p>

      <button onClick={() => setExpanded((e) => !e)} className="text-xs text-[#555] hover:text-[#111] underline text-left">
        {expanded ? "Show less" : "Show more"}
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 pt-1 border-t border-[#ddd]">
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
      <p className="text-[10px] uppercase tracking-widest text-[#888] mb-0.5">{label}</p>
      <p className="text-sm text-[#444] leading-relaxed">{value}</p>
    </div>
  );
}
