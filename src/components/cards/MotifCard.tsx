"use client";

import { useState } from "react";
import type { MotifCard as MotifCardType, ResultCard } from "@/types";
import cls from "./MotifCard.module.css";

interface Props {
  card: MotifCardType;
  isSaved: boolean;
  onSave: () => void;
  onDismiss: () => void;
  onUpdate?: (card: ResultCard) => void;
}

const CORNER_CLASS: Record<"tl" | "tr" | "bl" | "br", string> = {
  tl: cls.cornerTL,
  tr: cls.cornerTR,
  bl: cls.cornerBL,
  br: cls.cornerBR,
};

function CornerMark({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  return <span className={`${cls.corner} ${CORNER_CLASS[pos]}`} />;
}

function MotifLabel({ category }: { category?: string }) {
  return (
    <span className="inline-flex items-center gap-2 shrink-0">
      <span className={`text-[15px] text-black ${cls.labelText}`}>Motif</span>
      {category && (
        <span className="text-[12px] text-[rgba(0,0,0,0.45)] not-italic">&middot; {category}</span>
      )}
    </span>
  );
}

export default function MotifCard({ card, isSaved, onSave, onDismiss, onUpdate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(card);

  function startEdit() { setDraft(card); setIsEditing(true); }
  function cancelEdit() { setDraft(card); setIsEditing(false); }
  function commitEdit() { onUpdate?.(draft); setIsEditing(false); }

  if (isEditing) {
    return (
      <div className="relative bg-white p-4 flex flex-col gap-3">
        <CornerMark pos="tl" /><CornerMark pos="tr" />
        <CornerMark pos="bl" /><CornerMark pos="br" />
        <div className="flex items-center justify-between">
          <MotifLabel category={card.category} />
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
            className={`w-full text-[16px] text-black border border-black px-3 py-2 outline-none bg-white ${cls.sq}`}
          />
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-[0.16em] text-[rgba(0,0,0,0.4)] mb-1">Visual Quality</p>
          <textarea
            value={draft.visualQuality}
            onChange={(e) => setDraft({ ...draft, visualQuality: e.target.value })}
            rows={2}
            className={`w-full text-[14px] text-black border border-black px-3 py-2 resize-y outline-none bg-white leading-relaxed ${cls.sq}`}
          />
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-[0.16em] text-[rgba(0,0,0,0.4)] mb-1">How It Conveys The Idea</p>
          <textarea
            value={draft.howItConveysIdea}
            onChange={(e) => setDraft({ ...draft, howItConveysIdea: e.target.value })}
            rows={2}
            className={`w-full text-[14px] text-black border border-black px-3 py-2 resize-y outline-none bg-white leading-relaxed ${cls.sq}`}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative bg-white p-4 flex flex-col gap-3 group">
      <CornerMark pos="tl" /><CornerMark pos="tr" />
      <CornerMark pos="bl" /><CornerMark pos="br" />
      <div className="flex items-start justify-between gap-2">
        <MotifLabel category={card.category} />
        <div className="flex items-center gap-2 shrink-0">
          {onUpdate && (
            <button onClick={startEdit} className="text-[rgba(0,0,0,0.2)] hover:text-black text-sm transition-colors opacity-0 group-hover:opacity-100" title="Edit">✎</button>
          )}
          <button
            onClick={onSave}
            disabled={isSaved}
            className={`text-[11px] px-2 py-0.5 border transition-colors ${cls.sq} ${
              isSaved ? "text-[rgba(0,0,0,0.3)] border-[rgba(0,0,0,0.2)] cursor-default" : "text-black border-black hover:bg-black hover:text-white"
            }`}
          >
            {isSaved ? "Saved" : "Save"}
          </button>
          <button onClick={onDismiss} className="text-[rgba(0,0,0,0.3)] hover:text-black text-lg leading-none transition-colors">×</button>
        </div>
      </div>

      <h3 className="text-[17px] text-black leading-snug">{card.title}</h3>
      <p className="text-[14px] text-[#333232] leading-relaxed">{card.visualQuality}</p>

      <button onClick={() => setExpanded((e) => !e)} className="text-[12px] italic text-[rgba(0,0,0,0.45)] hover:text-black underline text-left transition-colors">
        {expanded ? "Hide connection" : "Why it works →"}
      </button>

      {expanded && (
        <div className="pt-3 border-t border-[rgba(0,0,0,0.1)]">
          <p className="text-[9px] uppercase tracking-[0.16em] text-[rgba(0,0,0,0.4)] mb-1.5">How It Conveys The Idea</p>
          <p className="text-[14px] text-[#333232] leading-relaxed">{card.howItConveysIdea}</p>
        </div>
      )}
    </div>
  );
}
