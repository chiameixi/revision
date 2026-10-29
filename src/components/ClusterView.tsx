"use client";

// The collections view: user collections plus one group per role for nodes
// that aren't in any collection yet. Drag cards between them, or select cards
// and use "Add to collection" in the selection bar. Reads and writes through
// the store; dragged positions are saved in views.cluster.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  applyNodeChanges,
  getNodesBounds,
  getViewportForBounds,
  type Node as FlowNode,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import { toPng } from "html-to-image";
import "@xyflow/react/dist/style.css";
import { CheckSquare, Pencil, Plus, Trash2, X } from "lucide-react";
import { useProjectStore } from "@/store/projectStore";
import { visibleNodes } from "@/domain/graph";
import type { Collection, CollectionId, IdeaNode, NodeId, ProjectState, Role } from "@/domain/types";
import { useImageUrl } from "./useImageUrl";
import { COLLECTION_COLORS, COLLECTION_COLOR_NAMES, ROLES, ROLE_LABEL_PLURAL, ROLE_STYLE } from "./nodeStyle";
import { Menu, RoleBadge } from "./ui";
import styles from "./TreeView.module.css";

const DRAG_NODE = "application/x-node-id";
const DRAG_FROM = "application/x-from-collection";
const GROUP_W = 340;
const COL_GAP = 32;
const ACCENT = "var(--color-accent)";

// ── Context for the two container node types ──────────────────────────────────

interface Ctx {
  nodes: Record<NodeId, IdeaNode>;      // visible nodes only
  collections: Record<CollectionId, Collection>;
  unassigned: Record<Role, IdeaNode[]>;
  selected: Set<string>;
  dragOverId: string | null;
  setDragOverId: (id: string | null) => void;
  onSelect: (id: NodeId, additive: boolean) => void;
  onDrop: (nodeId: NodeId, from: CollectionId | null, to: CollectionId | null) => void;
}

const ClusterCtx = createContext<Ctx | null>(null);
function useCtx() {
  const ctx = useContext(ClusterCtx);
  if (!ctx) throw new Error("ClusterCtx missing");
  return ctx;
}

function dropZone(ctx: Ctx, zoneId: string, to: CollectionId | null) {
  return {
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes(DRAG_NODE)) e.preventDefault(); },
    onDragEnter: (e: React.DragEvent) => { e.preventDefault(); if (e.dataTransfer.types.includes(DRAG_NODE)) ctx.setDragOverId(zoneId); },
    onDragLeave: (e: React.DragEvent) => {
      if (e.relatedTarget && (e.currentTarget as Element).contains(e.relatedTarget as Element)) return;
      ctx.setDragOverId(null);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      ctx.setDragOverId(null);
      const nodeId = e.dataTransfer.getData(DRAG_NODE);
      if (nodeId) ctx.onDrop(nodeId, e.dataTransfer.getData(DRAG_FROM) || null, to);
    },
  };
}

// ── Cards ─────────────────────────────────────────────────────────────────────

function useCardProps(node: IdeaNode, from: CollectionId | null) {
  const { onSelect } = useCtx();
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.stopPropagation();
      e.dataTransfer.setData(DRAG_NODE, node.id);
      if (from) e.dataTransfer.setData(DRAG_FROM, from);
      e.dataTransfer.effectAllowed = "move";
    },
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); onSelect(node.id, e.shiftKey); },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onSelect(node.id, e.shiftKey); }
    },
    role: "button" as const,
    tabIndex: 0,
  };
}

function RemoveFromCollection({ onRemove, title }: { onRemove: () => void; title: string }) {
  return (
    <button className="nodrag absolute top-1 right-1 w-6 h-6 rounded-md flex items-center justify-center bg-white/90 text-ink-2 hover:text-danger opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      aria-label={`Take ${title} out of this collection`} onClick={(e) => { e.stopPropagation(); onRemove(); }}>
      <X size={13} />
    </button>
  );
}

