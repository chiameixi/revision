/**
 * src/db/index.ts
 *
 * Responsibility: The only way the app reads or writes persistent data.
 *
 * Design decisions:
 * - Everything is async, even where the backing store wouldn't need it, so a
 *   server-backed implementation can replace IndexedDB without touching callers.
 * - Each project is saved as one document. Images and events live in their own
 *   tables because they're large (images) or append-only (events).
 * - The app never imports Dexie directly; it imports `repo` from here.
 */

import type { AppEvent, ImageId, ImageRecord, ProjectId, ProjectState, ProjectSummary } from "@/domain/types";
import { DexieRepository } from "./dexie";

export interface NewImage {
  blob: Blob;
  mimeType: string;
  width?: number;
  height?: number;
}

export type NewEvent = Omit<AppEvent, "id" | "at">;

export interface Repository {
  listProjects(): Promise<ProjectSummary[]>;   // newest first
  loadProject(id: ProjectId): Promise<ProjectState | undefined>;
  saveProject(project: ProjectState): Promise<void>;
  deleteProject(id: ProjectId): Promise<void>;

  saveImage(image: NewImage, id?: ImageId): Promise<ImageId>;
  getImage(id: ImageId): Promise<ImageRecord | undefined>;

  logEvent(event: NewEvent): Promise<void>;
  listEvents(projectId: ProjectId): Promise<AppEvent[]>; // oldest first, for export
}

let instance: Repository | null = null;

// Created on first use so nothing touches IndexedDB during server rendering.
export function repo(): Repository {
  if (!instance) instance = new DexieRepository();
  return instance;
}
