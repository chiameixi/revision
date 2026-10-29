"use client";

// The shell around both views: header with the view toggle, the shared
// selection bar, run progress, notices, side panel and modals. Both views
// read the same project and the same selection from the store.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useProjectStore } from "@/store/projectStore";
import type { ActionType, NodeId } from "@/domain/types";
import TreeView from "./TreeView";
import ClusterView from "./ClusterView";
import RunComposer from "./RunComposer";
import AddNodeModal from "./AddNodeModal";
import { BriefPanel, LinkPanel, NodePanel } from "./DetailPanel";
import { ACTIONS, ACTION_LABEL, COLLECTION_COLORS } from "./nodeStyle";
import styles from "./Workspace.module.css";

function Notices() {
  const notices = useProjectStore((s) => s.notices);
  const dismiss = useProjectStore((s) => s.dismissNotice);
  useEffect(() => {
    if (notices.length === 0) return;
    const timers = notices.map((n) => setTimeout(() => dismiss(n.id), 8000));
    return () => timers.forEach(clearTimeout);
  }, [notices, dismiss]);
  if (notices.length === 0) return null;
  return (
    <div className="absolute left-3 bottom-[200px] z-20 flex flex-col gap-1.5 max-w-xs">
      {notices.map((n) => (
        <div key={n.id} role="alert" className={`flex items-start gap-2 bg-white border border-red-200 px-3 py-2 text-[11px] shadow-sm ${styles.sq}`}>
          <span className="text-red-500 shrink-0 mt-px">⚠</span>
          <span className="text-[#333] flex-1 leading-snug">{n.message}</span>
          <button onClick={() => dismiss(n.id)} className="text-[#ccc] hover:text-[#555] shrink-0 ml-1 leading-none" aria-label="Dismiss">✕</button>
        </div>
      ))}
    </div>
  );
}

function RunProgress() {
  const runs = useProjectStore((s) => s.runs);
  const list = Object.values(runs);
  if (list.length === 0) return null;
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex flex-col gap-1">
      {list.map((r) => (
        <div key={r.runId} className={`flex items-center gap-2 bg-white border border-[#111] px-3 py-2 text-[11px] text-[#555] ${styles.sq}`}>
          <span className="inline-block w-3 h-3 border-2 border-[#555] border-t-transparent rounded-full animate-spin shrink-0" />
          Running {ACTION_LABEL[r.action]}
          {r.total > 1 && <span className="text-[#999]">· {r.total} outputs</span>}
        </div>
      ))}
    </div>
  );
}

function SelectionBar({ onRun }: { onRun: (a: ActionType) => void }) {
  const project = useProjectStore((s) => s.project)!;
  const selection = useProjectStore((s) => s.selection);
  const clearSelection = useProjectStore((s) => s.clearSelection);
  const addToCollection = useProjectStore((s) => s.addToCollection);
  const createCollection = useProjectStore((s) => s.createCollection);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const nodeIds = selection.filter((id) => project.nodes[id]);
  const collections = Object.values(project.collections);
  const done = () => { setPickerOpen(false); setNewName(""); clearSelection(); };

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20">
      <div className={`flex items-center gap-2 bg-white border border-[rgba(0,0,0,0.2)] px-3 py-2 text-[11px] ${styles.sq}`}>
        <span className="text-[#555] font-medium pr-1 whitespace-nowrap">
          {selection.length > 0 ? `${selection.length} selected` : "Nothing selected · uses the brief"}
        </span>
        <span className="text-[#ddd]">·</span>
        {ACTIONS.map((a) => (
          <button key={a.id} onClick={() => onRun(a.id)} title={a.description}
            className="px-2.5 py-1 rounded-md bg-[#111] text-white hover:bg-[#333] transition-colors whitespace-nowrap">
            {a.label} →
          </button>
        ))}
        {nodeIds.length > 0 && (
          <>
            <span className="text-[#ddd]">·</span>
            <div className="relative">
              <button onClick={() => setPickerOpen((v) => !v)}
                className={`px-2.5 py-1 rounded-md border transition-colors whitespace-nowrap ${
                  pickerOpen ? "bg-[#f0f0ff] border-[#6666cc] text-[#333]" : "border-[#e4e3e0] text-[#555] hover:border-[#888] hover:text-[#111]"}`}>
                Collection →
              </button>
              {pickerOpen && (
                <div className={`absolute bottom-full left-0 mb-1.5 bg-white border border-[rgba(0,0,0,0.15)] shadow-lg p-1.5 min-w-[180px] z-50 ${styles.sq}`}>
                  {collections.map((c) => (
                    <button key={c.id} onClick={() => { addToCollection(c.id, nodeIds); done(); }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-[#f5f5f4] text-left">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                      <span className="text-[11px] text-[#333] truncate">{c.title}</span>
                    </button>
                  ))}
                  <div className="px-2 py-1.5 border-t border-[#f0efec] mt-1">
                    <input autoFocus placeholder="New collection name…" value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newName.trim()) {
                          createCollection(newName.trim(), COLLECTION_COLORS[collections.length % COLLECTION_COLORS.length], nodeIds);
                          done();
                        }
                        if (e.key === "Escape") setPickerOpen(false);
                      }}
                      className="w-full text-[10px] border border-[#e4e3e0] rounded-md px-1.5 py-1 outline-none focus:border-blue-400" />
                  </div>
                </div>
              )}
            </div>
          </>
        )}
        {selection.length > 0 && (
          <>
            <span className="text-[#ddd]">·</span>
            <button onClick={clearSelection} className="text-[#aaa] hover:text-[#555] transition-colors px-1" title="Clear selection">✕ Clear</button>
          </>
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
  const [panelWidth, setPanelWidth] = useState(280);

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
    const onMove = (ev: PointerEvent) => setPanelWidth(Math.max(220, Math.min(560, startW + startX - ev.clientX)));
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [panelWidth]);

  return (
    <main className="flex-1 min-w-0 h-screen flex flex-col overflow-hidden">
      <div className={`px-5 pt-2.5 pb-2.5 bg-white flex items-center gap-4 ${styles.toolbar}`}>
        <Link href="/" className="text-[12px] text-[rgba(0,0,0,0.45)] hover:text-black transition-colors whitespace-nowrap">← Projects</Link>
        <span className="text-[#ddd]">/</span>
        <p className="text-[13px] font-semibold text-[#111] truncate max-w-[30ch]" title={project.title}>{project.title}</p>
        <div className="flex items-center gap-1">
          {(["tree", "collections"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`text-[12px] px-2.5 py-1 transition-colors capitalize tracking-wide ${styles.sq} ${
                view === v ? "text-black border-b border-black" : "text-[rgba(0,0,0,0.35)] hover:text-black"}`}>
              {v}
            </button>
          ))}
        </div>
        {saveError && (
          <p role="alert" className="ml-auto text-[11px] text-red-600">Couldn&apos;t save: {saveError}. Your changes are kept in this tab; try again before closing it.</p>
        )}
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="relative flex-1 min-w-0 flex">
          {view === "tree" ? (
            <TreeView
              briefOpen={briefOpen}
              onOpenBrief={() => setBriefOpen(true)}
              onOpenAddNode={setAddNodeParents}
              onOpenRun={openRun}
            />
          ) : (
            <ClusterView />
          )}
          <RunProgress />
          <SelectionBar onRun={openRun} />
          <Notices />
        </div>

        {panel && (
          <div className="relative flex shrink-0" style={{ width: panelWidth }}>
            <div onPointerDown={startResize} className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-blue-300/40 transition-colors" />
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