function TextCard({ node, from, onRemove }: { node: IdeaNode; from: CollectionId | null; onRemove?: () => void }) {
  const { selected } = useCtx();
  const props = useCardProps(node, from);
  const s = ROLE_STYLE[node.role];
  const on = selected.has(node.id);
  return (
    <div {...props} aria-pressed={on} aria-label={`${node.role}: ${node.title}`}
      className="nodrag nowheel relative group cursor-pointer rounded-md border px-2.5 py-2 pr-7 flex flex-col gap-1"
      style={{ background: s.fill, borderColor: on ? ACCENT : s.border, boxShadow: on ? `0 0 0 2px ${ACCENT}` : undefined }}>
      <RoleBadge role={node.role} />
      <p className="idea text-[14px] leading-snug text-ink line-clamp-3">{node.title}</p>
      {onRemove && <RemoveFromCollection onRemove={onRemove} title={node.title} />}
    </div>
  );
}

function ImageCard({ node, from, onRemove }: { node: IdeaNode; from: CollectionId | null; onRemove?: () => void }) {
  const { selected } = useCtx();
  const props = useCardProps(node, from);
  const url = useImageUrl(node.image?.imageId);
  const on = selected.has(node.id);
  return (
    <div {...props} aria-pressed={on} aria-label={`${node.role} image: ${node.title}`} title={node.title}
      className="nodrag nowheel relative group cursor-pointer rounded-md overflow-hidden border aspect-[4/3] bg-subtle"
      style={{ borderColor: on ? ACCENT : "var(--color-line)", boxShadow: on ? `0 0 0 2px ${ACCENT}` : undefined }}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="w-full h-full object-cover" />
      )}
      {node.role !== "visual" && <span className="absolute left-1 top-1"><RoleBadge role={node.role} onImage /></span>}
      {onRemove && <RemoveFromCollection onRemove={onRemove} title={node.title} />}
    </div>
  );
}

// Text cards two across, images three across.
function CardGrid({ items, from, onRemove }: { items: IdeaNode[]; from: CollectionId | null; onRemove?: (id: NodeId) => void }) {
  const images = items.filter((n) => n.image);
  const texts = items.filter((n) => !n.image);
  return (
    <div className="flex flex-col gap-2">
      {texts.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {texts.map((n) => <TextCard key={n.id} node={n} from={from} onRemove={onRemove && (() => onRemove(n.id))} />)}
        </div>
      )}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {images.map((n) => <ImageCard key={n.id} node={n} from={from} onRemove={onRemove && (() => onRemove(n.id))} />)}
        </div>
      )}
    </div>
  );
}

// ── Collection container ──────────────────────────────────────────────────────

function CollectionContainer({ data }: NodeProps) {
  const ctx = useCtx();
  const updateCollection = useProjectStore((s) => s.updateCollection);
  const deleteCollection = useProjectStore((s) => s.deleteCollection);
  const removeFromCollection = useProjectStore((s) => s.removeFromCollection);
  const setSelection = useProjectStore((s) => s.setSelection);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: "", description: "" });

  const id = data.collectionId as CollectionId;
  const col = ctx.collections[id];
  if (!col) return null;
  const items = col.nodeIds.map((n) => ctx.nodes[n]).filter(Boolean);
  const isOver = ctx.dragOverId === id;
  const save = () => {
    if (!form.title.trim()) return;
    updateCollection(id, { title: form.title.trim(), description: form.description.trim() || undefined });
    setEditing(false);
  };

  return (
    <section aria-label={`Collection: ${col.title}`} {...dropZone(ctx, id, id)}
      className="rounded-lg bg-surface border overflow-hidden"
      style={{ width: GROUP_W, borderColor: isOver ? col.color : "var(--color-line)", boxShadow: isOver ? `0 0 0 2px ${col.color}` : "var(--shadow-float)" }}>
      <header className="flex items-center gap-2 pl-3 pr-1.5 h-11 border-b cursor-grab" style={{ borderColor: `${col.color}55`, background: `${col.color}14` }}>
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: col.color }} aria-hidden />
        <h2 className="idea text-[16px] text-ink truncate flex-1">{col.title}</h2>
        <span className="text-[12px] text-muted tabular-nums">{items.length}</span>
        <button className="nodrag icon-btn" aria-label={`Select everything in ${col.title}`} title="Select all"
          disabled={!items.length} onClick={() => setSelection(items.map((n) => n.id))}><CheckSquare size={14} /></button>
        <button className="nodrag icon-btn" aria-label={`Rename ${col.title}`} title="Rename"
          onClick={() => { setForm({ title: col.title, description: col.description ?? "" }); setEditing(true); }}><Pencil size={14} /></button>
        <button className="nodrag icon-btn hover:text-danger" aria-label={`Delete ${col.title} (its nodes stay)`} title="Delete collection"
          onClick={() => deleteCollection(id)}><Trash2 size={14} /></button>
      </header>

      {editing && (
        <form className="nodrag p-3 border-b border-line flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); save(); }}
          onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}>
          <label className="field-label" htmlFor={`col-title-${id}`}>Name</label>
          <input id={`col-title-${id}`} autoFocus className="field" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <label className="field-label" htmlFor={`col-desc-${id}`}>Description (optional)</label>
          <input id={`col-desc-${id}`} className="field" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <div className="flex gap-1.5 justify-end">
            <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>Cancel</button>
            <button type="submit" className="btn btn-sm btn-primary">Save</button>
          </div>
        </form>
      )}
      {!editing && col.description && <p className="px-3 pt-2.5 text-[13px] text-ink-2">{col.description}</p>}

      <div className="nodrag nowheel p-3">
        {items.length === 0 ? (
          <p className="rounded-md border border-dashed py-6 text-center text-[13px] text-muted" style={{ borderColor: `${col.color}90` }}>
            {isOver ? "Drop to add" : "Drag cards here, or select some and use Add to collection"}
          </p>
        ) : (
          <CardGrid items={items} from={id} onRemove={(nodeId) => removeFromCollection(id, nodeId)} />
        )}
      </div>
    </section>
  );
}

