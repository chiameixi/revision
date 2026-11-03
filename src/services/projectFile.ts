/**
 * src/services/projectFile.ts
 *
 * Responsibility: The project file. One JSON file with everything needed to
 * rebuild a project in another browser: the project, its images as data URLs,
 * and its event log. The study log is for analysis and can't be opened again.
 */

import { BRIEF_ID, type AppEvent, type ImageId, type ImageRecord, type ProjectId, type ProjectState, type Role } from "@/domain/types";
import { blobToDataUrl, dataUrlToImage } from "./images";
import { exportFileName } from "./exportLog";

export const PROJECT_FILE_FORMAT = "design-workspace/project@1";

export interface ProjectFile {
  format: typeof PROJECT_FILE_FORMAT;
  exportedAt: string;
  project: ProjectState;
  images: (Omit<ImageRecord, "blob"> & { dataUrl: string })[];
  events: Omit<AppEvent, "projectId" | "seq">[];  // oldest first
}

// Every image the project uses, including those on removed nodes (Undo brings them back).
export function imageIdsOf(p: ProjectState): ImageId[] {
  return [...new Set(Object.values(p.nodes).flatMap((n) => (n.image ? [n.image.imageId] : [])))];
}

export async function buildProjectFile(p: ProjectState, images: ImageRecord[], events: AppEvent[], exportedAt: string): Promise<ProjectFile> {
  return {
    format: PROJECT_FILE_FORMAT,
    exportedAt,
    project: p,
    images: await Promise.all(images.map(async ({ blob, ...image }) => ({ ...image, dataUrl: await blobToDataUrl(blob, image.mimeType) }))),
    events: [...events]
      .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
      .map(({ projectId: _p, seq: _s, ...e }) => e),
  };
}

// "harbour-cafe_2026-10-29.project.json", so it isn't mistaken for a study log.
export function projectFileName(title: string, date: Date): string {
  return exportFileName(title, date).replace(/\.json$/, ".project.json");
}

// A problem with the uploaded file. The message is shown to the user.
export class ProjectFileError extends Error {}

const ROLES: Role[] = ["concept", "motif", "visual", "note"];

function fail(msg: string): never {
  throw new ProjectFileError(msg);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function damaged(what: string): never {
  fail(`This project file is damaged: ${what}.`);
}

// Checks everything the app assumes when it opens a project, so a bad file is
// refused here instead of crashing the canvas later.
function checkProject(p: unknown): asserts p is ProjectState {
  if (!isObj(p)) damaged("the project is missing");
  for (const field of ["title", "brief", "createdAt", "updatedAt"]) {
    if (typeof p[field] !== "string") damaged(`the project has no ${field}`);
  }
  const { nodes, edges, collections, views } = p;
  if (!isObj(nodes) || !isObj(edges) || !isObj(collections)) damaged("the project has no nodes, connections or collections");
  if (!isObj(views) || !isObj(views.tree) || !isObj(views.tree.positions) || !isObj(views.cluster) || !isObj(views.cluster.positions)) {
    damaged("the project has no layout");
  }
  for (const [id, n] of Object.entries(nodes)) {
    if (!isObj(n) || n.id !== id || typeof n.title !== "string" || !ROLES.includes(n.role as Role) || !isObj(n.origin)) damaged(`node ${id} is invalid`);
    if (n.image !== undefined && (!isObj(n.image) || typeof n.image.imageId !== "string")) damaged(`node ${id} has an invalid image`);
  }
  for (const [id, e] of Object.entries(edges)) {
    if (!isObj(e) || e.id !== id || (e.kind !== "derived_from" && e.kind !== "link") || !isObj(e.origin)) damaged(`connection ${id} is invalid`);
    if ((e.from !== BRIEF_ID && !nodes[e.from as string]) || !nodes[e.to as string]) damaged(`connection ${id} points to a missing node`);
  }
  for (const [id, c] of Object.entries(collections)) {
    if (!isObj(c) || c.id !== id || typeof c.title !== "string" || !Array.isArray(c.nodeIds)) damaged(`collection ${id} is invalid`);
    if (c.nodeIds.some((n) => !nodes[n as string])) damaged(`collection ${id} points to a missing node`);
  }
}

export function parseProjectFile(text: string): ProjectFile {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    fail("This file isn't a project file: it can't be read as JSON.");
  }
  if (!isObj(file)) fail("This file isn't a project file.");
  if (typeof file.format === "string" && file.format.includes("study-log")) {
    fail("This is a study log, which can't be opened as a project because it has no images or layout. Use a file from Export project.");
  }
  if (file.format !== PROJECT_FILE_FORMAT) fail("This file isn't a project file, or a newer version of the app made it.");
  checkProject(file.project);
  if (!Array.isArray(file.images) || !Array.isArray(file.events)) damaged("the images or the log are missing");
  for (const i of file.images) {
    if (!isObj(i) || typeof i.id !== "string" || typeof i.dataUrl !== "string" || !i.dataUrl.startsWith("data:image/")) damaged("an image is invalid");
  }
  for (const e of file.events) {
    if (!isObj(e) || typeof e.type !== "string" || typeof e.at !== "string") damaged("a log entry is invalid");
  }
  return file as unknown as ProjectFile;
}

// Turns a parsed file into what storage needs. The project gets a new ID so an
// upload can never overwrite one already here. Node and image IDs stay, because
// the log refers to them; they only need to be unique within a project.
export function restoreProject(file: ProjectFile, id: ProjectId, at: string) {
  const available = new Set(file.images.map((i) => i.id));
  return {
    project: { ...file.project, id, updatedAt: at },
    images: file.images.map(({ dataUrl, ...image }): ImageRecord => ({ ...image, blob: dataUrlToImage(dataUrl).blob })),
    events: file.events.map((e): AppEvent => ({ ...e, projectId: id })),
    missingImages: imageIdsOf(file.project).filter((i) => !available.has(i)).length,
  };
}
