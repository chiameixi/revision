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
 * - expand: everything selected is input; one job.
 * - visual_variations: the first selected image is varied; everything else is
 *   context. One job per chosen dimension.
 * - conceptual_variations: each selected concept or motif is an idea to
 *   render; the first other image is the base; the rest is context.
 *   One job per idea per image.
 */

import type { ActionType, Edge, IdeaNode, ImageId, NodeId, RunId } from "@/domain/types";
import {
  DEFAULT_COUNTS,
  DEFAULT_IMAGES_PER_IDEA,
  type ActionReply,
  type ActionRequest,
  type ActionResponse,
  type ExpandResponse,
  type ImageResponse,
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

// `images` maps imageId → data URL for every input that has an image.
export function planRun(
  action: ActionType,
  inputs: IdeaNode[],
  brief: string,
  images: Record<ImageId, string>,
  runId: RunId,
  opts: RunOptions = {},
): Plan {
  const meta = { runId, brief, instructions: opts.instructions };
  const wire = (n: IdeaNode) => toWire(n, images);
  const hasImage = (n: IdeaNode) => !!(n.image && images[n.image.imageId]);
  const ids = (ns: IdeaNode[]) => ns.map((n) => n.id);

  switch (action) {
    case "expand": {
      const counts = opts.counts ?? DEFAULT_COUNTS;
      if (counts.concepts + counts.motifs === 0) return { ok: false, error: "Ask for at least one concept or motif." };
      if (inputs.length === 0 && !brief.trim()) return { ok: false, error: "Write a brief or select something to expand." };
      return {
        ok: true,
        jobs: [{ action, label: "Expand", parents: ids(inputs), req: { ...meta, inputs: inputs.map(wire), counts } }],
      };
    }

    case "visual_variations": {
      const base = inputs.find(hasImage);
      if (!base) return { ok: false, error: "Select at least one image to make visual variations." };
      const dims = opts.dimensionIds ?? DIMENSIONS.map((d) => d.id);
      if (dims.length === 0) return { ok: false, error: "Choose at least one dimension." };
      const context = inputs.filter((n) => n !== base).map(wire);
      return {
        ok: true,
        jobs: dims.map((dimensionId) => ({
          action,
          label: `${DIMENSION_MAP[dimensionId]?.label ?? dimensionId} variation`,
          parents: ids(inputs),
          req: { ...meta, base: wire(base), context, dimensionId },
        })),
      };
    }

    case "conceptual_variations": {
      const ideas = inputs.filter((n) => n.role === "concept" || n.role === "motif");
      if (ideas.length === 0) return { ok: false, error: "Select at least one concept or motif to visualize." };
      const base = inputs.find((n) => !ideas.includes(n) && hasImage(n));
      const context = inputs.filter((n) => !ideas.includes(n) && n !== base).map(wire);
      const of = Math.max(1, opts.imagesPerIdea ?? DEFAULT_IMAGES_PER_IDEA);
      const jobs: Job[] = [];
      for (const idea of ideas) {
        for (let variant = 1; variant <= of; variant++) {
          jobs.push({
            action,
            label: of > 1 ? `"${idea.title}" (${variant} of ${of})` : `"${idea.title}"`,
            parents: base ? [idea.id, base.id] : [idea.id],
            req: { ...meta, idea: wire(idea), base: base ? wire(base) : undefined, context, variant, of },
          });
        }
      }
      return { ok: true, jobs };
    }
  }
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
  const add = (node: IdeaNode) => {
    out.nodes.push(node);
    for (const from of job.parents) {
      out.edges.push(makeEdge(from, node.id, "derived_from", { origin: { kind: "generated", action: job.action, runId } }));
    }
  };
  const origin = (params?: { dimensionId?: string }) => ({ kind: "generated" as const, action: job.action, runId, params });

  if (job.action === "expand") {
    const r = res as ExpandResponse;
    for (const c of r.concepts) {
      add(makeNode({ role: "concept", title: c.title, body: c.description, details: { rationale: c.rationale } }, origin()));
    }
    for (const m of r.motifs) {
      add(makeNode({
        role: "motif", title: m.title, body: m.visualQuality,
        details: { howItConveysIdea: m.howItConveysIdea, category: m.category },
      }, origin()));
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
    add(makeNode({ role: "visual", title: req.idea.title, body: r.text || undefined, image }, origin()));
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
