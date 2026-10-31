import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { DexieRepository } from "@/db/dexie";
import { createProjectStore } from "@/store/projectStore";
import { ActionCallError, type ActionResult, type CallActionFn } from "@/services/generate";
import type { ActionRequest, ActionResponse } from "@/domain/wire";
import type { ActionType } from "@/domain/types";
import { treeEdges, visibleLinks, visibleNodes } from "@/domain/graph";

let repo: DexieRepository;
let store: ReturnType<typeof createProjectStore>;
let count = 0;

beforeEach(async () => {
  repo = new DexieRepository(`store_test_${count++}`);
  store = createProjectStore(() => repo, { saveDelayMs: 0 });
  await store.getState().createProject("Poster");
});

const s = () => store.getState();
const p = () => s().project!;
const eventTypes = async () => (await repo.listEvents(p().id)).map((e) => e.type);

describe("projects", () => {
  it("creates, saves and lists a project", async () => {
    expect(p().title).toBe("Poster");
    expect(s().status).toBe("ready");
    expect(s().projects.map((x) => x.title)).toEqual(["Poster"]);
    expect(await repo.loadProject(p().id)).toBeDefined();
  });

  it("saves edits and reopens them", async () => {
    const id = p().id;
    const nodeId = s().addNode({ role: "concept", title: "Ebb" })!;
    await s().closeProject();
    expect(s().project).toBeNull();
    await s().openProject(id);
    expect(p().nodes[nodeId].title).toBe("Ebb");
  });

  it("switches projects without losing unsaved edits", async () => {
    const first = p().id;
    s().setTitle("Renamed");
    await s().createProject("Second");
    expect((await repo.loadProject(first))?.title).toBe("Renamed");
  });

  it("reports a missing project instead of crashing", async () => {
    await s().openProject("p_nope");
    expect(s().status).toBe("missing");
  });

  it("deletes the open project", async () => {
    const id = p().id;
    await s().deleteProject(id);
    expect(s().project).toBeNull();
    expect(s().projects).toEqual([]);
  });

  it("bumps updatedAt on each edit", async () => {
    const before = p().updatedAt;
    await new Promise((r) => setTimeout(r, 2));
    s().setBrief("Tides");
    expect(p().updatedAt > before).toBe(true);
  });

  it("records a save failure instead of swallowing it", async () => {
    repo.saveProject = async () => { throw new Error("Disk full"); };
    s().setTitle("x");
    await s().flush();
    await new Promise((r) => setTimeout(r, 5));
    expect(s().saveError).toBe("Disk full");
  });
});

describe("nodes", () => {
  it("adds a node under parents with provenance edges", () => {
    const a = s().addNode({ role: "concept", title: "A" })!;
    const b = s().addNode({ role: "motif", title: "B" }, [a])!;
    expect(treeEdges(p())).toEqual([{ from: a, to: b, bridged: false }]);
    expect(p().nodes[b].origin).toEqual({ kind: "user" });
  });

  it("stores an uploaded image separately and references it", async () => {
    const id = (await s().addImageNode({ blob: new Blob([new Uint8Array([1, 2])]), mimeType: "image/png" }, { role: "visual", title: "draft.png" }))!;
    const ref = p().nodes[id].image!;
    expect((await repo.getImage(ref.imageId))?.blob.size).toBe(2);
  });

  it("crops into a new node linked to its source by region", async () => {
    const src = s().addNode({ role: "visual", title: "Draft" })!;
    const crop = (await s().cropNode(src, { blob: new Blob([]), mimeType: "image/png" }, [0, 0, 500, 500]))!;
    const e = Object.values(p().edges).find((x) => x.to === crop)!;
    expect(e).toMatchObject({ from: src, kind: "derived_from", region: { box: [0, 0, 500, 500] } });
    expect(p().nodes[crop].title).toBe("Draft (crop)");
  });

  it("duplicates with the same parents and links, linked to the original, but not children", () => {
    const a = s().addNode({ role: "concept", title: "A" })!;
    const b = s().addNode({ role: "motif", title: "B" }, [a])!;
    const c = s().addNode({ role: "note", title: "C" })!;
    s().addNode({ role: "visual", title: "Child" }, [b]);
    s().addLink(b, c);
    const copy = s().duplicateNode(b)!;
    expect(p().nodes[copy]).toMatchObject({ title: "B", role: "motif" });
    expect(treeEdges(p()).filter((e) => e.to === copy).map((e) => e.from)).toEqual([a]);
    expect(treeEdges(p()).filter((e) => e.from === copy)).toEqual([]);
    expect(visibleLinks(p()).some((e) => e.from === copy && e.to === c)).toBe(true);
    expect(visibleLinks(p()).find((e) => e.from === b && e.to === copy)?.label).toBe("duplicate");
  });

  it("hides a node and drops it from the selection", () => {
    const a = s().addNode({ role: "concept", title: "A" })!;
    s().setSelection([a]);
    s().hideNode(a);
    expect(visibleNodes(p())).toEqual([]);
    expect(s().selection).toEqual([]);
  });
});

