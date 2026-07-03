"use client";

import { useState } from "react";
import type { Highlight, ResultCard, VisualCard } from "@/types";
import styles from "./HighlightCard.module.css";

const TYPE_LABELS: Record<string, string> = {
  concept: "Concept",
  motif: "Motif",
  visual: "Visual",
  note: "Note",
};

function getSubtext(card: Highlight["card"]): string {
  if (card.type === "concept") return card.description;
  if (card.type === "motif") return card.visualQuality;
  if (card.type === "visual") return card.analysisText;
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
  const isVisual = card.type === "visual";

  const mainField = card.type === "concept" ? "description"
    : card.type === "motif" ? "visualQuality"
    : card.type === "visual" ? "analysisText"
    : "body";
  const mainLabel = card.type === "concept" ? "Description"
    : card.type === "motif" ? "Visual Quality"
    : card.type === "visual" ? "Analysis"
    : "Body";

  if (editingCard) {
    return (
      <div className={`bg-white border-2 border-black overflow-hidden ${styles.sq}`}>
        <div className="p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[9px] uppercase tracking-[0.16em] text-[rgba(0,0,0,0.45)]">
              {TYPE_LABELS[card.type] ?? card.type}
            </span>
            <div className="flex gap-3">
              <button
                onClick={() => { onUpdateCard?.(cardDraft); setEditingCard(false); }}
                className="text-[11px] text-black underline hover:no-underline"
              >Save</button>
              <button
                onClick={() => { setCardDraft(card); setEditingCard(false); }}
                className="text-[11px] text-[rgba(0,0,0,0.4)] hover:text-black"
              >Cancel</button>
            </div>
          </div>
          <input
            value={cardDraft.title}
            onChange={(e) => setCardDraft({ ...cardDraft, title: e.target.value } as ResultCard)}
            className={`text-[13px] text-black border border-black px-2 py-1.5 outline-none bg-white ${styles.sq}`}
          />
          <div>
            <p className="text-[9px] uppercase tracking-[0.14em] text-[rgba(0,0,0,0.4)] mb-0.5">{mainLabel}</p>
            <textarea
              value={((cardDraft as unknown) as Record<string, string>)[mainField] ?? ""}
              onChange={(e) => setCardDraft({ ...cardDraft, [mainField]: e.target.value } as ResultCard)}
              rows={3}
              className={`w-full text-[12px] text-[#333232] border border-black px-2 py-1.5 resize-y outline-none bg-white leading-relaxed ${styles.sq}`}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`overflow-hidden group ${styles.sq}`}
      style={{
        border: isHighlighted ? "1px solid rgba(201,168,76,0.8)" : "1px solid rgba(0,0,0,0.18)",
        borderLeft: isHighlighted ? "2.5px solid rgba(201,168,76,0.9)" : pinned ? "2.5px solid black" : "1px solid rgba(0,0,0,0.18)",
        background: isHighlighted ? "rgba(201,168,76,0.05)" : "white",
        transition: "border-color 0.2s ease, background 0.2s ease",
      }}
    >
      <div className="p-3 flex flex-col gap-2">
        {/* Header */}
        <div className="flex items-start gap-1.5">
          <span className="text-[9px] uppercase tracking-[0.16em] text-[rgba(0,0,0,0.45)] shrink-0 mt-0.5">
            {TYPE_LABELS[card.type] ?? card.type}
          </span>
          <span className="text-[13px] text-black flex-1 leading-snug">{card.title}</span>
          {onUpdateCard && (
            <button
              onClick={() => { setCardDraft(card); setEditingCard(true); }}
              className="text-[rgba(0,0,0,0.2)] hover:text-black text-xs leading-none shrink-0 ml-0.5 mt-0.5 transition-colors opacity-0 group-hover:opacity-100"
              title="Edit"
            >✎</button>
          )}
          <button onClick={onRemove} className="text-[rgba(0,0,0,0.2)] hover:text-black text-sm leading-none shrink-0 ml-1 mt-0.5 transition-colors">×</button>
        </div>

        {/* Image for visual cards */}
        {isVisual && (card as VisualCard).imageDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={(card as VisualCard).imageDataUrl}
            alt={card.title}
            className={`w-full object-cover object-top transition-all border border-[rgba(0,0,0,0.1)] ${styles.sq}`}
            style={{ maxHeight: expanded ? 200 : 96 }}
          />
        )}

        {/* Subtext */}
        {subtext && (
          <div>
            <p className={`text-[12px] text-[#333232] leading-relaxed ${expanded ? "" : styles.lineClamp}`}>
              {subtext}
            </p>
            {subtext.length > 90 && (
              <button onClick={() => setExpanded(!expanded)} className="text-[10px] italic text-[rgba(0,0,0,0.4)] hover:text-black mt-0.5 transition-colors">
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
              className={`text-[12px] border border-black px-2 py-1.5 resize-none outline-none text-black bg-white ${styles.sq}`}
              placeholder="Add a note…"
            />
            <div className="flex gap-2">
              <button onClick={() => { onUpdateNote(noteValue); setEditingNote(false); }} className="text-[11px] text-black underline">Save</button>
              <button onClick={() => { setNoteValue(note); setEditingNote(false); }} className="text-[11px] text-[rgba(0,0,0,0.4)] hover:text-black">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setEditingNote(true)} className="text-left text-[12px] italic transition-colors" style={{ color: note ? "#555" : "rgba(0,0,0,0.3)" }}>
            {note ? <>&ldquo;{note}&rdquo;</> : "+ note"}
          </button>
        )}

        {/* Controls */}
        <div className="flex items-center justify-between pt-1.5 border-t border-[rgba(0,0,0,0.08)]">
          <button onClick={onTogglePin} title={pinned ? "Unpin" : "Pin to top"} className={`text-[11px] transition-colors ${pinned ? "text-black" : "text-[rgba(0,0,0,0.25)] hover:text-[rgba(0,0,0,0.6)]"}`}>
            {pinned ? "★ pinned" : "☆ pin"}
          </button>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={includeInNextCall} onChange={onToggleInclude} className="w-3 h-3 accent-black" />
            <span className="text-[10px] uppercase tracking-[0.12em] text-[rgba(0,0,0,0.4)]">Include</span>
          </label>
        </div>
      </div>
    </div>
  );
}
