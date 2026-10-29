// ── IDs ───────────────────────────────────────────────────────────────────────
// All IDs are nanoid strings with a short prefix (see ids.ts).
// Aliases of string: they don't stop mix-ups at compile time, but they say what an ID points to.

export type ProjectId = string;
export type NodeId = string;
export type EdgeId = string;
export type CollectionId = string;
export type ImageId = string;
export type RunId = string;

// ── Shared ────────────────────────────────────────────────────────────────────

// What a node is about. Independent of content: a concept can be just an image.
export type Role = "concept" | "motif" | "visual" | "note";

// The three generation actions. Fixed set; each takes whatever is selected.
export type ActionType = "expand" | "visual_variations" | "conceptual_variations";

// A position on a view's canvas, in pixels.
export interface XY { x: number; y: number }

// A box inside an image: [ymin, xmin, ymax, xmax] on a 0–1000 scale, as Gemini returns it.
// Convert to pixels only when drawing.
export interface Region { box: [number, number, number, number] }

// Points a node at an image in the image store. The image data never lives in project state.
export interface ImageRef {
  imageId: ImageId;
  mimeType: string;
  width?: number;
  height?: number;
}

// Optional structured text from the model. Shared across roles so retagging loses nothing.
export interface RoleDetails {
  rationale?: string;        // why this direction is promising
  visualQuality?: string;    // what it looks like / how it manifests visually
  howItConveysIdea?: string; // why this motif works for the concept
  category?: string;         // color | texture | form | composition | subject | style
}

// Action-specific facts about how a generated node or edge was made.
export interface OriginParams {
  dimensionId?: string;   // visual_variations: which Arnheim dimension produced it
  sourceEdgeId?: EdgeId;  // run with a link as input: the link it came from
}

// Who made a node or edge. Inputs are not here; they are the derived_from edges.
// runId groups siblings from one run and joins the node to its log entries.
export type Origin =
  | { kind: "user" }
  | { kind: "generated"; action: ActionType; runId: RunId; params?: OriginParams };

// ── Entities ──────────────────────────────────────────────────────────────────

// One box on the canvas: a concept, motif, visual or note.
export interface IdeaNode {
  id: NodeId;
  role: Role;
  title: string;
  body?: string;            // main text, any role
  image?: ImageRef;         // any role can have one
  details?: RoleDetails;
  hidden?: boolean;         // removed by the user; kept so the tree can bridge over it
  origin: Origin;
  createdAt: string;
}

// derived_from: provenance made by runs (from = input, to = output). Always points forward
//   in time, so it never loops; that is why it alone sets tree depth.
// link: a connection the user drew, optionally labelled; can be selected and expanded.
//   Drawn on top of the tree without moving anything.
export type EdgeKind = "derived_from" | "link";

// A connection between two nodes. Holds only their IDs, never copies of them.
export interface Edge {
  id: EdgeId;
  from: NodeId;
  to: NodeId;
  kind: EdgeKind;
  label?: string;
  region?: Region | "whole"; // derived_from from an image: where in it the output came from
  hidden?: boolean;
  origin: Origin;
  createdAt: string;
}

// A named, coloured group of nodes, shown in the cluster view.
export interface Collection {
  id: CollectionId;
  title: string;
  description?: string;
  color: string;            // hex, e.g. "#f59e0b"
  nodeIds: NodeId[];        // ordered
  createdAt: string;
}

// Everything about one project. Each Record is keyed by ID, so each fact is stored once.
export interface ProjectState {
  id: ProjectId;
  title: string;
  brief: string;
  createdAt: string;
  updatedAt: string;
  nodes: Record<NodeId, IdeaNode>;
  edges: Record<EdgeId, Edge>;
  collections: Record<CollectionId, Collection>;
  views: {
    // Only positions the user has dragged; everything else is auto-laid-out.
    tree: { positions: Record<NodeId, XY> };
    cluster: { positions: Record<NodeId | CollectionId, XY> };
  };
}

// What the projects grid needs without loading every project.
export type ProjectSummary = Pick<ProjectState, "id" | "title" | "updatedAt" | "createdAt">;

// ── Stored outside project state ──────────────────────────────────────────────

// One image in the image store (an IndexedDB table). Nodes reach it through ImageRef.
export interface ImageRecord {
  id: ImageId;
  blob: Blob;
  mimeType: string;
  width?: number;
  height?: number;
  createdAt: string;
}

// One entry in the append-only study log. The app writes these and never reads them back.
export interface AppEvent {
  id: string;
  projectId: ProjectId;
  at: string;
  actor: "user" | "model";
  type: string;                       // e.g. "node.hidden", "run.done"
  payload: Record<string, unknown>;   // IDs and small values only, never image data
  participantId?: string;
}

// ── Memory only ───────────────────────────────────────────────────────────────

// A run that hasn't finished yet, for the progress UI. Never saved; on finish it
// leaves behind nodes, edges and a run.done event.
export interface RunInProgress {
  runId: RunId;
  action: ActionType;
  inputs: (NodeId | EdgeId)[];  // the selection when the run started
  total: number;
  done: number;
  failed: number;
  startedAt: string;
}