describe("links", () => {
  it("refuses duplicates, self-links and missing nodes", () => {
    const a = s().addNode({ role: "concept", title: "A" })!;
    const b = s().addNode({ role: "motif", title: "B" })!;
    expect(s().addLink(a, b, "tension")).not.toBeNull();
    expect(s().addLink(b, a)).toBeNull();
    expect(s().addLink(a, a)).toBeNull();
    expect(s().addLink(a, "ghost")).toBeNull();
    expect(visibleLinks(p())).toHaveLength(1);
  });
});

describe("collections", () => {
  it("creates a collection with initial nodes", () => {
    const a = s().addNode({ role: "concept", title: "A" })!;
    const c = s().createCollection("Keep", "#f59e0b", [a])!;
    expect(p().collections[c]).toMatchObject({ title: "Keep", nodeIds: [a] });
  });
});

describe("event log", () => {
  it("logs one event per edit, with IDs only", async () => {
    const a = s().addNode({ role: "concept", title: "A" })!;
    s().retagNode(a, "motif");
    s().hideNode(a);
    await new Promise((r) => setTimeout(r, 5));
    expect(await eventTypes()).toEqual(["project.created", "node.created", "node.retagged", "node.hidden"]);
    const retag = (await repo.listEvents(p().id)).find((e) => e.type === "node.retagged")!;
    expect(retag.payload).toEqual({ nodeId: a, from: "concept", to: "motif" });
  });

  it("doesn't log dragging", async () => {
    s().moveNode("tree", "x", { x: 1, y: 1 });
    await new Promise((r) => setTimeout(r, 5));
    expect(await eventTypes()).toEqual(["project.created"]);
    expect(p().views.tree.positions.x).toEqual({ x: 1, y: 1 });
  });

  it("doesn't log edits that change nothing", async () => {
    s().hideNode("ghost");
    await new Promise((r) => setTimeout(r, 5));
    expect(await eventTypes()).toEqual(["project.created"]);
  });
});

describe("selection", () => {
  it("toggles and dedupes", () => {
    s().setSelection(["a", "a", "b"]);
    expect(s().selection).toEqual(["a", "b"]);
    s().toggleSelected("a");
    expect(s().selection).toEqual(["b"]);
    s().toggleSelected("c");
    expect(s().selection).toEqual(["b", "c"]);
  });
});

describe("clear tree", () => {
  it("clears the canvas within the project, logs it once, and clears selection", async () => {
    const a = s().addNode({ role: "concept", title: "A" })!;
    s().addNode({ role: "motif", title: "B" }, [a]);
    s().setSelection([a]);
    const id = p().id;
    s().clearTree();
    expect(visibleNodes(p())).toEqual([]);
    expect(p().id).toBe(id);
    expect(s().selection).toEqual([]);
    await new Promise((r) => setTimeout(r, 5));
    const cleared = (await repo.listEvents(id)).filter((e) => e.type === "project.cleared");
    expect(cleared.map((e) => e.payload)).toEqual([{ count: 2 }]);
  });
});

