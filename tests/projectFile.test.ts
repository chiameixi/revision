import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { DexieRepository } from "@/db/dexie";
import { createProjectStore } from "@/store/projectStore";
import { parseProjectFile, projectFileName, ProjectFileError, PROJECT_FILE_FORMAT } from "@/services/projectFile";
import { EXPORT_FORMAT } from "@/services/exportLog";
import { edge, node, project } from "./helpers";

let repo: DexieRepository;
let store: ReturnType<typeof createProjectStore>;
let count = 0;
const s = () => store.getState();

beforeEach(() => {
  repo = new DexieRepository(`project_file_test_${count++}`);
  store = createProjectStore(() => repo, { saveDelayMs: 0 });
});

const png = (...bytes: number[]) => ({ blob: new Blob([new Uint8Array(bytes)], { type: "image/png" }), mimeType: "image/png", width: 4, height: 2 });
const asFile = (over: object) => JSON.stringify({ format: PROJECT_FILE_FORMAT, exportedAt: "t", project: project(), images: [], events: [], ...over });

describe("exporting and uploading a project", () => {
  async function exported() {
    const id = await s().createProject("Harbour");
    s().setBrief("A cafe by the sea");
    const concept = s().addNode({ role: "concept", title: "Ebb", body: "Slow", details: { rationale: "Calm" } })!;
    const kept = (await s().addImageNode(png(1, 2, 3), { role: "visual", title: "kept" }, [concept]))!;
    const removed = (await s().addImageNode(png(4, 5), { role: "visual", title: "removed" }))!;
    s().hideNode(removed);
    s().moveNode("tree", kept, { x: 11, y: 22 });
    await s().flush();
    const original = (await repo.loadProject(id))!;
    // Through JSON, as a real file goes.
    const text = JSON.stringify(await s().exportProjectFile(id));
    return { id, original, text, concept, kept, removed };
  }

  it("restores the same project under a new ID, in a different browser", async () => {
    const { id, original, text } = await exported();
    const events = await repo.listEvents(id);

    repo = new DexieRepository(`project_file_test_${count++}`);
    const newId = await s().uploadProject(text);

    expect(newId).not.toBe(id);
    expect(s().project!.id).toBe(newId);
    expect(s().status).toBe("ready");
    expect({ ...s().project!, id: "", updatedAt: "" }).toEqual({ ...original, id: "", updatedAt: "" });
    expect(s().projects.map((p) => p.id)).toEqual([newId]);

    const restored = await repo.listEvents(newId);
    expect(restored.slice(0, events.length).map((e) => [e.id, e.at, e.type])).toEqual(events.map((e) => [e.id, e.at, e.type]));
    expect(restored.at(-1)).toMatchObject({ type: "project.uploaded", payload: { sourceProjectId: id } });
  });

  it("restores image bytes, including those of removed nodes", async () => {
    const { original, text, kept, removed } = await exported();
    repo = new DexieRepository(`project_file_test_${count++}`);
    await s().uploadProject(text);

    const bytes = async (nodeId: string) => {
      const image = await repo.getImage(original.nodes[nodeId].image!.imageId);
      return { mimeType: image!.mimeType, width: image!.width, data: [...new Uint8Array(await image!.blob.arrayBuffer())] };
    };
    expect(await bytes(kept)).toEqual({ mimeType: "image/png", width: 4, data: [1, 2, 3] });
    expect((await bytes(removed)).data).toEqual([4, 5]);
  });

  it("leaves the original alone when uploaded to the same browser", async () => {
    const { id, original, text } = await exported();
    const newId = await s().uploadProject(text);
    expect(newId).not.toBe(id);
    expect(await repo.loadProject(id)).toEqual(original);
    expect(s().projects).toHaveLength(2);
    expect(s().notices).toEqual([]);
  });

  it("saves pending edits before exporting", async () => {
    const id = await s().createProject("Harbour");
    s().setTitle("Latest");
    expect((await s().exportProjectFile(id))!.project.title).toBe("Latest");
  });

  it("warns when the file is missing an image", async () => {
    const { text } = await exported();
    const file = JSON.parse(text);
    file.images = file.images.slice(1);
    await s().uploadProject(JSON.stringify(file));
    expect(s().notices.map((n) => n.message)).toEqual(["1 image was missing from this file, so its node shows no picture."]);
  });

  it("adds nothing when the file is refused", async () => {
    await expect(s().uploadProject("nope")).rejects.toThrow(ProjectFileError);
    await s().loadProjects();
    expect(s().projects).toEqual([]);
  });
});

describe("parseProjectFile", () => {
  it("accepts a valid file", () => {
    const p = project();
    node(p, "A");
    node(p, "B");
    edge(p, "A", "B");
    expect(parseProjectFile(asFile({ project: p })).project.nodes.A.title).toBe("A");
  });

  it("explains that a study log can't be opened", () => {
    expect(() => parseProjectFile(JSON.stringify({ format: EXPORT_FORMAT }))).toThrow(/study log/);
    expect(() => parseProjectFile(JSON.stringify({ format: "design-workspace/study-logs@1" }))).toThrow(/study log/);
  });

  it.each([
    ["text that isn't JSON", "not json"],
    ["a list", "[]"],
    ["another format", JSON.stringify({ format: "other" })],
  ])("refuses %s", (_name, text) => {
    expect(() => parseProjectFile(text)).toThrow(ProjectFileError);
  });

  it("refuses files the app couldn't open", () => {
    const withEdgeToNowhere = project();
    node(withEdgeToNowhere, "A");
    edge(withEdgeToNowhere, "A", "gone");
    const withBadRole = project();
    node(withBadRole, "A");
    (withBadRole.nodes.A as { role: string }).role = "banana";
    const withBadCollection = project();
    withBadCollection.collections.c = { id: "c", title: "C", color: "#000", nodeIds: ["gone"], createdAt: "t" };

    for (const over of [
      { project: undefined },
      { project: { ...project(), nodes: undefined } },
      { project: { ...project(), views: {} } },
      { project: withEdgeToNowhere },
      { project: withBadRole },
      { project: withBadCollection },
      { images: undefined },
      { images: [{ id: "i", dataUrl: "https://example.com/x.png" }] },
      { events: [{}] },
    ]) {
      expect(() => parseProjectFile(asFile(over))).toThrow(ProjectFileError);
    }
  });
});

describe("projectFileName", () => {
  it("can't be mistaken for a study log", () => {
    expect(projectFileName("Harbour Café", new Date("2026-10-29T12:00:00Z"))).toBe("harbour-cafe_2026-10-29.project.json");
  });
});
