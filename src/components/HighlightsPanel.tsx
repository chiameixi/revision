"use client";

import type { Highlight } from "@/types";
import HighlightCard from "./HighlightCard";

interface Props {
  highlights: Highlight[];
  onRemove: (id: string) => void;
  onToggleInclude: (id: string) => void;
  onTogglePin: (id: string) => void;
  onUpdateNote: (id: string, note: string) => void;
}

export default function HighlightsPanel({
  highlights,
  onRemove,
  onToggleInclude,
  onTogglePin,
  onUpdateNote,
}: Props) {
  const sorted = [...highlights].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return a.orderIndex - b.orderIndex;
  });

  return (
    <aside className="w-72 shrink-0 h-screen flex flex-col bg-white border-l border-[#e4e3e0] overflow-y-auto">
      <div className="px-4 pt-5 pb-3 border-b border-[#e4e3e0] sticky top-0 bg-white z-10">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#111]">Highlights</h2>
          <span className="text-xs text-[#aaa]">{highlights.length}</span>
        </div>
        <p className="text-[11px] text-[#aaa] mt-0.5">
          Saved cards marked &quot;include&quot; will be added to your next call.
        </p>
      </div>

      <div className="flex-1 px-3 py-3 flex flex-col gap-2">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center">
            <p className="text-sm text-[#bbb]">No highlights yet.</p>
            <p className="text-xs text-[#ccc] mt-1">Save cards from the results to see them here.</p>
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
            />
          ))
        )}
      </div>
    </aside>
  );
}
