// Checks request bodies for POST /api/actions/[id] before any model call.
// Pure, so it's unit-tested. Throws RequestError, which the route turns into a 400.

import type { ActionType, Role } from "@/domain/types";
import {
  MAX_COUNT,
  MAX_IMAGES_PER_IDEA,
  type ActionRequest,
  type ConceptualVariationRequest,
  type ExpandRequest,
  type VisualVariationRequest,
  type WireNode,
} from "@/domain/wire";
import { DIMENSION_MAP } from "@/lib/dimensions";

export class RequestError extends Error {}

const ROLES: Role[] = ["concept", "motif", "visual", "note"];

function fail(msg: string): never {
  throw new RequestError(msg);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function int(v: unknown, name: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) fail(`${name} must be a whole number from ${min} to ${max}.`);
  return v;
}

function node(v: unknown, name: string): WireNode {
  if (!isObj(v)) fail(`${name} is missing.`);
  if (typeof v.id !== "string" || typeof v.title !== "string") fail(`${name} needs an id and a title.`);
  if (!ROLES.includes(v.role as Role)) fail(`${name} has an unknown role.`);
  if (v.imageDataUrl !== undefined && (typeof v.imageDataUrl !== "string" || !v.imageDataUrl.startsWith("data:image/"))) {
    fail(`${name} has an image that isn't an image data URL.`);
  }
  return v as unknown as WireNode;
}

function nodes(v: unknown, name: string): WireNode[] {
  if (!Array.isArray(v)) fail(`${name} must be a list.`);
  return v.map((n, i) => node(n, `${name}[${i}]`));
}

function meta(b: Record<string, unknown>) {
  if (typeof b.runId !== "string" || !b.runId) fail("runId is missing.");
  if (typeof b.brief !== "string") fail("brief must be text.");
  if (b.instructions !== undefined && typeof b.instructions !== "string") fail("instructions must be text.");
}

function expand(b: Record<string, unknown>): ExpandRequest {
  meta(b);
  const inputs = nodes(b.inputs, "inputs");
  if (!isObj(b.counts)) fail("counts is missing.");
  const concepts = int(b.counts.concepts, "counts.concepts", 0, MAX_COUNT);
  const motifs = int(b.counts.motifs, "counts.motifs", 0, MAX_COUNT);
  if (concepts + motifs === 0) fail("Ask for at least one concept or motif.");
  if (inputs.length === 0 && !(b.brief as string).trim()) fail("Write a brief or select something to expand.");
  return b as unknown as ExpandRequest;
}

function visualVariations(b: Record<string, unknown>): VisualVariationRequest {
  meta(b);
  const base = node(b.base, "base");
  if (!base.imageDataUrl) fail("The design to vary needs an image.");
  nodes(b.context, "context");
  if (typeof b.dimensionId !== "string" || !DIMENSION_MAP[b.dimensionId]) fail("Unknown dimension.");
  return b as unknown as VisualVariationRequest;
}

function conceptualVariations(b: Record<string, unknown>): ConceptualVariationRequest {
  meta(b);
  const idea = node(b.idea, "idea");
  if (idea.role !== "concept" && idea.role !== "motif") fail("Only concepts and motifs can be visualized.");
  if (b.base !== undefined && !node(b.base, "base").imageDataUrl) fail("The base needs an image.");
  nodes(b.context, "context");
  const of = int(b.of, "of", 1, MAX_IMAGES_PER_IDEA);
  int(b.variant, "variant", 1, of);
  return b as unknown as ConceptualVariationRequest;
}

const validators: { [A in ActionType]: (b: Record<string, unknown>) => ActionRequest<A> } = {
  expand,
  visual_variations: visualVariations,
  conceptual_variations: conceptualVariations,
};

export function isActionType(id: string): id is ActionType {
  return id in validators;
}

export function validateRequest<A extends ActionType>(action: A, body: unknown): ActionRequest<A> {
  if (!isObj(body)) fail("The request body must be a JSON object.");
  return validators[action](body) as ActionRequest<A>;
}
