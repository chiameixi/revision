/**
 * src/services/generate.ts
 *
 * Responsibility: The browser side of a run.
 *   planRun     — selection + options → one job per output (pure)
 *   outputsFor  — one job's result → nodes and provenance edges (pure)
 *   callAction  — sends one job to POST /api/actions/[id]
 *
 * Rules for which inputs play which part are fixed per action, so the same
 * selection always does the same thing:
 * - expand: everything selected is input (a link brings its two ends);
 *   selected links are also sent as connections to explore. One job.
 * - visual_variations: the first selected image is varied; everything else,
 *   including link ends, is context. One job per chosen dimension.
 * - conceptual_variations: each selected concept, motif or link is rendered
 *   (a link as "one end expressed through the other"); the first other
 *   selected image is the base; the rest is context. One job per idea per image.
 */

import type { ActionType, Edge, EdgeId, IdeaNode, ImageId, NodeId, Region, RunId } from "@/domain/types";
import {
  DEFAULT_COUNTS,
  DEFAULT_IMAGES_PER_IDEA,
  type ActionReply,
  type ActionRequest,
  type ActionResponse,
  type ExpandResponse,
  type ImageResponse,
  type WireLink,
  type WireNode,
} from "@/domain/wire";
import { makeEdge, makeNode } from "@/domain/builders";
import { newId } from "@/domain/ids";
import { DIMENSIONS, DIMENSION_MAP } from "@/lib/dimensions";

export interface RunOptions {
  instructions?: string;
  dimensionIds?: string[];
  counts?: { concepts: number; motifs: number };
  imagesPerIdea?: number;
}

export interface Job<A extends ActionType = ActionType> {
  action: A;
  req: ActionRequest<A>;
  parents: NodeId[];          // provenance for this job's outputs
  label: string;              // shown if the job fails
  sourceEdgeId?: EdgeId;      // the link this job explores, recorded on its outputs
  imageNodeIds?: NodeId[];    // expand: which node each sent image belongs to, in order
}

// What's selected, with links kept as links rather than flattened to their ends.
export interface Selection {
  nodes: IdeaNode[];
  links: { edge: Edge; from: IdeaNode; to: IdeaNode }[];
}

export type Plan = { ok: true; jobs: Job[] } | { ok: false; error: string };

export function toWire(n: IdeaNode, images: Record<ImageId, string>): WireNode {
  return {
    id: n.id,
    role: n.role,
    title: n.title,
    body: n.body,
    details: n.details,
    imageDataUrl: n.image ? images[n.image.imageId] : undefined,
  };
}

function toWireLink(l: Selection["links"][number], images: Record<ImageId, string>): WireLink {
  return { id: l.edge.id, from: toWire(l.from, images), to: toWire(l.to, images), label: l.edge.label };
}

// `images` maps imageId → data URL for every input that has an image.
export function planRun(
  action: ActionType,
  sel: Selection,
  brief: string,
  images: Record<ImageId, string>,
  runId: RunId,
  opts: RunOptions = {},
): Plan {
  const meta = { runId, brief, instructions: opts.instructions };
  const wire = (n: IdeaNode) => toWire(n, images);
  const hasImage = (n: IdeaNode) => !!(n.image && images[n.image.imageId]);
  const ids = (ns: IdeaNode[]) => ns.map((n) => n.id);

  // Selected nodes plus the ends of selected links, without duplicates.
  const all: IdeaNode[] = [];
  for (const n of [...sel.nodes, ...sel.links.flatMap((l) => [l.from, l.to])]) if (!all.includes(n)) all.push(n);

  switch (action) {
    case "expand": {
      const counts = opts.counts ?? DEFAULT_COUNTS;
      if (counts.concepts + counts.motifs === 0) return { ok: false, error: "Ask for at least one concept or motif." };
      if (all.length === 0 && !brief.trim()) return { ok: false, error: "Write a brief or select something to expand." };
      return {
        ok: true,
        jobs: [{
          action, label: "Expand", parents: ids(all),
          sourceEdgeId: sel.links.length === 1 ? sel.links[0].edge.id : undefined,
          imageNodeIds: ids(all.filter(hasImage)),
          req: {
            ...meta, inputs: all.map(wire), counts,
            links: sel.links.length ? sel.links.map((l) => toWireLink(l, images)) : undefined,
          },
        }],
      };
    }

    case "visual_variations": {
      const base = all.find(hasImage);
      if (!base) return { ok: false, error: "Select at least one image to make visual variations." };
      const dims = opts.dimensionIds ?? DIMENSIONS.map((d) => d.id);
      if (dims.length === 0) return { ok: false, error: "Choose at least one dimension." };
      const context = all.filter((n) => n !== base).map(wire);
      return {
        ok: true,
        jobs: dims.map((dimensionId) => ({
          action,
          label: `${DIMENSION_MAP[dimensionId]?.label ?? dimensionId} variation`,
          parents: ids(all),
          req: { ...meta, base: wire(base), context, dimensionId },
        })),
      };
    }

    case "conceptual_variations": {
      const ideas = sel.nodes.filter((n) => n.role === "concept" || n.role === "motif");
      if (ideas.length === 0 && sel.links.length === 0) {
        return { ok: false, error: "Select at least one concept, motif or link to visualize." };
      }
      const base = sel.nodes.find((n) => !ideas.includes(n) && hasImage(n));
      const context = sel.nodes.filter((n) => !ideas.includes(n) && n !== base).map(wire);
      const of = Math.max(1, opts.imagesPerIdea ?? DEFAULT_IMAGES_PER_IDEA);
      const withBase = (parents: NodeId[]) => (base ? [...parents, base.id] : parents);
      const suffix = (variant: number) => (of > 1 ? ` (${variant} of ${of})` : "");
      const jobs: Job[] = [];
      for (const idea of ideas) {
        for (let variant = 1; variant <= of; variant++) {
          jobs.push({
            action, label: `"${idea.title}"${suffix(variant)}`, parents: withBase([idea.id]),
            req: { ...meta, idea: wire(idea), base: base ? wire(base) : undefined, context, variant, of },
          });
        }
      }
      for (const l of sel.links) {
        for (let variant = 1; variant <= of; variant++) {
          jobs.push({
            action, label: `"${l.from.title}" through "${l.to.title}"${suffix(variant)}`,
            parents: withBase([l.from.id, l.to.id]), sourceEdgeId: l.edge.id,
            req: { ...meta, link: toWireLink(l, images), base: base ? wire(base) : undefined, context, variant, of },
          });
        }
      }
      return { ok: true, jobs };
    }
  }
}

