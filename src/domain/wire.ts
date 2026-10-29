// Request and response shapes for POST /api/actions/[id], shared by the
// browser (services/generate.ts) and the server (server/registry.ts).
// One request produces one output (or one batch of text ideas, for expand).

import type { ActionType, NodeId, Role, RoleDetails, RunId } from "./types";

// A node as sent to the server: its text, plus its image inlined if it has one.
export interface WireNode {
  id: NodeId;
  role: Role;
  title: string;
  body?: string;
  details?: RoleDetails;
  imageDataUrl?: string;
}

interface RunMeta {
  runId: RunId;
  brief: string;
  instructions?: string;
}

export interface ExpandRequest extends RunMeta {
  inputs: WireNode[];
  counts: { concepts: number; motifs: number };
}

export interface ExpandResponse {
  concepts: { title: string; description: string; rationale: string }[];
  motifs: { title: string; visualQuality: string; howItConveysIdea: string; category: string }[];
}

export interface VisualVariationRequest extends RunMeta {
  base: WireNode;            // the image being varied
  context: WireNode[];       // everything else selected; images become style references
  dimensionId: string;
}

export interface ConceptualVariationRequest extends RunMeta {
  idea: WireNode;            // the concept or motif to render
  base?: WireNode;           // optional image to build on
  context: WireNode[];
  variant: number;           // 1-based: which of `of` images this is
  of: number;
}

export interface ImageResponse {
  imageDataUrl: string;
  text: string;
}

export interface ActionContract {
  expand: { req: ExpandRequest; res: ExpandResponse };
  visual_variations: { req: VisualVariationRequest; res: ImageResponse };
  conceptual_variations: { req: ConceptualVariationRequest; res: ImageResponse };
}

export type ActionRequest<A extends ActionType = ActionType> = ActionContract[A]["req"];
export type ActionResponse<A extends ActionType = ActionType> = ActionContract[A]["res"];

// What the route returns: the result, or an error message.
export type ActionReply<A extends ActionType = ActionType> =
  | { result: ActionResponse<A> }
  | { error: string };

export const DEFAULT_COUNTS = { concepts: 4, motifs: 4 } as const;
export const MAX_COUNT = 10;
export const DEFAULT_IMAGES_PER_IDEA = 1;
export const MAX_IMAGES_PER_IDEA = 4;
