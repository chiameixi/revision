/**
 * src/server/prompts.ts
 *
 * Responsibility: Turns an action request into the prompt text, the images to
 * send, and (for text actions) the JSON schema. Pure: the named sections of
 * prompts.txt are passed in, so this file has no IO and is unit-tested.
 *
 * Context is split by role so each section tells the model what the input is
 * for: concepts are directions to build on, motifs are visual language to keep,
 * visuals are territory already explored, notes are the user's own words.
 */

import { Type } from "@google/genai";
import type { Role } from "@/domain/types";
import type {
  ConceptualVariationRequest,
  ExpandRequest,
  VisualVariationRequest,
  WireNode,
} from "@/domain/wire";

export interface BuiltPrompt {
  prompt: string;
  images: string[];   // data URLs, in the order the prompt refers to them
}

// ── Shared ────────────────────────────────────────────────────────────────────

export function describeNode(n: WireNode): string {
  const d = n.details ?? {};
  const lines = [`[${n.role}] ${n.title}`];
  switch (n.role) {
    case "concept":
      if (n.body) lines.push(`Description: ${n.body}`);
      if (d.rationale) lines.push(`Rationale: ${d.rationale}`);
      break;
    case "motif":
      if (n.body) lines.push(`Visual quality: ${n.body}`);
      if (d.howItConveysIdea) lines.push(`How it conveys the idea: ${d.howItConveysIdea}`);
      break;
    case "visual":
      if (n.body) lines.push(`Analysis: ${n.body}`);
      break;
    case "note":
      if (n.body) lines.push(n.body);
      break;
  }
  return lines.join("\n");
}

const SECTION_TITLE: Record<Role, string> = {
  concept: "Conceptual directions to build on",
  motif: "Visual language / motifs to maintain",
  visual: "Visuals already explored",
  note: "User notes",
};

export function contextSections(nodes: WireNode[]): string {
  const parts: string[] = [];
  for (const role of ["concept", "motif", "visual", "note"] as Role[]) {
    const items = nodes.filter((n) => n.role === role);
    if (items.length) parts.push(`${SECTION_TITLE[role]}:\n${items.map((n, i) => `${i + 1}. ${describeNode(n)}`).join("\n")}`);
  }
  return parts.length ? `\n${parts.join("\n\n")}\n` : "";
}

function instructionsLine(instructions?: string): string {
  return instructions?.trim() ? `\nAdditional instructions: ${instructions.trim()}\n` : "";
}

const images = (nodes: WireNode[]) => nodes.flatMap((n) => (n.imageDataUrl ? [n.imageDataUrl] : []));

// ── Expand ────────────────────────────────────────────────────────────────────

const TITLE_RULE = `title (2–5 words: plain, direct label for the idea — no poetic flourishes, no metaphors, no adjective stacking; e.g. "Controlled Uncertainty" not "Whispers of Elegant Tension")`;

export function buildExpandPrompt(
  req: ExpandRequest,
  system: { unpackBrief: string; analyze: string },
): BuiltPrompt {
  const withImages = req.inputs.filter((n) => n.imageDataUrl);
  const hasImages = withImages.length > 0;
  const { concepts, motifs } = req.counts;

  const intro = hasImages
    ? `${system.analyze} Examine the provided images to extract both concept-level interpretations and visual motifs.\n\nYou are looking at ${withImages.length} image(s), in this order: ${withImages.map((n) => `"${n.title}"`).join(", ")}.`
    : system.unpackBrief;

  const asks: string[] = [];
  if (concepts > 0) {
    asks.push(`"concepts": ${hasImages
      ? "abstract concept directions expressed or implied by these images — not descriptions of what you see, but the underlying ideas, tensions, and meanings"
      : "abstract concept directions — core design tensions, underlying values, emotional registers, and meaningful ambiguities"}. Each concept has:
- ${TITLE_RULE}
- description (1–2 sentences: the abstract design intention — its meaning, tension, or emotional register — not a prescription for colors, shapes, or layouts)
- rationale (1–2 sentences: why this conceptual direction is worth pursuing)
${concepts === 1
  ? "Generate exactly 1 concept that names an idea, not a visual recipe."
  : `Generate exactly ${concepts} distinct concepts that name ideas, not visual recipes.`}`);
  }
  if (motifs > 0) {
    asks.push(`"motifs": ${hasImages
      ? "reusable visual elements or qualities you observe in these images"
      : "reusable visual elements or qualities that could carry these ideas visually"}. Each motif has:
- title (2–5 words)
- visualQuality (1–2 sentences: what it looks like, how it manifests visually)
- howItConveysIdea (1–2 sentences: what concept, feeling, or meaning this quality communicates)
- category (one of: color, texture, form, composition, subject, style, typography)
${motifs === 1
  ? "Generate exactly 1 motif."
  : `Generate exactly ${motifs} distinct motifs covering different visual dimensions.`}`);
  }

  const prompt = `${intro}

Design brief: ${req.brief || "(none provided)"}
${contextSections(req.inputs)}${instructionsLine(req.instructions)}
Return a JSON object with ${asks.length === 2 ? "two arrays" : "one array"}:

${asks.join("\n\n")}`;

  return { prompt, images: images(withImages) };
}