// Keeps a model-returned box only if it's a real box on the 0–1000 scale.
export function toRegion(box: unknown): Region | undefined {
  if (!Array.isArray(box) || box.length !== 4 || !box.every((v) => typeof v === "number" && Number.isFinite(v))) return undefined;
  const [ymin, xmin, ymax, xmax] = box.map((v) => Math.round(v));
  if (ymin < 0 || xmin < 0 || ymax > 1000 || xmax > 1000 || ymin >= ymax || xmin >= xmax) return undefined;
  return { box: [ymin, xmin, ymax, xmax] };
}

export interface Outputs {
  nodes: IdeaNode[];
  edges: Edge[];
  images: { imageId: ImageId; dataUrl: string }[];
}

function mimeOf(dataUrl: string): string {
  return dataUrl.match(/^data:([^;,]+)/)?.[1] ?? "image/png";
}

export function outputsFor(job: Job, res: ActionResponse, runId: RunId): Outputs {
  const out: Outputs = { nodes: [], edges: [], images: [] };
  // `from` says which input image the output came from (expand only), so that
  // edge can carry the region.
  const add = (node: IdeaNode, from?: { sourceImage?: number; box?: number[] }) => {
    out.nodes.push(node);
    const sourceId = from?.sourceImage ? job.imageNodeIds?.[from.sourceImage - 1] : undefined;
    for (const parent of job.parents) {
      const region = parent === sourceId ? toRegion(from?.box) ?? "whole" : undefined;
      out.edges.push(makeEdge(parent, node.id, "derived_from", { origin: { kind: "generated", action: job.action, runId }, region }));
    }
  };
  const origin = (params: { dimensionId?: string } = {}) => {
    const all = { ...params, ...(job.sourceEdgeId ? { sourceEdgeId: job.sourceEdgeId } : {}) };
    return { kind: "generated" as const, action: job.action, runId, params: Object.keys(all).length ? all : undefined };
  };

  if (job.action === "expand") {
    const r = res as ExpandResponse;
    for (const c of r.concepts) {
      add(makeNode({ role: "concept", title: c.title, body: c.description, details: { rationale: c.rationale } }, origin()), c);
    }
    for (const m of r.motifs) {
      add(makeNode({
        role: "motif", title: m.title, body: m.visualQuality,
        details: { howItConveysIdea: m.howItConveysIdea, category: m.category },
      }, origin()), m);
    }
    return out;
  }

  const r = res as ImageResponse;
  const imageId = newId("image");
  out.images.push({ imageId, dataUrl: r.imageDataUrl });
  const image = { imageId, mimeType: mimeOf(r.imageDataUrl) };

  if (job.action === "visual_variations") {
    const req = job.req as ActionRequest<"visual_variations">;
    const dim = DIMENSION_MAP[req.dimensionId];
    add(makeNode({ role: "visual", title: `${dim?.label ?? req.dimensionId} variation`, body: r.text || undefined, image },
      origin({ dimensionId: req.dimensionId })));
  } else {
    const req = job.req as ActionRequest<"conceptual_variations">;
    const title = req.idea ? req.idea.title : `${req.link!.from.title} through ${req.link!.to.title}`;
    add(makeNode({ role: "visual", title, body: r.text || undefined, image }, origin()));
  }
  return out;
}

// Provider errors sometimes arrive as raw JSON strings. Pull out the
// human-readable message so notices say "API key not valid…", not a blob.
export function readableError(raw: string): string {
  let msg = raw;
  const start = raw.indexOf("{");
  if (start >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(start));
      msg = parsed?.error?.message ?? parsed?.message ?? raw;
    } catch {
      // not JSON; use as is
    }
  }
  return msg.length > 200 ? `${msg.slice(0, 197)}…` : msg;
}

export type CallActionFn = (action: ActionType, req: ActionRequest) => Promise<ActionResponse>;

export const callAction: CallActionFn = async (action, req) => {
  let res: Response;
  try {
    res = await fetch(`/api/actions/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
  } catch {
    throw new Error("Couldn't reach the server. Check that it's running.");
  }
  let reply: ActionReply;
  try {
    reply = await res.json();
  } catch {
    throw new Error(`The server returned an unreadable response (${res.status}).`);
  }
  if ("error" in reply) throw new Error(readableError(reply.error));
  return reply.result;
};
