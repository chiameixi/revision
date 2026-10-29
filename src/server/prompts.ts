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
  WireLink,
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

export function describeLink(l: WireLink): string {
  return `"${l.from.title}" (${l.from.role}) ↔ "${l.to.title}" (${l.to.role})${l.label?.trim() ? ` — the designer sees them as connected by: ${l.label.trim()}` : ""}`;
}

function linksSection(links: WireLink[] = []): string {
  if (!links.length) return "";
  return `\nConnections to explore (the designer drew these between two ideas):\n${links.map((l, i) => `${i + 1}. ${describeLink(l)}`).join("\n")}
For these, generate ideas that sit between the two ends — what links them, what combining them would mean, what a third idea bridging them could be — rather than ideas about either end alone.\n`;
}

// Asked only when images are sent, so outputs can point back to where they came from.
function regionFields(imageCount: number): string {
  return `
- sourceImage (optional: the number of the image this comes from, 1 to ${imageCount}, if it comes mainly from one image)
- box (optional: [ymin, xmin, ymax, xmax] on a 0–1000 scale around the part of that image it comes from; leave it out if it's about the whole image)`;
}

export function buildExpandPrompt(
  req: ExpandRequest,
  system: { unpackBrief: string; analyze: string },
): BuiltPrompt {
  const withImages = req.inputs.filter((n) => n.imageDataUrl);
  const hasImages = withImages.length > 0;
  const { concepts, motifs } = req.counts;
  const regions = hasImages ? regionFields(withImages.length) : "";

  const intro = hasImages
    ? `${system.analyze} Examine the provided images to extract both concept-level interpretations and visual motifs.\n\nYou are looking at ${withImages.length} image(s), in this order: ${withImages.map((n, i) => `${i + 1}. "${n.title}"`).join(", ")}.`
    : system.unpackBrief;

  const asks: string[] = [];
  if (concepts > 0) {
    asks.push(`"concepts": ${hasImages
      ? "abstract concept directions expressed or implied by these images — not descriptions of what you see, but the underlying ideas, tensions, and meanings"
      : "abstract concept directions — core design tensions, underlying values, emotional registers, and meaningful ambiguities"}. Each concept has:
- ${TITLE_RULE}
- description (1–2 sentences: the abstract design intention — its meaning, tension, or emotional register — not a prescription for colors, shapes, or layouts)
- rationale (1–2 sentences: why this conceptual direction is worth pursuing)${regions}
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
- category (one of: color, texture, form, composition, subject, style, typography)${regions}
${motifs === 1
  ? "Generate exactly 1 motif."
  : `Generate exactly ${motifs} distinct motifs covering different visual dimensions.`}`);
  }

  const prompt = `${intro}

Design brief: ${req.brief || "(none provided)"}
${contextSections(req.inputs)}${linksSection(req.links)}${instructionsLine(req.instructions)}
Return a JSON object with ${asks.length === 2 ? "two arrays" : "one array"}:

${asks.join("\n\n")}`;

  return { prompt, images: images(withImages) };
}

export function expandSchema(counts: ExpandRequest["counts"], withRegions = false) {
  const regionProps = withRegions
    ? { sourceImage: { type: Type.INTEGER }, box: { type: Type.ARRAY, items: { type: Type.NUMBER } } }
    : {};
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  if (counts.concepts > 0) {
    required.push("concepts");
    properties.concepts = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["title", "description", "rationale"],
        properties: { title: { type: Type.STRING }, description: { type: Type.STRING }, rationale: { type: Type.STRING }, ...regionProps },
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
          ...regionProps,
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

function ideaLines(n: WireNode): string[] {
  const d = n.details ?? {};
  const lines = n.role === "motif"
    ? [`Motif: "${n.title}"`, n.body && `Visual quality: ${n.body}`, d.howItConveysIdea && `How it conveys the idea: ${d.howItConveysIdea}`]
    : n.role === "concept"
    ? [`Concept: "${n.title}"`, n.body && `Description: ${n.body}`, d.rationale && `Rationale: ${d.rationale}`]
    : [`${n.role === "visual" ? "Visual" : "Note"}: "${n.title}"`, n.body];
  return lines.filter((l): l is string => !!l);
}

// Renders one idea, or a link as "one end expressed through the other".
export function buildConceptualVariationPrompt(req: ConceptualVariationRequest, basePrompt: string): BuiltPrompt {
  const { idea, link, base } = req;
  const subject = idea
    ? ideaLines(idea).join("\n")
    : `Connection to express: ${describeLink(link!)}

${ideaLines(link!.from).join("\n")}

${ideaLines(link!.to).join("\n")}

Make one image where "${link!.from.title}" is expressed through "${link!.to.title}": both should be present, and the connection between them should be the point of the image.`;
  const kind = idea ? (idea.role === "motif" ? "motif" : "concept") : "connection";
  const own = idea ? [idea] : [link!.from, link!.to];

  const sent: string[] = [];
  const notes: string[] = [];
  if (base?.imageDataUrl) {
    sent.push(base.imageDataUrl);
    notes.push(`Image ${sent.length} is the base design: keep its medium and overall style, and re-imagine it to express this ${kind}.`);
  }
  for (const n of own) {
    if (!n.imageDataUrl) continue;
    sent.push(n.imageDataUrl);
    notes.push(`Image ${sent.length} is how "${n.title}" was captured; use it as a reference for what it means.`);
  }
  const refs = images(req.context);
  if (refs.length) {
    sent.push(...refs);
    notes.push(`The remaining ${refs.length} image(s) are style references.`);
  }

  const prompt = `${basePrompt}

${subject}

Overall design brief: ${req.brief || "(none provided)"}
${contextSections(req.context)}${notes.length ? `\n${notes.join("\n")}\n` : ""}${
  req.of > 1 ? `\nThis is interpretation ${req.variant} of ${req.of}. ${APPROACHES[(req.variant - 1) % APPROACHES.length]}\n` : ""}${instructionsLine(req.instructions)}
You MUST output the image — generating the image is required, not optional.`;
  return { prompt, images: sent };
}
