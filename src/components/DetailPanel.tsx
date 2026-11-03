"use client";

// Side panels shared by the tree and cluster views: one for a node, one for a
// connection, one for the brief. All read and write through the store.
// Text fields save on blur, so the study log gets one event per edit.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Copy, Crop, Expand as ExpandIcon, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useProjectStore } from "@/store/projectStore";
import { visibleParents } from "@/domain/graph";
import { readingFor } from "@/domain/relations";
import { BRIEF_ID, type ActionType, type Edge, type EdgeId, type IdeaNode, type NodeId, type Region, type RoleDetails } from "@/domain/types";
import { fileToImage } from "@/services/images";
import { useImageUrl } from "./useImageUrl";
import { ACTIONS, BODY_LABEL, ROLES, ROLE_LABEL, ROLE_STYLE, originLabel } from "./nodeStyle";
import { RoleBadge, useDialogFocus } from "./ui";
import { whyUnavailable } from "./availability";
import { ACTION_ICON } from "./actionIcons";

// ── Shared bits ───────────────────────────────────────────────────────────────

function PanelShell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <aside aria-label={label} className="w-full h-full border-l border-line bg-surface flex flex-col overflow-hidden">
      {children}
    </aside>
  );
}

// Kind, title and close on top; the rest of the panel scrolls under it.
function PanelHeader({ kind, title, subtitle, onClose, children }: {
  kind: React.ReactNode; title: string; subtitle?: string; onClose: () => void; children?: React.ReactNode;
}) {
  return (
    <div className="px-4 pt-3 pb-3 border-b border-line shrink-0 flex flex-col gap-2.5">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="text-[12px] text-muted">{kind}</div>
          <h2 className="idea text-[19px] leading-tight text-ink break-words">{title}</h2>
          {subtitle && <p className="text-[12px] text-muted">{subtitle}</p>}
        </div>
        <button onClick={onClose} aria-label="Close panel" title="Close" className="icon-btn -mr-1.5 -mt-0.5"><X size={16} /></button>
      </div>
      {children}
    </div>
  );
}

function Section({ title, children, last }: { title?: string; children: React.ReactNode; last?: boolean }) {
  return (
    <section className={`px-4 py-3.5 flex flex-col gap-2.5 ${last ? "" : "border-b border-line"}`}>
      {title && <h3 className="section-title">{title}</h3>}
      {children}
    </section>
  );
}

export function EditField({
  label, value, onCommit, singleLine, placeholder, rows = 3, idea,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  singleLine?: boolean;
  placeholder?: string;
  rows?: number;
  idea?: boolean;    // set the text in the idea serif
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(value); }, [value]);

  const commit = () => {
    focused.current = false;
    if (draft !== value) onCommit(draft);
  };
  const common = {
    id,
    className: `field ${idea ? "idea text-[15px]" : ""}`,
    value: draft,
    placeholder,
    onFocus: () => { focused.current = true; },
    onBlur: commit,
  };
  return (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      {singleLine ? (
        <input {...common} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
      ) : (
        <textarea {...common} rows={rows} onChange={(e) => setDraft(e.target.value)} className={`${common.className} resize-y leading-relaxed`} />
      )}
    </div>
  );
}

// The same three actions as the selection bar, run on this panel's subject.
function RunButtons({ onRun, title, note, selection }: { onRun: (a: ActionType) => void; title: string; note: string; selection: string[] }) {
  const project = useProjectStore((s) => s.project)!;
  return (
    <Section title={title}>
      <p className="hint -mt-1">{note}</p>
      <div className="flex flex-col gap-1.5">
        {ACTIONS.map((a) => {
          const reason = whyUnavailable(a.id, project, selection);
          const Icon = ACTION_ICON[a.id];
          return (
            <button key={a.id} className="btn justify-start" onClick={() => { if (!reason) onRun(a.id); }} aria-disabled={!!reason} title={reason ?? a.description}>
              <Icon size={15} aria-hidden /> {a.label}
              {reason && <span className="sr-only">. {reason}</span>}
            </button>
          );
        })}
      </div>
    </Section>
  );
}

