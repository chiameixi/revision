"use client";

import { useState } from "react";
import type { Highlight, ResultCard } from "@/types";

const TYPE_LABELS: Record<string, string> = {
  insight: "Insight",
  visual_variation: "Visual",
  conceptual_variation: "Conceptual",
  concept: "Concept",
  note: "Note",
};

function getSubtext(card: Highlight["card"]): string {
  if (card.type === "insight") return card.summary;
  if (card.type === "visual_variation") return card.analysisText;
  if (card.type === "conceptual_variation") return card.coreIdea;
  if (card.type === "concept") return card.coreIdea;
  if (card.type === "note") return card.body;
  return "";
}

interface Props {
  highlight: Highlight;
  onRemove: () => void;
  onToggleInclude: () => void;
  onTogglePin: () => void;
  onUpdateNote: (note: string) => void;
  onUpdateCard?: (card: ResultCard) => void;
  isHighlighted?: boolean;
}

export default function HighlightCard({
  highlight,
  onRemove,
  onToggleInclude,
  onTogglePin,
  onUpdateNote,
  onUpdateCard,
  isHighlighted = false,
}: Props) {
  const { card, note, pinned, includeInNextCall } = highlight;
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(note);
  const [expanded, setExpanded] = useState(false);
  const [editingCard, setEditingCard] = useState(false);
  const [cardDraft, setCardDraft] = useState(card);

  const subtext = getSubtext(card);
  const isVisual = card.type === "visual_variation";

  if (editingCard) {
    const mainField = card.type === "insight" ? "summary"
      : card.type === "visual_variation" ? "analysisText"
      : card.type === "conceptual_variation" ? "coreIdea"
      : card.type === "concept" ? "coreIdea"
      : "body";
    const mainLabel = card.type === "insight" ? "Summary"
      : card.type === "visual_variation" ? "Analysis"
      : card.type === "conceptual_variation" ? "Core idea"
      : card.type === "concept" ? "Core idea"
      : "Body";
    return (
      <div className="rounded bg-white border-2 border-[#111] overflow-hidden" style={{ borderLeft: `3px solid #111` }}>
        <div className="p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[8px] uppercase tracking-widest px-1.5 py-0.5 rounded-sm bg-[#111] text-white">
              {TYPE_LABELS[card.type] ?? card.type}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => { onUpdateCard?.(cardDraft); setEditingCard(false); }}
                className="text-[10px] text-[#111] underline hover:no-underline"
              >Save</button>
              <button
                onClick={() => { setCardDraft(card); setEditingCard(false); }}
                className="text-[10px] text-[#888] hover:text-[#111]"
              >Cancel</button>
            </div>
          </div>
          <input
            value={cardDraft.title}
            onChange={(e) => setCardDraft({ ...cardDraft, title: e.target.value } as ResultCard)}
            className="text-[11px] text-[#111] border border-[#111] rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-black bg-white"
          />
          <div>
            <p className="text-[9px] uppercase tracking-widest text-[#888] mb-0.5">{mainLabel}</p>
            <textarea
              value={((cardDraft as unknown) as Record<string, string>)[mainField] ?? ""}
              onChange={(e) => setCardDraft({ ...cardDraft, [mainField]: e.target.value } as ResultCard)}
              rows={3}
              className="w-full text-[11px] text-[#444] border border-[#111] rounded px-2 py-1.5 resize-y outline-none focus:ring-1 focus:ring-black bg-white leading-relaxed"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded overflow-hidden group"
      style={{
        border: `1px solid ${isHighlighted ? "#f59e0b" : "#111"}`,
        borderLeft: `3px solid ${isHighlighted ? "#f59e0b" : pinned ? "#111" : "#555"}`,
        boxShadow: isHighlighted ? "0 0 0 3px rgba(251,191,36,0.25)" : undefined,
        background: isHighlighted ? "#fffbeb" : "white",
        transition: "border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease",
      }}
    >
      <div className="p-3 flex flex-col gap-2">
        {/* Header */}
        <div className="flex items-start gap-1.5">
          <span className="text-[8px] uppercase tracking-widest px-1.5 py-0.5 rounded-sm shrink-0 mt-0.5 bg-[#111] text-white">
            {TYPE_LABELS[card.type] ?? card.type}
          </span>
          <span className="text-[11px] text-[#111] flex-1 leading-snug">{card.title}</span>
          {onUpdateCard && (
            <button
              onClick={() => { setCardDraft(card); setEditingCard(true); }}
              className="text-[#ccc] hover:text-[#111] text-xs leading-none shrink-0 ml-0.5 mt-0.5 transition-colors opacity-0 group-hover:opacity-100"
              title="Edit"
            >✎</button>
          )}
          <button onClick={onRemove} className="text-[#ccc] hover:text-[#111] text-sm leading-none shrink-0 ml-1 mt-0.5 transition-colors">×</button>
        </div>

        {/* Image for visual cards */}
        {isVisual && card.imageDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.imageDataUrl}
            alt={card.title}
            className="w-full rounded object-cover transition-all border border-[#eee]"
            style={{ maxHeight: expanded ? 200 : 96, objectPosition: "top" }}
          />
        )}

        {/* Subtext */}
        {subtext && (
          <div>
            <p
              className="text-[11px] text-[#555] leading-relaxed"
              style={expanded ? {} : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
            >
              {subtext}
            </p>
            {subtext.length > 90 && (
              <button onClick={() => setExpanded(!expanded)} className="text-[9px] text-[#999] hover:text-[#111] mt-0.5 transition-colors underline">
                {expanded ? "less" : "more"}
              </button>
            )}
          </div>
        )}

        {/* Note */}
        {editingNote ? (
          <div className="flex flex-col gap-1">
            <textarea
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
              rows={2}
              autoFocus
              className="text-[11px] border border-[#111] rounded px-2 py-1.5 resize-none outline-none focus:ring-1 focus:ring-black text-[#111] bg-white"
              placeholder="Add a note…"
            />
            <div className="flex gap-2">
              <button onClick={() => { onUpdateNote(noteValue); setEditingNote(false); }} className="text-[10px] text-[#111] underline">Save</button>
              <button onClick={() => { setNoteValue(note); setEditingNote(false); }} className="text-[10px] text-[#888] hover:text-[#111]">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setEditingNote(true)} className="text-left text-[11px] transition-colors" style={{ color: note ? "#333" : "#bbb" }}>
            {note ? <span className="italic text-[#555]">&ldquo;{note}&rdquo;</span> : "+ note"}
          </button>
        )}

        {/* Controls */}
        <div className="flex items-center justify-between pt-1.5 border-t border-[#eee]">
          <button
            onClick={onTogglePin}
            title={pinned ? "Unpin" : "Pin to top"}
            className={`text-[11px] transition-colors ${pinned ? "text-[#111]" : "text-[#ccc] hover:text-[#555]"}`}
          >
            {pinned ? "★ pinned" : "☆ pin"}
          </button>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={includeInNextCall}
              onChange={onToggleInclude}
              className="w-3 h-3 accent-black"
            />
            <span className="text-[10px] text-[#888]">Include</span>
          </label>
        </div>
      </div>
    </div>
  );
}
