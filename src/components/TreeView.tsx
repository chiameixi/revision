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
  Position,
  BackgroundVariant,
  MarkerType,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
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
  type FinalConnectionState,
  type EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Check, ChevronDown, ChevronUp, ImagePlus, Lasso, MousePointer2, Plus, Spline, X } from "lucide-react";
import { projectStore, useProjectStore } from "@/store/projectStore";
import { ancestors, treeEdges, visibleLinks, visibleNodes } from "@/domain/graph";
import { BRIEF_H, BRIEF_ID, BRIEF_W, computeTreeLayout } from "@/domain/treeLayout";
import { placeLabels, wordSize, type Box, type LabelRequest } from "@/domain/labelPlacement";
import { readingFor } from "@/domain/relations";
import type { ActionType, Collection, IdeaNode, NodeId, XY } from "@/domain/types";
import { fileToImage } from "@/services/images";
import { useImageUrl } from "./useImageUrl";
import { ROLE_STYLE, ROLES, ROLE_LABEL } from "./nodeStyle";
import { Menu, RoleBadge } from "./ui";
import styles from "./TreeView.module.css";

const ACCENT = "var(--color-accent)";
type Tool = "select" | "lasso" | "link";

// ── Node data ─────────────────────────────────────────────────────────────────

type IdeaNodeData = {
  node: IdeaNode;
  isSelected: boolean;      // selected, alone or with others
  isHovered: boolean;
  isAncestor: boolean;      // ancestor of the hovered node
  isSourceOfSelected: boolean;
  isNew: boolean;           // just made by a run; glows briefly
  collectionColors?: string[];
  linking: boolean;
  onRemove: (id: NodeId) => void;
};

type BriefNodeData = {
  title: string;
  brief: string;
  isSelected: boolean;
  onUpload: (files: File[]) => void;
};

function handleStyle(linking: boolean): React.CSSProperties {
  return { opacity: linking ? 1 : 0, pointerEvents: linking ? "auto" : "none", background: "var(--color-ink-2)" };
}

// Outline and ring for each interaction state, shared by every node shape.
function outline(d: IdeaNodeData) {
  const base = ROLE_STYLE[d.node.role].border;
  if (d.isSelected) return { color: ACCENT, ring: `0 0 0 2px ${ACCENT}` };
  if (d.isSourceOfSelected) return { color: "var(--color-ink-2)", ring: "0 0 0 1.5px var(--color-ink-2)" };
  if (d.isAncestor || d.isHovered) return { color: "var(--color-ink-2)", ring: "none" };
  return { color: d.collectionColors?.[0] ?? base, ring: "none" };
}

function CollectionDots({ colors }: { colors?: string[] }) {
  if (!colors?.length) return null;
  return (
    <span className="flex gap-0.5" aria-hidden>
      {colors.map((c) => <span key={c} className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />)}
    </span>
  );
}

function RemoveButton({ id, onRemove, onImage }: { id: NodeId; onRemove: (id: NodeId) => void; onImage?: boolean }) {
  return (
    <button aria-label="Remove node" title="Remove"
      onClick={(e) => { e.stopPropagation(); onRemove(id); }}
      className={`nodrag absolute top-1 right-1 w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity ${
        onImage ? "bg-white/90 text-ink-2 hover:text-danger" : "text-muted hover:text-danger hover:bg-white/70"}`}>
      <X size={13} />
    </button>
  );
}

// ── Text node: concept and note rectangles, motif octagon, visual without image ─

