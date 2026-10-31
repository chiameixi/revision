// Request and response shapes for POST /api/actions/[id], shared by the
// browser (services/generate.ts) and the server (server/registry.ts).
// One request produces one output (or one batch of text ideas, for expand).

import type { ActionType, EdgeId, NodeId, Role, RoleDetails, RunId } from "./types";

// A node as sent to the server: its text, plus its image inlined if it has one.
export interface WireNode {
  id: NodeId;
  role: Role;
  title: string;
  body?: string;
  details?: RoleDetails;
  imageDataUrl?: string;
}

// A user-drawn link sent as an input in its own right: the two ends plus
// the user's label for what connects them.
export interface WireLink {
  id: EdgeId;
  from: WireNode;
  to: WireNode;
  label?: string;
}

interface RunMeta {
  runId: RunId;
  brief: string;
  instructions?: string;
}

export interface ExpandRequest extends RunMeta {
  inputs: WireNode[];
  links?: WireLink[];        // connections to explore: ideas that sit between the two ends
  counts: { concepts: number; motifs: number };
}

// Where in the input images an idea came from. Only asked for when images are
// sent. sourceImage is 1-based, in the order the images were sent; box is
// [ymin, xmin, ymax, xmax] on a 0–1000 scale, absent for the whole image.
interface FromImage {
  sourceImage?: number;
  box?: number[];
}

export interface ExpandResponse {
  concepts: ({ title: string; description: string; rationale: string } & FromImage)[];
  motifs: ({ title: string; visualQuality: string; howItConveysIdea: string; category: string } & FromImage)[];
}

export interface VisualVariationRequest extends RunMeta {
  base: WireNode;            // the image being varied
  context: WireNode[];       // everything else selected; images become style references
  dimensionId: string;
}

// Renders either one idea, or a link as "one end expressed through the other".
export interface ConceptualVariationRequest extends RunMeta {
  idea?: WireNode;           // the concept or motif to render…
  link?: WireLink;           // …or a connection between two nodes (exactly one of the two)
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

// Tokens one request used, summed over retries. Failed requests still report
// what they used, since those calls are billed too.
export interface Usage {
  model: string;
  calls: number;           // model calls, including retries
  inputTokens: number;
  outputTokens: number;    // text output, including thinking
  imageTokens: number;     // image output
}

// What the route returns: the result, or an error message.
export type ActionReply<A extends ActionType = ActionType> =
  | { result: ActionResponse<A>; usage?: Usage }
  | { error: string; usage?: Usage };

export const DEFAULT_COUNTS = { concepts: 4, motifs: 4 } as const;
export const MAX_COUNT = 10;
export const DEFAULT_IMAGES_PER_IDEA = 1;
export const MAX_IMAGES_PER_IDEA = 4;