// ── Unassigned nodes, grouped by role ─────────────────────────────────────────

function RoleGroup({ data }: NodeProps) {
  const ctx = useCtx();
  const role = data.role as Role;
  const items = ctx.unassigned[role];
  const zoneId = `role::${role}`;
  const isOver = ctx.dragOverId === zoneId;
  return (
    <section aria-label={`${ROLE_LABEL_PLURAL[role]} not in a collection`} {...dropZone(ctx, zoneId, null)}
      className="rounded-lg border overflow-hidden"
      style={{ width: GROUP_W, background: ROLE_STYLE[role].group, borderColor: isOver ? "var(--color-ink-2)" : "var(--color-line)" }}>
      <header className="flex items-baseline gap-2 px-3 h-10 pt-2.5 cursor-grab">
        <h2 className="text-[13px] font-semibold text-ink">{ROLE_LABEL_PLURAL[role]}</h2>
        <span className="text-[12px] text-muted">{items.length} not in a collection</span>
      </header>
      <div className="nodrag nowheel px-3 pb-3"><CardGrid items={items} from={null} /></div>
    </section>
  );
}

const nodeTypes = { collection: CollectionContainer, role: RoleGroup };

// Rough height of a group from what's in it, so groups can be packed into
// columns without overlapping before React Flow has measured them.
function estimateHeight(items: IdeaNode[], extra = 0): number {
  const texts = items.filter((n) => !n.image).length;
  const images = items.filter((n) => n.image).length;
  const body = items.length === 0 ? 70 : Math.ceil(texts / 2) * 78 + Math.ceil(images / 3) * 82 + (texts && images ? 8 : 0);
  return 44 + 24 + body + extra;
}

