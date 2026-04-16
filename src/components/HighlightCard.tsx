"use client";

import { useState } from "react";
import type { Highlight } from "@/types";

interface Props {
  highlight: Highlight;
  onRemove: () => void;
  onToggleInclude: () => void;
  onTogglePin: () => void;
  onUpdateNote: (note: string) => void;
}

const TYPE_COLORS: Record<string, string> = {
  insight: "text-[#666] bg-[#f5f4f1]",
  visual_variation: "text-blue-700 bg-blue-50",
  conceptual_variation: "text-emerald-700 bg-emerald-50",
  concept: "text-violet-700 bg-violet-50",
};

const TYPE_LABELS: Record<string, string> = {
  insight: "Insight",
  visual_variation: "Visual",
  conceptual_variation: "Conceptual",
  concept: "Concept",
};

export default function HighlightCard({ highlight, onRemove, onToggleInclude, onTogglePin, onUpdateNote }: Props) {
  const { card, note, pinned, includeInNextCall } = highlight;
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(note);

  function saveNote() {
    onUpdateNote(noteValue);
    setEditingNote(false);
  }

  return (
    <div className={`border rounded-xl p-3 flex flex-col gap-2 transition-colors ${pinned ? "border-[#f5c842] bg-[#fffdf0]" : "border-[#e4e3e0] bg-white"}`}>
      {/* Header row */}
      <div className="flex items-start gap-1.5">
        <span className={`text-[9px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0 ${TYPE_COLORS[card.type]}`}>
          {TYPE_LABELS[card.type]}
        </span>
        <span className="text-xs font-medium text-[#222] flex-1 leading-tight line-clamp-2">{card.title}</span>
        <button onClick={onRemove} className="text-[#ccc] hover:text-[#999] text-base leading-none shrink-0 ml-1">×</button>
      </div>

      {/* Thumbnail for visual variations */}
      {card.type === "visual_variation" && card.imageDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.imageDataUrl} alt={card.title} className="w-full rounded-lg object-contain border border-[#e4e3e0]" />
      )}

      {/* Summary/core idea */}
      <p className="text-xs text-[#666] leading-relaxed line-clamp-3">
        {card.type === "insight" ? card.summary
          : card.type === "visual_variation" ? card.analysisText
          : card.type === "conceptual_variation" ? card.coreIdea
          : card.coreIdea}
      </p>

      {/* Note */}
      {editingNote ? (
        <div className="flex flex-col gap-1">
          <textarea
            value={noteValue}
            onChange={(e) => setNoteValue(e.target.value)}
            rows={2}
            autoFocus
            className="text-xs border border-[#e4e3e0] rounded-lg px-2 py-1.5 resize-none outline-none focus:border-[#2563eb]/40 text-[#333]"
            placeholder="Add a note..."
          />
          <div className="flex gap-1.5">
            <button onClick={saveNote} className="text-[11px] text-[#2563eb] hover:underline">Save</button>
            <button onClick={() => { setNoteValue(note); setEditingNote(false); }} className="text-[11px] text-[#aaa] hover:underline">Cancel</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setEditingNote(true)}
          className="text-[11px] text-left text-[#aaa] hover:text-[#2563eb] transition-colors"
        >
          {note ? note : "+ Add note"}
        </button>
      )}

      {/* Controls */}
      <div className="flex items-center justify-between pt-1 border-t border-[#f0efec]">
        <button
          onClick={onTogglePin}
          title={pinned ? "Unpin" : "Pin"}
          className={`text-[11px] transition-colors ${pinned ? "text-yellow-500" : "text-[#ccc] hover:text-yellow-400"}`}
        >
          {pinned ? "★ Pinned" : "☆ Pin"}
        </button>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={includeInNextCall}
            onChange={onToggleInclude}
            className="w-3 h-3 accent-[#2563eb]"
          />
          <span className="text-[11px] text-[#888]">Include in next call</span>
        </label>
      </div>
    </div>
  );
}
