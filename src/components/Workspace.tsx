"use client";

// The shell around both views: header with the view switch, the shared
// selection bar, run progress, notices, side panel and modals. Both views
// read the same project and the same selection from the store.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, FolderPlus, Loader2, X } from "lucide-react";
import { useProjectStore, type Notice } from "@/store/projectStore";
import type { ActionType, NodeId } from "@/domain/types";
import { formatUsd, PRICES_CHECKED } from "@/domain/pricing";
import TreeView from "./TreeView";
import ClusterView from "./ClusterView";
import RunComposer from "./RunComposer";
import AddNodeModal from "./AddNodeModal";
import { BriefPanel, LinkPanel, NodePanel } from "./DetailPanel";
import { ACTIONS, ACTION_LABEL, COLLECTION_COLORS } from "./nodeStyle";
import { whyUnavailable } from "./availability";
import { ACTION_ICON } from "./actionIcons";

// Calls and estimated cost for this project.
function UsageBadge() {
  const usage = useProjectStore((s) => s.project?.usage);
  const calls = usage?.calls ?? 0;
  return (
    <p className="text-[12px] text-muted whitespace-nowrap tabular-nums"
      title={`Estimated from the tokens Gemini reports, at list prices checked ${PRICES_CHECKED}. Retries and failed calls are included.`}>
      {calls} {calls === 1 ? "call" : "calls"}, about {formatUsd(usage?.costUsd ?? 0)}
    </p>
  );
}

// One message, with its own fade timer so new notices don't reset older ones.
function NoticeRow({ notice }: { notice: Notice }) {
  const dismiss = useProjectStore((s) => s.dismissNotice);
  useEffect(() => {
    if (notice.kind === "error") return;   // errors stay until dismissed
    const t = setTimeout(() => dismiss(notice.id), 6000);
    return () => clearTimeout(t);
  }, [notice, dismiss]);
  const isError = notice.kind === "error";
  return (
    <div role={isError ? "alert" : "status"}
      className={`floating flex items-start gap-2.5 pl-3 pr-1.5 py-2 text-[13px] ${isError ? "border-l-[3px] border-l-danger" : ""}`}>
      {isError && <AlertTriangle size={15} className="text-danger shrink-0 mt-0.5" aria-hidden />}
      <span className="text-ink flex-1 leading-snug pt-px">{notice.message}</span>
      {notice.action && (
        <button className="btn btn-sm shrink-0" onClick={() => { notice.action!.run(); dismiss(notice.id); }}>
          {notice.action.label}
        </button>
      )}
      <button onClick={() => dismiss(notice.id)} className="icon-btn shrink-0" aria-label="Dismiss"><X size={14} /></button>
    </div>
  );
}

// Top-right, under the canvas toolbar, so they never cover nodes or the selection bar.
function Notices() {
  const notices = useProjectStore((s) => s.notices);
  if (notices.length === 0) return null;
  return (
    <div className="absolute right-3 top-14 z-20 flex flex-col gap-2 w-[min(24rem,calc(100%-1.5rem))]">
      {notices.slice(-4).map((n) => <NoticeRow key={n.id} notice={n} />)}
    </div>
  );
}

function RunProgress() {
  const runs = useProjectStore((s) => s.runs);
  const list = Object.values(runs);
  if (list.length === 0) return null;
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex flex-col gap-1.5">
      {list.map((r) => (
        <div key={r.runId} role="status" className="floating flex items-center gap-2 px-3 h-9 text-[13px] text-ink tabular-nums">
          <Loader2 size={15} className="animate-spin text-accent" aria-hidden />
          Running {ACTION_LABEL[r.action]}
          {r.total > 1 && <span className="text-muted">{r.done + r.failed} of {r.total}</span>}
        </div>
      ))}
    </div>
  );
}

