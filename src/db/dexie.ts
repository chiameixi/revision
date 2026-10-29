/**
 * src/db/dexie.ts
 *
 * Responsibility: IndexedDB implementation of `Repository`, via Dexie.
 * Only src/db/index.ts should import this file.
 */

import Dexie, { type Table } from "dexie";
import type { AppEvent, ImageId, ImageRecord, ProjectId, ProjectState, ProjectSummary } from "@/domain/types";
import { newId, now } from "@/domain/ids";
import { summarize } from "@/domain/graph";
import type { NewEvent, NewImage, Repository } from "./index";

class WorkspaceDB extends Dexie {
  projects!: Table<ProjectState, ProjectId>;
  images!: Table<ImageRecord, ImageId>;
  events!: Table<AppEvent, number>;

  constructor(name: string) {
    super(name);
    // Only indexed fields are listed; documents can hold any other fields.
    // Events are keyed by an auto-incrementing seq so order survives same-millisecond writes.
    this.version(1).stores({
      projects: "id, updatedAt",
      images: "id",
      events: "++seq, id, projectId",
    });
  }
}

export class DexieRepository implements Repository {
  private db: WorkspaceDB;

  // Tests pass their own name to get a fresh database each time.
  constructor(name = "design_workspace") {
    this.db = new WorkspaceDB(name);
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const all = await this.db.projects.orderBy("updatedAt").reverse().toArray();
    return all.map(summarize);
  }

  loadProject(id: ProjectId) {
    return this.db.projects.get(id);
  }

  async saveProject(project: ProjectState) {
    await this.db.projects.put(project);
  }

  async deleteProject(id: ProjectId) {
    // Images are left in place: they're shared by ID and may be referenced elsewhere.
    await this.db.transaction("rw", this.db.projects, this.db.events, async () => {
      await this.db.projects.delete(id);
      await this.db.events.where("projectId").equals(id).delete();
    });
  }

  async saveImage(image: NewImage, id: ImageId = newId("image")): Promise<ImageId> {
    await this.db.images.put({ ...image, id, createdAt: now() });
    return id;
  }

  getImage(id: ImageId) {
    return this.db.images.get(id);
  }

  async logEvent(event: NewEvent) {
    await this.db.events.add({ ...event, id: newId("event"), at: now() });
  }

  listEvents(projectId: ProjectId) {
    return this.db.events.where("projectId").equals(projectId).sortBy("seq");
  }
}