function NodeChip({ node, onClick }: { node: IdeaNode; onClick: () => void }) {
  const s = ROLE_STYLE[node.role];
  return (
    <button onClick={onClick} className="text-left flex items-start gap-2 px-2.5 py-2 rounded-md border transition-colors hover:border-ink-2"
      style={{ borderColor: s.border, background: s.fill }}>
      <RoleBadge role={node.role} />
      <span className="idea text-[14px] leading-snug text-ink">{node.title}</span>
    </button>
  );
}

// One connection in "Came from": what it says, or a prompt to fill it in. Opens its panel.
function ConnectionRow({ edge, reading, onClick }: { edge: Edge; reading: string; onClick: () => void }) {
  const relation = edge.relation;
  return (
    <button onClick={onClick} className="text-left px-2.5 py-1.5 rounded-md border border-line hover:border-ink-2">
      <span className="block text-[12px] text-muted">{reading}</span>
      {relation?.word && <span className="block text-[13px] font-medium text-ink">{relation.word}</span>}
      {relation?.explanation && <span className="block text-[13px] text-ink-2">{relation.explanation}</span>}
      {!relation && <span className="block text-[13px] text-muted italic">Describe this connection</span>}
    </button>
  );
}

function SiblingImage({ node, onSelect }: { node: IdeaNode; onSelect: () => void }) {
  const url = useImageUrl(node.image?.imageId);
  return (
    <button onClick={onSelect} className="relative aspect-square rounded-md overflow-hidden bg-subtle border border-line hover:border-ink-2"
      title={`${node.title}. ${originLabel(node)}`}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={node.title} className="w-full h-full object-cover" />
      )}
    </button>
  );
}

// An input image with the part an output came from outlined.
function RegionPreview({ node, region, onClick }: { node: IdeaNode; region: Region | "whole"; onClick: () => void }) {
  const url = useImageUrl(node.image?.imageId);
  const box = region === "whole" ? null : region.box;
  return (
    <button onClick={onClick} className="text-left flex flex-col gap-1.5 group">
      <div className="relative w-full bg-subtle overflow-hidden rounded-md border border-line">
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`${node.title}${box ? ", with the region this came from outlined" : ""}`} className="w-full block" />
        )}
        {url && box && (
          <div className="absolute border-2 border-accent bg-accent/10 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]"
            style={{ top: `${box[0] / 10}%`, left: `${box[1] / 10}%`, height: `${(box[2] - box[0]) / 10}%`, width: `${(box[3] - box[1]) / 10}%` }} />
        )}
      </div>
      <span className="text-[12px] text-ink-2 group-hover:underline truncate">
        {box ? `From this part of ${node.title}` : `From the whole of ${node.title}`}
      </span>
    </button>
  );
}

// Full-size image, with an option to crop a region into a new node.
function Lightbox({ src, alt, onCrop, onClose }: { src: string; alt: string; onCrop?: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = useDialogFocus(ref, onClose, "[data-autofocus]");
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label={alt} className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center gap-3 p-8"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={onKeyDown}>
      <div className="flex items-center gap-2">
        {onCrop && <button className="btn" onClick={onCrop}><Crop size={15} aria-hidden /> Crop a region</button>}
        <button data-autofocus className="btn" onClick={onClose}><X size={15} aria-hidden /> Close</button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="max-w-full max-h-[82vh] object-contain rounded-lg shadow-[var(--shadow-modal)]" />
    </div>
  );
}

// Connects another node to this one without dragging (the canvas Connect tool needs a drag).
function LinkTo({ nodeId }: { nodeId: NodeId }) {
  const project = useProjectStore((s) => s.project)!;
  const addLink = useProjectStore((s) => s.addLink);
  const id = useId();
  const [target, setTarget] = useState("");
  const options = Object.values(project.nodes).filter((n) => !n.hidden && n.id !== nodeId)
    .sort((a, b) => a.title.localeCompare(b.title));
  if (options.length === 0) return null;
  return (
    <Section title="Connect to another node">
      <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (target) { addLink(nodeId, target); setTarget(""); } }}>
        <label htmlFor={id} className="sr-only">Node to connect to</label>
        <select id={id} className="field flex-1 min-w-0" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Choose a node</option>
          {options.map((n) => <option key={n.id} value={n.id}>{n.title} ({ROLE_LABEL[n.role].toLowerCase()})</option>)}
        </select>
        <button type="submit" className="btn" disabled={!target}>Connect</button>
      </form>
    </Section>
  );
}

