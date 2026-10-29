"use client";

// Review step before a run: shows what the action will use, lets the user
// drop inputs, pick dimensions and add instructions. Sending closes the modal
// straight away; progress shows on the canvas.

import { useEffect, useMemo, useRef, useState } from "react";
import { useProjectStore } from "@/store/projectStore";
import { resolveSelection } from "@/domain/graph";
import type { ActionType, IdeaNode } from "@/domain/types";
import { DIMENSIONS } from "@/lib/dimensions";
import { useImageUrl } from "./useImageUrl";
import { ACTIONS, ROLE_LABEL } from "./nodeStyle";
import styles from "./RunComposer.module.css";

function InputRow({ node, onRemove }: { node: IdeaNode; onRemove: () => void }) {
  const url = useImageUrl(node.image?.imageId);
  return (
    <div className={`flex items-center gap-2.5 px-3 py-2 border border-black bg-[#f5f4f0] ${styles.sq}`}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={node.title} className="w-9 h-9 object-cover shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-black truncate">{node.title}</p>
        <p className="text-[11px] italic text-[rgba(0,0,0,0.4)]">{ROLE_LABEL[node.role]}{node.image ? " · image" : ""}</p>
      </div>
      <button onClick={onRemove} className="text-[rgba(0,0,0,0.3)] hover:text-black text-[12px]" title="Leave out of this run">✕</button>
    </div>
  );
}

export default function RunComposer({ action, onClose }: { action: ActionType; onClose: () => void }) {
  const project = useProjectStore((s) => s.project)!;
  const selection = useProjectStore((s) => s.selection);
  const toggleSelected = useProjectStore((s) => s.toggleSelected);
  const runAction = useProjectStore((s) => s.runAction);
  const [instructions, setInstructions] = useState("");
  const [dimensionIds, setDimensionIds] = useState<string[]>(DIMENSIONS.map((d) => d.id));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { textareaRef.current?.focus(); }, []);

  const meta = ACTIONS.find((a) => a.id === action)!;
  const { nodes, edges } = useMemo(() => resolveSelection(project, selection), [project, selection]);
  const allDims = dimensionIds.length === DIMENSIONS.length;

  function send() {
    runAction(action, { instructions: instructions.trim() || undefined, dimensionIds });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/25 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`bg-white border border-black w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden ${styles.sq}`}>
        <div className={`px-6 pt-6 pb-5 ${styles.header}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[20px] text-black">{meta.label}</h2>
              <p className="text-[13px] italic text-[rgba(0,0,0,0.45)] mt-0.5">{meta.description}</p>
            </div>
            <button onClick={onClose} className="text-[rgba(0,0,0,0.3)] hover:text-black text-2xl leading-none mt-0.5 transition-colors">×</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          <div>
            <p className="text-[9px] uppercase tracking-[0.16em] text-[rgba(0,0,0,0.4)] mb-2">Brief</p>
            <div className={`bg-[#f5f4f0] border border-[rgba(0,0,0,0.2)] px-3 py-2.5 text-[14px] text-[#333232] max-h-20 overflow-y-auto leading-relaxed ${styles.sq}`}>
              {project.brief || <span className="italic text-[rgba(0,0,0,0.3)]">No brief yet</span>}
            </div>
          </div>

          <div>
            <p className="text-[9px] uppercase tracking-[0.16em] text-[rgba(0,0,0,0.4)] mb-2">
              Selected ({nodes.length + edges.length})
            </p>
            {nodes.length + edges.length === 0 ? (
              <div className={`text-[12px] italic text-[rgba(0,0,0,0.35)] bg-[#f5f4f0] border border-[rgba(0,0,0,0.1)] px-3 py-2.5 ${styles.sq}`}>
                Nothing selected, so this runs on the brief alone. Select nodes on the canvas to use them.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {nodes.map((n) => <InputRow key={n.id} node={n} onRemove={() => toggleSelected(n.id)} />)}
                {edges.map((e) => (
                  <div key={e.id} className={`flex items-center gap-2.5 px-3 py-2 border border-black bg-[#f5f4f0] ${styles.sq}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-black truncate">{project.nodes[e.from]?.title} ↔ {project.nodes[e.to]?.title}</p>
                      <p className="text-[11px] italic text-[rgba(0,0,0,0.4)]">Link{e.label ? ` · ${e.label}` : ""}</p>
                    </div>
                    <button onClick={() => toggleSelected(e.id)} className="text-[rgba(0,0,0,0.3)] hover:text-black text-[12px]" title="Leave out of this run">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {action === "visual_variations" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] uppercase tracking-[0.16em] text-[rgba(0,0,0,0.4)]">
                  Arnheim dimensions ({dimensionIds.length} selected)
                </p>
                <button onClick={() => setDimensionIds(allDims ? [] : DIMENSIONS.map((d) => d.id))}
                  className="text-[12px] italic text-black underline hover:no-underline">
                  {allDims ? "Deselect all" : "Select all"}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DIMENSIONS.map((dim) => {
                  const on = dimensionIds.includes(dim.id);
                  return (
                    <button key={dim.id} title={dim.summary}
                      onClick={() => setDimensionIds(on ? dimensionIds.filter((d) => d !== dim.id) : [...dimensionIds, dim.id])}
                      className={`text-[12px] px-2.5 py-1 border transition-colors ${styles.sq} ${
                        on ? "bg-black text-white border-black" : "text-[rgba(0,0,0,0.55)] border-[rgba(0,0,0,0.25)] hover:border-black hover:text-black"
                      }`}>
                      {dim.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <p className="text-[9px] uppercase tracking-[0.16em] text-[rgba(0,0,0,0.4)] mb-2">Additional instructions (optional)</p>
            <textarea
              ref={textareaRef}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Any focus, constraints or direction for this run…"
              rows={3}
              className={`w-full text-[14px] text-[#333232] bg-[#f5f4f0] border border-[rgba(0,0,0,0.2)] px-3 py-2.5 resize-none outline-none focus:border-black placeholder-[rgba(0,0,0,0.3)] leading-relaxed italic ${styles.sq}`}
            />
          </div>
        </div>

        <div className={`px-6 pb-6 pt-4 flex items-center justify-between gap-4 ${styles.footer}`}>
          <button onClick={onClose} className="text-[14px] italic text-[rgba(0,0,0,0.45)] hover:text-black transition-colors">Cancel</button>
          <button onClick={send} className={`bg-black text-white text-[15px] px-6 py-2.5 hover:opacity-75 transition-opacity ${styles.sq}`}>
            Run →
          </button>
        </div>
      </div>
    </div>
  );
}
