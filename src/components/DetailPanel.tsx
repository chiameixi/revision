"use client";

// Side panels shared by the tree and cluster views: one for a node, one for a
// user-drawn link, one for the brief. All read and write through the store.
// Text fields save on blur, so the study log gets one event per edit.

import { useEffect, useMemo, useRef, useState } from "react";
import { useProjectStore } from "@/store/projectStore";
import { visibleParents } from "@/domain/graph";
import type { ActionType, EdgeId, IdeaNode, NodeId, Region, RoleDetails } from "@/domain/types";
import { fileToImage } from "@/services/images";
import { useImageUrl } from "./useImageUrl";
import { ACTIONS, BODY_LABEL, ROLES, ROLE_LABEL, ROLE_STYLE, originLabel } from "./nodeStyle";
import styles from "./TreeView.module.css";

// ── Shared bits ───────────────────────────────────────────────────────────────

function PanelShell({ children }: { children: React.ReactNode }) {
  return <aside className="w-full h-full border-l border-[#e4e3e0] bg-white flex flex-col overflow-hidden">{children}</aside>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[9px] text-[#bbb] uppercase tracking-wide font-semibold mb-2">{children}</p>;
}

export function EditField({
  label, value, onCommit, singleLine, placeholder,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  singleLine?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(value); }, [value]);

  const commit = () => {
    focused.current = false;
    if (draft !== value) onCommit(draft);
  };
  const cls = "w-full text-[11px] text-[#333] bg-[#fafaf8] border border-transparent hover:border-[#e4e3e0] focus:border-[#888] rounded px-2 py-1 outline-none leading-relaxed resize-none placeholder-[#ccc] transition-colors";
  const common = {
    className: cls,
    value: draft,
    placeholder,
    onFocus: () => { focused.current = true; },
    onBlur: commit,
  };
  return (
    <div>
      <p className="text-[9px] font-semibold uppercase tracking-wide text-[#bbb] mb-0.5 px-2">{label}</p>
      {singleLine ? (
        <input {...common} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
      ) : (
        <textarea {...common} rows={3} onChange={(e) => setDraft(e.target.value)} />
      )}
    </div>
  );
}

function RunButtons({ onRun, label }: { onRun: (a: ActionType) => void; label: string }) {
  return (
    <>
      <p className="text-[9px] text-[#bbb] uppercase tracking-wide font-semibold px-1 pt-1 pb-0.5">{label}</p>
      {ACTIONS.map((a) => (
        <button key={a.id} onClick={() => onRun(a.id)} title={a.description}
          className="w-full text-left text-[11px] px-3 py-1.5 rounded-lg hover:bg-blue-50 hover:text-[#2563eb] text-[#555] transition-colors">
          {a.label} →
        </button>
      ))}
    </>
  );
}

function NodeChip({ node, onClick }: { node: IdeaNode; onClick: () => void }) {
  const s = ROLE_STYLE[node.role];
  return (
    <button onClick={onClick} className="text-left px-2.5 py-2 rounded-lg border transition-colors hover:opacity-80"
      style={{ borderColor: s.border, background: s.bg }}>
      <span className="text-[8px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded mr-1.5"
        style={{ background: s.badgeBg, color: s.badgeText }}>{ROLE_LABEL[node.role]}</span>
      <span className="text-[10px] font-medium text-[#333] leading-snug">{node.title}</span>
    </button>
  );
}

