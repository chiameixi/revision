import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { DexieRepository } from "@/db/dexie";
import { project, node } from "./helpers";

// Each test gets a fresh database.
let r: DexieRepository;
let count = 0;
beforeEach(() => {
  r = new DexieRepository(`test_${count++}`);
});

describe("projects", () => {
  it("saves and loads a project unchanged", async () => {
    const p = project();
    node(p, "A");
    await r.saveProject(p);
    expect(await r.loadProject(p.id)).toEqual(p);
  });

  it("lists projects newest first", async () => {
    await r.saveProject({ ...project(), id: "old", title: "Old", updatedAt: "2026-01-01T00:00:00.000Z" });
    await r.saveProject({ ...project(), id: "new", title: "New", updatedAt: "2026-02-01T00:00:00.000Z" });
    expect((await r.listProjects()).map((s) => s.title)).toEqual(["New", "Old"]);
  });

  it("deletes a project together with its events", async () => {
    const p = project();
    await r.saveProject(p);
    await r.logEvent({ projectId: p.id, actor: "user", type: "node.hidden", payload: {} });
    await r.deleteProject(p.id);
    expect(await r.loadProject(p.id)).toBeUndefined();
    expect(await r.listEvents(p.id)).toEqual([]);
  });
});

describe("images", () => {
  it("stores an image and returns it by ID", async () => {
    const id = await r.saveImage({ blob: new Blob([new Uint8Array([1, 2, 3])]), mimeType: "image/png" });
    const img = await r.getImage(id);
    expect(img?.mimeType).toBe("image/png");
    expect(img?.blob.size).toBe(3);
  });
});

describe("events", () => {
  it("returns a project's events oldest first, with ID and time filled in", async () => {
    await r.logEvent({ projectId: "p1", actor: "user", type: "first", payload: {} });
    await new Promise((res) => setTimeout(res, 2));
    await r.logEvent({ projectId: "p1", actor: "model", type: "second", payload: {} });
    await r.logEvent({ projectId: "other", actor: "user", type: "elsewhere", payload: {} });
    const events = await r.listEvents("p1");
    expect(events.map((e) => e.type)).toEqual(["first", "second"]);
    expect(events[0].id).toMatch(/^ev_/);
    expect(events[0].at).toBeTruthy();
  });
});