function TextIdeaNode({ data }: { data: IdeaNodeData }) {
  const { node, linking, onRemove } = data;
  const s = ROLE_STYLE[node.role];
  const o = outline(data);
  const body = (
    <div className="relative group flex flex-col gap-1 px-3 py-2 pr-7 min-h-[34px] justify-center">
      {node.role !== "concept" && node.role !== "motif" && (
        <div className="flex items-center gap-1.5"><RoleBadge role={node.role} /><CollectionDots colors={data.collectionColors} /></div>
      )}
      <div className="flex items-start gap-1.5">
        {(node.role === "concept" || node.role === "motif") && <span className="mt-1.5"><CollectionDots colors={data.collectionColors} /></span>}
        <p className="idea text-[14px] leading-[1.25] text-ink flex-1 break-words">{node.title}</p>
      </div>
      {!linking && <RemoveButton id={node.id} onRemove={onRemove} />}
    </div>
  );

  return (
    <>
      <Handle type="target" position={Position.Left} className={styles.handleDot} style={handleStyle(linking)} />
      {node.role === "motif" ? (
        <div className={styles.motif} style={{ background: o.color, filter: o.ring !== "none" ? `drop-shadow(0 0 1.5px ${ACCENT})` : undefined }}>
          <div className={styles.motifInner} style={{ background: s.fill, width: 157 }}>{body}</div>
        </div>
      ) : (
        <div className={`border ${node.role === "concept" ? "rounded-md w-[160px]" : "rounded-lg w-[140px]"}`}
          style={{ background: s.fill, borderColor: o.color, boxShadow: o.ring }}>
          {body}
        </div>
      )}
      <Handle type="source" position={Position.Right} className={styles.handleDot} style={handleStyle(linking)} />
    </>
  );
}

// ── Image node (any role with an image) ───────────────────────────────────────

function ImageIdeaNode({ data }: { data: IdeaNodeData }) {
  const { node, linking, onRemove } = data;
  const url = useImageUrl(node.image?.imageId);
  const o = outline(data);
  return (
    <>
      <Handle type="target" position={Position.Left} className={styles.handleDot} style={handleStyle(linking)} />
      <div className="relative group w-[320px] h-[200px] rounded-lg overflow-hidden border bg-subtle"
        style={{ borderColor: o.color, boxShadow: o.ring }}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={node.title} className="w-full h-full object-cover" />
        ) : <div className="w-full h-full bg-line/60" />}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          <RoleBadge role={node.role} onImage />
          <CollectionDots colors={data.collectionColors} />
        </div>
        {data.isSelected && (
          <span className="absolute top-2 right-9 w-6 h-6 rounded-md bg-white/90 flex items-center justify-center" aria-hidden>
            <Check size={14} style={{ color: ACCENT }} />
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 px-3 pt-6 pb-2 bg-gradient-to-t from-black/70 to-transparent">
          <p className="idea text-[14px] leading-tight text-white truncate">{node.title}</p>
        </div>
        {!linking && <RemoveButton id={node.id} onRemove={onRemove} onImage />}
      </div>
      <Handle type="source" position={Position.Right} className={styles.handleDot} style={handleStyle(linking)} />
    </>
  );
}

function IdeaFlowNode(props: NodeProps) {
  const data = props.data as unknown as IdeaNodeData;
  const inner = data.node.image ? <ImageIdeaNode data={data} /> : <TextIdeaNode data={data} />;
  return data.isNew ? <div className={styles.newGlow}>{inner}</div> : inner;
}

// ── Brief node ────────────────────────────────────────────────────────────────

function BriefFlowNode(props: NodeProps) {
  const data = props.data as unknown as BriefNodeData;
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <div className="w-[320px] h-[200px] rounded-lg border bg-surface px-4 py-3 flex flex-col gap-1.5 cursor-pointer"
        style={{ borderColor: data.isSelected ? ACCENT : "var(--color-line-strong)", boxShadow: data.isSelected ? `0 0 0 2px ${ACCENT}` : "var(--shadow-float)" }}>
        <p className="text-[12px] font-medium text-muted">Project brief</p>
        <p className="idea text-[18px] leading-tight text-ink truncate">{data.title}</p>
        <p className="idea text-[14px] leading-snug text-ink-2 line-clamp-4 flex-1">
          {data.brief || <span className="italic text-muted">Click to write your brief</span>}
        </p>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" aria-label="Add images"
          onChange={(e) => { data.onUpload(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
        <button className="nodrag nopan btn btn-sm self-start" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}>
          <ImagePlus size={14} aria-hidden /> Add images
        </button>
      </div>
      <Handle type="source" position={Position.Right} className={styles.handleDot} style={{ opacity: 0, pointerEvents: "none" }} />
    </>
  );
}

const nodeTypes: NodeTypes = { idea: IdeaFlowNode, brief: BriefFlowNode };

// ── Edges ─────────────────────────────────────────────────────────────────────

type SelectEdge = (additive: boolean) => void;

const LINK_SHAPE = { borderRadius: 14, offset: 28 };
const HANDLE_RADIUS = 5;
const LINE_SAMPLES = 41;
const LINK_DOT = { w: 10, h: 10 };

// Evenly spaced points along an SVG path. Kept by path text: most lines don't
// change between renders, and getPointAtLength is slow.
const sampledPaths = new Map<string, XY[]>();
function samplePath(d: string): XY[] {
  const known = sampledPaths.get(d);
  if (known) return known;
  if (sampledPaths.size > 2000) sampledPaths.clear();
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d);
  const length = path.getTotalLength();
  const points = Array.from({ length: LINE_SAMPLES }, (_, i) => {
    const { x, y } = path.getPointAtLength((length * i) / (LINE_SAMPLES - 1));
    return { x, y };
  });
  sampledPaths.set(d, points);
  return points;
}