describe("runs", () => {
  const PNG = "data:image/png;base64,iVBORw0KGgo=";
  type Call = { action: string; req: Record<string, unknown> };

  // Fakes return either a bare result or { result, usage }.
  type Fake = (action: ActionType, req: ActionRequest) => Promise<ActionResponse | ActionResult>;
  function runStore(fake: Fake) {
    const callAction: CallActionFn = async (action, req) => {
      const out = await fake(action, req);
      return "result" in out ? out : { result: out };
    };
    return createProjectStore(() => repo, { saveDelayMs: 0, callAction });
  }

  const imageReply = async () => ({ imageDataUrl: PNG, text: "analysis" });

  it("expands the selection into concepts and motifs with provenance, and logs start and finish", async () => {
    const calls: Call[] = [];
    store = runStore(async (action, req) => {
      calls.push({ action, req: req as unknown as Record<string, unknown> });
      return { concepts: [{ title: "Undertow", description: "d", rationale: "r" }], motifs: [{ title: "Foam", visualQuality: "v", howItConveysIdea: "h", category: "texture" }] };
    });
    await s().createProject("Run");
    const a = s().addNode({ role: "concept", title: "Ebb" })!;
    s().setSelection([a]);
    const runId = await s().runAction("expand", { counts: { concepts: 1, motifs: 1 } });
    expect(calls.map((c) => c.action)).toEqual(["expand"]);
    expect(calls[0].req.counts).toEqual({ concepts: 1, motifs: 1 });
    const titles = visibleNodes(p()).map((n) => `${n.role}:${n.title}`);
    expect(titles).toEqual(expect.arrayContaining(["concept:Undertow", "motif:Foam"]));
    const out = visibleNodes(p()).find((n) => n.title === "Foam")!;
    expect(out.origin).toMatchObject({ kind: "generated", action: "expand", runId });
    expect(out.details).toEqual({ howItConveysIdea: "h", category: "texture" });
    expect(treeEdges(p())).toContainEqual({ from: a, to: out.id, bridged: false });
    expect(s().runs).toEqual({});
    await new Promise((r) => setTimeout(r, 5));
    const events = await repo.listEvents(p().id);
    expect(events.map((e) => [e.type, e.actor])).toContainEqual(["run.done", "model"]);
  });

  it("sends one request per dimension and saves each returned image", async () => {
    const calls: Call[] = [];
    store = runStore(async (action, req) => { calls.push({ action, req: req as unknown as Record<string, unknown> }); return imageReply(); });
    await s().createProject("Images");
    const draft = (await s().addImageNode({ blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), mimeType: "image/png" }, { role: "visual", title: "draft" }))!;
    s().setSelection([draft]);
    await s().runAction("visual_variations", { dimensionIds: ["balance", "color"] });
    expect(calls.map((c) => c.req.dimensionId)).toEqual(["balance", "color"]);
    expect((calls[0].req.base as { imageDataUrl: string }).imageDataUrl).toBe("data:image/png;base64,AQID");
    const outs = visibleNodes(p()).filter((n) => n.title.endsWith("variation"));
    expect(outs.map((n) => n.title).sort()).toEqual(["Balance variation", "Color variation"]);
    expect((await repo.getImage(outs[0].image!.imageId))?.blob.size).toBeGreaterThan(0);
  });

  it("shows partial results and reports the failures together", async () => {
    store = runStore(async (_a, req) => {
      if ((req as { dimensionId: string }).dimensionId === "color") throw new Error("Timed out");
      return imageReply();
    });
    await s().createProject("Partial");
    const draft = (await s().addImageNode({ blob: new Blob([new Uint8Array([1])]), mimeType: "image/png" }, { role: "visual", title: "d" }))!;
    s().setSelection([draft]);
    await s().runAction("visual_variations", { dimensionIds: ["balance", "color", "shape"] });
    expect(visibleNodes(p()).filter((n) => n.origin.kind === "generated")).toHaveLength(2);
    expect(s().notices.filter((n) => n.kind === "error").map((n) => n.message))
      .toEqual(["Visual variations: 1 of 3 outputs failed. Color variation: Timed out"]);
    expect(s().notices.filter((n) => n.kind === "info").map((n) => n.message)).toEqual(["Made 2 images"]);
  });

  it("shows one plain message when every request fails the same way", async () => {
    store = runStore(async () => { throw new Error('{"error":{"message":"API key not valid."}}'); });
    await s().createProject("Fail");
    const draft = (await s().addImageNode({ blob: new Blob([new Uint8Array([1])]), mimeType: "image/png" }, { role: "visual", title: "d" }))!;
    s().setSelection([draft]);
    await s().runAction("visual_variations", { dimensionIds: ["balance", "color"] });
    expect(s().notices.map((n) => n.message)).toEqual(["Visual variations failed: API key not valid."]);
    await new Promise((r) => setTimeout(r, 5));
    expect((await repo.listEvents(p().id)).map((e) => e.type)).toContain("run.failed");
  });

  it("explains why a selection doesn't suit the action, without calling the server", async () => {
    let called = false;
    store = runStore(async () => { called = true; return imageReply(); });
    await s().createProject("Empty");
    expect(await s().runAction("visual_variations")).toBeNull();
    expect(called).toBe(false);
    expect(s().notices).toHaveLength(1);
    s().dismissNotice(s().notices[0].id);
    expect(s().notices).toEqual([]);
  });

  it("counts progress while the run is going", async () => {
    const releases: (() => void)[] = [];
    store = runStore(() => new Promise((res) => { releases.push(() => res({ imageDataUrl: PNG, text: "" })); }));
    await s().createProject("Slow");
    const idea = s().addNode({ role: "concept", title: "Ebb" })!;
    s().setSelection([idea]);
    const pending = s().runAction("conceptual_variations", { imagesPerIdea: 2 });
    await new Promise((r) => setTimeout(r, 5));
    expect(Object.values(s().runs)[0]).toMatchObject({ total: 2, done: 0 });
    releases[0]();
    await new Promise((r) => setTimeout(r, 5));
    expect(Object.values(s().runs)[0]).toMatchObject({ done: 1 });
    expect(visibleNodes(p()).filter((n) => n.origin.kind === "generated")).toHaveLength(1);
    releases[1]();
    await pending;
    expect(s().runs).toEqual({});
  });

  it("saves outputs into the right project if the user switched away mid-run", async () => {
    let release!: () => void;
    store = runStore(() => new Promise((res) => {
      release = () => res({ concepts: [{ title: "Late", description: "", rationale: "" }], motifs: [] });
    }));
    const first = await s().createProject("First");
    s().setBrief("Tides");
    const pending = s().runAction("expand");
    await new Promise((r) => setTimeout(r, 5));
    await s().createProject("Second");
    release();
    await pending;
    expect(Object.values(p().nodes)).toEqual([]);
    const saved = await repo.loadProject(first);
    expect(Object.values(saved!.nodes).map((n) => n.title)).toEqual(["Late"]);
  });

  it("counts a selected link as its two end nodes", async () => {
    let inputs: { title: string }[] = [];
    store = runStore(async (_a, req) => { inputs = (req as { inputs: { title: string }[] }).inputs; return { concepts: [], motifs: [] }; });
    await s().createProject("Link");
    const a = s().addNode({ role: "concept", title: "Ebb" })!;
    const b = s().addNode({ role: "motif", title: "Waves" })!;
    const link = s().addLink(a, b)!;
    s().setSelection([link]);
    await s().runAction("expand");
    expect(inputs.map((n) => n.title)).toEqual(["Ebb", "Waves"]);
  });
});