// ── Node panel ────────────────────────────────────────────────────────────────

export function NodePanel({
  nodeId, onClose, onRun, onAddChild,
}: {
  nodeId: NodeId;
  onClose: () => void;
  onRun: (action: ActionType) => void;
  onAddChild: () => void;
}) {
  const project = useProjectStore((s) => s.project)!;
  const editNode = useProjectStore((s) => s.editNode);
  const retagNode = useProjectStore((s) => s.retagNode);
  const hideNode = useProjectStore((s) => s.hideNode);
  const hideEdge = useProjectStore((s) => s.hideEdge);
  const duplicateNode = useProjectStore((s) => s.duplicateNode);
  const cropNode = useProjectStore((s) => s.cropNode);
  const setSelection = useProjectStore((s) => s.setSelection);
  const typeLabelId = useId();

  const node = project.nodes[nodeId];
  const imageUrl = useImageUrl(node?.image?.imageId);
  const [lightbox, setLightbox] = useState(false);
  const [cropping, setCropping] = useState(false);

  const parents = useMemo(() => (node ? visibleParents(project, node.id).map((id) => project.nodes[id]) : []), [project, node]);
  // The stored edge from each parent: how they connect, and where in a parent image this
  // node came from. A parent bridged over a removed node has none. Includes the brief.
  const parentEdges = useMemo(() => {
    const map = new Map<string, Edge>();
    for (const e of Object.values(project.edges)) {
      if (e.kind === "derived_from" && e.to === nodeId && !e.hidden) map.set(e.from, e);
    }
    return map;
  }, [project.edges, nodeId]);
  const briefEdge = parentEdges.get(BRIEF_ID);
  const exploredLink = node?.origin.kind === "generated" && node.origin.params?.sourceEdgeId
    ? project.edges[node.origin.params.sourceEdgeId]
    : undefined;
  const siblings = useMemo(() => {
    if (!node || node.origin.kind !== "generated") return [];
    const runId = node.origin.runId;
    return Object.values(project.nodes).filter((n) =>
      n.id !== node.id && !n.hidden && n.origin.kind === "generated" && n.origin.runId === runId);
  }, [project, node]);
  const links = useMemo(() => Object.values(project.edges).filter((e) =>
    e.kind === "link" && !e.hidden && (e.from === nodeId || e.to === nodeId)
    && project.nodes[e.from] && !project.nodes[e.from].hidden && project.nodes[e.to] && !project.nodes[e.to].hidden,
  ), [project, nodeId]);

  if (!node) return null;
  const imageSiblings = siblings.filter((n) => n.image);
  const textSiblings = siblings.filter((n) => !n.image);
  const setDetail = (key: keyof RoleDetails, v: string) =>
    editNode(node.id, { details: { ...node.details, [key]: v || undefined } });

  return (
    <>
      <PanelShell label={`${ROLE_LABEL[node.role]} details`}>
        <PanelHeader kind={<RoleBadge role={node.role} />} title={node.title} subtitle={originLabel(node)} onClose={onClose}>
          <div className="flex items-center gap-2">
            <span id={typeLabelId} className="text-[12px] text-ink-2 font-medium">Type</span>
            <div role="radiogroup" aria-labelledby={typeLabelId} className="flex flex-1 p-0.5 rounded-md bg-subtle border border-line">
              {ROLES.map((r) => {
                const active = node.role === r;
                return (
                  <button key={r} role="radio" aria-checked={active} onClick={() => !active && retagNode(node.id, r)}
                    className={`flex-1 h-7 rounded-[5px] text-[12px] font-medium transition-colors ${
                      active ? "bg-surface text-ink shadow-[0_1px_2px_rgb(16_24_40/0.1)]" : "text-ink-2 hover:text-ink"}`}>
                    {ROLE_LABEL[r]}
                  </button>
                );
              })}
            </div>
          </div>
        </PanelHeader>

        <div className="flex-1 overflow-y-auto">
          {imageUrl && (
            <div className="px-4 pt-3.5">
              <button onClick={() => setLightbox(true)} className="block w-full rounded-md overflow-hidden border border-line group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt={node.title} className="w-full object-cover" />
                <span className="absolute right-2 bottom-2 btn btn-sm opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                  <ExpandIcon size={13} aria-hidden /> View and crop
                </span>
              </button>
            </div>
          )}

          <Section>
            <EditField label="Title" value={node.title} onCommit={(v) => editNode(node.id, { title: v })} singleLine idea />
            <EditField label={BODY_LABEL[node.role]} value={node.body ?? ""} onCommit={(v) => editNode(node.id, { body: v || undefined })} />
            {(node.role === "concept" || node.details?.rationale) && (
              <EditField label="Rationale" value={node.details?.rationale ?? ""} onCommit={(v) => setDetail("rationale", v)} />
            )}
            {/* New motifs say this on their connections; only older motifs have it here. */}
            {node.details?.howItConveysIdea && (
              <EditField label="How it conveys the idea" value={node.details?.howItConveysIdea ?? ""} onCommit={(v) => setDetail("howItConveysIdea", v)} />
            )}
            {(node.role === "motif" || node.details?.category) && (
              <EditField label="Category" value={node.details?.category ?? ""} onCommit={(v) => setDetail("category", v)} singleLine />
            )}
          </Section>

          {(parents.length > 0 || exploredLink || briefEdge) && (
            <Section title="Came from">
              {exploredLink && project.nodes[exploredLink.from] && project.nodes[exploredLink.to] && (
                <button onClick={() => setSelection([exploredLink.id])}
                  className="text-left px-2.5 py-2 rounded-md border border-dashed border-ink-2 hover:bg-subtle">
                  <span className="block text-[12px] text-muted">Explored connection</span>
                  <span className="idea text-[14px] text-ink">
                    {project.nodes[exploredLink.from].title} and {project.nodes[exploredLink.to].title}
                  </span>
                  {exploredLink.relation?.word && <span className="block text-[12px] text-ink-2 italic">{exploredLink.relation.word}</span>}
                </button>
              )}
              {briefEdge && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[13px] text-ink-2">The project brief</p>
                  <ConnectionRow edge={briefEdge} reading={readingFor("brief", node.role).reading} onClick={() => setSelection([briefEdge.id])} />
                </div>
              )}
              {parents.map((p) => {
                const edge = parentEdges.get(p.id);
                return (
                  <div key={p.id} className="flex flex-col gap-1.5">
                    {p.image && edge?.region
                      ? <RegionPreview node={p} region={edge.region} onClick={() => setSelection([p.id])} />
                      : <NodeChip node={p} onClick={() => setSelection([p.id])} />}
                    {edge && <ConnectionRow edge={edge} reading={readingFor(p.role, node.role).reading} onClick={() => setSelection([edge.id])} />}
                  </div>
                );
              })}
            </Section>
          )}

          {siblings.length > 0 && (
            <Section title={`Made in the same run (${siblings.length})`}>
              {imageSiblings.length > 0 && (
                <div className="grid grid-cols-3 gap-1.5">
                  {imageSiblings.map((sib) => <SiblingImage key={sib.id} node={sib} onSelect={() => setSelection([sib.id])} />)}
                </div>
              )}
              {textSiblings.map((sib) => <NodeChip key={sib.id} node={sib} onClick={() => setSelection([sib.id])} />)}
            </Section>
          )}

          <LinkTo nodeId={node.id} />

          {links.length > 0 && (
            <Section title="Connected to">
              {links.map((e) => {
                const other = project.nodes[e.from === node.id ? e.to : e.from];
                return (
                  <div key={e.id} className="flex items-center gap-1">
                    <button className="flex-1 text-left truncate text-[13px] text-ink hover:underline" onClick={() => setSelection([e.id])}>
                      <span className="idea text-[14px]">{other.title}</span>
                      {e.relation?.word && <span className="text-ink-2 italic">, {e.relation.word}</span>}
                    </button>
                    <button className="icon-btn hover:text-danger" aria-label={`Remove connection to ${other.title}`} onClick={() => hideEdge(e.id)}>
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </Section>
          )}

          <RunButtons onRun={onRun} title="Use this node" note="Runs on this node alone." selection={[node.id]} />

          <Section last>
            <div className="flex flex-wrap gap-1.5">
              <button className="btn" onClick={() => { const id = duplicateNode(node.id); if (id) setSelection([id]); }}>
                <Copy size={14} aria-hidden /> Duplicate
              </button>
              <button className="btn" onClick={onAddChild}><Plus size={14} aria-hidden /> Add child</button>
              <button className="btn btn-danger ml-auto" onClick={() => { hideNode(node.id); onClose(); }}>
                <Trash2 size={14} aria-hidden /> Remove
              </button>
            </div>
          </Section>
        </div>
      </PanelShell>

      {lightbox && imageUrl && !cropping && (
        <Lightbox src={imageUrl} alt={node.title} onCrop={() => setCropping(true)} onClose={() => setLightbox(false)} />
      )}
      {lightbox && imageUrl && cropping && (
        <CropModal
          src={imageUrl}
          mimeType={node.image?.mimeType ?? "image/png"}
          onSave={async (blob, box) => {
            const image = await fileToImage(blob);
            const id = await cropNode(node.id, image, box);
            setCropping(false);
            setLightbox(false);
            if (id) setSelection([id]);
          }}
          onClose={() => setCropping(false)}
        />
      )}
    </>
  );
}

// ── Connection panel ──────────────────────────────────────────────────────────

// For any connection: one a run made, or one the user drew. One from the brief can't be
// explored, because the brief isn't a node a run can take as input.
export function ConnectionPanel({ edgeId, onClose, onRun }: { edgeId: EdgeId; onClose: () => void; onRun: (a: ActionType) => void }) {
  const project = useProjectStore((s) => s.project)!;
  const setRelation = useProjectStore((s) => s.setRelation);
  const suggestRelation = useProjectStore((s) => s.suggestRelation);
  const hideEdge = useProjectStore((s) => s.hideEdge);
  const setSelection = useProjectStore((s) => s.setSelection);
  const [suggesting, setSuggesting] = useState(false);
  const edge = project.edges[edgeId];
  if (!edge) return null;
  const fromBrief = edge.from === BRIEF_ID;
  const from = project.nodes[edge.from];
  const to = project.nodes[edge.to];
  if (!to) return null;
  const relation = edge.relation;
  const fromTitle = fromBrief ? "The brief" : from?.title;
  const reading = readingFor(fromBrief ? "brief" : from?.role ?? "note", to.role).reading;

  const suggest = async () => {
    setSuggesting(true);
    await suggestRelation(edge.id);
    setSuggesting(false);
  };

  return (
    <PanelShell label="Connection details">
      <PanelHeader kind="Connection" title={`${fromTitle} and ${to.title}`} subtitle={`${fromTitle} ${reading} ${to.title}`} onClose={onClose} />
      <div className="flex-1 overflow-y-auto">
        <Section>
          <EditField label="Word" value={relation?.word ?? ""} singleLine placeholder="For example, holding back"
            onCommit={(word) => setRelation(edge.id, { word, explanation: relation?.explanation })} />
          <EditField label="Explanation" value={relation?.explanation ?? ""} placeholder="How do these two connect?"
            onCommit={(explanation) => setRelation(edge.id, { word: relation?.word ?? "", explanation })} />
          <button className="btn self-start" onClick={suggest} disabled={suggesting} aria-busy={suggesting}>
            <Sparkles size={14} aria-hidden /> {suggesting ? "Suggesting…" : relation ? "Suggest again" : "Suggest connection"}
          </button>
          <div className="flex flex-col gap-1.5">
            {fromBrief && <p className="text-[13px] text-ink-2">The project brief</p>}
            {from && <NodeChip node={from} onClick={() => setSelection([from.id])} />}
            <NodeChip node={to} onClick={() => setSelection([to.id])} />
          </div>
        </Section>
        {!fromBrief && (
          <RunButtons onRun={onRun} title="Explore this connection" note="Runs on the connection: ideas between the two ends, or one expressed through the other." selection={[edge.id]} />
        )}
        <Section last>
          <button className="btn btn-danger self-start" onClick={() => { hideEdge(edge.id); onClose(); }}>
            <Trash2 size={14} aria-hidden /> Remove connection
          </button>
          {edge.kind === "derived_from" && !fromBrief && (
            <p className="hint">{to.title} will no longer come from {fromTitle}, so it may move in the tree.</p>
          )}
        </Section>
      </div>
    </PanelShell>
  );
}

// ── Brief panel ───────────────────────────────────────────────────────────────

export function BriefPanel({ onClose, onRun }: { onClose: () => void; onRun: (a: ActionType) => void }) {
  const project = useProjectStore((s) => s.project)!;
  const setTitle = useProjectStore((s) => s.setTitle);
  const setBrief = useProjectStore((s) => s.setBrief);
  return (
    <PanelShell label="Project brief">
      <PanelHeader kind="Project brief" title={project.title} onClose={onClose} />
      <div className="flex-1 overflow-y-auto">
        <Section>
          <EditField label="Project name" value={project.title} onCommit={setTitle} singleLine idea />
          <EditField label="Brief" value={project.brief} onCommit={setBrief} rows={10} idea
            placeholder="What are you designing, for whom, and what should it feel like?" />
        </Section>
        <RunButtons onRun={onRun} title="Start from the brief" note="Runs on the brief, with nothing selected." selection={[]} />
      </div>
    </PanelShell>
  );
}

// ── Crop modal ────────────────────────────────────────────────────────────────

// Returns the cropped image and its box on Gemini's 0–1000 scale
// ([ymin, xmin, ymax, xmax]) relative to the source image.
function CropModal({
  src, mimeType, onSave, onClose,
}: {
  src: string;
  mimeType: string;
  onSave: (blob: Blob, box: Region["box"]) => void;
  onClose: () => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onDialogKeyDown = useDialogFocus(dialogRef, onClose, "[data-autofocus]");
  const [ready, setReady] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const dragRef = useRef<{
    handle: "move" | "nw" | "ne" | "sw" | "se";
    startX: number; startY: number;
    startCrop: { x: number; y: number; w: number; h: number };
  } | null>(null);
  function handleImageLoad() {
    const img = imgRef.current!;
    const m = 0.1;
    setCrop({ x: img.clientWidth * m, y: img.clientHeight * m, w: img.clientWidth * (1 - 2 * m), h: img.clientHeight * (1 - 2 * m) });
    setReady(true);
  }

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  function onHandlePointerDown(e: React.PointerEvent, handle: "move" | "nw" | "ne" | "sw" | "se") {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { handle, startX: e.clientX, startY: e.clientY, startCrop: { ...crop } };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current || !imgRef.current) return;
    const { handle, startX, startY, startCrop } = dragRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const maxW = imgRef.current.clientWidth;
    const maxH = imgRef.current.clientHeight;
    const MIN = 20;
    let { x, y, w, h } = startCrop;
    if (handle === "move") {
      x = clamp(x + dx, 0, maxW - w);
      y = clamp(y + dy, 0, maxH - h);
    } else if (handle === "nw") {
      const nx = clamp(x + dx, 0, x + w - MIN); const ny = clamp(y + dy, 0, y + h - MIN);
      w += x - nx; h += y - ny; x = nx; y = ny;
    } else if (handle === "ne") {
      const ny = clamp(y + dy, 0, y + h - MIN);
      w = clamp(w + dx, MIN, maxW - x); h += y - ny; y = ny;
    } else if (handle === "sw") {
      const nx = clamp(x + dx, 0, x + w - MIN);
      w += x - nx; x = nx; h = clamp(h + dy, MIN, maxH - y);
    } else {
      w = clamp(w + dx, MIN, maxW - x); h = clamp(h + dy, MIN, maxH - y);
    }
    setCrop({ x, y, w, h });
  }

  function handleApply() {
    const img = imgRef.current!;
    const cw = img.clientWidth;
    const ch = img.clientHeight;
    const sx = img.naturalWidth / cw;
    const sy = img.naturalHeight / ch;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(crop.w * sx);
    canvas.height = Math.round(crop.h * sy);
    canvas.getContext("2d")!.drawImage(img, Math.round(crop.x * sx), Math.round(crop.y * sy), canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    const box: Region["box"] = [
      Math.round((crop.y / ch) * 1000),
      Math.round((crop.x / cw) * 1000),
      Math.round(((crop.y + crop.h) / ch) * 1000),
      Math.round(((crop.x + crop.w) / cw) * 1000),
    ];
    const type = mimeType === "image/jpeg" ? "image/jpeg" : "image/png";
    canvas.toBlob((blob) => { if (blob) onSave(blob, box); }, type, 0.92);
  }

  const HANDLE = 12;
  const handles: Array<{ id: "nw" | "ne" | "sw" | "se"; left: number; top: number; cursor: string }> = [
    { id: "nw", left: crop.x - HANDLE / 2,          top: crop.y - HANDLE / 2,          cursor: "nwse-resize" },
    { id: "ne", left: crop.x + crop.w - HANDLE / 2, top: crop.y - HANDLE / 2,          cursor: "nesw-resize" },
    { id: "sw", left: crop.x - HANDLE / 2,          top: crop.y + crop.h - HANDLE / 2, cursor: "nesw-resize" },
    { id: "se", left: crop.x + crop.w - HANDLE / 2, top: crop.y + crop.h - HANDLE / 2, cursor: "nwse-resize" },
  ];

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Crop a region" className="fixed inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center gap-4 p-8"
      onKeyDown={onDialogKeyDown}>
      <div className="flex items-center gap-2">
        <p className="text-white/80 text-[13px] mr-2">Drag the box or its corners to choose a region</p>
        <button data-autofocus onClick={handleApply} className="btn btn-primary bg-white text-ink border-white hover:bg-white/90">Save as new node</button>
        <button onClick={onClose} className="btn">Cancel</button>
      </div>
      <div className="relative inline-block select-none" onPointerMove={onPointerMove} onPointerUp={() => { dragRef.current = null; }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} src={src} alt="Image to crop" className="block max-w-[80vw] max-h-[70vh] object-contain" onLoad={handleImageLoad} draggable={false} />
        {ready && (
          <>
            <div
              style={{
                position: "absolute", left: crop.x, top: crop.y, width: crop.w, height: crop.h,
                border: "1.5px solid rgb(255 255 255 / 0.9)", boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.55)", cursor: "move",
              }}
              onPointerDown={(e) => onHandlePointerDown(e, "move")}
            >
              {[1, 2].map((n) => (
                <div key={`v${n}`} style={{ position: "absolute", left: `${(n / 3) * 100}%`, top: 0, bottom: 0, width: 1, background: "rgb(255 255 255 / 0.3)" }} />
              ))}
              {[1, 2].map((n) => (
                <div key={`h${n}`} style={{ position: "absolute", top: `${(n / 3) * 100}%`, left: 0, right: 0, height: 1, background: "rgb(255 255 255 / 0.3)" }} />
              ))}
            </div>
            {handles.map(({ id, left, top, cursor }) => (
              <div key={id}
                style={{ position: "absolute", left, top, width: HANDLE, height: HANDLE, background: "white", border: "1px solid rgb(0 0 0 / 0.4)", borderRadius: 3, cursor }}
                onPointerDown={(e) => onHandlePointerDown(e, id)} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
