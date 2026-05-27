"use client";

import { useState } from "react";
import type { Highlight, ResultCard } from "@/types";
import HighlightCard from "./HighlightCard";

interface Props {
  highlights: Highlight[];
  onRemove: (id: string) => void;
  onToggleInclude: (id: string) => void;
  onTogglePin: (id: string) => void;
  onUpdateNote: (id: string, note: string) => void;
  onUpdateCard: (card: ResultCard) => void;
  onDropCard: (card: ResultCard) => void;
  onAddNote: (title: string, body: string) => void;
  hoveredSourceIds?: Set<string>;
}

export default function HighlightsPanel({
  highlights,
  onRemove,
  onToggleInclude,
  onTogglePin,
  onUpdateNote,
  onUpdateCard,
  onDropCard,
  onAddNote,
  hoveredSourceIds,
}: Props) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");

  const sorted = [...highlights].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return a.orderIndex - b.orderIndex;
  });

  const included = sorted.filter((h) => h.includeInNextCall).length;

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    try {
      const raw = e.dataTransfer.getData("card-drag");
      if (raw) {
        const { card } = JSON.parse(raw) as { card: ResultCard };
        onDropCard(card);
      }
    } catch {}
  }

  function submitNote() {
    if (!noteTitle.trim()) return;
    onAddNote(noteTitle.trim(), noteBody.trim());
    setNoteTitle("");
    setNoteBody("");
    setAddingNote(false);
  }

  return (
    <aside
      className="w-72 shrink-0 h-screen flex flex-col border-l overflow-hidden transition-all duration-150"
      style={{
        background: isDragOver ? "#f5f5f4" : "#ffffff",
        borderColor: isDragOver ? "#111" : "#ccc9c0",
      }}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={(e) => {
        if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDragOver(false);
      }}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="px-4 pt-5 pb-3 border-b shrink-0 sticky top-0 z-10 bg-inherit" style={{ borderColor: "#ccc9c0" }}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm text-[#111]">Highlights</h2>
          <div className="flex items-center gap-2">
            {highlights.length > 0 && (
              <span className="text-[10px] text-[#888]">{included}/{highlights.length} included</span>
            )}
            <button
              onClick={() => setAddingNote((v) => !v)}
              className="text-[11px] text-[#111] border border-[#111] px-2 py-0.5 rounded-sm hover:bg-[#111] hover:text-white transition-colors"
            >
              + Note
            </button>
          </div>
        </div>
        <p className="text-[11px]" style={{ color: isDragOver ? "#111" : "#aaa" }}>
          {isDragOver ? "Drop to save →" : "Drag cards here · included → next call"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
        {/* Add note inline form */}
        {addingNote && (
          <div className="border border-[#111] rounded p-3 bg-white flex flex-col gap-2">
            <input
              autoFocus
              placeholder="Title…"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitNote()}
              className="text-[12px] border border-[#ccc] rounded px-2.5 py-1.5 outline-none focus:border-[#111] bg-white text-[#111]"
            />
            <textarea
              placeholder="Write something…"
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              rows={2}
              className="text-[11px] border border-[#ccc] rounded px-2.5 py-1.5 resize-none outline-none focus:border-[#111] bg-white text-[#444]"
            />
            <div className="flex gap-2">
              <button onClick={submitNote} className="text-[11px] text-white bg-[#111] hover:bg-[#333] rounded px-3 py-1 transition-colors">Add</button>
              <button onClick={() => { setAddingNote(false); setNoteTitle(""); setNoteBody(""); }} className="text-[11px] text-[#888] hover:text-[#111] transition-colors">Cancel</button>
            </div>
          </div>
        )}

        {sorted.length === 0 && !addingNote ? (
          <div
            className="flex flex-col items-center justify-center rounded border-2 border-dashed text-center py-16 mt-4 transition-all duration-150"
            style={{
              borderColor: isDragOver ? "#111" : "#ccc9c0",
              background: isDragOver ? "#f5f5f4" : "transparent",
            }}
          >
            {isDragOver ? (
              <p className="text-sm text-[#111]">Release to save</p>
            ) : (
              <>
                <p className="text-sm text-[#bbb]">No highlights yet.</p>
                <p className="text-xs text-[#ccc] mt-1">Drag cards here or save from results.</p>
              </>
            )}
          </div>
        ) : (
          sorted.map((h) => (
            <HighlightCard
              key={h.id}
              highlight={h}
              onRemove={() => onRemove(h.id)}
              onToggleInclude={() => onToggleInclude(h.id)}
              onTogglePin={() => onTogglePin(h.id)}
              onUpdateNote={(note) => onUpdateNote(h.id, note)}
              onUpdateCard={onUpdateCard}
              isHighlighted={hoveredSourceIds?.has(h.card.id)}
            />
          ))
        )}
      </div>
    </aside>
  );
}