function CollectionPicker({ nodeIds, onDone }: { nodeIds: NodeId[]; onDone: () => void }) {
  const project = useProjectStore((s) => s.project)!;
  const addToCollection = useProjectStore((s) => s.addToCollection);
  const createCollection = useProjectStore((s) => s.createCollection);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const collections = Object.values(project.collections);
  const finish = () => { setOpen(false); setName(""); onDone(); };
  return (
    <div className="relative" onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
      <button className="btn btn-ghost" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((v) => !v)}>
        <FolderPlus size={15} aria-hidden /> <span className="hidden xl:inline">Add to collection</span>
        <span className="sr-only xl:hidden">Add to collection</span>
      </button>
      {open && (
        <div role="menu" className="floating absolute bottom-full mb-2 left-0 w-60 p-1 z-50">
          {collections.map((c) => (
            <button key={c.id} role="menuitem" onClick={() => { addToCollection(c.id, nodeIds); finish(); }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] text-ink hover:bg-subtle text-left">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} aria-hidden />
              <span className="truncate">{c.title}</span>
            </button>
          ))}
          <form className={`p-1.5 ${collections.length ? "border-t border-line mt-1" : ""}`}
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              createCollection(name.trim(), COLLECTION_COLORS[collections.length % COLLECTION_COLORS.length], nodeIds);
              finish();
            }}>
            <label htmlFor="new-collection" className="field-label">New collection</label>
            <input id="new-collection" autoFocus className="field" placeholder="Name, then press Enter" value={name} onChange={(e) => setName(e.target.value)} />
          </form>
        </div>
      )}
    </div>
  );
}

function SelectionBar({ onRun }: { onRun: (a: ActionType) => void }) {
  const project = useProjectStore((s) => s.project)!;
  const selection = useProjectStore((s) => s.selection);
  const clearSelection = useProjectStore((s) => s.clearSelection);
  const nodeIds = selection.filter((id) => project.nodes[id]);

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 max-w-[calc(100%-1.5rem)]">
      <div role="toolbar" aria-label="Actions for the selection" className="floating flex items-center gap-1.5 p-1.5 pl-3">
        <span className="text-[13px] text-ink-2 whitespace-nowrap mr-1 tabular-nums">
          {selection.length > 0 ? `${selection.length} selected` : <><span className="hidden lg:inline">Nothing selected, </span>uses the brief</>}
        </span>
        {ACTIONS.map((a) => {
          const reason = whyUnavailable(a.id, project, selection);
          const Icon = ACTION_ICON[a.id];
          return (
            // aria-disabled, not disabled, so keyboard users can still reach it and hear why.
            <button key={a.id} className="btn" onClick={() => { if (!reason) onRun(a.id); }} aria-disabled={!!reason}
              title={reason ?? a.description}>
              <Icon size={15} aria-hidden /> {a.label}
              {reason && <span className="sr-only">. {reason}</span>}
            </button>
          );
        })}
        {nodeIds.length > 0 && (
          <>
            <span className="w-px h-5 bg-line mx-0.5" aria-hidden />
            <CollectionPicker nodeIds={nodeIds} onDone={clearSelection} />
          </>
        )}
        {selection.length > 0 && (
          <button className="icon-btn" onClick={clearSelection} aria-label="Clear selection" title="Clear selection"><X size={15} /></button>
        )}
      </div>
    </div>
  );
}

