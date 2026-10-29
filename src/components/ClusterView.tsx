"use client";

// The collections view: user collections plus one group per role for nodes
// that aren't in any collection yet. Drag cards between them. Reads and
// writes through the store; positions are saved in views.cluster.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Panel,
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
import { useProjectStore } from "@/store/projectStore";
import { visibleNodes } from "@/domain/graph";
import type { Collection, CollectionId, IdeaNode, NodeId, ProjectState, Role } from "@/domain/types";
import { useImageUrl } from "./useImageUrl";
import { COLLECTION_COLORS, ROLES, ROLE_LABEL, ROLE_LABEL_PLURAL, ROLE_STYLE, originLabel } from "./nodeStyle";
import styles from "./ClusterView.module.css";

const DRAG_NODE = "application/x-node-id";
const DRAG_FROM = "application/x-from-collection";
const COL_W = 360;

// ── Context for the two container node types ──────────────────────────────────

interface Ctx {
  nodes: Record<NodeId, IdeaNode>;      // visible nodes only
  collections: Record<CollectionId, Collection>;
  unassigned: Record<Role, IdeaNode[]>;
  selected: NodeId | null;
  dragOverId: string | null;
  setDragOverId: (id: string | null) => void;
  onSelect: (id: NodeId) => void;
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

// ── Mini card ─────────────────────────────────────────────────────────────────

function MiniCard({ node, from, onRemove }: { node: IdeaNode; from: CollectionId | null; onRemove?: () => void }) {
  const { selected, onSelect } = useCtx();
  const url = useImageUrl(node.image?.imageId);
  const isSelected = selected === node.id;
  const ts = ROLE_STYLE[node.role];
  const border = isSelected ? ts.selectedBorder : ts.border;
  const shadow = isSelected ? "2px 2px 0px rgba(0,0,0,0.5)" : "none";
  const bg = isSelected ? "#f5f4f0" : ts.bg;

  const drag = {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.stopPropagation();
      e.dataTransfer.setData(DRAG_NODE, node.id);
      if (from) e.dataTransfer.setData(DRAG_FROM, from);
      e.dataTransfer.effectAllowed = "move";
    },
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); onSelect(node.id); },
  };
  const removeBtn = (cls: string) => onRemove && (
    <button className={cls} title="Take out of this collection" onClick={(e) => { e.stopPropagation(); onRemove(); }}>✕</button>
  );

  if (node.image) {
    return (
      <div {...drag} className={`relative group/minicard overflow-hidden cursor-pointer nodrag nowheel col-span-2 ${styles.visualCard}`}
        style={{ border: `1px solid ${border}`, boxShadow: shadow }}>
        {removeBtn("nodrag absolute top-1.5 right-1.5 opacity-0 group-hover/minicard:opacity-100 transition-opacity w-4 h-4 rounded flex items-center justify-center text-[#6b6b6b] hover:text-red-400 hover:bg-red-50 text-[11px] leading-none z-20")}
        <div className="absolute top-0 left-0 right-0 p-1.5 flex items-center gap-1.5 z-10 bg-gradient-to-b from-black/30 to-transparent">
          <span className="text-[10px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded text-white" style={{ background: node.role === "visual" ? "rgba(0,0,0,0.5)" : ts.badgeBg }}>
            {ROLE_LABEL[node.role]}
          </span>
          {isSelected && <span className="text-[10px] text-white bg-blue-500/80 px-1 rounded font-bold">✓</span>}
        </div>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={node.title} className="w-full h-full object-cover" />
        ) : <div className="w-full h-full bg-[#eee]" />}
        <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-10">
          <p className="text-[11px] text-white leading-tight truncate font-medium">{node.title}</p>
        </div>
      </div>
    );
  }

  if (node.role === "concept" || node.role === "motif") {
    const content = (
      <>
        <p className={styles.chipText}>{node.title}</p>
        {isSelected && <span className={styles.chipCheck}>✓</span>}
        {removeBtn(`nodrag absolute right-1.5 opacity-0 group-hover/minicard:opacity-100 transition-opacity w-4 h-4 rounded-full flex items-center justify-center text-[#6b6b6b] hover:text-red-400 text-[11px] leading-none ${styles.centerY}`)}
      </>
    );
    if (node.role === "motif") {
      return (
        <div {...drag} className={styles.chipMotif} style={{ background: border, filter: isSelected ? "drop-shadow(2px 2px 0px rgba(0,0,0,0.5))" : undefined }}>
          <div className={`relative group/minicard cursor-pointer nodrag nowheel ${styles.chipMotifInner}`}
            style={{ background: bg, paddingLeft: 8, paddingRight: onRemove ? 22 : 8 }}>{content}</div>
        </div>
      );
    }
    return (
      <div {...drag} className={`relative group/minicard cursor-pointer nodrag nowheel ${styles.chipNode}`}
        style={{ background: bg, border: `1px solid ${border}`, boxShadow: shadow, paddingLeft: 7, paddingRight: onRemove ? 22 : 8 }}>
        {content}
      </div>
    );
  }

  return (
    <div {...drag} className={`relative group/minicard overflow-hidden cursor-pointer nodrag nowheel ${styles.noteCard}`}
      style={{ background: bg, border: `1px solid ${border}`, boxShadow: shadow }}>
      {removeBtn("nodrag absolute top-1.5 right-1.5 opacity-0 group-hover/minicard:opacity-100 transition-opacity w-4 h-4 rounded flex items-center justify-center text-[#6b6b6b] hover:text-red-400 hover:bg-red-50 text-[11px] leading-none z-10")}
      <div className="p-2 flex flex-col gap-0.5 h-full">
        <div className="flex items-center gap-1.5 pr-4">
          <span className="text-[10px] uppercase tracking-[0.12em] shrink-0 text-[#666]">{ROLE_LABEL[node.role]}</span>
          {isSelected && <span className="text-[11px] text-black shrink-0">✓</span>}
        </div>
        <p className="text-[11px] text-[#111] leading-tight line-clamp-2 flex-1">{node.title}</p>
        <p className="text-[11px] truncate text-[#757575]">{originLabel(node)}</p>
      </div>
    </div>
  );
}

