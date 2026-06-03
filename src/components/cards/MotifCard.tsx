"use client";

/**
 * src/components/cards/MotifCard.tsx
 *
 * Responsibility: Renders a single motif card — a reusable visual element or
 * quality extracted from draft/reference images by the `analyze` action.
 *
 * Fields: title, category badge (color-coded by type), visualQuality (always
 * visible), and howItConveysIdea (collapsible behind "Why it works").
 *
 * The category badge uses `CATEGORY_COLORS` to give each visual dimension a
 * distinct hue, making it easy to scan which domain a motif belongs to
 * (color, texture, form, composition, subject, style, typography).
 *
 * Supports the same inline edit pattern as ConceptCard.
 */

import { useState } from "react";
import type { MotifCard as MotifCardType, ResultCard } from "@/types";

const CATEGORY_COLORS: Record<string, string> = {
  color: "#dc2626",
  texture: "#b45309",
  form: "#7c3aed",
  composition: "#2563eb",
  subject: "#059669",
  style: "#0891b2",
  typography: "#4f46e5",
};

interface Props {
  card: MotifCardType;
  isSaved: boolean;
  onSave: () => void;
  onDismiss: () => void;
  onUpdate?: (card: ResultCard) => void;
}

export default function MotifCard({ card, isSaved, onSave, onDismiss, onUpdate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(card);

  function startEdit() { setDraft(card); setIsEditing(true); }
  function cancelEdit() { setDraft(card); setIsEditing(false); }
  function commitEdit() { onUpdate?.(draft); setIsEditing(false); }

  const catColor = CATEGORY_COLORS[card.category?.toLowerCase()] ?? "#166534";

  if (isEditing) {
    return (
      <div className="bg-[#f0fdf4] border-2 border-[#166534] rounded p-4 flex flex-col gap-3" style={{ boxShadow: "3px 3px 0px #166534" }}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest bg-[#166534] text-white px-2 py-0.5 rounded-sm">Motif</span>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={commitEdit} className="text-xs font-medium text-white bg-[#166534] px-2.5 py-1 rounded-sm hover:bg-[#14532d] transition-colors">Save</button>
            <button onClick={cancelEdit} className="text-xs text-[#888] hover:text-[#111] transition-colors">Cancel</button>
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[#888] mb-0.5">Title</p>
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            className="w-full text-[15px] text-[#111] border border-[#166534] rounded px-3 py-2 outline-none focus:ring-1 focus:ring-[#166534] bg-white"
          />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[#888] mb-0.5">Visual Quality</p>
          <textarea
            value={draft.visualQuality}
            onChange={(e) => setDraft({ ...draft, visualQuality: e.target.value })}
            rows={2}
            className="w-full text-sm text-[#111] border border-[#166634] rounded px-3 py-2 resize-y outline-none focus:ring-1 focus:ring-[#166534] bg-white leading-relaxed"
          />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[#888] mb-0.5">How It Conveys The Idea</p>
          <textarea
            value={draft.howItConveysIdea}
            onChange={(e) => setDraft({ ...draft, howItConveysIdea: e.target.value })}
            rows={2}
            className="w-full text-sm text-[#111] border border-[#166634] rounded px-3 py-2 resize-y outline-none focus:ring-1 focus:ring-[#166534] bg-white leading-relaxed"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#f0fdf4] border border-[#16a34a] rounded p-4 flex flex-col gap-3 group hover:shadow-[2px_2px_0px_#166534] transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest bg-[#166534] text-white px-2 py-0.5 rounded-sm shrink-0">Motif</span>
          {card.category && (
            <span
              className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border font-medium"
              style={{ color: catColor, borderColor: catColor, background: `${catColor}14` }}
            >
              {card.category}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {onUpdate && (
            <button onClick={startEdit} className="text-[#ccc] hover:text-[#166534] text-sm transition-colors opacity-0 group-hover:opacity-100" title="Edit">✎</button>
          )}
          <button
            onClick={onSave}
            disabled={isSaved}
            className={`text-xs px-2.5 py-1 rounded-sm border transition-colors ${
              isSaved ? "text-[#aaa] border-[#ccc] cursor-default" : "text-[#166534] border-[#166534] hover:bg-[#166534] hover:text-white"
            }`}
          >
            {isSaved ? "Saved" : "Save"}
          </button>
          <button onClick={onDismiss} className="text-[#bbb] hover:text-[#111] text-lg leading-none">×</button>
        </div>
      </div>

      <h3 className="text-[15px] text-[#111] leading-snug">{card.title}</h3>
      <p className="text-sm text-[#444] leading-relaxed">{card.visualQuality}</p>

      <button onClick={() => setExpanded((e) => !e)} className="text-xs text-[#999] hover:text-[#166534] underline text-left transition-colors">
        {expanded ? "Hide connection" : "Why it works"}
      </button>

      {expanded && (
        <div className="pt-2 border-t border-[#bbf7d0]">
          <p className="text-[10px] uppercase tracking-widest text-[#166534] mb-1">How It Conveys The Idea</p>
          <p className="text-sm text-[#555] leading-relaxed">{card.howItConveysIdea}</p>
        </div>
      )}
    </div>
  );
}
