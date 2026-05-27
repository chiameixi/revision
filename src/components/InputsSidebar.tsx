"use client";

import { useRef } from "react";
import type { Asset } from "@/types";

interface Props {
  title: string;
  brief: string;
  assets: Asset[];
  hoveredAssetIds?: Set<string>;
  onTitleChange: (v: string) => void;
  onBriefChange: (v: string) => void;
  onAddAsset: (asset: Asset) => void;
  onRemoveAsset: (id: string) => void;
}

export default function InputsSidebar({
  title,
  brief,
  assets,
  hoveredAssetIds,
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
    <aside className="w-72 shrink-0 h-screen flex flex-col bg-white border-r overflow-y-auto" style={{ borderColor: "#ccc9c0" }}>
      {/* Header */}
      <div className="px-4 pt-5 pb-3 border-b" style={{ borderColor: "#ccc9c0" }}>
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          className="w-full text-sm text-[#111] bg-transparent outline-none placeholder-[#bbb]"
          placeholder="Project title"
        />
      </div>

      {/* Brief */}
      <section className="px-4 py-4 border-b" style={{ borderColor: "#ccc9c0" }}>
        <label className="text-[10px] uppercase tracking-widest text-[#888] block mb-2">
          Design Brief
        </label>
        <textarea
          value={brief}
          onChange={(e) => onBriefChange(e.target.value)}
          placeholder="Describe your design challenge, target users, goals, constraints..."
          rows={6}
          className="w-full text-sm text-[#333] bg-white border border-[#ccc] rounded px-3 py-2.5 resize-none outline-none focus:border-[#111] placeholder-[#bbb] leading-relaxed"
        />
      </section>

      {/* Drafts */}
      <section className="px-4 py-4 border-b" style={{ borderColor: "#ccc9c0" }}>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] uppercase tracking-widest text-[#888]">
            Drafts ({drafts.length})
          </label>
          <button onClick={() => draftInput.current?.click()} className="text-[11px] text-[#111] underline hover:no-underline">
            + Add
          </button>
        </div>
        <input ref={draftInput} type="file" accept="image/*" multiple className="hidden" onChange={handleFileUpload("draft")} />
        {drafts.length === 0 ? (
          <button
            onClick={() => draftInput.current?.click()}
            className="w-full border-2 border-dashed border-[#ccc] rounded py-4 text-xs text-[#bbb] hover:border-[#111] hover:text-[#555] transition-colors"
          >
            Upload sketches, wireframes, screenshots
          </button>
        ) : (
          <AssetGrid assets={drafts} onRemove={onRemoveAsset} hoveredAssetIds={hoveredAssetIds} />
        )}
      </section>

      {/* References */}
      <section className="px-4 py-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] uppercase tracking-widest text-[#888]">
            References ({refs.length})
          </label>
          <button onClick={() => refInput.current?.click()} className="text-[11px] text-[#111] underline hover:no-underline">
            + Add
          </button>
        </div>
        <input ref={refInput} type="file" accept="image/*" multiple className="hidden" onChange={handleFileUpload("reference")} />
        {refs.length === 0 ? (
          <button
            onClick={() => refInput.current?.click()}
            className="w-full border-2 border-dashed border-[#ccc] rounded py-4 text-xs text-[#bbb] hover:border-[#111] hover:text-[#555] transition-colors"
          >
            Upload inspiration, style references
          </button>
        ) : (
          <AssetGrid assets={refs} onRemove={onRemoveAsset} hoveredAssetIds={hoveredAssetIds} />
        )}
      </section>
    </aside>
  );
}

function AssetGrid({ assets, onRemove, hoveredAssetIds }: { assets: Asset[]; onRemove: (id: string) => void; hoveredAssetIds?: Set<string> }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {assets.map((a) => {
        const isHighlighted = hoveredAssetIds?.has(a.id) ?? false;
        return (
          <div
            key={a.id}
            className="relative group aspect-square rounded overflow-hidden bg-[#f5f5f4]"
            style={{
              border: `2px solid ${isHighlighted ? "#f59e0b" : "#ccc"}`,
              boxShadow: isHighlighted ? "0 0 0 3px rgba(251,191,36,0.25)" : undefined,
              transition: "border-color 0.2s ease, box-shadow 0.2s ease",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.dataUrl} alt={a.fileName} className="w-full h-full object-cover" />
            <button
              onClick={() => onRemove(a.id)}
              className="absolute inset-0 bg-black/50 text-white text-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >×</button>
          </div>
        );
      })}
    </div>
  );
}
