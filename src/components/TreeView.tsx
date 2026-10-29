"use client";

// The tree view: nodes laid out in columns by where they came from.
// Reads the open project from the store; every change goes through store
// actions. Side panels, the run composer and the selection bar live in
// Workspace so both views share them.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Panel,
  Position,
  BackgroundVariant,
  MarkerType,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  applyNodeChanges,
  useNodes,
  useViewport,
  getNodesBounds,
  getViewportForBounds,
  SelectionMode,
  type ReactFlowInstance,
  type Node as FlowNode,
  type Edge as FlowEdge,
  type EdgeTypes,
  type NodeTypes,
  type NodeProps,
  type EdgeProps,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useProjectStore } from "@/store/projectStore";
import { ancestors, treeEdges, visibleLinks, visibleNodes } from "@/domain/graph";
import { BRIEF_H, BRIEF_ID, BRIEF_W, computeTreeLayout, noteHeight } from "@/domain/treeLayout";
import type { ActionType, Collection, IdeaNode, NodeId } from "@/domain/types";
import { fileToImage } from "@/services/images";
import { useImageUrl } from "./useImageUrl";
import { ACTIONS, ROLE_LABEL, ROLE_STYLE, originLabel } from "./nodeStyle";
import styles from "./TreeView.module.css";

const SOURCE_COLOR = "#2d4f8a";

// ── Node data ─────────────────────────────────────────────────────────────────

type IdeaNodeData = {
  node: IdeaNode;
  isSelected: boolean;      // the only selected thing
  isMultiSelected: boolean; // one of several selected
  isHovered: boolean;
  isAncestor: boolean;      // ancestor of the hovered node
  isSourceOfSelected: boolean;
  collectionColors?: string[];
  connectMode: boolean;
  onRemove: (id: NodeId) => void;
  onQuickRun: (id: NodeId, action: ActionType) => void;
};

type BriefNodeData = {
  title: string;
  brief: string;
  isSelected: boolean;
  connectMode: boolean;
  onUpload: (files: File[]) => void;
};

function handleStyle(connectMode: boolean, side: "left" | "right"): React.CSSProperties {
  return {
    opacity: connectMode ? 1 : 0,
    pointerEvents: connectMode ? "auto" : "none",
    background: side === "right" ? "#64748b" : "#94a3b8",
  };
}

function highlight(d: IdeaNodeData, base: string) {
  const primary = d.collectionColors?.[0];
  const border = d.isMultiSelected ? primary ?? "#000"
    : d.isSelected ? "#000"
    : d.isSourceOfSelected ? SOURCE_COLOR
    : d.isAncestor ? "rgba(0,0,0,0.4)"
    : primary ?? base;
  const shadow = d.isMultiSelected ? `0 0 0 2px ${primary ?? "rgba(0,0,0,0.4)"}`
    : d.isSelected ? "2px 2px 0px #000"
    : d.isSourceOfSelected ? `0 0 0 2px ${SOURCE_COLOR}`
    : d.isAncestor ? "0 0 0 1px rgba(0,0,0,0.2)"
    : d.isHovered ? "1px 1px 0px #888"
    : "none";
  return { border, shadow, primary };
}

function CollectionDots({ colors }: { colors?: string[] }) {
  if (!colors?.length) return null;
  return (
    <div className="flex gap-[1px] shrink-0">
      {colors.map((c) => <div key={c} className="w-[3px] h-[3px] rounded-full" style={{ background: c }} />)}
    </div>
  );
}

// ── Text node (concept / motif chips, notes, visuals without an image) ────────