describe("projects grid", () => {
  it("lists summaries with counts", async () => {
    s().addNode({ role: "concept", title: "A" });
    await s().flush();
    await s().loadProjects();
    expect(s().projects[0]).toMatchObject({ title: "Poster", nodeCount: 1, imageCount: 0 });
  });

  it("renames a project that isn't open", async () => {
    const first = p().id;
    await s().createProject("Second");
    await s().renameProject(first, "Renamed");
    expect((await repo.loadProject(first))?.title).toBe("Renamed");
    expect(p().title).toBe("Second");
    expect(s().projects.map((x) => x.title).sort()).toEqual(["Renamed", "Second"]);
  });

  it("renames the open project through the normal edit path", async () => {
    await s().renameProject(p().id, "Tides");
    expect(p().title).toBe("Tides");
  });

  it("lists fresh data even while a save is still pending", async () => {
    store = createProjectStore(() => repo, { saveDelayMs: 400 });
    await s().createProject("Old title");
    await s().renameProject(p().id, "New title");
    expect(s().projects.find((x) => x.id === p().id)?.title).toBe("New title");
    s().addNode({ role: "concept", title: "A" });
    await s().loadProjects();
    expect(s().projects.find((x) => x.id === p().id)?.nodeCount).toBe(1);
  });

  it("doesn't reload a project that's already open", async () => {
    s().addNode({ role: "concept", title: "unsaved" });  // not flushed yet
    const before = p();
    await s().openProject(before.id);
    expect(p()).toBe(before);
  });
});