function buildFlowNodes(p: ProjectState, ctx: Pick<Ctx, "nodes" | "unassigned">): FlowNode[] {
  const saved = p.views.cluster.positions;
  const cols = Object.values(p.collections).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const groups: { id: string; type: string; data: Record<string, unknown>; h: number }[] = [
    ...cols.map((c) => ({
      id: c.id, type: "collection", data: { collectionId: c.id },
      h: estimateHeight(c.nodeIds.map((n) => ctx.nodes[n]).filter(Boolean), c.description ? 28 : 0),
    })),
    ...ROLES.filter((r) => ctx.unassigned[r].length > 0).map((r) => ({
      id: `role::${r}`, type: "role", data: { role: r }, h: estimateHeight(ctx.unassigned[r]) - 4,
    })),
  ];
  // Pack into two columns, each group into the shorter one.
  const colY = [20, 20];
  return groups.map((g) => {
    const c = colY[0] <= colY[1] ? 0 : 1;
    const position = saved[g.id] ?? { x: 20 + c * (GROUP_W + COL_GAP), y: colY[c] };
    colY[c] += g.h + 24;
    return { id: g.id, type: g.type, data: g.data, position };
  });
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ClusterView() {
  const project = useProjectStore((s) => s.project)!;
  const selection = useProjectStore((s) => s.selection);
  const setSelection = useProjectStore((s) => s.setSelection);
  const toggleSelected = useProjectStore((s) => s.toggleSelected);
  const clearSelection = useProjectStore((s) => s.clearSelection);
  const moveToCollection = useProjectStore((s) => s.moveToCollection);
  const removeFromCollection = useProjectStore((s) => s.removeFromCollection);
  const createCollection = useProjectStore((s) => s.createCollection);
  const updateCollection = useProjectStore((s) => s.updateCollection);
  const moveNode = useProjectStore((s) => s.moveNode);
  const resetLayout = useProjectStore((s) => s.resetLayout);

  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [newCol, setNewCol] = useState({ open: false, title: "", description: "", colorIdx: 0 });
  const [rf, setRf] = useState<ReactFlowInstance | null>(null);

  const shown = useMemo(() => visibleNodes(project), [project]);
  const ctx: Ctx = useMemo(() => {
    const nodes = Object.fromEntries(shown.map((n) => [n.id, n]));
    const inCollection = new Set(Object.values(project.collections).flatMap((c) => c.nodeIds));
    const unassigned = Object.fromEntries(ROLES.map((r) => [r, shown.filter((n) => n.role === r && !inCollection.has(n.id))])) as Record<Role, IdeaNode[]>;
    return {
      nodes,
      collections: project.collections,
      unassigned,
      selected: new Set(selection),
      dragOverId,
      setDragOverId,
      onSelect: (id, additive) => {
        if (additive) toggleSelected(id);
        else setSelection(selection.length === 1 && selection[0] === id ? [] : [id]);
      },
      onDrop: (nodeId, from, to) => {
        if (from === to) return;
        if (to) moveToCollection(nodeId, from, to);
        else if (from) removeFromCollection(from, nodeId);
      },
    };
  }, [shown, project.collections, selection, dragOverId, setSelection, toggleSelected, moveToCollection, removeFromCollection]);

  // Layout follows content; React Flow owns positions only while dragging.
  const computed = useMemo(() => buildFlowNodes(project, ctx), [project, ctx]);
  const [flowNodes, setFlowNodes] = useState<FlowNode[]>(computed);
  useEffect(() => {
    setFlowNodes((current) => {
      const live = new Map(current.map((n) => [n.id, n]));
      return computed.map((n) => {
        const existing = live.get(n.id);
        return existing ? { ...n, measured: existing.measured, position: existing.dragging ? existing.position : n.position } : n;
      });
    });
  }, [computed]);

  // Refit when groups appear or disappear, readable rather than all-in-view.
  const groupKey = computed.map((n) => n.id).join(",");
  useEffect(() => {
    const t = setTimeout(() => rf?.fitView({ padding: 0.1, maxZoom: 1, minZoom: 0.7, duration: 250 }), 60);
    return () => clearTimeout(t);
  }, [groupKey, rf]);

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    setFlowNodes((nds) => applyNodeChanges(changes.filter((c) => c.type !== "select"), nds));
  }, []);

  function addCollection(e?: React.FormEvent) {
    e?.preventDefault();
    if (!newCol.title.trim()) return;
    const id = createCollection(newCol.title.trim(), COLLECTION_COLORS[newCol.colorIdx]);
    if (id && newCol.description.trim()) updateCollection(id, { description: newCol.description.trim() });
    setNewCol({ open: false, title: "", description: "", colorIdx: (newCol.colorIdx + 1) % COLLECTION_COLORS.length });
  }

  const exportPng = useCallback(async () => {
    if (!rf) return;
    const nodes = rf.getNodes();
    if (!nodes.length) return;
    const bounds = getNodesBounds(nodes);
    const W = 3200;
    const H = Math.round(W * (bounds.height / bounds.width)) || 2000;
    const { x, y, zoom } = getViewportForBounds(bounds, W, H, 0.05, 4, 0.08);
    const viewport = document.querySelector(".react-flow__viewport") as HTMLElement | null;
    if (!viewport) return;
    const dataUrl = await toPng(viewport, {
      backgroundColor: "#f3f4f6", width: W, height: H,
      style: { width: `${W}px`, height: `${H}px`, transform: `translate(${x}px, ${y}px) scale(${zoom})` },
    });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${project.title || "collections"}-collections-${Date.now()}.png`;
    a.click();
  }, [rf, project.title]);

  if (shown.length === 0 && Object.keys(project.collections).length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="floating max-w-sm px-5 py-4 text-center">
          <p className="text-[15px] font-semibold text-ink mb-1">Nothing to group yet</p>
          <p className="text-[13px] text-ink-2">Build the tree first, then group its nodes into collections here.</p>
        </div>
      </div>
    );
  }

  return (
    <ClusterCtx.Provider value={ctx}>
      <div className={`relative flex-1 h-full overflow-hidden ${styles.canvas}`}>
        {/* Toolbar first in the page so Tab reaches it before the cards. */}
      <div className="absolute top-3 right-3 z-10 flex items-start gap-2">
        {newCol.open ? (
          <form className="floating p-4 w-72 flex flex-col gap-3" onSubmit={addCollection}
            onKeyDown={(e) => { if (e.key === "Escape") setNewCol((c) => ({ ...c, open: false })); }}>
            <h2 className="text-[15px] font-semibold text-ink">New collection</h2>
            <div>
              <label htmlFor="new-col-title" className="field-label">Name</label>
              <input id="new-col-title" autoFocus className="field" value={newCol.title}
                onChange={(e) => setNewCol((c) => ({ ...c, title: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="new-col-desc" className="field-label">Description (optional)</label>
              <input id="new-col-desc" className="field" value={newCol.description}
                onChange={(e) => setNewCol((c) => ({ ...c, description: e.target.value }))} />
            </div>
            <fieldset>
              <legend className="field-label">Colour</legend>
              <div role="radiogroup" className="flex gap-1.5 flex-wrap">
                {COLLECTION_COLORS.map((color, i) => (
                  <button type="button" key={color} role="radio" aria-checked={newCol.colorIdx === i} aria-label={COLLECTION_COLOR_NAMES[i]}
                    onClick={() => setNewCol((c) => ({ ...c, colorIdx: i }))}
                    className="w-6 h-6 rounded-full border-2 transition-transform"
                    style={{ background: color, borderColor: newCol.colorIdx === i ? "var(--color-ink)" : "transparent", transform: newCol.colorIdx === i ? "scale(1.1)" : undefined }} />
                ))}
              </div>
            </fieldset>
            <div className="flex gap-1.5 justify-end">
              <button type="button" className="btn" onClick={() => setNewCol((c) => ({ ...c, open: false, title: "", description: "" }))}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={!newCol.title.trim()}>Create</button>
            </div>
          </form>
        ) : (
          <button className="btn btn-primary shadow-[var(--shadow-float)]" onClick={() => setNewCol((c) => ({ ...c, open: true }))}>
            <Plus size={15} aria-hidden /> New collection
          </button>
        )}
        <div className="shadow-[var(--shadow-float)] rounded-md">
          <Menu label="More collection actions" items={[
            { label: "Tidy layout", onSelect: () => resetLayout("cluster"), disabled: Object.keys(project.views.cluster.positions).length === 0 },
            { label: "Export as PNG", onSelect: exportPng },
          ]} />
        </div>
      </div>
        <ReactFlow
          proOptions={{ hideAttribution: true }}
          nodes={flowNodes}
          edges={[]}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStop={(_e, n) => moveNode("cluster", n.id, n.position)}
          onInit={setRf}
          fitView
          fitViewOptions={{ padding: 0.1, maxZoom: 1, minZoom: 0.7 }}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable={false}
          panOnScroll
          zoomOnScroll={false}
          minZoom={0.3}
          maxZoom={2}
          onPaneClick={clearSelection}
          aria-label="Collections"
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#c9ccd3" />
        </ReactFlow>
      </div>
    </ClusterCtx.Provider>
  );
}