function SiblingImage({ node, onSelect, onZoom }: { node: IdeaNode; onSelect: () => void; onZoom: (url: string) => void }) {
  const url = useImageUrl(node.image?.imageId);
  return (
    <div className="relative group/img aspect-square rounded overflow-hidden bg-[#f7f6f3]">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={node.title} className="w-full h-full object-cover cursor-pointer" onClick={onSelect} />
      )}
      {url && (
        <button className="absolute top-1 right-1 opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/40 text-white text-[10px] px-1.5 py-0.5 rounded"
          onClick={() => onZoom(url)} title="Zoom">⤢</button>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent px-1.5 py-1 opacity-0 group-hover/img:opacity-100 transition-opacity pointer-events-none">
        <p className="text-white text-[8px] leading-tight truncate">{originLabel(node)}</p>
      </div>
    </div>
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

  const node = project.nodes[nodeId];
  const imageUrl = useImageUrl(node?.image?.imageId);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [cropping, setCropping] = useState(false);

  const parents = useMemo(() => (node ? visibleParents(project, node.id).map((id) => project.nodes[id]) : []), [project, node]);
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
  const s = ROLE_STYLE[node.role];
  const imageSiblings = siblings.filter((n) => n.image);
  const textSiblings = siblings.filter((n) => !n.image);
  const setDetail = (key: keyof RoleDetails, v: string) =>
    editNode(node.id, { details: { ...node.details, [key]: v || undefined } });

  return (
    <>
      <PanelShell>
        <div className="px-4 py-3 border-b border-[#f0efec] shrink-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-1" title="Change what this node is">
              {ROLES.map((r) => {
                const rs = ROLE_STYLE[r];
                const active = node.role === r;
                return (
                  <button key={r} onClick={() => !active && retagNode(node.id, r)}
                    className={`text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 transition-colors ${styles.sq}`}
                    style={active ? { background: rs.badgeBg, color: rs.badgeText } : { background: "rgba(0,0,0,0.06)", color: "rgba(0,0,0,0.35)" }}>
                    {r}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5 shrink-0 -mt-0.5">
              <button onClick={() => { hideNode(node.id); onClose(); }} className="text-[11px] text-[#ccc] hover:text-red-400 transition-colors">✕ Remove</button>
              <span className="text-[#e4e3e0]">|</span>
              <button onClick={onClose} className="text-[11px] text-[#bbb] hover:text-[#555] transition-colors">Close</button>
            </div>
          </div>
          <p className="text-[12px] font-semibold text-[#222] leading-snug">{node.title}</p>
          <p className="text-[10px] text-[#bbb] mt-0.5">{originLabel(node)}</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {imageUrl && (
            <div className="border-b border-[#f0efec]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt={node.title} className="w-full object-cover cursor-zoom-in" onClick={() => setLightbox(imageUrl)} />
              <p className="px-3 py-2 text-[9px] text-[#bbb]">Click to enlarge or crop a region</p>
            </div>
          )}

          {parents.length > 0 && (
            <div className="px-4 py-3 border-b border-[#f0efec]">
              <SectionLabel>Came from</SectionLabel>
              <div className="flex flex-col gap-1.5">
                {parents.map((p) => <NodeChip key={p.id} node={p} onClick={() => setSelection([p.id])} />)}
              </div>
            </div>
          )}

          {imageSiblings.length > 0 && (
            <div className="border-b border-[#f0efec] p-3">
              <SectionLabel>Images from the same run</SectionLabel>
              <div className="grid grid-cols-3 gap-1.5">
                {imageSiblings.map((sib) => (
                  <SiblingImage key={sib.id} node={sib} onSelect={() => setSelection([sib.id])} onZoom={setLightbox} />
                ))}
              </div>
            </div>
          )}

          <div className="p-4 border-b border-[#f0efec] flex flex-col gap-3" style={{ borderTop: `3px solid ${s.bg}` }}>
            <EditField label="Title" value={node.title} onCommit={(v) => editNode(node.id, { title: v })} singleLine />
            <EditField label={BODY_LABEL[node.role]} value={node.body ?? ""} onCommit={(v) => editNode(node.id, { body: v || undefined })} />
            {(node.role === "concept" || node.details?.rationale) && (
              <EditField label="Rationale" value={node.details?.rationale ?? ""} onCommit={(v) => setDetail("rationale", v)} />
            )}
            {(node.role === "motif" || node.details?.howItConveysIdea) && (
              <EditField label="How it conveys the idea" value={node.details?.howItConveysIdea ?? ""} onCommit={(v) => setDetail("howItConveysIdea", v)} />
            )}
            {(node.role === "motif" || node.details?.category) && (
              <EditField label="Category" value={node.details?.category ?? ""} onCommit={(v) => setDetail("category", v)} singleLine />
            )}
          </div>

          {textSiblings.length > 0 && (
            <div className="p-3 border-b border-[#f0efec]">
              <SectionLabel>From the same run ({siblings.length})</SectionLabel>
              <div className="flex flex-col gap-1.5">
                {textSiblings.map((sib) => <NodeChip key={sib.id} node={sib} onClick={() => setSelection([sib.id])} />)}
              </div>
            </div>
          )}

          {links.length > 0 && (
            <div className="p-3 border-b border-[#f0efec]">
              <SectionLabel>Linked to</SectionLabel>
              <div className="flex flex-col gap-1">
                {links.map((e) => {
                  const other = project.nodes[e.from === node.id ? e.to : e.from];
                  return (
                    <div key={e.id} className="flex items-center gap-2 text-[11px] text-[#444]">
                      <button className="flex-1 text-left truncate hover:underline" onClick={() => setSelection([e.id])}>
                        {other.title}{e.label ? <span className="italic text-[#999]"> · {e.label}</span> : null}
                      </button>
                      <button className="text-[#ccc] hover:text-red-400 text-[10px]" title="Remove link" onClick={() => hideEdge(e.id)}>✕</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="p-3 flex flex-col gap-1">
            <button onClick={() => { const id = duplicateNode(node.id); if (id) setSelection([id]); }}
              className="w-full text-left text-[11px] px-3 py-1.5 rounded-lg hover:bg-[#f5f0ff] hover:text-purple-700 text-[#555] transition-colors">
              ⧉ Duplicate node
            </button>
            <button onClick={onAddChild}
              className="w-full text-left text-[11px] px-3 py-1.5 rounded-lg hover:bg-[#f0f9f0] hover:text-green-700 text-[#555] transition-colors">
              + Add child node
            </button>
            <RunButtons onRun={onRun} label="Use this for" />
          </div>
        </div>
      </PanelShell>

      {lightbox && !cropping && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-8" onClick={() => setLightbox(null)}>
          <div className="relative max-w-4xl max-h-full" onClick={(e) => e.stopPropagation()}>
            <div className="absolute -top-9 left-0 right-0 flex items-center justify-between">
              {lightbox === imageUrl ? (
                <button onClick={() => setCropping(true)}
                  className="text-sm text-white/70 hover:text-white border border-white/30 hover:border-white/70 px-3 py-1 rounded transition-colors">
                  ⊙ Crop a region
                </button>
              ) : <span />}
              <button onClick={() => setLightbox(null)} className="text-white/60 hover:text-white text-sm transition-colors">✕ Close</button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox} alt="Full size" className="max-w-full max-h-[82vh] object-contain rounded-xl shadow-2xl" />
          </div>
        </div>
      )}

      {lightbox && cropping && (
        <CropModal
          src={lightbox}
          mimeType={node.image?.mimeType ?? "image/png"}
          onSave={async (blob, box) => {
            const image = await fileToImage(blob);
            const id = await cropNode(node.id, image, box);
            setCropping(false);
            setLightbox(null);
            if (id) setSelection([id]);
          }}
          onClose={() => setCropping(false)}
        />
      )}
    </>
  );
}

// ── Link panel ────────────────────────────────────────────────────────────────

export function LinkPanel({ edgeId, onClose, onRun }: { edgeId: EdgeId; onClose: () => void; onRun: (a: ActionType) => void }) {
  const project = useProjectStore((s) => s.project)!;
  const labelEdge = useProjectStore((s) => s.labelEdge);
  const hideEdge = useProjectStore((s) => s.hideEdge);
  const setSelection = useProjectStore((s) => s.setSelection);
  const edge = project.edges[edgeId];
  if (!edge) return null;
  const from = project.nodes[edge.from];
  const to = project.nodes[edge.to];

  return (
    <PanelShell>
      <div className="px-4 py-3 border-b border-[#f0efec] shrink-0">
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className={`text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 bg-[#64748b] text-white ${styles.sq}`}>Link</span>
          <div className="flex items-center gap-1.5 shrink-0 -mt-0.5">
            <button onClick={() => { hideEdge(edge.id); onClose(); }} className="text-[11px] text-[#ccc] hover:text-red-400 transition-colors">✕ Remove</button>
            <span className="text-[#e4e3e0]">|</span>
            <button onClick={onClose} className="text-[11px] text-[#bbb] hover:text-[#555] transition-colors">Close</button>
          </div>
        </div>
        <p className="text-[12px] font-semibold text-[#222] leading-snug">{from?.title} ↔ {to?.title}</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 border-b border-[#f0efec] flex flex-col gap-3">
          <EditField label="What connects them" value={edge.label ?? ""} onCommit={(v) => labelEdge(edge.id, v)}
            placeholder="e.g. both about holding back" />
          <div className="flex flex-col gap-1.5">
            {from && <NodeChip node={from} onClick={() => setSelection([from.id])} />}
            {to && <NodeChip node={to} onClick={() => setSelection([to.id])} />}
          </div>
        </div>
        <div className="p-3 flex flex-col gap-1">
          <RunButtons onRun={onRun} label="Explore this connection" />
        </div>
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
    <PanelShell>
      <div className="px-4 py-3 border-b border-[#f0efec] shrink-0 flex items-start justify-between gap-2">
        <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Project brief</span>
        <button onClick={onClose} className="text-[11px] text-[#bbb] hover:text-[#555] transition-colors shrink-0">Close</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        <EditField label="Title" value={project.title} onCommit={setTitle} singleLine />
        <EditField label="Brief" value={project.brief} onCommit={setBrief} placeholder="Describe your design challenge…" />
        <div className="flex flex-col gap-1 -mx-1">
          <RunButtons onRun={onRun} label="Start from the brief" />
        </div>
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

  const HANDLE = 10;
  const handles: Array<{ id: "nw" | "ne" | "sw" | "se"; left: number; top: number; cursor: string }> = [
    { id: "nw", left: crop.x - HANDLE / 2,          top: crop.y - HANDLE / 2,          cursor: "nwse-resize" },
    { id: "ne", left: crop.x + crop.w - HANDLE / 2, top: crop.y - HANDLE / 2,          cursor: "nesw-resize" },
    { id: "sw", left: crop.x - HANDLE / 2,          top: crop.y + crop.h - HANDLE / 2, cursor: "nesw-resize" },
    { id: "se", left: crop.x + crop.w - HANDLE / 2, top: crop.y + crop.h - HANDLE / 2, cursor: "nwse-resize" },
  ];

  return (
    <div className="fixed inset-0 z-[60] bg-black/92 flex flex-col items-center justify-center gap-5 p-8">
      <div className="flex items-center gap-4">
        <p className="text-white/60 text-sm">Drag to select a region</p>
        <button onClick={handleApply} className="bg-white text-[#111] text-sm px-4 py-1.5 rounded-sm hover:bg-white/90 transition-colors font-medium">
          Save as new node
        </button>
        <button onClick={onClose} className="text-white/50 hover:text-white text-sm transition-colors">Cancel</button>
      </div>
      <div className="relative inline-block select-none" onPointerMove={onPointerMove} onPointerUp={() => { dragRef.current = null; }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} src={src} alt="Crop" className="block max-w-[80vw] max-h-[70vh] object-contain" onLoad={handleImageLoad} draggable={false} />
        {ready && (
          <>
            <div
              style={{
                position: "absolute", left: crop.x, top: crop.y, width: crop.w, height: crop.h,
                border: "1.5px solid rgba(255,255,255,0.9)", boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)", cursor: "move",
              }}
              onPointerDown={(e) => onHandlePointerDown(e, "move")}
            >
              {[1, 2].map((n) => (
                <div key={`v${n}`} style={{ position: "absolute", left: `${(n / 3) * 100}%`, top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.3)" }} />
              ))}
              {[1, 2].map((n) => (
                <div key={`h${n}`} style={{ position: "absolute", top: `${(n / 3) * 100}%`, left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.3)" }} />
              ))}
            </div>
            {handles.map(({ id, left, top, cursor }) => (
              <div key={id}
                style={{ position: "absolute", left, top, width: HANDLE, height: HANDLE, background: "white", border: "1px solid rgba(0,0,0,0.4)", borderRadius: 2, cursor }}
                onPointerDown={(e) => onHandlePointerDown(e, id)} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
