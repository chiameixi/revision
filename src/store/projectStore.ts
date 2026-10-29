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
  Role,
  RunId,
  RunInProgress,
  XY,
} from "@/domain/types";
import type { GenerateRequest, GenerateResponse } from "@/types";
import { emptyProject, resolveSelection } from "@/domain/graph";
import { newId, now } from "@/domain/ids";
import { makeCollection, makeEdge, makeNode, type NewNodeInput } from "@/domain/builders";
import * as u from "@/domain/updates";
import { repo as defaultRepo, type NewImage, type Repository } from "@/db";
import { blobToDataUrl, dataUrlToImage } from "@/services/images";
import { buildLegacyRequest, legacyCardsToOutputs, readableError, type LegacyOptions } from "@/services/legacyGenerate";

type View = "tree" | "cluster";
type Ref = NodeId | EdgeId;

export interface Notice {
  id: string;
  message: string;
}

export interface ProjectStore {
  projects: ProjectSummary[];
  project: ProjectState | null;
  status: "idle" | "loading" | "ready" | "missing";
  saveError: string | null;
  selection: Ref[];
  runs: Record<RunId, RunInProgress>;   // memory only
  notices: Notice[];                     // errors to show the user

  // Projects
  loadProjects(): Promise<void>;
  createProject(title?: string): Promise<ProjectId>;
  openProject(id: ProjectId): Promise<void>;
  closeProject(): Promise<void>;
  deleteProject(id: ProjectId): Promise<void>;
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
  clearTree(): void;

  // Edges
  addLink(from: NodeId, to: NodeId, label?: string): EdgeId | null;
  labelEdge(id: EdgeId, label: string): void;
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
  runAction(action: ActionType, opts?: LegacyOptions): Promise<RunId | null>;
  dismissNotice(id: string): void;
}

export type GenerateFn = (body: GenerateRequest) => Promise<GenerateResponse>;

async function fetchGenerate(body: GenerateRequest): Promise<GenerateResponse> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export interface StoreOptions {
  saveDelayMs?: number;
  generate?: GenerateFn;   // tests pass a fake
}

export function createProjectStore(
  getRepo: () => Repository = defaultRepo,
  { saveDelayMs = 400, generate = fetchGenerate }: StoreOptions = {},
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

    function notify(message: string) {
      set({ notices: [...get().notices, { id: newId("event"), message }] });
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

      // ── Projects ──────────────────────────────────────────────────────────

      async loadProjects() {
        set({ projects: await getRepo().listProjects() });
      },

      async createProject(title = "Untitled project") {
        await flush();
        const p = emptyProject(newId("project"), title, now());
        await getRepo().saveProject(p);
        set({ project: p, status: "ready", selection: [] });
        log("project.created", { title });
        await get().loadProjects();
        return p.id;
      },

      async openProject(id) {
        await flush();
        set({ status: "loading", selection: [] });
        const p = await getRepo().loadProject(id);
        set({ project: p ?? null, status: p ? "ready" : "missing" });
        if (p) log("project.opened");
      },

      async closeProject() {
        await flush();
        set({ project: null, status: "idle", selection: [] });
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
            { label: e.label, region: e.region },
          ));
        edges.push(makeEdge(id, copy.id, "link", { label: "duplicate" }));
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
        commit((p) => u.hideNode(p, id), { type: "node.hidden", payload: { nodeId: id } });
        set({ selection: get().selection.filter((s) => s !== id) });
      },

      unhideNode(id) {
        commit((p) => u.unhideNode(p, id), { type: "node.unhidden", payload: { nodeId: id } });
      },

      clearTree() {
        const count = Object.values(get().project?.nodes ?? {}).filter((n) => !n.hidden).length;
        commit(u.clearNodes, { type: "project.cleared", payload: { count } });
        set({ selection: [] });
      },

      // ── Edges ─────────────────────────────────────────────────────────────

      addLink(from, to, label) {
        const p = get().project;
        if (!p || from === to || !p.nodes[from] || !p.nodes[to] || u.hasLink(p, from, to)) return null;
        const e = makeEdge(from, to, "link", { label });
        commit((s) => u.addNodesAndEdges(s, [], [e]), { type: "link.created", payload: { edgeId: e.id, from, to } });
        return e.id;
      },

      labelEdge(id, label) {
        commit((p) => u.labelEdge(p, id, label), { type: "edge.labelled", payload: { edgeId: id } });
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

        // Selected links count as their two end nodes.
        const sel = resolveSelection(p, get().selection);
        const inputs: IdeaNode[] = [];
        for (const n of [...sel.nodes, ...sel.edges.flatMap((e) => [p.nodes[e.from], p.nodes[e.to]])]) {
          if (n && !inputs.includes(n)) inputs.push(n);
        }

        const images: Record<ImageId, string> = {};
        for (const n of inputs) {
          if (!n.image) continue;
          const rec = await getRepo().getImage(n.image.imageId);
          if (rec) images[n.image.imageId] = await blobToDataUrl(rec.blob, rec.mimeType);
        }

        const built = buildLegacyRequest(action, inputs, p.brief, images, opts);
        if (!built.ok) {
          notify(built.error);
          return null;
        }

        const runId = newId("run");
        const inputIds = inputs.map((n) => n.id);
        const total = action === "visual_variations" ? built.body.dimensionIds.length
          : action === "conceptual_variations" ? built.body.conceptCards?.length ?? 1
          : 1;
        set({ runs: { ...get().runs, [runId]: { runId, action, inputs: inputIds, total, done: 0, failed: 0, startedAt: now() } } });
        log("run.started", { runId, action, inputIds, dimensionIds: opts.dimensionIds, hasInstructions: !!opts.instructions });

        try {
          const res = await generate(built.body);
          if (res.error && !res.cards?.length) throw new Error(res.error);
          const out = legacyCardsToOutputs(res.cards ?? [], action, runId, inputs);
          for (const img of out.images) await getRepo().saveImage(dataUrlToImage(img.dataUrl), img.imageId);
          await applyTo(p.id, (s) => u.addNodesAndEdges(s, out.nodes, out.edges));
          log("run.done", { runId, outputIds: out.nodes.map((n) => n.id), failed: out.failed.length }, { actor: "model", projectId: p.id });
          if (out.failed.length === 1) notify(`1 output failed: ${out.failed[0]}`);
          else if (out.failed.length > 1) notify(`${out.failed.length} outputs failed.`);
          if (res.error) notify(readableError(res.error));
        } catch (err) {
          const message = readableError(err instanceof Error ? err.message : "The request failed.");
          notify(message);
          log("run.failed", { runId, message }, { actor: "model", projectId: p.id });
        } finally {
          const { [runId]: _done, ...rest } = get().runs;
          set({ runs: rest });
        }
        return runId;
      },

      dismissNotice(id) {
        set({ notices: get().notices.filter((n) => n.id !== id) });
      },
    };
  });
}

// ── App instance ──────────────────────────────────────────────────────────────

export const projectStore = createProjectStore();

export function useProjectStore<T>(selector: (s: ProjectStore) => T): T {
  return useStore(projectStore, selector);
}
