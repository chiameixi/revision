/**
 * src/services/legacyGenerate.ts
 *
 * Responsibility: TEMPORARY bridge between the new model and the old
 * POST /api/generate route, so generation keeps working until the server is
 * rewritten (phase 5 deletes this file).
 *
 * New action → old route action:
 * - expand: images in the selection → "analyze" on those images;
 *   no images → "unpack_brief" with the selection as context.
 * - visual_variations: selected images are the drafts (first one is varied);
 *   everything else is context.
 * - conceptual_variations: each selected concept or motif gets a result; a
 *   selected image is the base / style reference.
 */

import type { ConceptCardRef, GenerateRequest, ResultCard, TypedContext } from "@/types";
import type { ActionType, Edge, IdeaNode, ImageId, NodeId, RunId } from "@/domain/types";
import { makeEdge, makeNode } from "@/domain/builders";
import { newId } from "@/domain/ids";
import { DIMENSIONS } from "@/lib/dimensions";

export interface LegacyOptions {
  instructions?: string;
  dimensionIds?: string[];
}

export type LegacyBuild =
  | { ok: true; body: GenerateRequest }
  | { ok: false; error: string };

function describe(n: IdeaNode): string {
  const lines = [`[${n.role}] ${n.title}`];
  if (n.body) lines.push(n.body);
  if (n.details?.rationale) lines.push(`Rationale: ${n.details.rationale}`);
  if (n.details?.visualQuality) lines.push(`Visual quality: ${n.details.visualQuality}`);
  if (n.details?.howItConveysIdea) lines.push(`How it conveys the idea: ${n.details.howItConveysIdea}`);
  return lines.join("\n");
}

// `images` maps imageId → data URL for every input that has an image.
export function buildLegacyRequest(
  action: ActionType,
  inputs: IdeaNode[],
  brief: string,
  images: Record<ImageId, string>,
  opts: LegacyOptions = {},
): LegacyBuild {
  const withImage = inputs.filter((n) => n.image && images[n.image.imageId]);
  const imageUrls = withImage.map((n) => images[n.image!.imageId]);
  const rest = inputs.filter((n) => !withImage.includes(n));

  const typedContext: TypedContext = { concepts: [], motifs: [], visuals: [], notes: [] };
  const ideas = action === "conceptual_variations"
    ? rest.filter((n) => n.role === "concept" || n.role === "motif")
    : [];
  for (const n of rest) {
    if (ideas.includes(n)) continue;
    if (n.role === "concept") typedContext.concepts.push(describe(n));
    else if (n.role === "motif") typedContext.motifs.push(describe(n));
    else if (n.role === "visual") typedContext.visuals.push({ text: describe(n) });
    else typedContext.notes.push(describe(n));
  }

  const base: Omit<GenerateRequest, "action"> = {
    brief,
    userInstructions: opts.instructions ?? "",
    draftDataUrls: [],
    referenceDataUrls: [],
    typedContext,
    dimensionIds: opts.dimensionIds ?? DIMENSIONS.map((d) => d.id),
  };

  switch (action) {
    case "expand":
      if (withImage.length > 0) return { ok: true, body: { ...base, action: "analyze", draftDataUrls: imageUrls } };
      if (!brief.trim() && inputs.length === 0) return { ok: false, error: "Write a brief or select something to expand." };
      return { ok: true, body: { ...base, action: "unpack_brief" } };

    case "visual_variations":
      if (withImage.length === 0) return { ok: false, error: "Select at least one image to make visual variations." };
      if (base.dimensionIds.length === 0) return { ok: false, error: "Choose at least one dimension." };
      return { ok: true, body: { ...base, action: "visual_variations", draftDataUrls: imageUrls } };

    case "conceptual_variations": {
      if (ideas.length === 0) return { ok: false, error: "Select at least one concept or motif to visualize." };
      const conceptCards: ConceptCardRef[] = ideas.map((n) => ({
        id: n.id,
        title: n.title,
        description: n.body ?? "",
        rationale: n.details?.rationale ?? n.details?.howItConveysIdea ?? "",
      }));
      return { ok: true, body: { ...base, action: "conceptual_variations", draftDataUrls: imageUrls, conceptCards } };
    }
  }
}

// The old route passes provider errors through as raw JSON strings. Pull out
// the human-readable message so notices say "API key not valid…", not a blob.
export function readableError(raw: string): string {
  let msg = raw;
  try {
    const parsed = JSON.parse(raw);
    msg = parsed?.error?.message ?? parsed?.message ?? raw;
  } catch {
    // not JSON; use as is
  }
  return msg.length > 200 ? `${msg.slice(0, 197)}…` : msg;
}

export interface LegacyOutputs {
  nodes: IdeaNode[];
  edges: Edge[];
  images: { imageId: ImageId; dataUrl: string }[];
  failed: string[];   // error messages from cards that failed
}

// Turns returned cards into nodes, with derived_from edges from the inputs.
// Conceptual variations connect each output only to the idea it renders.
export function legacyCardsToOutputs(
  cards: ResultCard[],
  action: ActionType,
  runId: RunId,
  inputs: IdeaNode[],
): LegacyOutputs {
  const out: LegacyOutputs = { nodes: [], edges: [], images: [], failed: [] };
  const inputIds = inputs.map((n) => n.id);

  for (const card of cards) {
    if (card.type === "visual" && card.error && !card.imageDataUrl) {
      out.failed.push(card.error);
      continue;
    }

    let imageId: ImageId | undefined;
    let mimeType = "image/png";
    if (card.type === "visual" && card.imageDataUrl) {
      imageId = newId("image");
      mimeType = card.imageMimeType ?? card.imageDataUrl.match(/^data:([^;,]+)/)?.[1] ?? mimeType;
      out.images.push({ imageId, dataUrl: card.imageDataUrl });
    }

    const dimensionId = action === "visual_variations" && card.type === "visual"
      ? DIMENSIONS.find((d) => d.label === card.dimensionLabel)?.id
      : undefined;

    const node = makeNode(
      {
        role: card.type,
        title: card.title,
        body: card.type === "concept" ? card.description
          : card.type === "motif" ? card.visualQuality
          : card.type === "visual" ? card.analysisText || undefined
          : card.body,
        details: card.type === "concept" ? { rationale: card.rationale }
          : card.type === "motif" ? { howItConveysIdea: card.howItConveysIdea, category: card.category }
          : undefined,
        image: imageId ? { imageId, mimeType } : undefined,
      },
      { kind: "generated", action, runId, params: dimensionId ? { dimensionId } : undefined },
    );
    out.nodes.push(node);

    let parents: NodeId[] = inputIds;
    if (action === "conceptual_variations" && card.type === "visual") {
      const idea = inputs.find((n) => n.title === card.dimensionLabel && (n.role === "concept" || n.role === "motif"));
      if (idea) parents = [idea.id, ...inputs.filter((n) => n.image).map((n) => n.id)];
    }
    for (const from of parents) {
      out.edges.push(makeEdge(from, node.id, "derived_from", { origin: { kind: "generated", action, runId } }));
    }
  }

  return out;
}
