import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { DexieRepository } from "@/db/dexie";
import { createProjectStore } from "@/store/projectStore";
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