describe("usage", () => {
  const imageUsage = { model: "gemini-3-pro-image", calls: 1, inputTokens: 300, outputTokens: 20, imageTokens: 1120 };

  it("adds each request's usage to the project, including failed ones", async () => {
    const fake: CallActionFn = async (_a, req) => {
      if ((req as { dimensionId: string }).dimensionId === "color") {
        throw new ActionCallError("No image came back after 3 attempts.", { ...imageUsage, calls: 3, imageTokens: 0 });
      }
      return { result: { imageDataUrl: "data:image/png;base64,iVBORw0KGgo=", text: "" }, usage: imageUsage };
    };
    store = createProjectStore(() => repo, { saveDelayMs: 0, callAction: fake });
    await s().createProject("Costs");
    const draft = (await s().addImageNode({ blob: new Blob([new Uint8Array([1])]), mimeType: "image/png" }, { role: "visual", title: "d" }))!;
    s().setSelection([draft]);
    await s().runAction("visual_variations", { dimensionIds: ["balance", "color"] });
    expect(p().usage).toMatchObject({ calls: 4, imageTokens: 1120 });
    expect(p().usage!.costUsd).toBeGreaterThan(0.13);
    await new Promise((r) => setTimeout(r, 5));
    const done = (await repo.listEvents(p().id)).find((e) => e.type === "run.done")!;
    expect(done.payload).toMatchObject({ calls: 4 });
    await s().loadProjects();
    expect(s().projects[0]).toMatchObject({ calls: 4 });
  });
});

describe("undo and notices", () => {
  it("offers to undo a removal", () => {
    const a = s().addNode({ role: "concept", title: "Ebb" })!;
    s().hideNode(a);
    const notice = s().notices.at(-1)!;
    expect(notice).toMatchObject({ kind: "info", message: 'Removed "Ebb"', action: { label: "Undo" } });
    notice.action!.run();
    expect(visibleNodes(p()).map((n) => n.id)).toEqual([a]);
  });

  it("offers to undo clearing the tree, bringing back exactly what was cleared", () => {
    const a = s().addNode({ role: "concept", title: "A" })!;
    const b = s().addNode({ role: "motif", title: "B" })!;
    s().hideNode(b);
    s().clearTree();
    s().notices.at(-1)!.action!.run();
    expect(visibleNodes(p()).map((n) => n.id)).toEqual([a]);
  });

  it("clears notices when switching projects", async () => {
    const a = s().addNode({ role: "concept", title: "A" })!;
    s().hideNode(a);
    await s().createProject("Other");
    expect(s().notices).toEqual([]);
  });
});

describe("after a run", () => {
  const PNG = "data:image/png;base64,iVBORw0KGgo=";

  it("asks the canvas to show the new nodes and says what was made", async () => {
    store = createProjectStore(() => repo, { saveDelayMs: 0, callAction: async () => ({
      result: { concepts: [{ title: "A", description: "", rationale: "" }], motifs: [{ title: "B", visualQuality: "", howItConveysIdea: "", category: "" }] },
    }) });
    await s().createProject("Focus");
    s().setBrief("Tides");
    await s().runAction("expand");
    const made = visibleNodes(p()).map((n) => n.id);
    expect(s().focus?.nodeIds.sort()).toEqual(made.sort());
    const notice = s().notices.at(-1)!;
    expect(notice).toMatchObject({ kind: "info", message: "Made 1 concept and 1 motif", action: { label: "Show" } });
    const seq = s().focus!.seq;
    notice.action!.run();
    expect(s().focus!.seq).toBe(seq + 1);
  });

  it("retries only the jobs that failed", async () => {
    const seen: string[] = [];
    let failColor = true;
    store = createProjectStore(() => repo, { saveDelayMs: 0, callAction: async (_a, req) => {
      const dim = (req as { dimensionId: string }).dimensionId;
      seen.push(dim);
      if (dim === "color" && failColor) throw new ActionCallError("Timed out");
      return { result: { imageDataUrl: PNG, text: "" } };
    } });
    await s().createProject("Retry");
    const draft = (await s().addImageNode({ blob: new Blob([new Uint8Array([1])]), mimeType: "image/png" }, { role: "visual", title: "d" }))!;
    s().setSelection([draft]);
    await s().runAction("visual_variations", { dimensionIds: ["balance", "color"] });
    const error = s().notices.find((n) => n.kind === "error")!;
    expect(error.action?.label).toBe("Retry failed");
    failColor = false;
    seen.length = 0;
    error.action!.run();
    await new Promise((r) => setTimeout(r, 20));
    expect(seen).toEqual(["color"]);
    expect(visibleNodes(p()).filter((n) => n.origin.kind === "generated").map((n) => n.title).sort()).toEqual(["Balance variation", "Color variation"]);
  });
});
