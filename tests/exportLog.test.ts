import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { buildStudyLog, exportFileName, EXPORT_FORMAT } from "@/services/exportLog";
import { DexieRepository } from "@/db/dexie";
import { createProjectStore } from "@/store/projectStore";
import { edge, node, project } from "./helpers";
import type { AppEvent } from "@/domain/types";

describe("buildStudyLog", () => {
  const p = project();
  node(p, "A", { hidden: true }).body = "removed but still explained";
  node(p, "B", { role: "motif" });
  edge(p, "A", "B", "link");
  const events: AppEvent[] = [
    { id: "e2", seq: 2, projectId: p.id, at: "2026-01-01T00:00:00.000Z", actor: "user", type: "node.hidden", payload: { nodeId: "A" } },
    { id: "e1", seq: 1, projectId: p.id, at: "2026-01-01T00:00:00.000Z", actor: "user", type: "node.created", payload: { nodeId: "A" } },
  ];
  const log = buildStudyLog(p, events, "2026-02-02T00:00:00.000Z");

  it("puts events in their true order and drops the repeated project ID", () => {
    expect(log.events.map((e) => e.type)).toEqual(["node.created", "node.hidden"]);
    expect(log.events[0]).not.toHaveProperty("projectId");
  });

  it("explains every ID, including removed nodes", () => {
    expect(log.snapshot.nodes.find((n) => n.id === "A")).toMatchObject({ hidden: true, body: "removed but still explained", role: "concept" });
    expect(log.snapshot.edges).toEqual([expect.objectContaining({ from: "A", to: "B", kind: "link", hidden: false })]);
  });

  it("is labelled with a format version", () => {
    expect(log.format).toBe(EXPORT_FORMAT);
    expect(log.project).toMatchObject({ id: p.id, title: "Test" });
  });
});

describe("exportFileName", () => {
  it("makes a safe, dated file name", () => {
    expect(exportFileName("Harbour café: Round 2!", new Date("2026-10-29T12:00:00Z"))).toBe("harbour-cafe-round-2_2026-10-29.json");
    expect(exportFileName("???", new Date("2026-10-29T12:00:00Z"))).toBe("project_2026-10-29.json");
  });
});

describe("export from real use", () => {
  it("captures what happened in a session", async () => {
    const repo = new DexieRepository("export_test");
    const store = createProjectStore(() => repo, { saveDelayMs: 0 });
    const s = () => store.getState();
    await s().createProject("Study");
    const a = s().addNode({ role: "concept", title: "Ebb" })!;
    s().retagNode(a, "motif");
    s().hideNode(a);
    await new Promise((r) => setTimeout(r, 10));
    const p = s().project!;
    const log = buildStudyLog(p, await repo.listEvents(p.id), "now");
    expect(log.events.map((e) => e.type)).toEqual(["project.created", "node.created", "node.retagged", "node.hidden"]);
    expect(log.snapshot.nodes).toEqual([expect.objectContaining({ id: a, title: "Ebb", role: "motif", hidden: true })]);
  });
});

describe("export all", () => {
  it("includes every project, with unsaved edits saved first", async () => {
    const repo = new DexieRepository("export_all_test");
    const store = createProjectStore(() => repo, { saveDelayMs: 10_000 });   // nothing saves on its own
    const s = () => store.getState();
    await s().createProject("One");
    await s().createProject("Two");
    s().addNode({ role: "note", title: "unsaved" });
    const logs = await s().exportAllStudyLogs();
    expect(logs.map((l) => l.project.title).sort()).toEqual(["One", "Two"]);
    expect(logs.find((l) => l.project.title === "Two")!.snapshot.nodes.map((n) => n.title)).toEqual(["unsaved"]);
  });
});
