"use client";

// Review step before a run: shows what the action will use, lets the user
// drop inputs, pick dimensions and add instructions. Running closes the dialog
// straight away; progress shows on the canvas.

import { useMemo, useState } from "react";
import { Link2, X } from "lucide-react";
import { useProjectStore } from "@/store/projectStore";
import { resolveSelection } from "@/domain/graph";
import type { ActionType, IdeaNode } from "@/domain/types";
import { DIMENSIONS } from "@/lib/dimensions";
import { DEFAULT_COUNTS, DEFAULT_IMAGES_PER_IDEA, MAX_COUNT, MAX_IMAGES_PER_IDEA } from "@/domain/wire";
import { useImageUrl } from "./useImageUrl";
import { ACTIONS } from "./nodeStyle";
import { Modal, RoleBadge } from "./ui";
import { whyUnavailable } from "./availability";
import { ACTION_ICON } from "./actionIcons";

function CountSlider({ id, label, value, min, max, onChange }: {
  id: string; label: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <div className="grid grid-cols-[8rem_1fr_2rem] items-center gap-3">
      <label htmlFor={id} className="text-[13px] text-ink">{label}</label>
      <input id={id} type="range" min={min} max={max} step={1} value={value}
        onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--color-ink)] cursor-pointer" />
      <output htmlFor={id} className="text-[13px] font-medium text-ink text-right tabular-nums">{value}</output>
    </div>
  );
}

function InputRow({ node, onRemove }: { node: IdeaNode; onRemove: () => void }) {
  const url = useImageUrl(node.image?.imageId);
  return (
    <li className="flex items-center gap-2.5 pl-2 pr-1 py-1.5 rounded-md border border-line">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="w-9 h-9 rounded object-cover shrink-0" />
      )}
      <RoleBadge role={node.role} />
      <span className="idea text-[14px] text-ink truncate flex-1">{node.title}</span>
      <button onClick={onRemove} className="icon-btn" aria-label={`Leave ${node.title} out of this run`}><X size={14} /></button>
    </li>
  );
}

function Group({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between"><h3 className="section-title">{title}</h3>{aside}</div>
      {children}
    </section>
  );
}

export default function RunComposer({ action, onClose }: { action: ActionType; onClose: () => void }) {
  const project = useProjectStore((s) => s.project)!;
  const selection = useProjectStore((s) => s.selection);
  const toggleSelected = useProjectStore((s) => s.toggleSelected);
  const runAction = useProjectStore((s) => s.runAction);
  const [instructions, setInstructions] = useState("");
  const [dimensionIds, setDimensionIds] = useState<string[]>(DIMENSIONS.map((d) => d.id));
  const [counts, setCounts] = useState<{ concepts: number; motifs: number }>({ ...DEFAULT_COUNTS });
  const [imagesPerIdea, setImagesPerIdea] = useState(DEFAULT_IMAGES_PER_IDEA);

  const meta = ACTIONS.find((a) => a.id === action)!;
  const Icon = ACTION_ICON[action];
  const { nodes, edges } = useMemo(() => resolveSelection(project, selection), [project, selection]);
  const allDims = dimensionIds.length === DIMENSIONS.length;
  const ideaCount = nodes.filter((n) => n.role === "concept" || n.role === "motif").length + edges.length;

  // How many images this run will make, so the wait is visible up front.
  const images = action === "visual_variations" ? dimensionIds.length
    : action === "conceptual_variations" ? ideaCount * imagesPerIdea
    : 0;

  const blocker = whyUnavailable(action, project, selection)
    ?? (action === "expand" && counts.concepts + counts.motifs === 0 ? "Ask for at least one concept or motif." : null)
    ?? (action === "visual_variations" && dimensionIds.length === 0 ? "Choose at least one dimension." : null);

  function run() {
    runAction(action, { instructions: instructions.trim() || undefined, dimensionIds, counts, imagesPerIdea });
    onClose();
  }

  return (
    <Modal title={meta.label} description={meta.description} onClose={onClose}
      footer={
        <>
          <p role="status" className={`text-[13px] flex-1 ${blocker ? "text-danger" : "text-muted"} tabular-nums`}>
            {blocker ?? (images > 1 ? `Makes ${images} images, 4 at a time` : "")}
          </p>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={run} disabled={!!blocker}>
            <Icon size={15} aria-hidden /> Run
          </button>
        </>
      }>
      <Group title="Brief">
        <p className={`idea text-[15px] leading-relaxed max-h-24 overflow-y-auto ${project.brief ? "text-ink-2" : "text-muted italic"}`}>
          {project.brief || "No brief yet"}
        </p>
      </Group>

      <Group title={`Selected (${nodes.length + edges.length})`}>
        {nodes.length + edges.length === 0 ? (
          <p className="hint">Nothing selected, so this runs on the brief alone. Select nodes on the canvas to use them.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {nodes.map((n) => <InputRow key={n.id} node={n} onRemove={() => toggleSelected(n.id)} />)}
            {edges.map((e) => (
              <li key={e.id} className="flex items-center gap-2.5 pl-2 pr-1 py-1.5 rounded-md border border-dashed border-ink-2">
                <Link2 size={15} className="text-ink-2 shrink-0" aria-label="Link" />
                <span className="idea text-[14px] text-ink truncate flex-1">
                  {project.nodes[e.from]?.title} and {project.nodes[e.to]?.title}
                  {e.label && <span className="text-ink-2 italic">, {e.label}</span>}
                </span>
                <button onClick={() => toggleSelected(e.id)} className="icon-btn" aria-label="Leave this link out of this run"><X size={14} /></button>
              </li>
            ))}
          </ul>
        )}
      </Group>

      {action === "expand" && (
        <Group title="How many to make">
          <CountSlider id="count-concepts" label="Concepts" value={counts.concepts} min={0} max={MAX_COUNT}
            onChange={(v) => setCounts((c) => ({ ...c, concepts: v }))} />
          <CountSlider id="count-motifs" label="Motifs" value={counts.motifs} min={0} max={MAX_COUNT}
            onChange={(v) => setCounts((c) => ({ ...c, motifs: v }))} />
        </Group>
      )}

      {action === "conceptual_variations" && (
        <Group title="How many to make">
          <CountSlider id="images-per-idea" label="Images per idea" value={imagesPerIdea} min={1} max={MAX_IMAGES_PER_IDEA}
            onChange={setImagesPerIdea} />
        </Group>
      )}

      {action === "visual_variations" && (
        <Group title={`Arnheim dimensions (${dimensionIds.length} of ${DIMENSIONS.length})`}
          aside={<button className="text-[13px] text-accent hover:underline" onClick={() => setDimensionIds(allDims ? [] : DIMENSIONS.map((d) => d.id))}>
            {allDims ? "Clear all" : "Select all"}
          </button>}>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Dimensions">
            {DIMENSIONS.map((dim) => {
              const on = dimensionIds.includes(dim.id);
              return (
                <button key={dim.id} aria-pressed={on} title={dim.summary}
                  onClick={() => setDimensionIds(on ? dimensionIds.filter((d) => d !== dim.id) : [...dimensionIds, dim.id])}
                  className={`btn btn-sm ${on ? "btn-on" : ""}`}>
                  {dim.label}
                </button>
              );
            })}
          </div>
        </Group>
      )}

      <Group title="Instructions (optional)">
        <label htmlFor="run-instructions" className="sr-only">Instructions</label>
        <textarea id="run-instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3}
          placeholder="Any focus, constraints or direction for this run" className="field resize-y leading-relaxed" />
      </Group>
    </Modal>
  );
}
