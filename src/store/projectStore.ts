/**
 * src/store/projectStore.ts
 *
 * Responsibility: The open project in memory, and the only place it changes.
 *
 * Every edit goes through `commit()`, which:
 *   1. applies a pure update from domain/updates.ts,
 *   2. bumps updatedAt,
 *   3. logs one event (IDs only),
 *   4. schedules a debounced save of the whole project through db/.
 *
 * Design decisions:
 * - Built with zustand's vanilla `createStore` and an injected repository, so
 *   tests run it without React or a browser. The app uses `useProjectStore`.
 * - Save failures are kept in `saveError` instead of being swallowed.
 * - Selection lives here (not saved) because the views, the detail panel and
 *   run actions all need the same selection.
 * - Dragging nodes is saved but not logged; it would flood the study log.
 */

import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";
import type {
  ActionType,
  CollectionId,
  EdgeId,
  IdeaNode,
  ImageId,
  NodeId,
  ProjectId,
  ProjectState,
  ProjectSummary,
  Region,
  Relation,
  Role,
  RunId,
  RunInProgress,
  XY,
} from "@/domain/types";
import { emptyProject, incomingRelations, resolveSelection } from "@/domain/graph";
import { newId, now } from "@/domain/ids";
import { makeCollection, makeEdge, makeNode, type NewNodeInput } from "@/domain/builders";
import * as u from "@/domain/updates";
import { repo as defaultRepo, type NewImage, type Repository } from "@/db";
import { blobToDataUrl, dataUrlToImage } from "@/services/images";
import { ActionCallError, callAction as fetchAction, callSuggest as fetchSuggest, outputsFor, planRun, readableError, toWire, type CallActionFn, type CallSuggestFn, type Job, type RunOptions, type Selection } from "@/services/generate";
import type { Usage } from "@/domain/wire";
import { costUsd } from "@/domain/pricing";
import { buildStudyLog, type StudyLog } from "@/services/exportLog";
import { buildProjectFile, imageIdsOf, parseProjectFile, restoreProject, type ProjectFile } from "@/services/projectFile";

type View = "tree" | "cluster";
type Ref = NodeId | EdgeId;

export interface Notice {
  id: string;
  message: string;
  kind: "error" | "info";   // errors stay until dismissed; info fades
  action?: { label: string; run: () => void };
}

const ACTION_NAMES: Record<ActionType, string> = {
  expand: "Expand",
  visual_variations: "Visual variations",
  conceptual_variations: "Visualize",
};

// "Made 4 concepts and 3 motifs", "Made 10 images".
function describeOutputs(nodes: IdeaNode[]): string {
  const images = nodes.filter((n) => n.image).length;
  const parts: string[] = [];
  const count = (n: number, one: string, many: string) => { if (n) parts.push(`${n} ${n === 1 ? one : many}`); };
  count(nodes.filter((n) => !n.image && n.role === "concept").length, "concept", "concepts");
  count(nodes.filter((n) => !n.image && n.role === "motif").length, "motif", "motifs");
  count(images, "image", "images");
  count(nodes.filter((n) => !n.image && (n.role === "visual" || n.role === "note")).length, "note", "notes");
  return parts.length ? `Made ${parts.slice(0, -1).join(", ")}${parts.length > 1 ? " and " : ""}${parts.at(-1)}` : "Made nothing";
}

export interface ProjectStore {
  projects: ProjectSummary[];
  project: ProjectState | null;
  status: "idle" | "loading" | "ready" | "missing";
  saveError: string | null;
  selection: Ref[];
  runs: Record<RunId, RunInProgress>;   // memory only
  notices: Notice[];                     // messages to show the user
  focus: { nodeIds: NodeId[]; seq: number } | null;  // nodes the canvas should bring into view

