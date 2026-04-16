"use client";

import { useRef } from "react";
import type { Asset } from "@/types";

interface Props {
  title: string;
  brief: string;
  assets: Asset[];
  onTitleChange: (v: string) => void;
  onBriefChange: (v: string) => void;
  onAddAsset: (asset: Asset) => void;
  onRemoveAsset: (id: string) => void;
}

export default function InputsSidebar({
  title,
  brief,
  assets,
  onTitleChange,
  onBriefChange,
  onAddAsset,
  onRemoveAsset,
}: Props) {
  const draftInput = useRef<HTMLInputElement>(null);
  const refInput = useRef<HTMLInputElement>(null);

  const drafts = assets.filter((a) => a.type === "draft");
  const refs = assets.filter((a) => a.type === "reference");

  function handleFileUpload(type: "draft" | "reference") {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
          onAddAsset({
            id: crypto.randomUUID(),
            type,
            fileName: file.name,
            dataUrl: reader.result as string,
            note: "",
          });
        };
        reader.readAsDataURL(file);
      });
      e.target.value = "";
    };
  }

  return (
    <aside className="w-72 shrink-0 h-screen flex flex-col bg-white border-r border-[#e4e3e0] overflow-y-auto">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 border-b border-[#e4e3e0]">
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          className="w-full text-sm font-semibold text-[#111] bg-transparent outline-none placeholder-[#aaa]"
          placeholder="Project title"
        />
      </div>

      {/* Brief */}
      <section className="px-4 py-4 border-b border-[#e4e3e0]">
        <label className="text-[10px] font-semibold uppercase tracking-widest text-[#aaa] block mb-2">
          Design Brief
        </label>
        <textarea
          value={brief}
          onChange={(e) => onBriefChange(e.target.value)}
          placeholder="Describe your design challenge, target users, goals, constraints..."
          rows={6}
          className="w-full text-sm text-[#333] bg-[#fafaf8] border border-[#e4e3e0] rounded-lg px-3 py-2.5 resize-none outline-none focus:border-[#2563eb]/40 placeholder-[#bbb] leading-relaxed"
        />
      </section>

      {/* Drafts */}
      <section className="px-4 py-4 border-b border-[#e4e3e0]">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-[#aaa]">
            Drafts ({drafts.length})
          </label>
          <button
            onClick={() => draftInput.current?.click()}
            className="text-[11px] text-[#2563eb] hover:underline"
          >
            + Add
          </button>
        </div>
        <input
          ref={draftInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileUpload("draft")}
        />
        {drafts.length === 0 ? (
          <button
            onClick={() => draftInput.current?.click()}
            className="w-full border-2 border-dashed border-[#e4e3e0] rounded-lg py-4 text-xs text-[#bbb] hover:border-[#2563eb]/30 hover:text-[#2563eb]/60 transition-colors"
          >
            Upload sketches, wireframes, screenshots
          </button>
        ) : (
          <AssetGrid assets={drafts} onRemove={onRemoveAsset} />
        )}
      </section>

      {/* References */}
      <section className="px-4 py-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-[#aaa]">
            References ({refs.length})
          </label>
          <button
            onClick={() => refInput.current?.click()}
            className="text-[11px] text-[#2563eb] hover:underline"
          >
            + Add
          </button>
        </div>
        <input
          ref={refInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileUpload("reference")}
        />
        {refs.length === 0 ? (
          <button
            onClick={() => refInput.current?.click()}
            className="w-full border-2 border-dashed border-[#e4e3e0] rounded-lg py-4 text-xs text-[#bbb] hover:border-[#2563eb]/30 hover:text-[#2563eb]/60 transition-colors"
          >
            Upload inspiration, style references
          </button>
        ) : (
          <AssetGrid assets={refs} onRemove={onRemoveAsset} />
        )}
      </section>
    </aside>
  );
}

function AssetGrid({ assets, onRemove }: { assets: Asset[]; onRemove: (id: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {assets.map((a) => (
        <div key={a.id} className="relative group aspect-square rounded-lg overflow-hidden bg-[#f5f4f1] border border-[#e4e3e0]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.dataUrl} alt={a.fileName} className="w-full h-full object-cover" />
          <button
            onClick={() => onRemove(a.id)}
            className="absolute inset-0 bg-black/50 text-white text-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