function TextIdeaNode({ data }: { data: IdeaNodeData }) {
  const { node, connectMode, onRemove } = data;
  const s = ROLE_STYLE[node.role];
  const { border, shadow, primary } = highlight(data, s.border);
  const picked = data.isSelected || data.isMultiSelected;
  const bg = data.isMultiSelected ? "#fafaf8" : data.isAncestor ? "#f5f4f0" : s.bg;
  const removeBtn = (
    <button
      className={`absolute right-1.5 opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 flex items-center justify-center text-[rgba(0,0,0,0.3)] hover:text-black text-[9px] leading-none z-10 ${styles.centerY}`}
      onClick={(e) => { e.stopPropagation(); onRemove(node.id); }}
      title="Remove"
    >✕</button>
  );

  if (node.role === "concept" || node.role === "motif") {
    const content = (
      <>
        {!picked && <CollectionDots colors={data.collectionColors} />}
        <p className={styles.chipText}>{node.title}</p>
        {picked && <span className={styles.chipCheck}>✓</span>}
        {removeBtn}
      </>
    );
    if (node.role === "motif") {
      const filter = data.isMultiSelected ? `drop-shadow(0 0 3px ${primary ?? "rgba(0,0,0,0.5)"})`
        : data.isSelected ? "drop-shadow(2px 2px 0px #000)"
        : data.isAncestor ? "drop-shadow(0 0 2px rgba(0,0,0,0.2))"
        : data.isHovered ? "drop-shadow(1px 1px 2px rgba(0,0,0,0.3))"
        : undefined;
      return (
        <>
          <Handle type="target" position={Position.Left} className={styles.handleDot} style={handleStyle(connectMode, "left")} />
          <div className={styles.chipMotif} style={{ background: border, filter }}>
            <div className={`relative group ${styles.chipMotifInner}`} style={{ background: bg, paddingLeft: 10 }}>{content}</div>
          </div>
          <Handle type="source" position={Position.Right} className={styles.handleDot} style={handleStyle(connectMode, "right")} />
        </>
      );
    }
    return (
      <>
        <Handle type="target" position={Position.Left} className={styles.handleDot} style={handleStyle(connectMode, "left")} />
        <div className={`relative group ${styles.chipNode}`} style={{ background: bg, border: `1px solid ${border}`, boxShadow: shadow, paddingLeft: 9 }}>
          {content}
        </div>
        <Handle type="source" position={Position.Right} className={styles.handleDot} style={handleStyle(connectMode, "right")} />
      </>
    );
  }

  const h = noteHeight(node.title);
  return (
    <>
      <Handle type="target" position={Position.Left} className={styles.handleDot} style={handleStyle(connectMode, "left")} />
      <div className={`relative group ${styles.noteNode}`} style={{ background: bg, border: `1px solid ${border}`, boxShadow: shadow, height: h }}>
        {!picked && data.collectionColors?.length ? (
          <div className="absolute top-1.5 left-1.5"><CollectionDots colors={data.collectionColors} /></div>
        ) : null}
        {!connectMode && removeBtn}
        <div className={`p-2.5 flex flex-col justify-center ${styles.noteBody}`} style={{ height: h }}>
          {node.role !== "note" && (
            <div className="flex items-center gap-1.5 pr-4">
              <span className="text-[8px] uppercase tracking-[0.14em] shrink-0 text-[rgba(0,0,0,0.45)]">{ROLE_LABEL[node.role]}</span>
              {picked && <span className="text-[9px] text-black shrink-0">✓</span>}
            </div>
          )}
          <p className={`text-[11px] text-[#111] leading-tight flex-1${node.role === "note" ? "" : " line-clamp-2"}`}>{node.title}</p>
          {node.role !== "note" && <p className="text-[9px] truncate text-[rgba(0,0,0,0.3)]">{originLabel(node)}</p>}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className={styles.handleDot} style={handleStyle(connectMode, "right")} />
    </>
  );
}

// ── Image node (any role with an image) ───────────────────────────────────────