  // Projects
  loadProjects(): Promise<void>;
  createProject(title?: string): Promise<ProjectId>;
  openProject(id: ProjectId): Promise<void>;
  closeProject(): Promise<void>;
  deleteProject(id: ProjectId): Promise<void>;
  renameProject(id: ProjectId, title: string): Promise<void>;
  // Study log for one project, or for all of them. Saves pending edits first.
  exportStudyLog(id: ProjectId): Promise<StudyLog | null>;
  exportAllStudyLogs(): Promise<StudyLog[]>;
  // The project with its images and log, for uploadProject in any browser.
  exportProjectFile(id: ProjectId): Promise<ProjectFile | null>;
  // Opens a project file's text as a new project. Throws ProjectFileError if the file is bad.
  uploadProject(text: string): Promise<ProjectId>;
  flush(): Promise<void>;
  setTitle(title: string): void;
  setBrief(brief: string): void;

  // Nodes
  addNode(input: NewNodeInput, parentIds?: NodeId[]): NodeId | null;
  addImageNode(image: NewImage, input: Omit<NewNodeInput, "image">, parentIds?: NodeId[]): Promise<NodeId | null>;
  cropNode(sourceId: NodeId, image: NewImage, box: Region["box"]): Promise<NodeId | null>;
  duplicateNode(id: NodeId): NodeId | null;
  editNode(id: NodeId, patch: u.NodePatch): void;
  retagNode(id: NodeId, role: Role): void;
  hideNode(id: NodeId): void;
  unhideNode(id: NodeId): void;
  unhideNodes(ids: NodeId[]): void;
  clearTree(): void;

  // Edges
  addLink(from: NodeId, to: NodeId, word?: string): EdgeId | null;
  setRelation(id: EdgeId, relation: Relation | undefined): void;
  // Asks the model to write the connection's word and explanation. Resolves when it's done.
  suggestRelation(id: EdgeId): Promise<void>;
  hideEdge(id: EdgeId): void;

  // Collections
  createCollection(title: string, color: string, nodeIds?: NodeId[]): CollectionId | null;
  updateCollection(id: CollectionId, patch: u.CollectionPatch): void;
  deleteCollection(id: CollectionId): void;
  addToCollection(id: CollectionId, nodeIds: NodeId[]): void;
  removeFromCollection(id: CollectionId, nodeId: NodeId): void;
  moveToCollection(nodeId: NodeId, from: CollectionId | null, to: CollectionId | null): void;

  // Layout
  moveNode(view: View, id: string, xy: XY): void;
  resetLayout(view: View): void;

  // Selection (memory only)
  setSelection(ids: Ref[]): void;
  toggleSelected(id: Ref): void;
  clearSelection(): void;

  // Runs: generate from the current selection. Returns the run ID, or null if
  // the selection doesn't suit the action (a notice explains why).
  runAction(action: ActionType, opts?: RunOptions): Promise<RunId | null>;
  dismissNotice(id: string): void;
  focusOn(nodeIds: NodeId[]): void;
}

// How many requests of one run go to the server at once.
const MAX_PARALLEL = 4;

async function inPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export interface StoreOptions {
  saveDelayMs?: number;
  callAction?: CallActionFn;   // tests pass a fake
  callSuggest?: CallSuggestFn;
}

