/**
 * src/services/exportLog.ts
 *
 * Responsibility: The study log export. One JSON file per project: the
 * project, every event in order, and a snapshot of what the event IDs refer
 * to (nodes, links, collections, removed ones included), so the log can be
 * analysed without the app.
 */

import type { AppEvent, ProjectState, Relation } from "@/domain/types";

export const EXPORT_FORMAT = "design-workspace/study-log@2";

export interface StudyLog {
  format: typeof EXPORT_FORMAT;
  exportedAt: string;
  project: Pick<ProjectState, "id" | "title" | "brief" | "createdAt" | "updatedAt" | "usage">;
  events: Omit<AppEvent, "projectId">[];
  // What IDs in the events mean. Images are referenced by ID only.
  snapshot: {
    nodes: { id: string; role: string; title: string; body?: string; hasImage: boolean; hidden: boolean; origin: unknown; createdAt: string }[];
    edges: { id: string; from: string; to: string; kind: string; relation?: Relation; region?: unknown; hidden: boolean; origin: unknown }[];
    collections: { id: string; title: string; nodeIds: string[] }[];
  };
}

export function buildStudyLog(p: ProjectState, events: AppEvent[], exportedAt: string): StudyLog {
  return {
    format: EXPORT_FORMAT,
    exportedAt,
    project: { id: p.id, title: p.title, brief: p.brief, createdAt: p.createdAt, updatedAt: p.updatedAt, usage: p.usage },
    events: [...events]
      .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || a.at.localeCompare(b.at))
      .map(({ projectId: _p, ...e }) => e),
    snapshot: {
      nodes: Object.values(p.nodes).map((n) => ({
        id: n.id, role: n.role, title: n.title, body: n.body, hasImage: !!n.image,
        hidden: !!n.hidden, origin: n.origin, createdAt: n.createdAt,
      })),
      edges: Object.values(p.edges).map((e) => ({
        id: e.id, from: e.from, to: e.to, kind: e.kind, relation: e.relation, region: e.region, hidden: !!e.hidden, origin: e.origin,
      })),
      collections: Object.values(p.collections).map((c) => ({ id: c.id, title: c.title, nodeIds: c.nodeIds })),
    },
  };
}

// A file name that's safe on every OS: "harbour-cafe_2026-10-29.json".
export function exportFileName(title: string, date: Date): string {
  const slug = title.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "project";
  return `${slug}_${date.toISOString().slice(0, 10)}.json`;
}

// Browser only: saves JSON as a file.
export function downloadJson(data: unknown, fileName: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