function ImageIdeaNode({ data }: { data: IdeaNodeData }) {
  const { node, connectMode, onRemove, onQuickRun } = data;
  const url = useImageUrl(node.image?.imageId);
  const s = ROLE_STYLE[node.role];
  const { border, shadow, primary } = highlight(data, s.border);
  const picked = data.isSelected || data.isMultiSelected;

  return (
    <>
      <Handle type="target" position={Position.Left} className={styles.handleDot} style={handleStyle(connectMode, "left")} />
      <div className={`relative group ${styles.visualNode}`} style={{ border: `1px solid ${border}`, boxShadow: shadow }}>
        <button
          className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 rounded flex items-center justify-center text-[#ccc] hover:text-red-400 hover:bg-red-50 text-[10px] leading-none z-20"
          onClick={(e) => { e.stopPropagation(); onRemove(node.id); }}
          title="Remove"
        >✕</button>
        <div className="absolute top-0 left-0 right-0 p-2 flex items-center gap-1.5 z-10 bg-gradient-to-b from-black/30 to-transparent">
          <span className="text-[8px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 text-white" style={{ background: node.role === "visual" ? "rgba(0,0,0,0.5)" : s.badgeBg }}>
            {ROLE_LABEL[node.role]}
          </span>
          {picked && <span className="text-[9px] text-white shrink-0">✓</span>}
        </div>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={node.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-[#eee]" />
        )}
        {!picked && data.collectionColors?.length ? (
          <div className="absolute inset-y-0 left-0 w-[3px] z-20" style={{ background: primary }} />
        ) : null}
        <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/80 via-black/50 to-transparent z-10">
          <p className="text-[9px] text-white leading-tight truncate font-medium mb-1">{node.title}</p>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <p className="text-[7px] text-white/60 uppercase tracking-wider font-semibold mb-1">Use for →</p>
            <div className="flex gap-1 flex-wrap">
              {ACTIONS.map((a) => (
                <button key={a.id} title={a.description}
                  onClick={(e) => { e.stopPropagation(); onQuickRun(node.id, a.id); }}
                  className="text-[7px] bg-white/20 hover:bg-white/45 text-white px-1.5 py-0.5 rounded transition-colors whitespace-nowrap">
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className={styles.handleDot} style={handleStyle(connectMode, "right")} />
    </>
  );
}

function IdeaFlowNode(props: NodeProps) {
  const data = props.data as unknown as IdeaNodeData;
  return data.node.image ? <ImageIdeaNode data={data} /> : <TextIdeaNode data={data} />;
}

// ── Brief node ────────────────────────────────────────────────────────────────

function BriefFlowNode(props: NodeProps) {
  const data = props.data as unknown as BriefNodeData;
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <div className={styles.briefNode} style={{ boxShadow: data.isSelected ? "2px 2px 0px #000" : "none" }}>
        <div className={styles.briefRow}>
          <p className={styles.briefLabel}>Project brief</p>
          {data.isSelected && <span className={styles.briefCheck}>✓</span>}
        </div>
        <p className="text-[13px] font-semibold text-[#111] truncate mb-1">{data.title}</p>
        <p className="text-[11px] text-[#555] leading-relaxed line-clamp-5 flex-1">
          {data.brief || <span className="italic text-[#aaa]">Click to write your brief…</span>}
        </p>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => { data.onUpload(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
        <div className={styles.briefBtnRow}>
          <button className={`nodrag nopan ${styles.briefUploadBtn}`} onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}>
            + Images
          </button>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className={styles.handleDot}
        style={{ opacity: 0, pointerEvents: "none", background: "#64748b" }} />
    </>
  );
}

const nodeTypes: NodeTypes = { idea: IdeaFlowNode, brief: BriefFlowNode };

// ── Edges ─────────────────────────────────────────────────────────────────────

function ProvenanceEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data, selected }: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const { onDelete, color, dashed, isSourceEdge } = (data ?? {}) as { onDelete?: () => void; color?: string; dashed?: boolean; isSourceEdge?: boolean };
  const stroke = selected ? "#000" : (color ?? "#94a3b8");
  return (
    <>
      <path d={path} fill="none" stroke="transparent" strokeWidth={20} style={{ cursor: "pointer" }} />
      <BaseEdge path={path} markerEnd={markerEnd}
        style={{
          stroke,
          strokeWidth: isSourceEdge ? 2.5 : selected ? 2 : 1.5,
          strokeOpacity: isSourceEdge ? 0.85 : selected ? 0.9 : 0.45,
          strokeDasharray: dashed ? "5 4" : undefined,
          transition: "stroke 0.15s, stroke-opacity 0.15s, stroke-width 0.15s",
        }} />
      {selected && onDelete && (
        <EdgeLabelRenderer>
          <div style={{ position: "absolute", transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`, pointerEvents: "all" }} className="nodrag nopan">
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Remove connection"
              className="w-5 h-5 rounded-full bg-white border border-[#ccc] text-[#888] hover:text-red-500 hover:border-red-300 flex items-center justify-center text-[10px] leading-none shadow-sm transition-colors">✕</button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

function LinkEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data, selected }: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const { label } = (data ?? {}) as { label?: string };
  return (
    <>
      <path d={path} fill="none" stroke="transparent" strokeWidth={20}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} style={{ cursor: "pointer" }} />
      <BaseEdge path={path} markerEnd={markerEnd}
        style={{ stroke: selected ? "#2563eb" : "#64748b", strokeWidth: selected ? 2 : 1.5, strokeDasharray: "5 3", transition: "stroke 0.1s" }} />
      {(label || hovered || selected) && (
        <EdgeLabelRenderer>
          <div style={{ position: "absolute", transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`, pointerEvents: "none" }}
            className={`text-[9px] px-1.5 py-0.5 bg-white border ${selected ? "border-[#2563eb] text-[#2563eb]" : "border-[#cbd5e1] text-[#64748b]"} ${styles.sq}`}>
            {label || "link"}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const edgeTypes: EdgeTypes = { provenance: ProvenanceEdge, link: LinkEdge };

// Soft colour halos behind nodes that belong to collections. Reads live node
// positions from React Flow so they follow drags without lag.
function CollectionHalos({ collections }: { collections: Collection[] }) {
  const nodes = useNodes();
  const { x, y, zoom } = useViewport();
  return (
    <svg className="absolute inset-0 pointer-events-none"
      style={{ width: "100%", height: "100%", zIndex: -1, overflow: "visible", mixBlendMode: "multiply" }}>
      <defs>
        <filter id="halo-blur" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="34" /></filter>
      </defs>
      <g transform={`translate(${x},${y}) scale(${zoom})`}>
        {collections.map((col) => (
          <g key={col.id}>
            {col.nodeIds.flatMap((id) => {
              const rn = nodes.find((n) => n.id === id);
              if (!rn) return [];
              const cx = rn.position.x + (rn.measured?.width ?? rn.width ?? 140) / 2;
              const cy = rn.position.y + (rn.measured?.height ?? rn.height ?? 44) / 2;
              return [<circle key={id} cx={cx} cy={cy} r={95} fill={col.color} opacity={0.38} filter="url(#halo-blur)" />];
            })}
          </g>
        ))}
      </g>
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TreeView({
  briefOpen, onOpenBrief, onOpenAddNode, onOpenRun,
}: {
  briefOpen: boolean;
  onOpenBrief: () => void;
  onOpenAddNode: (parentIds: NodeId[]) => void;
  onOpenRun: (action: ActionType) => void;
}) {
  const project = useProjectStore((s) => s.project)!;
  const selection = useProjectStore((s) => s.selection);
  const setSelection = useProjectStore((s) => s.setSelection);
  const toggleSelected = useProjectStore((s) => s.toggleSelected);
  const clearSelection = useProjectStore((s) => s.clearSelection);
  const hideNode = useProjectStore((s) => s.hideNode);
  const hideEdge = useProjectStore((s) => s.hideEdge);
  const addLink = useProjectStore((s) => s.addLink);
  const addImageNode = useProjectStore((s) => s.addImageNode);
  const moveNode = useProjectStore((s) => s.moveNode);
  const resetLayout = useProjectStore((s) => s.resetLayout);
  const clearTree = useProjectStore((s) => s.clearTree);

  const [hoveredId, setHoveredId] = useState<NodeId | null>(null);
  const [lassoMode, setLassoMode] = useState(false);
  const [connectMode, setConnectMode] = useState(false);
  const [showCollectionColors, setShowCollectionColors] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportWithColors, setExportWithColors] = useState(false);
  const [exportColorsActive, setExportColorsActive] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const rfRef = useRef<ReactFlowInstance | null>(null);

  const layout = useMemo(() => computeTreeLayout(project), [project]);
  const shown = useMemo(() => visibleNodes(project), [project]);
  const provenance = useMemo(() => treeEdges(project), [project]);
  const links = useMemo(() => visibleLinks(project), [project]);
  const collections = useMemo(() => Object.values(project.collections), [project]);

  const singleSelected = selection.length === 1 ? selection[0] : null;
  const selectedSet = useMemo(() => new Set(selection), [selection]);
  const hoveredAncestors = useMemo(() => (hoveredId ? ancestors(project, hoveredId) : new Set<NodeId>()), [project, hoveredId]);
  const selectedAncestors = useMemo(
    () => (singleSelected && project.nodes[singleSelected] ? ancestors(project, singleSelected) : new Set<NodeId>()),
    [project, singleSelected],
  );

  const collectionColors = useMemo(() => {
    const map = new Map<NodeId, string[]>();
    for (const c of collections) for (const id of c.nodeIds) map.set(id, [...(map.get(id) ?? []), c.color]);
    return map;
  }, [collections]);

  const handleRemove = useCallback((id: NodeId) => hideNode(id), [hideNode]);
  const handleQuickRun = useCallback((id: NodeId, action: ActionType) => {
    setSelection([id]);
    onOpenRun(action);
  }, [setSelection, onOpenRun]);

  const handleUpload = useCallback(async (files: File[]) => {
    for (const f of files) await addImageNode(await fileToImage(f), { role: "visual", title: f.name });
  }, [addImageNode]);

  // ── React Flow nodes and edges ────────────────────────────────────────────

  const flowNodes = useMemo((): FlowNode[] => {
    const showColors = showCollectionColors || exportColorsActive;
    const nodes: FlowNode[] = [{
      id: BRIEF_ID,
      type: "brief",
      position: layout.positions[BRIEF_ID],
      data: { title: project.title, brief: project.brief, isSelected: briefOpen, connectMode, onUpload: handleUpload } satisfies BriefNodeData,
      width: BRIEF_W,
      height: BRIEF_H,
      deletable: false,
      selected: false,
    }];
    for (const n of shown) {
      nodes.push({
        id: n.id,
        type: "idea",
        position: layout.positions[n.id],
        data: {
          node: n,
          isSelected: singleSelected === n.id,
          isMultiSelected: selection.length > 1 && selectedSet.has(n.id),
          isHovered: hoveredId === n.id,
          isAncestor: hoveredAncestors.has(n.id),
          isSourceOfSelected: selectedAncestors.has(n.id),
          collectionColors: showColors ? collectionColors.get(n.id) : undefined,
          connectMode,
          onRemove: handleRemove,
          onQuickRun: handleQuickRun,
        } satisfies IdeaNodeData,
        width: layout.sizes[n.id].w,
        height: layout.sizes[n.id].h,
        selected: selectedSet.has(n.id),
      });
    }
    return nodes;
  }, [project.title, project.brief, layout, shown, briefOpen, connectMode, handleUpload, singleSelected, selection.length, selectedSet,
    hoveredId, hoveredAncestors, selectedAncestors, showCollectionColors, exportColorsActive, collectionColors, handleRemove, handleQuickRun]);

  const flowEdges = useMemo((): FlowEdge[] => {
    const edges: FlowEdge[] = [];
    for (const id of layout.briefTargets) {
      edges.push({
        id: `${BRIEF_ID}->${id}`, source: BRIEF_ID, target: id, type: "default", selectable: false, deletable: false,
        style: { stroke: "rgba(0,0,0,0.3)", strokeWidth: 1.5, strokeOpacity: 0.6, strokeDasharray: "5 4" },
        markerEnd: { type: MarkerType.Arrow, color: "rgba(0,0,0,0.3)", width: 10, height: 10, strokeWidth: 0 },
      });
    }
    for (const e of provenance) {
      const toRole = project.nodes[e.to].role;
      const isSourceEdge = !!singleSelected && (e.to === singleSelected || (selectedAncestors.has(e.to) && selectedAncestors.has(e.from)));
      const isActive = hoveredId === e.to || hoveredId === e.from;
      const color = isSourceEdge ? SOURCE_COLOR : isActive ? "rgba(0,0,0,0.7)" : ROLE_STYLE[toRole].line;
      // A bridged edge spans removed nodes, so there's no single stored edge to delete.
      const direct = e.bridged ? [] : Object.values(project.edges).filter(
        (x) => x.kind === "derived_from" && !x.hidden && x.from === e.from && x.to === e.to);
      edges.push({
        id: `prov:${e.from}->${e.to}`, source: e.from, target: e.to, type: "provenance",
        selectable: direct.length > 0, deletable: direct.length > 0,
        data: {
          color, isSourceEdge, dashed: e.bridged,
          onDelete: direct.length > 0 ? () => direct.forEach((x) => hideEdge(x.id)) : undefined,
        },
        markerEnd: { type: MarkerType.Arrow, color, width: isSourceEdge ? 14 : 12, height: isSourceEdge ? 14 : 12, strokeWidth: 0 },
      });
    }
    for (const e of links) {
      edges.push({
        id: e.id, source: e.from, target: e.to, type: "link", selected: selectedSet.has(e.id),
        data: { label: e.label },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#64748b", width: 12, height: 12, strokeWidth: 0 },
      });
    }
    return edges;
  }, [layout.briefTargets, provenance, links, project.nodes, project.edges, singleSelected, selectedAncestors, hoveredId, selectedSet, hideEdge]);

  // React Flow needs to own node state while dragging. Keep our computed
  // nodes in sync without resetting a node mid-drag.
  const [displayNodes, setDisplayNodes] = useState<FlowNode[]>(flowNodes);
  useEffect(() => {
    setDisplayNodes((current) => {
      const byId = new Map(current.map((n) => [n.id, n]));
      return flowNodes.map((n) => {
        const existing = byId.get(n.id);
        if (!existing) return n;
        return { ...existing, data: n.data, width: n.width, height: n.height, selected: n.selected,
          position: existing.dragging ? existing.position : n.position };
      });
    });
  }, [flowNodes]);

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    // Selection is owned by the store; ignore React Flow's own select changes.
    setDisplayNodes((nds) => applyNodeChanges(changes.filter((c) => c.type !== "select"), nds));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<FlowEdge>[]) => {
    for (const c of changes) {
      if (c.type !== "remove") continue;
      if (project.edges[c.id]) hideEdge(c.id);
      else (flowEdges.find((e) => e.id === c.id)?.data as { onDelete?: () => void } | undefined)?.onDelete?.();
    }
  }, [project.edges, flowEdges, hideEdge]);

  // ── Interaction ───────────────────────────────────────────────────────────

  const onNodeClick = useCallback((event: React.MouseEvent, n: FlowNode) => {
    if (n.id === BRIEF_ID) { clearSelection(); onOpenBrief(); return; }
    if (event.shiftKey) toggleSelected(n.id);
    else setSelection(singleSelected === n.id ? [] : [n.id]);
  }, [clearSelection, onOpenBrief, toggleSelected, setSelection, singleSelected]);

  const onEdgeClick = useCallback((event: React.MouseEvent, e: FlowEdge) => {
    if (!project.edges[e.id]) return;  // only user links are selectable as inputs
    if (event.shiftKey) toggleSelected(e.id);
    else setSelection([e.id]);
  }, [project.edges, toggleSelected, setSelection]);

  const onSelectionChange = useCallback(({ nodes }: { nodes: FlowNode[] }) => {
    if (!lassoMode) return;
    const ids = nodes.map((n) => n.id).filter((id) => id !== BRIEF_ID);
    if (ids.length >= 2) setSelection(ids);
  }, [lassoMode, setSelection]);

  const onNodeDragStop = useCallback((_e: unknown, _n: FlowNode, dragged: FlowNode[]) => {
    for (const n of dragged) moveNode("tree", n.id, n.position);
  }, [moveNode]);

  const onNodesDelete = useCallback((deleted: FlowNode[]) => {
    for (const n of deleted) if (n.id !== BRIEF_ID) hideNode(n.id);
  }, [hideNode]);

  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target || c.source === BRIEF_ID || c.target === BRIEF_ID) return;
    addLink(c.source, c.target);
  }, [addLink]);

  const exportPng = useCallback(async () => {
    const rf = rfRef.current;
    if (!rf) return;
    setIsExporting(true);
    const flash = exportWithColors && !showCollectionColors;
    if (flash) {
      setExportColorsActive(true);
      await new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res())));
    }
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
      a.download = `${project.title || "tree"}-${Date.now()}.png`;
      a.click();
    } finally {
      if (flash) setExportColorsActive(false);
      setIsExporting(false);
    }
  }, [exportWithColors, showCollectionColors, project.title]);

  const toolBtn = (active: boolean) => `border px-2.5 py-1.5 text-[11px] transition-colors flex items-center gap-1 ${styles.sq} ${
    active ? "bg-black border-black text-white" : "bg-white border-[rgba(0,0,0,0.2)] text-[rgba(0,0,0,0.45)] hover:text-black hover:border-black"
  }`;

  return (
    <div className={`flex-1 h-full ${styles.canvas}`}>
      <ReactFlow
        nodes={displayNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onNodeMouseEnter={(_, n) => { if (n.id !== BRIEF_ID) setHoveredId(n.id); }}
        onNodeMouseLeave={() => setHoveredId(null)}
        onPaneClick={() => { clearSelection(); setConfirmingClear(false); }}
        onInit={(instance) => { rfRef.current = instance; instance.fitView({ padding: 0.15 }); }}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        maxZoom={2.0}
        onNodeDragStop={onNodeDragStop}
        onNodesDelete={onNodesDelete}
        connectOnClick={false}
        nodesConnectable={connectMode}
        onConnect={onConnect}
        deleteKeyCode={["Delete", "Backspace"]}
        selectionOnDrag={lassoMode}
        panOnDrag={lassoMode ? [1, 2] : true}
        selectionMode={SelectionMode.Partial}
        onSelectionChange={onSelectionChange}
      >
        {showCollectionColors && <CollectionHalos collections={collections} />}
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(0,0,0,0.15)" />
        <Controls showInteractive={false} />

        {shown.length === 0 && (
          <Panel position="top-center">
            <div className={`mt-8 text-[12px] italic text-[rgba(0,0,0,0.35)] bg-white/80 border border-[rgba(0,0,0,0.1)] px-4 py-2.5 ${styles.sq}`}>
              Write your brief, add images, then run Expand to start the tree
            </div>
          </Panel>
        )}

        <Panel position="top-right">
          <div className="flex items-center gap-1.5 mr-2 mt-2">
            <div className="relative" onMouseEnter={() => setExportMenuOpen(true)} onMouseLeave={() => setExportMenuOpen(false)}>
              <button onClick={exportPng} disabled={isExporting} title="Export the tree as a PNG" className={toolBtn(false)}>
                <span className="text-[12px] leading-none">↓</span>{isExporting ? "Exporting…" : "Export PNG"}
              </button>
              {exportMenuOpen && (
                <div className={`absolute top-full left-0 bg-white border border-[rgba(0,0,0,0.18)] px-2.5 py-1.5 z-50 ${styles.sq}`}>
                  <label className="flex items-center gap-1.5 cursor-pointer whitespace-nowrap text-[10px] text-[rgba(0,0,0,0.55)] hover:text-black select-none">
                    <input type="checkbox" checked={exportWithColors} onChange={(e) => setExportWithColors(e.target.checked)} className="w-2.5 h-2.5 accent-black" />
                    Include collection colours
                  </label>
                </div>
              )}
            </div>
            <button onClick={() => { setLassoMode((v) => !v); setConnectMode(false); }} className={toolBtn(lassoMode)}
              title={lassoMode ? "Turn off lasso (dragging pans again)" : "Lasso: drag to select several nodes"}>
              <span className="text-[11px] leading-none">⬚</span>{lassoMode ? "Lasso on" : "Lasso"}
            </button>
            <button onClick={() => { setConnectMode((v) => !v); setLassoMode(false); }} className={toolBtn(connectMode)}
              title={connectMode ? "Stop drawing links" : "Draw links between nodes"}>
              <span className="text-[12px] leading-none">⌥</span>{connectMode ? "Linking…" : "Link"}
            </button>
            {lassoMode && (
              <span className={`text-[10px] italic text-[rgba(0,0,0,0.4)] bg-white border border-[rgba(0,0,0,0.15)] px-2 py-1 ${styles.sq}`}>
                Drag to select · Shift+click to add · Middle-click to pan
              </span>
            )}
            {connectMode && (
              <span className={`text-[10px] italic text-[rgba(0,0,0,0.4)] bg-white border border-[rgba(0,0,0,0.15)] px-2 py-1 ${styles.sq}`}>
                Drag from a node's edge to another node
              </span>
            )}
            {collections.length > 0 && (
              <button onClick={() => setShowCollectionColors((v) => !v)} className={toolBtn(showCollectionColors)}
                title={showCollectionColors ? "Hide collection colours" : "Show collection colours"}>
                <span className="text-[12px] leading-none">◉</span>Collections
              </button>
            )}
            <button onClick={() => onOpenAddNode(selection.filter((id) => project.nodes[id]))} className={toolBtn(false)} title="Add a node">
              <span className="text-[14px] leading-none font-light">+</span>Add node
            </button>
            {Object.keys(project.views.tree.positions).length > 0 && (
              <button onClick={() => resetLayout("tree")} className={toolBtn(false)} title="Put every node back in its automatic position">
                Tidy
              </button>
            )}
            {confirmingClear ? (
              <div className={`bg-white border border-red-200 px-2.5 py-1.5 flex items-center gap-2 ${styles.sq}`}>
                <span className="text-[10px] text-red-500">Clear the tree?</span>
                <button onClick={() => { clearTree(); setConfirmingClear(false); }} className="text-[10px] font-semibold text-red-600 hover:text-red-800">Yes</button>
                <button onClick={() => setConfirmingClear(false)} className="text-[10px] text-[#aaa] hover:text-[#555]">No</button>
              </div>
            ) : (
              <button onClick={() => setConfirmingClear(true)} disabled={shown.length === 0}
                className={`bg-white border border-[rgba(0,0,0,0.2)] px-2.5 py-1.5 text-[11px] text-[rgba(0,0,0,0.35)] hover:text-red-500 hover:border-red-300 transition-colors disabled:opacity-40 ${styles.sq}`}
                title="Remove every node from this project's tree. The project, brief and collections stay.">
                Clear tree
              </button>
            )}
          </div>
        </Panel>

        <Panel position="bottom-left">
          <div className={`mb-2 ml-2 bg-white border border-[rgba(0,0,0,0.12)] px-3 py-2.5 flex flex-col gap-2 ${styles.sq}`}>
            <p className="text-[8px] uppercase tracking-[0.16em] text-[rgba(0,0,0,0.35)] mb-0.5">Node types</p>
            <div className="flex items-center gap-2">
              <div className="w-[18px] h-[14px] shrink-0 bg-[#dde1f2]" style={{ border: "1px solid #8b96c8" }} />
              <span className="text-[10px] text-[rgba(0,0,0,0.6)]">Concept</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="shrink-0" style={{ background: "#c8a055", padding: 1, clipPath: "polygon(5px 0%, calc(100% - 5px) 0%, 100% 5px, 100% calc(100% - 5px), calc(100% - 5px) 100%, 5px 100%, 0% calc(100% - 5px), 0% 5px)" }}>
                <div style={{ width: 18, height: 14, background: "#fdf8ef", clipPath: "polygon(4.5px 0%, calc(100% - 4.5px) 0%, 100% 4.5px, 100% calc(100% - 4.5px), calc(100% - 4.5px) 100%, 4.5px 100%, 0% calc(100% - 4.5px), 0% 4.5px)" }} />
              </div>
              <span className="text-[10px] text-[rgba(0,0,0,0.6)]">Motif</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-[18px] h-[14px] shrink-0 rounded-[4px] bg-[#f3f8f5]" style={{ border: "1px solid #7aab8a" }} />
              <span className="text-[10px] text-[rgba(0,0,0,0.6)]">Note</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-[18px] h-[14px] shrink-0 bg-[#fdf4f2]" style={{ border: "1px solid #c89088" }} />
              <span className="text-[10px] text-[rgba(0,0,0,0.6)]">Visual</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="#64748b" strokeWidth="1.5" strokeDasharray="5 3" /></svg>
              <span className="text-[10px] text-[rgba(0,0,0,0.6)]">Your link</span>
            </div>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