export default function Workspace() {
  const project = useProjectStore((s) => s.project)!;
  const selection = useProjectStore((s) => s.selection);
  const saveError = useProjectStore((s) => s.saveError);
  const setSelection = useProjectStore((s) => s.setSelection);
  const clearSelection = useProjectStore((s) => s.clearSelection);

  const [view, setView] = useState<"tree" | "collections">("tree");
  const [briefOpen, setBriefOpen] = useState(false);
  const [composer, setComposer] = useState<ActionType | null>(null);
  const [addNodeParents, setAddNodeParents] = useState<NodeId[] | null>(null);
  const [panelWidth, setPanelWidth] = useState(320);

  useEffect(() => { document.title = `${project.title} | Design Workspace`; }, [project.title]);

  // Selecting something closes the brief panel; the panel follows the selection.
  useEffect(() => { if (selection.length > 0) setBriefOpen(false); }, [selection]);

  const single = selection.length === 1 ? selection[0] : null;
  const panel = useMemo(() => {
    if (briefOpen) return { kind: "brief" as const };
    if (single && project.nodes[single] && !project.nodes[single].hidden) return { kind: "node" as const, id: single };
    if (single && project.edges[single]) return { kind: "link" as const, id: single };
    return null;
  }, [briefOpen, single, project]);

  const openRun = useCallback((action: ActionType) => setComposer(action), []);
  const runFrom = useCallback((ids: string[]) => (action: ActionType) => { setSelection(ids); setComposer(action); }, [setSelection]);

  const startResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelWidth;
    const onMove = (ev: PointerEvent) => setPanelWidth(Math.max(260, Math.min(560, startW + startX - ev.clientX)));
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [panelWidth]);

  const views = [{ id: "tree", label: "Tree" }, { id: "collections", label: "Collections" }] as const;

  return (
    <main className="flex-1 min-w-0 h-screen flex flex-col overflow-hidden">
      <header className="h-12 px-3 bg-surface border-b border-line flex items-center gap-3 shrink-0">
        <Link href="/" className="btn btn-ghost btn-sm px-1.5 text-ink-2">
          <ChevronLeft size={16} aria-hidden /> Projects
        </Link>
        <span className="w-px h-5 bg-line" aria-hidden />
        <h1 className="idea text-[17px] text-ink truncate max-w-[32ch]" title={project.title}>{project.title}</h1>
        <div role="tablist" aria-label="View" className="inline-flex p-0.5 ml-2 rounded-md bg-subtle border border-line">
          {views.map((v) => (
            <button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => setView(v.id)}
              className={`h-7 px-3 rounded-[5px] text-[13px] font-medium transition-colors ${
                view === v.id ? "bg-surface text-ink shadow-[0_1px_2px_rgb(16_24_40/0.08)]" : "text-ink-2 hover:text-ink"}`}>
              {v.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3 min-w-0">
          {saveError && (
            <p role="alert" className="text-[12px] text-danger truncate" title={saveError}>
              Couldn&apos;t save: {saveError}. Your changes are kept in this tab.
            </p>
          )}
          <UsageBadge />
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <div className="relative flex-1 min-w-0 flex">
          {view === "tree" ? (
            <TreeView briefOpen={briefOpen} onOpenBrief={() => setBriefOpen(true)} onOpenAddNode={setAddNodeParents} onOpenRun={openRun} />
          ) : (
            <ClusterView />
          )}
          <RunProgress />
          <SelectionBar onRun={openRun} />
          <Notices />
        </div>

        {panel && (
          <div className="relative flex shrink-0" style={{ width: panelWidth }}>
            <div onPointerDown={startResize} aria-hidden
              className="absolute left-0 top-0 bottom-0 w-1 -ml-0.5 cursor-col-resize z-10 hover:bg-accent/40 transition-colors" />
            {panel.kind === "brief" && <BriefPanel onClose={() => setBriefOpen(false)} onRun={(a) => { clearSelection(); setComposer(a); }} />}
            {panel.kind === "node" && (
              <NodePanel nodeId={panel.id} onClose={clearSelection} onRun={runFrom([panel.id])} onAddChild={() => setAddNodeParents([panel.id])} />
            )}
            {panel.kind === "link" && <LinkPanel edgeId={panel.id} onClose={clearSelection} onRun={runFrom([panel.id])} />}
          </div>
        )}
      </div>

      {composer && <RunComposer action={composer} onClose={() => setComposer(null)} />}
      {addNodeParents && <AddNodeModal initialParentIds={addNodeParents} onClose={() => setAddNodeParents(null)} />}
    </main>
  );
}