export function expandSchema(counts: ExpandRequest["counts"]) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  if (counts.concepts > 0) {
    required.push("concepts");
    properties.concepts = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["title", "description", "rationale"],
        properties: { title: { type: Type.STRING }, description: { type: Type.STRING }, rationale: { type: Type.STRING } },
      },
    };
  }
  if (counts.motifs > 0) {
    required.push("motifs");
    properties.motifs = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["title", "visualQuality", "howItConveysIdea", "category"],
        properties: {
          title: { type: Type.STRING },
          visualQuality: { type: Type.STRING },
          howItConveysIdea: { type: Type.STRING },
          category: { type: Type.STRING },
        },
      },
    };
  }
  return { type: Type.OBJECT, required, properties };
}

// ── Visual variations ─────────────────────────────────────────────────────────

export function buildVisualVariationPrompt(
  req: VisualVariationRequest,
  basePrompt: string,
  dim: { label: string; summary: string },
): BuiltPrompt {
  const refs = images(req.context);
  const prompt = `${basePrompt.replace("[A CONCEPT]", req.brief || "this design")}

---

Focus specifically on the **${dim.label}** dimension: ${dim.summary}.${contextSections(req.context)}${instructionsLine(req.instructions)}${
  refs.length ? `\n(The first image is the design to vary. The other ${refs.length} image(s) are style references.)\n` : ""}
Generate a 5×3 image panel of visual variations that deliberately strengthen the **${dim.label}** dimension — the improvement should be immediately apparent compared to the original. You MUST output an image panel; it is required. Then provide a brief analysis (2–3 sentences) of how the ${dim.label} dimension was improved.`;
  return { prompt, images: [req.base.imageDataUrl!, ...refs] };
}

// ── Conceptual variations ─────────────────────────────────────────────────────

// Different directions for each image of the same idea, since the calls run in
// parallel and can't see each other.
export const APPROACHES = [
  "Take the most direct, legible approach.",
  "Take a less literal, more abstract approach.",
  "Use an unexpected metaphor, setting, or juxtaposition.",
  "Push the composition and medium somewhere bold.",
];

export function buildConceptualVariationPrompt(req: ConceptualVariationRequest, basePrompt: string): BuiltPrompt {
  const { idea, base } = req;
  const kind = idea.role === "motif" ? "motif" : "concept";
  const d = idea.details ?? {};
  const ideaLines = idea.role === "motif"
    ? [`Motif: "${idea.title}"`, idea.body && `Visual quality: ${idea.body}`, d.howItConveysIdea && `How it conveys the idea: ${d.howItConveysIdea}`]
    : [`Concept: "${idea.title}"`, idea.body && `Description: ${idea.body}`, d.rationale && `Rationale: ${d.rationale}`];

  const sent: string[] = [];
  const notes: string[] = [];
  if (base?.imageDataUrl) {
    sent.push(base.imageDataUrl);
    notes.push(`Image ${sent.length} is the base design: keep its medium and overall style, and re-imagine it to express this ${kind}.`);
  }
  if (idea.imageDataUrl) {
    sent.push(idea.imageDataUrl);
    notes.push(`Image ${sent.length} is how the ${kind} itself was captured; use it as a reference for what the ${kind} means.`);
  }
  const refs = images(req.context);
  if (refs.length) {
    sent.push(...refs);
    notes.push(`The remaining ${refs.length} image(s) are style references.`);
  }

  const prompt = `${basePrompt}

${ideaLines.filter(Boolean).join("\n")}

Overall design brief: ${req.brief || "(none provided)"}
${contextSections(req.context)}${notes.length ? `\n${notes.join("\n")}\n` : ""}${
  req.of > 1 ? `\nThis is interpretation ${req.variant} of ${req.of}. ${APPROACHES[(req.variant - 1) % APPROACHES.length]}\n` : ""}${instructionsLine(req.instructions)}
You MUST output the image — generating the image is required, not optional.`;
  return { prompt, images: sent };
}