// ── Collection container ──────────────────────────────────────────────────────

function CollectionContainer({ data }: NodeProps) {
  const ctx = useCtx();
  const updateCollection = useProjectStore((s) => s.updateCollection);
  const deleteCollection = useProjectStore((s) => s.deleteCollection);
  const removeFromCollection = useProjectStore((s) => s.removeFromCollection);
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
    <div className={`overflow-hidden transition-shadow ${styles.clusterNode}`} {...dropZone(ctx, id, id)}
      style={{ background: isOver ? `${col.color}10` : "#fff", border: `1.5px solid ${isOver ? col.color : "rgba(0,0,0,0.18)"}`, boxShadow: isOver ? `2px 2px 0px ${col.color}` : "none" }}>
      <div className="px-3 py-2.5 flex items-center gap-2 cursor-grab" style={{ background: `${col.color}16`, borderBottom: `1px solid ${col.color}55` }}>
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: col.color }} />
        {editing ? (
          <input autoFocus value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
            className="nodrag flex-1 text-[11px] font-semibold bg-transparent border-b border-[#2563eb] outline-none min-w-0" />
        ) : (
          <span className="flex-1 text-[11px] font-semibold text-[#222] truncate">{col.title}</span>
        )}
        <span className="text-[11px] text-[#6b6b6b] shrink-0">{items.length}</span>
        <button className="nodrag text-[11px] text-[#6b6b6b] hover:text-[#555] transition-colors" title="Rename"
          onClick={() => { setForm({ title: col.title, description: col.description ?? "" }); setEditing(true); }}>✎</button>
        <button className="nodrag text-[11px] text-[#6b6b6b] hover:text-red-400 transition-colors ml-0.5" title="Delete collection (its nodes stay)"
          onClick={() => deleteCollection(id)}>✕</button>
      </div>

      {editing && (
        <div className="nodrag px-3 py-2 bg-white border-b border-[#f0efec]">
          <input placeholder="Description (optional)…" value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
            className="w-full text-[11px] bg-transparent border-b border-[#e4e3e0] outline-none text-[#666]" />
          <div className="flex gap-2 mt-1.5">
            <button onClick={save} className="text-[11px] text-white bg-[#333] rounded px-2 py-0.5 nodrag">Save</button>
            <button onClick={() => setEditing(false)} className="text-[11px] text-[#6b6b6b] nodrag">Cancel</button>
          </div>
        </div>
      )}
      {!editing && col.description && (
        <div className="px-3 py-1.5 border-b border-[#f0efec]"><p className="text-[11px] text-[#666] leading-snug">{col.description}</p></div>
      )}

      <div className="nodrag nowheel p-2.5">
        {items.length === 0 ? (
          <div className={`flex items-center justify-center py-5 border border-dashed ${styles.sq}`} style={{ borderColor: `${col.color}70` }}>
            <p className="text-[11px] text-[#6b6b6b]">{isOver ? "Drop here ↓" : "Drag cards here"}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {items.map((n) => <MiniCard key={n.id} node={n} from={id} onRemove={() => removeFromCollection(id, n.id)} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Unassigned nodes, grouped by role ─────────────────────────────────────────

function RoleGroup({ data }: NodeProps) {
  const ctx = useCtx();
  const role = data.role as Role;
  const items = ctx.unassigned[role];
  const s = ROLE_STYLE[role];
  const zoneId = `role::${role}`;
  const isOver = ctx.dragOverId === zoneId;

  if (items.length === 0) {
    return (
      <div className={`overflow-hidden opacity-35 ${styles.clusterNode}`} style={{ background: s.clusterBg, border: "1px dashed rgba(0,0,0,0.3)" }}
        {...dropZone(ctx, zoneId, null)}>
        <div className="px-3 py-3 flex items-center gap-2 cursor-grab">
          <span className="text-[11px] uppercase tracking-[0.14em] text-[#666]">{ROLE_LABEL_PLURAL[role]}</span>
          <span className="text-[11px] italic text-[#757575]">none outside collections</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`overflow-hidden transition-shadow ${styles.clusterNode}`} {...dropZone(ctx, zoneId, null)}
      style={{ background: isOver ? "#f5f4f0" : s.clusterBg, border: `1px solid ${isOver ? "#000" : "rgba(0,0,0,0.18)"}`, boxShadow: isOver ? "2px 2px 0px rgba(0,0,0,0.4)" : "none" }}>
      <div className={`px-3 py-2.5 flex items-center gap-2 cursor-grab ${styles.sectionHeader}`}>
        <span className="text-[11px] uppercase tracking-[0.14em] text-[rgba(0,0,0,0.5)]">{ROLE_LABEL_PLURAL[role]}</span>
        <span className="text-[11px] flex-1 text-[#757575]">{items.length} not in a collection</span>
      </div>
      <div className="nodrag nowheel p-2.5">
        <div className="grid grid-cols-2 gap-2">
          {items.map((n) => <MiniCard key={n.id} node={n} from={null} />)}
        </div>
      </div>
    </div>
  );
}

const nodeTypes = { collection: CollectionContainer, role: RoleGroup };

function buildFlowNodes(p: ProjectState): FlowNode[] {
  const saved = p.views.cluster.positions;
  const cols = Object.values(p.collections).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const nodes: FlowNode[] = cols.map((c, i) => ({
    id: c.id, type: "collection", style: { width: 320 }, data: { collectionId: c.id },
    position: saved[c.id] ?? { x: (i % 2) * COL_W + 20, y: Math.floor(i / 2) * 420 + 20 },
  }));
  const baseY = Math.max(1, Math.ceil(cols.length / 2)) * 420 + 32;
  ROLES.forEach((r, i) => {
    const id = `role::${r}`;
    nodes.push({
      id, type: "role", style: { width: 320 }, data: { role: r },
      position: saved[id] ?? { x: (i % 2) * COL_W + 20, y: baseY + Math.floor(i / 2) * 360 },
    });
  });
  return nodes;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ClusterView() {
  const project = useProjectStore((s) => s.project)!;
  const selection = useProjectStore((s) => s.selection);
  const setSelection = useProjectStore((s) => s.setSelection);
  const clearSelection = useProjectStore((s) => s.clearSelection);
  const moveToCollection = useProjectStore((s) => s.moveToCollection);
  const removeFromCollection = useProjectStore((s) => s.removeFromCollection);
  const createCollection = useProjectStore((s) => s.createCollection);
  const updateCollection = useProjectStore((s) => s.updateCollection);
  const moveNode = useProjectStore((s) => s.moveNode);

  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [newCol, setNewCol] = useState({ open: false, title: "", description: "", colorIdx: 0 });
  const [isExporting, setIsExporting] = useState(false);
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
      selected: selection.length === 1 ? selection[0] : null,
      dragOverId,
      setDragOverId,
      onSelect: (id) => setSelection(selection.length === 1 && selection[0] === id ? [] : [id]),
      onDrop: (nodeId, from, to) => {
        if (from === to) return;
        if (to) moveToCollection(nodeId, from, to);
        else if (from) removeFromCollection(from, nodeId);
      },
    };
  }, [shown, project.collections, selection, dragOverId, setSelection, moveToCollection, removeFromCollection]);

  // React Flow owns positions while dragging; rebuild when collections change.
  const [flowNodes, setFlowNodes] = useState<FlowNode[]>(() => buildFlowNodes(project));
  const collectionKey = Object.keys(project.collections).sort().join(",");
  useEffect(() => {
    setFlowNodes((current) => {
      const live = new Map(current.map((n) => [n.id, n]));
      return buildFlowNodes(project).map((n) => {
        const existing = live.get(n.id);
        return existing ? { ...n, position: existing.position, measured: existing.measured } : n;
      });
    });
    // Bring a newly created collection into view once React Flow has measured it.
    const t = setTimeout(() => rf?.fitView({ padding: 0.15, duration: 250 }), 50);
    return () => clearTimeout(t);
    // Only rebuild when the set of collections changes, not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionKey]);

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    setFlowNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  function addCollection() {
    if (!newCol.title.trim()) return;
    const id = createCollection(newCol.title.trim(), COLLECTION_COLORS[newCol.colorIdx]);
    if (id && newCol.description.trim()) updateCollection(id, { description: newCol.description.trim() });
    setNewCol({ open: false, title: "", description: "", colorIdx: (newCol.colorIdx + 1) % COLLECTION_COLORS.length });
  }

  const exportPng = useCallback(async () => {
    if (!rf) return;
    setIsExporting(true);
    try {
      const nodes = rf.getNodes();
      if (!nodes.length) return;
      const bounds = getNodesBounds(nodes);
      const W = 3200;
      const H = Math.round(W * (bounds.height / bounds.width)) || 2000;
      const { x, y, zoom } = getViewportForBounds(bounds, W, H, 0.05, 4, 0.08);
      const viewport = document.querySelector(".react-flow__viewport") as HTMLElement | null;
      if (!viewport) return;
      const dataUrl = await toPng(viewport, {
        backgroundColor: "#f7f6f3", width: W, height: H,
        style: { width: `${W}px`, height: `${H}px`, transform: `translate(${x}px, ${y}px) scale(${zoom})` },
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${project.title || "collections"}-collections-${Date.now()}.png`;
      a.click();
    } finally {
      setIsExporting(false);
    }
  }, [rf, project.title]);

  if (shown.length === 0 && Object.keys(project.collections).length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-center py-24 text-[#6b6b6b]">
        <div>
          <p className="text-sm mb-1">Nothing here yet.</p>
          <p className="text-xs">Build the tree first, then group nodes into collections here.</p>
        </div>
      </div>
    );
  }

  return (
    <ClusterCtx.Provider value={ctx}>
      <div className="flex-1 h-full overflow-hidden bg-[#f7f6f3]">
        <ReactFlow
          nodes={flowNodes}
          edges={[]}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStop={(_e, n) => moveNode("cluster", n.id, n.position)}
          onInit={setRf}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable={false}
          panOnScroll
          zoomOnScroll={false}
          minZoom={0.3}
          maxZoom={2}
          onPaneClick={clearSelection}
        >
          <Background color="#bbb" gap={24} size={1} />
          <Panel position="top-right">
            {!newCol.open && (
              <div className="flex items-center gap-1.5 mb-1.5">
                <button onClick={exportPng} disabled={isExporting} title="Export collections as a PNG"
                  className={`bg-white border border-[rgba(0,0,0,0.2)] px-2.5 py-1.5 text-[11px] flex items-center gap-1 transition-colors ${styles.sq} ${
                    isExporting ? "text-[#757575] cursor-wait" : "text-[#666] hover:text-black hover:border-black"}`}>
                  <span className="text-[12px] leading-none">↓</span>{isExporting ? "Exporting…" : "Export PNG"}
                </button>
              </div>
            )}
            {newCol.open ? (
              <div className={`bg-white border border-[rgba(0,0,0,0.18)] shadow-lg p-4 w-64 flex flex-col gap-3 ${styles.sq}`}>
                <p className="text-[11px] uppercase tracking-[0.12em] text-[rgba(0,0,0,0.5)]">New collection</p>
                <input autoFocus placeholder="Collection title…" value={newCol.title}
                  onChange={(e) => setNewCol((c) => ({ ...c, title: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && addCollection()}
                  className={`text-[11px] border border-[rgba(0,0,0,0.2)] px-2.5 py-1.5 outline-none focus:border-black ${styles.sq}`} />
                <input placeholder="Description (optional)…" value={newCol.description}
                  onChange={(e) => setNewCol((c) => ({ ...c, description: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && addCollection()}
                  className={`text-[11px] border border-[rgba(0,0,0,0.2)] px-2.5 py-1.5 outline-none focus:border-black ${styles.sq}`} />
                <div className="flex gap-1.5 flex-wrap">
                  {COLLECTION_COLORS.map((color, i) => (
                    <button key={color} onClick={() => setNewCol((c) => ({ ...c, colorIdx: i }))} aria-label={`Colour ${i + 1}`}
                      className={`w-5 h-5 border-2 transition-transform ${styles.sq}`}
                      style={{ background: color, borderColor: newCol.colorIdx === i ? "#333" : "transparent", transform: newCol.colorIdx === i ? "scale(1.2)" : "scale(1)" }} />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={addCollection} className={`text-[11px] text-white bg-black hover:bg-[#333] px-3 py-1 transition-colors ${styles.sq}`}>Create</button>
                  <button onClick={() => setNewCol((c) => ({ ...c, open: false, title: "", description: "" }))}
                    className="text-[11px] text-[#666] hover:text-black transition-colors">Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setNewCol((c) => ({ ...c, open: true }))}
                className={`bg-white border border-[rgba(0,0,0,0.2)] hover:border-black text-[11px] text-[rgba(0,0,0,0.5)] hover:text-black px-4 py-2 transition-colors ${styles.sq}`}>
                + New collection
              </button>
            )}
          </Panel>
        </ReactFlow>
      </div>
    </ClusterCtx.Provider>
  );
}
