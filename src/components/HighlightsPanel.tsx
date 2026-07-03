"use client";

import { useState } from "react";
import type { Highlight, ResultCard } from "@/types";
import HighlightCard from "./HighlightCard";
import styles from "./HighlightsPanel.module.css";

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
  onCollapse?: () => void;
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
  onCollapse,
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
      className="h-full flex flex-col overflow-hidden"
      style={{
        background: isDragOver ? "#f5f4f0" : "#ffffff",
        borderLeft: `1px solid ${isDragOver ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.1)"}`,
        transition: "background 0.15s ease, border-color 0.15s ease",
      }}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={(e) => {
        if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDragOver(false);
      }}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className={`px-5 pt-5 pb-4 shrink-0 sticky top-0 z-10 bg-inherit ${styles.header}`}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-[18px] text-black">Highlights</h2>
          <div className="flex items-center gap-3">
            {highlights.length > 0 && (
              <span className="text-[11px] text-[rgba(0,0,0,0.4)] italic">{included}/{highlights.length} included</span>
            )}
            <button
              onClick={() => setAddingNote((v) => !v)}
              className={`text-[12px] text-black border border-dashed border-[rgba(0,0,0,0.5)] px-2.5 py-0.5 hover:border-black transition-colors ${styles.sq}`}
            >
              + Note
            </button>
            {onCollapse && (
              <button
                onClick={onCollapse}
                className={`text-[rgba(0,0,0,0.3)] hover:text-black transition-colors ${styles.collapseBtn}`}
                title="Hide panel"
              >›</button>
            )}
          </div>
        </div>
        <p className="text-[11px] italic" style={{ color: isDragOver ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.3)" }}>
          {isDragOver ? "Drop to save →" : "Drag cards here · included → next call"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2">
        {/* Add note inline form */}
        {addingNote && (
          <div className={`border border-black p-3 bg-white flex flex-col gap-2 ${styles.sq}`}>
            <input
              autoFocus
              placeholder="Title…"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitNote()}
              className={`text-[14px] border border-[rgba(0,0,0,0.3)] px-2.5 py-1.5 outline-none focus:border-black bg-white text-black ${styles.sq}`}
            />
            <textarea
              placeholder="Write something…"
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              rows={2}
              className={`text-[13px] border border-[rgba(0,0,0,0.3)] px-2.5 py-1.5 resize-none outline-none focus:border-black bg-white text-[#333232] ${styles.sq}`}
            />
            <div className="flex gap-3">
              <button onClick={submitNote} className="text-[12px] text-white bg-black hover:opacity-70 px-3 py-1 transition-opacity">Add</button>
              <button onClick={() => { setAddingNote(false); setNoteTitle(""); setNoteBody(""); }} className="text-[12px] text-[rgba(0,0,0,0.45)] hover:text-black transition-colors">Cancel</button>
            </div>
          </div>
        )}

        {sorted.length === 0 && !addingNote ? (
          <div
            className="flex flex-col items-center justify-center border border-dashed text-center py-16 mt-4 transition-all duration-150"
            style={{
              borderColor: isDragOver ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.2)",
              background: isDragOver ? "#f5f4f0" : "transparent",
            }}
          >
            {isDragOver ? (
              <p className="text-[15px] text-black italic">Release to save</p>
            ) : (
              <>
                <p className="text-[14px] text-[rgba(0,0,0,0.3)] italic">No highlights yet.</p>
                <p className="text-[12px] text-[rgba(0,0,0,0.25)] mt-1">Drag cards here or save from results.</p>
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