export function createProjectStore(
  getRepo: () => Repository = defaultRepo,
  { saveDelayMs = 400, callAction = fetchAction, callSuggest = fetchSuggest }: StoreOptions = {},
): StoreApi<ProjectStore> {
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  return createStore<ProjectStore>()((set, get) => {
    async function save() {
      saveTimer = null;
      const p = get().project;
      if (!p) return;
      try {
        await getRepo().saveProject(p);
        if (get().saveError) set({ saveError: null });
      } catch (err) {
        set({ saveError: err instanceof Error ? err.message : "Couldn't save the project." });
      }
    }

    function scheduleSave() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(save, saveDelayMs);
    }

    function log(
      type: string,
      payload: Record<string, unknown> = {},
      { actor = "user", projectId = get().project?.id }: { actor?: "user" | "model"; projectId?: ProjectId } = {},
    ) {
      if (!projectId) return;
      // Logging must never break an edit.
      getRepo().logEvent({ projectId, actor, type, payload }).catch(() => {});
    }

    function notify(message: string, opts: { kind?: Notice["kind"]; action?: Notice["action"] } = {}) {
      set({ notices: [...get().notices, { id: newId("event"), message, kind: opts.kind ?? "error", action: opts.action }] });
    }

    // Applies a change to a project that may no longer be open (a run that
    // finished after the user switched projects).
    async function applyTo(projectId: ProjectId, fn: (p: ProjectState) => ProjectState) {
      if (get().project?.id === projectId) {
        commit(fn, null);
        return;
      }
      const stored = await getRepo().loadProject(projectId);
      if (stored) await getRepo().saveProject({ ...fn(stored), updatedAt: now() });
    }

    // The single path for changing the open project.
    function commit(
      fn: (p: ProjectState) => ProjectState,
      event: { type: string; payload?: Record<string, unknown> } | null,
    ) {
      const p = get().project;
      if (!p) return;
      const next = fn(p);
      if (next === p) return;
      set({ project: { ...next, updatedAt: now() } });
      if (event) log(event.type, event.payload);
      scheduleSave();
    }

    async function flush() {
      if (saveTimer) {
        clearTimeout(saveTimer);
        await save();
      }
    }

    // Runs a run's jobs, at most MAX_PARALLEL at a time. Each job's outputs
    // land on the canvas as soon as it finishes; failures are reported
    // together at the end, with a Retry that re-runs only the failed jobs.
    async function execute(projectId: ProjectId, action: ActionType, runId: RunId, jobs: Job[], inputIds: (NodeId | EdgeId)[]) {
      set({ runs: { ...get().runs, [runId]: { runId, action, inputs: inputIds, total: jobs.length, done: 0, failed: 0, startedAt: now() } } });
      const tick = (field: "done" | "failed") => {
        const r = get().runs[runId];
        if (r) set({ runs: { ...get().runs, [runId]: { ...r, [field]: r[field] + 1 } } });
      };
      const made: IdeaNode[] = [];
      const errors: string[] = [];
      const failed: Job[] = [];
      const used = { calls: 0, costUsd: 0 };
      const countUsage = (usage?: Usage) => {
        if (!usage) return;
        used.calls += usage.calls;
        used.costUsd += costUsd(usage) ?? 0;
      };

      await inPool(jobs, MAX_PARALLEL, async (job) => {
        try {
          const { result, usage } = await callAction(job.action, job.req);
          const out = outputsFor(job, result, runId);
          for (const img of out.images) await getRepo().saveImage(dataUrlToImage(img.dataUrl), img.imageId);
          await applyTo(projectId, (s) => {
            const next = u.addNodesAndEdges(s, out.nodes, out.edges);
            return usage ? u.addUsage(next, usage) : next;
          });
          countUsage(usage);
          made.push(...out.nodes);
          tick("done");
        } catch (err) {
          const usage = err instanceof ActionCallError ? err.usage : undefined;
          if (usage) await applyTo(projectId, (s) => u.addUsage(s, usage));
          countUsage(usage);
          errors.push(`${job.label}: ${readableError(err instanceof Error ? err.message : String(err))}`);
          failed.push(job);
          tick("failed");
        }
      });

      const { [runId]: _finished, ...rest } = get().runs;
      set({ runs: rest });

      const outputIds = made.map((n) => n.id);
      const stillOpen = get().project?.id === projectId;
      const name = ACTION_NAMES[action];
      const retry: Notice["action"] = {
        label: failed.length === jobs.length ? "Retry" : "Retry failed",
        run: () => {
          if (get().project?.id !== projectId) return;
          const again = newId("run");
          log("run.started", { runId: again, action, inputIds, jobs: failed.length, retryOf: runId });
          execute(projectId, action, again, failed.map((j) => ({ ...j, req: { ...j.req, runId: again } })), inputIds);
        },
      };

      if (made.length && stillOpen) {
        get().focusOn(outputIds);
        notify(describeOutputs(made), { kind: "info", action: { label: "Show", run: () => get().focusOn(outputIds) } });
      }
      if (errors.length === jobs.length) {
        // Same message from every job (e.g. a bad key) is only worth showing once.
        const first = errors[0].slice(errors[0].indexOf(": ") + 2);
        const detail = jobs.length === 1 || errors.every((e) => e.endsWith(first)) ? first : `All ${jobs.length} outputs failed. ${errors[0]}`;
        if (stillOpen) notify(`${name} failed: ${detail}`, { action: retry });
        log("run.failed", { runId, errors: errors.slice(0, 5), ...used }, { actor: "model", projectId });
      } else {
        if (errors.length && stillOpen) notify(`${name}: ${errors.length} of ${jobs.length} outputs failed. ${errors[0]}`, { action: retry });
        log("run.done", { runId, outputIds, failed: errors.length, errors: errors.slice(0, 5), ...used }, { actor: "model", projectId });
      }
    }

    function parentEdges(parentIds: NodeId[], to: NodeId) {
      return parentIds.map((from) => makeEdge(from, to, "derived_from"));
    }

    return {
      projects: [],
      project: null,
      status: "idle",
      saveError: null,
      selection: [],
      runs: {},
      notices: [],
      focus: null,

      // ── Projects ──────────────────────────────────────────────────────────

      // Saves pending edits first, so the list never shows stale titles or counts.
      async loadProjects() {
        await flush();
        set({ projects: await getRepo().listProjects() });
      },

      async createProject(title = "Untitled project") {
        await flush();
        const p = emptyProject(newId("project"), title, now());
        await getRepo().saveProject(p);
        set({ project: p, status: "ready", selection: [], notices: [], focus: null });
        log("project.created", { title });
        await get().loadProjects();
        return p.id;
      },

      async openProject(id) {
        if (get().project?.id === id && get().status === "ready") return;
        await flush();
        set({ status: "loading", selection: [], notices: [], focus: null });
        const p = await getRepo().loadProject(id);
        set({ project: p ?? null, status: p ? "ready" : "missing" });
        if (p) log("project.opened");
      },

      async closeProject() {
        await flush();
        set({ project: null, status: "idle", selection: [], notices: [], focus: null });
        await get().loadProjects();
      },

      async deleteProject(id) {
        if (get().project?.id === id) {
          if (saveTimer) clearTimeout(saveTimer);
          saveTimer = null;
          set({ project: null, status: "idle", selection: [] });
        }
        await getRepo().deleteProject(id);
        await get().loadProjects();
      },

      // Renames any project, open or not (the grid renames without opening).
      async renameProject(id, title) {
        if (get().project?.id === id) {
          get().setTitle(title);
        } else {
          await applyTo(id, (p) => u.setTitle(p, title));
          log("project.renamed", { title }, { projectId: id });
        }
        await get().loadProjects();
      },

      async exportStudyLog(id) {
        await flush();
        const p = await getRepo().loadProject(id);
        return p ? buildStudyLog(p, await getRepo().listEvents(id), now()) : null;
      },

      async exportAllStudyLogs() {
        await flush();
        const logs: StudyLog[] = [];
        for (const summary of await getRepo().listProjects()) {
          const log = await get().exportStudyLog(summary.id);
          if (log) logs.push(log);
        }
        return logs;
      },

      async exportProjectFile(id) {
        await flush();
        const repo = getRepo();
        const p = await repo.loadProject(id);
        if (!p) return null;
        const images = await Promise.all(imageIdsOf(p).map((imageId) => repo.getImage(imageId)));
        return buildProjectFile(p, images.filter((i) => !!i), await repo.listEvents(id), now());
      },

      async uploadProject(text) {
        await flush();
        const file = parseProjectFile(text);
        const { project, images, events, missingImages } = restoreProject(file, newId("project"), now());
        await getRepo().importProject(project, images, events);
        set({ project, status: "ready", selection: [], notices: [], focus: null });
        log("project.uploaded", { sourceProjectId: file.project.id, exportedAt: file.exportedAt });
        if (missingImages) notify(`${missingImages} ${missingImages === 1 ? "image was" : "images were"} missing from this file, so ${missingImages === 1 ? "its node shows" : "their nodes show"} no picture.`);
        await get().loadProjects();
        return project.id;
      },

      flush,

      setTitle(title) {
        commit((p) => u.setTitle(p, title), { type: "project.renamed", payload: { title } });
      },

      // Call on blur, not per keystroke, to keep the log readable.
      setBrief(brief) {
        commit((p) => u.setBrief(p, brief), { type: "project.brief_edited", payload: { length: brief.length } });
      },

      // ── Nodes ─────────────────────────────────────────────────────────────

      addNode(input, parentIds = []) {
        if (!get().project) return null;
        const n = makeNode(input);
        commit((p) => u.addNodesAndEdges(p, [n], parentEdges(parentIds, n.id)), {
          type: "node.created",
          payload: { nodeId: n.id, role: n.role, parentIds },
        });
        return n.id;
      },

      async addImageNode(image, input, parentIds = []) {
        if (!get().project) return null;
        const imageId = await getRepo().saveImage(image);
        return get().addNode({ ...input, image: { imageId, mimeType: image.mimeType, width: image.width, height: image.height } }, parentIds);
      },

      async cropNode(sourceId, image, box) {
        const source = get().project?.nodes[sourceId];
        if (!source) return null;
        const imageId = await getRepo().saveImage(image);
        const n = makeNode({
          role: source.role,
          title: `${source.title} (crop)`,
          image: { imageId, mimeType: image.mimeType, width: image.width, height: image.height },
        });
        const e = makeEdge(sourceId, n.id, "derived_from", { region: { box } });
        commit((p) => u.addNodesAndEdges(p, [n], [e]), {
          type: "node.cropped",
          payload: { nodeId: n.id, sourceId, box },
        });
        return n.id;
      },

      // Copies the node with the same parents and links, so it sits beside the original,
      // plus a link back to the original. Children stay with the original only.
      duplicateNode(id) {
        const p = get().project;
        const original = p?.nodes[id];
        if (!p || !original) return null;
        const { id: _id, origin: _origin, createdAt: _at, hidden: _hidden, ...content } = original;
        const copy = makeNode(content);
        const edges = Object.values(p.edges)
          .filter((e) => !e.hidden && ((e.kind === "derived_from" && e.to === id) || (e.kind === "link" && (e.from === id || e.to === id))))
          .map((e) => makeEdge(
            e.from === id ? copy.id : e.from,
            e.to === id ? copy.id : e.to,
            e.kind,
            { relation: e.relation, region: e.region },
          ));
        edges.push(makeEdge(id, copy.id, "link", { relation: { word: "duplicate" } }));
        commit((s) => u.addNodesAndEdges(s, [copy], edges), {
          type: "node.duplicated",
          payload: { nodeId: copy.id, sourceId: id },
        });
        return copy.id;
      },

      editNode(id, patch) {
        commit((p) => u.editNode(p, id, patch), { type: "node.edited", payload: { nodeId: id, fields: Object.keys(patch) } });
      },

      retagNode(id, role) {
        const from = get().project?.nodes[id]?.role;
        commit((p) => u.retagNode(p, id, role), { type: "node.retagged", payload: { nodeId: id, from, to: role } });
      },

      hideNode(id) {
        const node = get().project?.nodes[id];
        if (!node || node.hidden) return;
        commit((p) => u.hideNode(p, id), { type: "node.hidden", payload: { nodeId: id } });
        set({ selection: get().selection.filter((s) => s !== id) });
        notify(`Removed "${node.title}"`, { kind: "info", action: { label: "Undo", run: () => get().unhideNode(id) } });
      },

      unhideNode(id) {
        commit((p) => u.unhideNode(p, id), { type: "node.unhidden", payload: { nodeId: id } });
      },

      unhideNodes(ids) {
        commit((p) => ids.reduce(u.unhideNode, p), { type: "nodes.unhidden", payload: { nodeIds: ids } });
      },

      clearTree() {
        const ids = Object.values(get().project?.nodes ?? {}).filter((n) => !n.hidden).map((n) => n.id);
        if (ids.length === 0) return;
        commit(u.clearNodes, { type: "project.cleared", payload: { count: ids.length } });
        set({ selection: [] });
        notify(`Cleared ${ids.length} ${ids.length === 1 ? "node" : "nodes"}`, {
          kind: "info",
          action: { label: "Undo", run: () => get().unhideNodes(ids) },
        });
      },

      // ── Edges ─────────────────────────────────────────────────────────────

      addLink(from, to, word) {
        const p = get().project;
        if (!p || from === to || !p.nodes[from] || !p.nodes[to] || u.hasLink(p, from, to)) return null;
        const e = makeEdge(from, to, "link", { relation: word ? { word } : undefined });
        commit((s) => u.addNodesAndEdges(s, [], [e]), { type: "link.created", payload: { edgeId: e.id, from, to } });
        return e.id;
      },

      setRelation(id, relation) {
        commit((p) => u.setRelation(p, id, relation), { type: "edge.relation_edited", payload: { edgeId: id } });
      },

      async suggestRelation(id) {
        const p = get().project;
        const edge = p?.edges[id];
        if (!p || !edge) return;
        const from = p.nodes[edge.from];
        const to = p.nodes[edge.to];
        if (!to) return;
        const images: Record<ImageId, string> = {};
        for (const n of [from, to]) {
          if (!n?.image) continue;
          const rec = await getRepo().getImage(n.image.imageId);
          if (rec) images[n.image.imageId] = await blobToDataUrl(rec.blob, rec.mimeType);
        }
        const previous = edge.relation;
        const stillOpen = () => get().project?.id === p.id;
        try {
          const { result, usage } = await callSuggest({
            runId: newId("run"), brief: p.brief,
            from: from ? toWire(from, images) : undefined,
            to: toWire(to, images),
          });
          await applyTo(p.id, (s) => {
            const next = u.setRelation(s, id, result);
            return usage ? u.addUsage(next, usage) : next;
          });
          log("edge.relation_suggested", { edgeId: id, word: result.word, replaced: !!previous }, { actor: "model", projectId: p.id });
          // Replacing text the user may have written, so it can be taken back.
          if (previous && stillOpen()) {
            notify("Replaced the connection's text", {
              kind: "info",
              action: { label: "Undo", run: () => get().setRelation(id, previous) },
            });
          }
        } catch (err) {
          const usage = err instanceof ActionCallError ? err.usage : undefined;
          if (usage) await applyTo(p.id, (s) => u.addUsage(s, usage));
          log("edge.relation_suggest_failed", { edgeId: id }, { actor: "model", projectId: p.id });
          if (stillOpen()) notify(`Couldn't suggest a connection: ${err instanceof Error ? err.message : String(err)}`);
        }
      },

      hideEdge(id) {
        const kind = get().project?.edges[id]?.kind;
        commit((p) => u.hideEdge(p, id), { type: "edge.hidden", payload: { edgeId: id, kind } });
        set({ selection: get().selection.filter((s) => s !== id) });
      },

      // ── Collections ───────────────────────────────────────────────────────

      createCollection(title, color, nodeIds = []) {
        if (!get().project) return null;
        const c = makeCollection(title, color);
        commit((p) => u.addToCollection(u.addCollection(p, c), c.id, nodeIds), {
          type: "collection.created",
          payload: { collectionId: c.id, nodeIds },
        });
        return c.id;
      },

      updateCollection(id, patch) {
        commit((p) => u.updateCollection(p, id, patch), { type: "collection.edited", payload: { collectionId: id, fields: Object.keys(patch) } });
      },

      deleteCollection(id) {
        commit((p) => u.deleteCollection(p, id), { type: "collection.deleted", payload: { collectionId: id } });
      },

      addToCollection(id, nodeIds) {
        commit((p) => u.addToCollection(p, id, nodeIds), { type: "collection.added", payload: { collectionId: id, nodeIds } });
      },

      removeFromCollection(id, nodeId) {
        commit((p) => u.removeFromCollection(p, id, nodeId), { type: "collection.removed", payload: { collectionId: id, nodeId } });
      },

      moveToCollection(nodeId, from, to) {
        commit((p) => u.moveToCollection(p, nodeId, from, to), { type: "collection.moved", payload: { nodeId, from, to } });
      },

      // ── Layout ────────────────────────────────────────────────────────────

      moveNode(view, id, xy) {
        commit((p) => u.moveNode(p, view, id, xy), null);
      },

      resetLayout(view) {
        commit((p) => u.resetLayout(p, view), { type: "layout.reset", payload: { view } });
      },

      // ── Selection ─────────────────────────────────────────────────────────

      setSelection(ids) {
        set({ selection: [...new Set(ids)] });
      },

      toggleSelected(id) {
        const sel = get().selection;
        set({ selection: sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id] });
      },

      clearSelection() {
        set({ selection: [] });
      },

      // ── Runs ──────────────────────────────────────────────────────────────

      async runAction(action, opts = {}) {
        const p = get().project;
        if (!p) return null;

        // Connections stay connections: actions can explore the connection itself.
        const resolved = resolveSelection(p, get().selection);
        // A motif's "how it conveys the idea" is now on its incoming connections; fold it
        // back into details so the model still sees it. One copy per node keeps inputs deduped.
        const withConveys = new Map<NodeId, IdeaNode>();
        const ctx = (n: IdeaNode): IdeaNode => {
          if (!withConveys.has(n.id)) {
            const conveys = n.role === "motif" ? n.details?.howItConveysIdea ?? incomingRelations(p, n.id) : undefined;
            withConveys.set(n.id, conveys ? { ...n, details: { ...n.details, howItConveysIdea: conveys } } : n);
          }
          return withConveys.get(n.id)!;
        };
        const sel: Selection = {
          nodes: resolved.nodes.map(ctx),
          links: resolved.edges.map((edge) => ({ edge, from: ctx(p.nodes[edge.from]), to: ctx(p.nodes[edge.to]) })),
        };
        const inputs: IdeaNode[] = [];
        for (const n of [...sel.nodes, ...sel.links.flatMap((l) => [l.from, l.to])]) {
          if (!inputs.includes(n)) inputs.push(n);
        }

        const images: Record<ImageId, string> = {};
        for (const n of inputs) {
          if (!n.image) continue;
          const rec = await getRepo().getImage(n.image.imageId);
          if (rec) images[n.image.imageId] = await blobToDataUrl(rec.blob, rec.mimeType);
        }

        const runId = newId("run");
        const plan = planRun(action, sel, p.brief, images, runId, opts);
        if (!plan.ok) {
          notify(plan.error);
          return null;
        }

        const inputIds = [...sel.nodes.map((n) => n.id), ...sel.links.map((l) => l.edge.id)];
        log("run.started", {
          runId, action, inputIds, jobs: plan.jobs.length,
          counts: opts.counts, dimensionIds: opts.dimensionIds, imagesPerIdea: opts.imagesPerIdea,
          hasInstructions: !!opts.instructions,
        });
        await execute(p.id, action, runId, plan.jobs, inputIds);
        return runId;
      },

      dismissNotice(id) {
        set({ notices: get().notices.filter((n) => n.id !== id) });
      },

      focusOn(nodeIds) {
        set({ focus: { nodeIds, seq: (get().focus?.seq ?? 0) + 1 } });
      },
    };
  });
}

// ── App instance ──────────────────────────────────────────────────────────────

export const projectStore = createProjectStore();

export function useProjectStore<T>(selector: (s: ProjectStore) => T): T {
  return useStore(projectStore, selector);
}