// Finds a spot for each connection's word that no node or other word covers.
function placeWords(edges: FlowEdge[], nodes: FlowNode[]): Record<string, XY> {
  const boxes = new Map<string, Box>(nodes.map((n) => [n.id, {
    x: n.position.x, y: n.position.y,
    w: n.measured?.width ?? n.width ?? 0, h: n.measured?.height ?? n.height ?? 0,
  }]));
  const requests: LabelRequest[] = [];
  for (const e of edges) {
    const from = boxes.get(e.source);
    const to = boxes.get(e.target);
    const word = (e.data as { word?: string } | undefined)?.word;
    // A link with no word still shows a dot to click.
    if (!from || !to || (!word && e.type !== "link")) continue;
    const ends = {
      sourceX: from.x + from.w + HANDLE_RADIUS, sourceY: from.y + from.h / 2, sourcePosition: Position.Right,
      targetX: to.x - HANDLE_RADIUS, targetY: to.y + to.h / 2, targetPosition: Position.Left,
    };
    const [path] = e.type === "link" ? getSmoothStepPath({ ...ends, ...LINK_SHAPE }) : getBezierPath(ends);
    requests.push({ id: e.id, points: samplePath(path), ...(word ? wordSize(word) : LINK_DOT) });
  }
  return placeLabels(requests, [...boxes.values()]);
}

// A connection's word, with its reading above it when that end of the tree is in focus.
// A bigger click target than the line. Keyboard users select the edge itself.
function RelationPill({ word, reading, borderColor, active, onSelect }: { word: string; reading?: string; borderColor?: string; active?: boolean; onSelect?: SelectEdge }) {
  return (
    <span className="block px-2 py-0.5 rounded-[10px] bg-surface border text-[12px] leading-[1.3] max-w-40"
      onClick={onSelect && ((e) => { e.stopPropagation(); onSelect(e.shiftKey); })}
      style={{ borderColor, color: active ? "var(--color-ink)" : "var(--color-ink-2)", pointerEvents: onSelect ? "all" : "none", cursor: onSelect ? "pointer" : undefined }}>
      {reading && <span className="block text-[10px] text-muted truncate">{reading}</span>}
      <span className="block truncate">{word}</span>
    </span>
  );
}

function ProvenanceEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data, selected }: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const { onDelete, color, dashed, emphasis, word, wordAt, reading, onSelect } = (data ?? {}) as { onDelete?: () => void; color?: string; dashed?: boolean; emphasis?: boolean; word?: string; wordAt?: XY; reading?: string; onSelect?: SelectEdge };
  const showDelete = selected && onDelete;
  return (
    <>
      <path d={path} fill="none" stroke="transparent" strokeWidth={20} style={{ cursor: onSelect ? "pointer" : "default" }} />
      <BaseEdge path={path} markerEnd={markerEnd}
        style={{
          stroke: selected ? ACCENT : color,
          strokeWidth: emphasis || selected ? 2 : 1.5,
          strokeOpacity: emphasis || selected ? 0.95 : 0.6,
          strokeDasharray: dashed ? "5 4" : undefined,
          transition: "stroke 0.15s, stroke-opacity 0.15s",
        }} />
      {(word || showDelete) && (
        <EdgeLabelRenderer>
          <div style={{ position: "absolute", transform: `translate(-50%,-50%) translate(${wordAt?.x ?? labelX}px,${wordAt?.y ?? labelY}px)`, pointerEvents: "none", zIndex: 1 }}
            className="nodrag nopan flex items-center gap-1">
            {word && <RelationPill word={word} reading={reading} borderColor={selected ? ACCENT : color} active={emphasis || selected} onSelect={onSelect} />}
            {showDelete && (
              <button onClick={(e) => { e.stopPropagation(); onDelete(); }} aria-label="Remove connection" style={{ pointerEvents: "all" }}
                className="w-6 h-6 shrink-0 rounded-full bg-surface border border-line shadow-[var(--shadow-float)] text-ink-2 hover:text-danger flex items-center justify-center">
                <X size={12} />
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

// User links bend around the column instead of cutting through the nodes in it,
// and always show a label or a dot to click.
function LinkEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data, selected }: EdgeProps) {
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, ...LINK_SHAPE });
  const { word, wordAt, reading, onSelect } = (data ?? {}) as { word?: string; wordAt?: XY; reading?: string; onSelect?: SelectEdge };
  const stroke = selected ? ACCENT : "var(--color-ink-2)";
  return (
    <>
      <path d={path} fill="none" stroke="transparent" strokeWidth={24} style={{ cursor: "pointer" }} />
      <BaseEdge path={path} markerEnd={markerEnd} style={{ stroke, strokeWidth: selected ? 2 : 1.5, strokeDasharray: "5 3" }} />
      <EdgeLabelRenderer>
        <div style={{ position: "absolute", transform: `translate(-50%,-50%) translate(${wordAt?.x ?? labelX}px,${wordAt?.y ?? labelY}px)`, pointerEvents: "none", zIndex: 1 }}>
          {word ? (
            <RelationPill word={word} reading={selected ? reading : undefined} borderColor={stroke} active={selected} onSelect={onSelect} />
          ) : (
            <span className="block w-2.5 h-2.5 rounded-full border-2 bg-surface" style={{ borderColor: stroke }} />
          )}
        </div>
      </EdgeLabelRenderer>
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
    <svg className="absolute inset-0 pointer-events-none" aria-hidden
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

// ── Canvas chrome ─────────────────────────────────────────────────────────────

function ToolSwitch({ tool, onChange }: { tool: Tool; onChange: (t: Tool) => void }) {
  const tools: { id: Tool; label: string; hint: string; Icon: typeof MousePointer2 }[] = [
    { id: "select", label: "Select", hint: "Click to select, shift-click to add, drag to pan", Icon: MousePointer2 },
    { id: "lasso", label: "Lasso", hint: "Drag to select several nodes", Icon: Lasso },
    { id: "link", label: "Connect", hint: "Drag from a node to another node to connect them", Icon: Spline },
  ];
  return (
    <div role="radiogroup" aria-label="Canvas tool" className="inline-flex p-0.5 rounded-md bg-surface border border-line shadow-[var(--shadow-float)]">
      {tools.map(({ id, label, hint, Icon }) => (
        <button key={id} role="radio" aria-checked={tool === id} title={hint} onClick={() => onChange(id)}
          className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[5px] text-[13px] font-medium transition-colors ${
            tool === id ? "bg-ink text-white" : "text-ink-2 hover:bg-subtle hover:text-ink"}`}>
          <Icon size={14} aria-hidden /> {label}
        </button>
      ))}
    </div>
  );
}

// Open while the tree is empty; tucks itself away once there are nodes, so it
// doesn't crowd the selection bar. The user can reopen it.
function Legend({ hasNodes }: { hasNodes: boolean }) {
  const [open, setOpen] = useState(!hasNodes);
  useEffect(() => { if (hasNodes) setOpen(false); }, [hasNodes]);
  return (
    <div className="floating text-[12px] overflow-hidden w-36">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 h-8 text-ink-2 font-medium hover:bg-subtle">
        Key {open ? <ChevronUp size={14} className="ml-auto" aria-hidden /> : <ChevronDown size={14} className="ml-auto" aria-hidden />}
      </button>
      {open && (
        <ul className="px-3 pb-2.5 flex flex-col gap-1.5 text-ink-2">
          {ROLES.map((r) => (
            <li key={r} className="flex items-center gap-2">
              {r === "motif" ? (
                <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden>
                  <polygon points="3.5,0.5 12.5,0.5 15.5,3.5 15.5,8.5 12.5,11.5 3.5,11.5 0.5,8.5 0.5,3.5"
                    fill={ROLE_STYLE[r].fill} stroke={ROLE_STYLE[r].border} />
                </svg>
              ) : (
                <span className={`w-4 h-3 border ${r === "concept" ? "rounded-[3px]" : "rounded-[5px]"}`}
                  style={{ background: ROLE_STYLE[r].fill, borderColor: ROLE_STYLE[r].border }} aria-hidden />
              )}
              {ROLE_LABEL[r]}
            </li>
          ))}
          <li className="flex items-center gap-2">
            <svg width="16" height="8" aria-hidden><line x1="0" y1="4" x2="16" y2="4" stroke="var(--color-ink-2)" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
            Your connection
          </li>
        </ul>
      )}
    </div>
  );
}

// Shown until the first run, so a first-time participant knows the order of things.
function GetStarted({ hasBrief, hasImage, onOpenBrief, onRun }: {
  hasBrief: boolean; hasImage: boolean; onOpenBrief: () => void; onRun: (a: ActionType) => void;
}) {
  const Step = ({ done, children }: { done: boolean; children: React.ReactNode }) => (
    <li className="flex items-center gap-2.5">
      <span className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center border ${done ? "bg-ink border-ink text-white" : "border-line-strong"}`}>
        {done && <Check size={12} aria-hidden />}
        <span className="sr-only">{done ? "Done:" : "To do:"}</span>
      </span>
      <span className={done ? "text-muted" : "text-ink"}>{children}</span>
    </li>
  );
  return (
    <section aria-label="Get started" className="floating w-80 px-4 py-3">
      <h2 className="text-[15px] font-semibold text-ink mb-2.5">Get started</h2>
      <ol className="flex flex-col gap-2 text-[13px]">
        <Step done={hasBrief}>
          <button className="underline underline-offset-2 hover:no-underline" onClick={onOpenBrief}>Write your brief</button>
        </Step>
        <Step done={hasImage}>Add images of your draft or references <span className="text-muted">(optional)</span></Step>
        <Step done={false}>
          <button className="underline underline-offset-2 hover:no-underline disabled:no-underline disabled:text-muted" disabled={!hasBrief}
            onClick={() => onRun("expand")}>Run Expand</button>{" "}to turn them into concepts and motifs
        </Step>
      </ol>
    </section>
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
  const [tool, setTool] = useState<Tool>("select");
  const [showCollectionColors, setShowCollectionColors] = useState(false);
  const [exportColorsActive, setExportColorsActive] = useState(false);
  const rfRef = useRef<ReactFlowInstance | null>(null);
  const linking = tool === "link";

  const layout = useMemo(() => computeTreeLayout(project), [project]);
  const shown = useMemo(() => visibleNodes(project), [project]);
  const provenance = useMemo(() => treeEdges(project), [project]);
  const links = useMemo(() => visibleLinks(project), [project]);
  const collections = useMemo(() => Object.values(project.collections), [project]);
  const hasGenerated = shown.some((n) => n.origin.kind === "generated");

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

  // When a run finishes (or "Show" is pressed), bring its outputs and what
  // they came from into view, and make them glow for a moment.
  const focus = useProjectStore((s) => s.focus);
  const [newIds, setNewIds] = useState<Set<NodeId>>(new Set());
  useEffect(() => {
    if (!focus?.nodeIds.length) return;
    const ids = new Set(focus.nodeIds);
    setNewIds(ids);
    // Wait a frame so React Flow has measured the new nodes.
    const fit = setTimeout(() => {
      const withParents = new Set(ids);
      for (const id of ids) for (const a of ancestors(projectStore.getState().project!, id)) withParents.add(a);
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      rfRef.current?.fitView({ nodes: [...withParents].map((id) => ({ id })), padding: 0.2, maxZoom: 1, duration: still ? 0 : 400 });
    }, 80);
    const fade = setTimeout(() => setNewIds(new Set()), 2600);
    return () => { clearTimeout(fit); clearTimeout(fade); };
  }, [focus]);

  const handleUpload = useCallback(async (files: File[]) => {
    for (const f of files) await addImageNode(await fileToImage(f), { role: "visual", title: f.name.replace(/\.[^.]+$/, "") });
  }, [addImageNode]);

  // ── React Flow nodes and edges ────────────────────────────────────────────

  const flowNodes = useMemo((): FlowNode[] => {
    const showColors = showCollectionColors || exportColorsActive;
    const nodes: FlowNode[] = [{
      id: BRIEF_ID, type: "brief", position: layout.positions[BRIEF_ID],
      data: { title: project.title, brief: project.brief, isSelected: briefOpen, onUpload: handleUpload } satisfies BriefNodeData,
      width: BRIEF_W, height: BRIEF_H, deletable: false, selected: false,
      ariaLabel: "Project brief. Press Enter to edit",
    }];
    for (const n of shown) {
      nodes.push({
        id: n.id, type: "idea", position: layout.positions[n.id],
        data: {
          node: n,
          isSelected: selectedSet.has(n.id),
          isHovered: hoveredId === n.id,
          isAncestor: hoveredAncestors.has(n.id),
          isSourceOfSelected: selectedAncestors.has(n.id),
          isNew: newIds.has(n.id),
          collectionColors: showColors ? collectionColors.get(n.id) : undefined,
          linking,
          onRemove: hideNode,
        } satisfies IdeaNodeData,
        width: layout.sizes[n.id].w, height: layout.sizes[n.id].h,
        selected: selectedSet.has(n.id),
        // A group (the default role), since it holds its own Remove button; the
        // selected state is in the name. Enter selects it (see onKeyDown).
        ariaLabel: `${ROLE_LABEL[n.role]}: ${n.title}${selectedSet.has(n.id) ? ", selected" : ""}`,
      });
    }
    return nodes;
  }, [project.title, project.brief, layout, shown, briefOpen, linking, handleUpload, selectedSet, hoveredId, hoveredAncestors,
    selectedAncestors, newIds, showCollectionColors, exportColorsActive, collectionColors, hideNode]);

  const selectEdge = useCallback((id: string, additive: boolean) => {
    if (additive) toggleSelected(id);
    else setSelection([id]);
  }, [toggleSelected, setSelection]);

  const flowEdges = useMemo((): FlowEdge[] => {
    const edges: FlowEdge[] = [];
    const edgeAria = (from: string, to: string, word?: string) => `Connection between ${from} and ${to}${word ? `: ${word}` : ""}`;
    for (const id of layout.briefTargets) {
      // Older outputs have no stored edge from the brief, so no word to show.
      const stored = Object.values(project.edges).find((x) => x.from === BRIEF_ID && x.to === id && !x.hidden);
      const focused = hoveredId === id || singleSelected === id;
      const word = stored && stored.relation?.word;
      edges.push({
        id: stored?.id ?? `${BRIEF_ID}->${id}`, source: BRIEF_ID, target: id, type: "provenance",
        selected: !!stored && selectedSet.has(stored.id), selectable: !!stored, deletable: false, focusable: !!stored,
        ...(stored ? {
          ariaLabel: edgeAria("the brief", project.nodes[id].title, word),
          ariaRole: "button" as const,
          domAttributes: { "aria-pressed": selectedSet.has(stored.id) },
        } : {}),
        data: {
          color: "var(--color-line-strong)", dashed: true, emphasis: focused, word,
          reading: focused || (stored && selectedSet.has(stored.id)) ? readingFor("brief", project.nodes[id].role).reading : undefined,
          onSelect: stored && ((additive: boolean) => selectEdge(stored.id, additive)),
        },
        markerEnd: { type: MarkerType.Arrow, color: "#c7cad1", width: 10, height: 10, strokeWidth: 0 },
      });
    }
    for (const e of provenance) {
      const emphasis = (!!singleSelected && (e.to === singleSelected || (selectedAncestors.has(e.to) && selectedAncestors.has(e.from))))
        || hoveredId === e.to || hoveredId === e.from;
      const color = emphasis ? "#43464d" : ROLE_STYLE[project.nodes[e.to].role].border;
      // A bridged edge spans removed nodes, so there's no single stored edge to delete.
      const direct = e.bridged ? [] : Object.values(project.edges).filter(
        (x) => x.kind === "derived_from" && !x.hidden && x.from === e.from && x.to === e.to);
      const stored = direct[0];
      const isSelected = !!stored && selectedSet.has(stored.id);
      const word = stored && stored.relation?.word;
      edges.push({
        // A stored connection is selected by its own ID; a bridged one can't be selected.
        id: stored?.id ?? `prov:${e.from}->${e.to}`, source: e.from, target: e.to, type: "provenance",
        selected: isSelected, selectable: !!stored, deletable: !!stored, focusable: !!stored,
        ...(stored ? {
          ariaLabel: edgeAria(project.nodes[e.from].title, project.nodes[e.to].title, word),
          ariaRole: "button" as const,
          domAttributes: { "aria-pressed": isSelected },
        } : {}),
        data: {
          color, emphasis, dashed: e.bridged, word,
          // Only edges into the node in focus: a whole fan of two-line pills would overlap.
          reading: isSelected || hoveredId === e.to || singleSelected === e.to ? readingFor(project.nodes[e.from].role, project.nodes[e.to].role).reading : undefined,
          onSelect: stored && ((additive: boolean) => selectEdge(stored.id, additive)),
          onDelete: direct.length > 0 ? () => direct.forEach((x) => hideEdge(x.id)) : undefined,
        },
        markerEnd: { type: MarkerType.Arrow, color, width: 12, height: 12, strokeWidth: 0 },
      });
    }
    for (const e of links) {
      edges.push({
        id: e.id, source: e.from, target: e.to, type: "link", selected: selectedSet.has(e.id),
        data: {
          word: e.relation?.word,
          reading: readingFor(project.nodes[e.from].role, project.nodes[e.to].role).reading,
          onSelect: (additive: boolean) => selectEdge(e.id, additive),
        },
        ariaLabel: edgeAria(project.nodes[e.from].title, project.nodes[e.to].title, e.relation?.word),
        ariaRole: "button",
        domAttributes: { "aria-pressed": selectedSet.has(e.id) },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#43464d", width: 12, height: 12, strokeWidth: 0 },
      });
    }
    return edges;
  }, [layout.briefTargets, provenance, links, project.nodes, project.edges, singleSelected, selectedAncestors, hoveredId, selectedSet, hideEdge, selectEdge]);

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
          ariaLabel: n.ariaLabel,
          position: existing.dragging ? existing.position : n.position };
      });
    });
  }, [flowNodes]);

  // From the live node positions, so words move out of the way during a drag.
  const placedEdges = useMemo((): FlowEdge[] => {
    const spots = placeWords(flowEdges, displayNodes);
    return flowEdges.map((e) => (spots[e.id] ? { ...e, data: { ...e.data, wordAt: spots[e.id] } } : e));
  }, [flowEdges, displayNodes]);

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    // Selection is owned by the store; ignore React Flow's own select changes.
    setDisplayNodes((nds) => applyNodeChanges(changes.filter((c) => c.type !== "select"), nds));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<FlowEdge>[]) => {
    for (const c of changes) {
      if (c.type !== "remove") continue;
      const onDelete = (flowEdges.find((e) => e.id === c.id)?.data as { onDelete?: () => void } | undefined)?.onDelete;
      if (onDelete) onDelete();
      else if (project.edges[c.id]) hideEdge(c.id);
    }
  }, [project.edges, flowEdges, hideEdge]);

  // ── Interaction ───────────────────────────────────────────────────────────

  const selectNode = useCallback((id: string, additive: boolean) => {
    if (id === BRIEF_ID) { clearSelection(); onOpenBrief(); return; }
    if (additive) toggleSelected(id);
    else setSelection(singleSelected === id ? [] : [id]);
  }, [clearSelection, onOpenBrief, toggleSelected, setSelection, singleSelected]);

  const onNodeClick = useCallback((event: React.MouseEvent, n: FlowNode) => selectNode(n.id, event.shiftKey), [selectNode]);

  // Keyboard: Enter or Space selects the focused node (shift adds), Escape clears.
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, input, textarea")) return;
    const nodeEl = target.closest?.(".react-flow__node");
    const edgeId = target.closest?.(".react-flow__edge")?.getAttribute("data-id");
    if ((e.key === "Enter" || e.key === " ") && nodeEl) {
      e.preventDefault();
      selectNode(nodeEl.getAttribute("data-id")!, e.shiftKey);
    } else if ((e.key === "Enter" || e.key === " ") && edgeId && project.edges[edgeId]) {
      e.preventDefault();
      if (e.shiftKey) toggleSelected(edgeId); else setSelection([edgeId]);
    } else if (e.key === "Escape") {
      clearSelection();
    }
  }, [selectNode, clearSelection, project.edges, toggleSelected, setSelection]);

  const onEdgeClick = useCallback((event: React.MouseEvent, e: FlowEdge) => {
    if (!project.edges[e.id]) return;  // older lines from the brief and bridged lines aren't stored
    selectEdge(e.id, event.shiftKey);
  }, [project.edges, selectEdge]);

  const onSelectionChange = useCallback(({ nodes }: { nodes: FlowNode[] }) => {
    if (tool !== "lasso") return;
    const ids = nodes.map((n) => n.id).filter((id) => id !== BRIEF_ID);
    if (ids.length >= 2) setSelection(ids);
  }, [tool, setSelection]);

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

  // React Flow only connects when the drag ends on the target's small handle.
  // Dropping anywhere on a node is what people expect, so handle that too.
  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (state.isValid || !state.fromNode) return;
    const point = "changedTouches" in event ? event.changedTouches[0] : event;
    const target = document.elementFromPoint(point.clientX, point.clientY)?.closest(".react-flow__node")?.getAttribute("data-id");
    if (!target || target === BRIEF_ID || state.fromNode.id === BRIEF_ID || target === state.fromNode.id) return;
    addLink(state.fromNode.id, target);
  }, [addLink]);

  const exportPng = useCallback(async (withColors: boolean) => {
    const rf = rfRef.current;
    if (!rf) return;
    const flash = withColors && !showCollectionColors;
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
        backgroundColor: "#f3f4f6", width: W, height: H,
        style: { width: `${W}px`, height: `${H}px`, transform: `translate(${x}px, ${y}px) scale(${zoom})` },
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${project.title || "tree"}-${Date.now()}.png`;
      a.click();
    } finally {
      if (flash) setExportColorsActive(false);
    }
  }, [showCollectionColors, project.title]);

  return (
    <div className={`relative flex-1 h-full ${styles.canvas}`} onKeyDown={onKeyDown}>
      {/* Canvas chrome comes first in the page so Tab reaches it before the nodes. */}
      <div className="absolute top-3 left-3 z-10"><Legend hasNodes={shown.length > 0} /></div>
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        <ToolSwitch tool={tool} onChange={setTool} />
        <button className="btn btn-primary shadow-[var(--shadow-float)]" onClick={() => onOpenAddNode(selection.filter((id) => project.nodes[id]))}>
          <Plus size={15} aria-hidden /> Add node
        </button>
        <div className="shadow-[var(--shadow-float)] rounded-md">
          <Menu label="More tree actions" items={[
            { label: "Tidy layout", onSelect: () => resetLayout("tree"), disabled: Object.keys(project.views.tree.positions).length === 0 },
            { label: showCollectionColors ? "Hide collection colours" : "Show collection colours", onSelect: () => setShowCollectionColors((v) => !v), disabled: collections.length === 0 },
            { label: "Export as PNG", onSelect: () => exportPng(false) },
            { label: "Export as PNG with collection colours", onSelect: () => exportPng(true), disabled: collections.length === 0 },
            { label: "Clear tree", onSelect: clearTree, danger: true, disabled: shown.length === 0 },
          ]} />
        </div>
      </div>
      {!hasGenerated && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10">
          <GetStarted hasBrief={!!project.brief.trim()} hasImage={shown.some((n) => n.image)} onOpenBrief={onOpenBrief} onRun={onOpenRun} />
        </div>
      )}
      <ReactFlow
        proOptions={{ hideAttribution: true }}
        nodes={displayNodes}
        edges={placedEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onNodeMouseEnter={(_, n) => { if (n.id !== BRIEF_ID) setHoveredId(n.id); }}
        onNodeMouseLeave={() => setHoveredId(null)}
        onPaneClick={clearSelection}
        onInit={(instance) => { rfRef.current = instance; instance.fitView({ padding: 0.15, maxZoom: 1 }); }}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={2.0}
        onNodeDragStop={onNodeDragStop}
        onNodesDelete={onNodesDelete}
        connectOnClick={false}
        nodesConnectable={linking}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        deleteKeyCode={["Delete", "Backspace"]}
        selectionOnDrag={tool === "lasso"}
        panOnDrag={tool === "lasso" ? [1, 2] : true}
        selectionMode={SelectionMode.Partial}
        onSelectionChange={onSelectionChange}
        aria-label="Idea tree"
      >
        {showCollectionColors && <CollectionHalos collections={collections} />}
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#c9ccd3" />
        <Controls showInteractive={false} position="bottom-right" />

      </ReactFlow>
    </div>
  );
}
