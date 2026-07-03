"use client";

import { useRef } from "react";
import type { Asset } from "@/types";
import styles from "./InputsSidebar.module.css";

interface Props {
  title: string;
  brief: string;
  assets: Asset[];
  hoveredAssetIds?: Set<string>;
  onTitleChange: (v: string) => void;
  onBriefChange: (v: string) => void;
  onAddAsset: (asset: Asset) => void;
  onRemoveAsset: (id: string) => void;
  onCollapse?: () => void;
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
  onCollapse,
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
    <aside className={`h-full flex flex-col bg-white overflow-y-auto ${styles.aside}`}>
      {/* Header */}
      <div className={`px-5 pt-5 pb-4 ${styles.divider}`}>
        <div className="flex items-start gap-2">
          <input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            className="flex-1 min-w-0 text-[22px] font-bold text-black bg-transparent outline-none placeholder-[rgba(0,0,0,0.25)] leading-tight"
            placeholder="Project Title"
          />
          {onCollapse && (
            <button
              onClick={onCollapse}
              className={`shrink-0 text-[rgba(0,0,0,0.3)] hover:text-black transition-colors mt-1.5 ${styles.collapseBtn}`}
              title="Hide panel"
            >‹</button>
          )}
        </div>
        <div className="mt-3 h-px bg-black opacity-20" />
      </div>

      {/* Brief */}
      <section className={`px-5 py-4 ${styles.divider}`}>
        <label className="text-[9px] uppercase tracking-[0.18em] text-[rgba(0,0,0,0.4)] block mb-2">
          Design Brief
        </label>
        <textarea
          value={brief}
          onChange={(e) => onBriefChange(e.target.value)}
          placeholder="Describe your design challenge, target users, goals, constraints…"
          rows={6}
          className={`w-full text-[15px] text-[#333232] bg-white border border-[rgba(0,0,0,0.7)] px-3 py-2.5 resize-none outline-none focus:border-black placeholder-[rgba(51,50,50,0.35)] leading-relaxed ${styles.sq}`}
        />
      </section>

      {/* Drafts */}
      <section className={`px-5 py-4 ${styles.divider}`}>
        <div className="flex items-center justify-between mb-3">
          <label className="text-[9px] uppercase tracking-[0.18em] text-[rgba(0,0,0,0.4)]">
            Drafts {drafts.length > 0 && `(${drafts.length})`}
          </label>
          <button onClick={() => draftInput.current?.click()} className="text-[12px] text-black underline-offset-2 hover:opacity-60 transition-opacity">
            + Add
          </button>
        </div>
        <input ref={draftInput} type="file" accept="image/*" multiple className="hidden" onChange={handleFileUpload("draft")} />
        {drafts.length === 0 ? (
          <button
            onClick={() => draftInput.current?.click()}
            className={`w-full border border-dashed border-[rgba(0,0,0,0.4)] py-4 text-[13px] text-[rgba(0,0,0,0.35)] hover:border-black hover:text-black transition-colors ${styles.sq}`}
          >
            + Draft
          </button>
        ) : (
          <AssetGrid assets={drafts} onRemove={onRemoveAsset} hoveredAssetIds={hoveredAssetIds} />
        )}
      </section>

      {/* References */}
      <section className="px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <label className="text-[9px] uppercase tracking-[0.18em] text-[rgba(0,0,0,0.4)]">
            References {refs.length > 0 && `(${refs.length})`}
          </label>
          <button onClick={() => refInput.current?.click()} className="text-[12px] text-black underline-offset-2 hover:opacity-60 transition-opacity">
            + Add
          </button>
        </div>
        <input ref={refInput} type="file" accept="image/*" multiple className="hidden" onChange={handleFileUpload("reference")} />
        {refs.length === 0 ? (
          <button
            onClick={() => refInput.current?.click()}
            className={`w-full border border-dashed border-[rgba(0,0,0,0.4)] py-4 text-[13px] text-[rgba(0,0,0,0.35)] hover:border-black hover:text-black transition-colors ${styles.sq}`}
          >
            + References
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
            className="relative group aspect-square overflow-hidden bg-[#f5f5f4]"
            style={{
              border: `1.5px solid ${isHighlighted ? "#c9a84c" : "rgba(0,0,0,0.2)"}`,
              boxShadow: isHighlighted ? "0 0 0 2px rgba(201,168,76,0.2)" : undefined,
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
