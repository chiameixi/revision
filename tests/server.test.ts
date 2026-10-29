import { describe, expect, it } from "vitest";
import {
  buildConceptualVariationPrompt,
  buildExpandPrompt,
  buildVisualVariationPrompt,
  contextSections,
  expandSchema,
} from "@/server/prompts";
import { RequestError, isActionType, validateRequest } from "@/server/validate";
import type { WireNode } from "@/domain/wire";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const SYSTEM = { unpackBrief: "UNPACK-SYSTEM", analyze: "ANALYZE-SYSTEM" };

const concept: WireNode = { id: "c", role: "concept", title: "Ebb", body: "pulling back", details: { rationale: "tension" } };
const motif: WireNode = { id: "m", role: "motif", title: "Waves", body: "curves", details: { howItConveysIdea: "rhythm" } };
const image: WireNode = { id: "i", role: "visual", title: "draft.png", imageDataUrl: PNG };
const note: WireNode = { id: "n", role: "note", title: "note", body: "keep it blue" };
const meta = { runId: "r1", brief: "A tide poster" };

describe("context sections", () => {
  it("groups inputs by role under labels that say what they're for", () => {
    const text = contextSections([note, concept, motif]);
    expect(text).toContain("Conceptual directions to build on:\n1. [concept] Ebb\nDescription: pulling back\nRationale: tension");
    expect(text).toContain("Visual language / motifs to maintain:\n1. [motif] Waves\nVisual quality: curves\nHow it conveys the idea: rhythm");
    expect(text).toContain("User notes:\n1. [note] note\nkeep it blue");
    expect(text.indexOf("Conceptual")).toBeLessThan(text.indexOf("User notes"));
  });

  it("is empty with no inputs", () => {
    expect(contextSections([])).toBe("");
  });
});

describe("expand prompt", () => {
  it("unpacks the brief when no images are selected, asking for exact counts", () => {
    const { prompt, images } = buildExpandPrompt({ ...meta, inputs: [concept], counts: { concepts: 3, motifs: 2 } }, SYSTEM);
    expect(prompt.startsWith("UNPACK-SYSTEM")).toBe(true);
    expect(prompt).toContain("Design brief: A tide poster");
    expect(prompt).toContain("Generate exactly 3 distinct concepts");
    expect(prompt).toContain("Generate exactly 2 distinct motifs");
    expect(prompt).toContain("could carry these ideas visually");
    expect(images).toEqual([]);
  });

  it("analyzes selected images and sends them in order", () => {
    const { prompt, images } = buildExpandPrompt({ ...meta, inputs: [image, concept], counts: { concepts: 1, motifs: 1 } }, SYSTEM);
    expect(prompt.startsWith("ANALYZE-SYSTEM")).toBe(true);
    expect(prompt).toContain(`1 image(s), in this order: 1. "draft.png"`);
    expect(prompt).toContain("Generate exactly 1 concept that names an idea, not a visual recipe.");
    expect(prompt).toContain("Generate exactly 1 motif.");
    expect(images).toEqual([PNG]);
  });

  it("leaves out a kind asked for zero times, in the prompt and the schema", () => {
    const req = { ...meta, inputs: [], counts: { concepts: 0, motifs: 5 } };
    const { prompt } = buildExpandPrompt(req, SYSTEM);
    expect(prompt).not.toContain('"concepts"');
    expect(prompt).toContain("one array");
    expect(expandSchema(req.counts).required).toEqual(["motifs"]);
  });

  it("adds the user's instructions", () => {
    const { prompt } = buildExpandPrompt({ ...meta, instructions: " more playful ", inputs: [], counts: { concepts: 1, motifs: 0 } }, SYSTEM);
    expect(prompt).toContain("Additional instructions: more playful");
  });
});

describe("visual variation prompt", () => {
  it("fills the concept into the Arnheim prompt and sends the base image first", () => {
    const { prompt, images } = buildVisualVariationPrompt(
      { ...meta, base: image, context: [concept, { ...image, id: "ref" }], dimensionId: "balance" },
      "Design for [A CONCEPT].",
      { label: "Balance", summary: "visual weight" },
    );
    expect(prompt.startsWith("Design for A tide poster.")).toBe(true);
    expect(prompt).toContain("Focus specifically on the **Balance** dimension: visual weight.");
    expect(prompt).toContain("The other 1 image(s) are style references");
    expect(images).toEqual([PNG, PNG]);
  });
});

describe("conceptual variation prompt", () => {
  it("describes a motif as a motif and says what each image is", () => {
    const { prompt, images } = buildConceptualVariationPrompt(
      { ...meta, idea: motif, base: image, context: [note], variant: 2, of: 2 },
      "BASE",
    );
    expect(prompt).toContain(`Motif: "Waves"\nVisual quality: curves\nHow it conveys the idea: rhythm`);
    expect(prompt).toContain("Image 1 is the base design");
    expect(prompt).toContain("This is interpretation 2 of 2. Take a less literal, more abstract approach.");
    expect(prompt).toContain("User notes:");
    expect(images).toEqual([PNG]);
  });

  it("says nothing about variants or images when there's one plain idea", () => {
    const { prompt, images } = buildConceptualVariationPrompt({ ...meta, idea: concept, context: [], variant: 1, of: 1 }, "BASE");
    expect(prompt).toContain(`Concept: "Ebb"\nDescription: pulling back\nRationale: tension`);
    expect(prompt).not.toContain("interpretation");
    expect(prompt).not.toContain("Image 1");
    expect(images).toEqual([]);
  });
});

describe("request validation", () => {
  const expandBody = { ...meta, inputs: [concept], counts: { concepts: 2, motifs: 0 } };

  it("knows the three actions", () => {
    expect(["expand", "visual_variations", "conceptual_variations"].every(isActionType)).toBe(true);
    expect(isActionType("analyze")).toBe(false);
  });

  it("accepts a well-formed request", () => {
    expect(validateRequest("expand", expandBody)).toEqual(expandBody);
  });

  it.each([
    ["no runId", { ...expandBody, runId: "" }],
    ["counts out of range", { ...expandBody, counts: { concepts: 11, motifs: 0 } }],
    ["nothing to generate", { ...expandBody, counts: { concepts: 0, motifs: 0 } }],
    ["no brief and no inputs", { ...expandBody, brief: " ", inputs: [] }],
    ["unknown role", { ...expandBody, inputs: [{ ...concept, role: "idea" }] }],
    ["image that isn't an image", { ...expandBody, inputs: [{ ...image, imageDataUrl: "http://x" }] }],
  ])("rejects expand with %s", (_name, body) => {
    expect(() => validateRequest("expand", body)).toThrow(RequestError);
  });

  it("rejects visual variations without a base image or with an unknown dimension", () => {
    const ok = { ...meta, base: image, context: [], dimensionId: "balance" };
    expect(() => validateRequest("visual_variations", ok)).not.toThrow();
    expect(() => validateRequest("visual_variations", { ...ok, base: concept })).toThrow(RequestError);
    expect(() => validateRequest("visual_variations", { ...ok, dimensionId: "smell" })).toThrow(RequestError);
  });

  it("rejects conceptual variations of a note, or a variant past the count", () => {
    const ok = { ...meta, idea: concept, context: [], variant: 1, of: 2 };
    expect(() => validateRequest("conceptual_variations", ok)).not.toThrow();
    expect(() => validateRequest("conceptual_variations", { ...ok, idea: note })).toThrow(RequestError);
    expect(() => validateRequest("conceptual_variations", { ...ok, variant: 3 })).toThrow(RequestError);
  });
});

describe("links and regions in prompts", () => {
  const link = { id: "e1", from: concept, to: motif, label: "both pull back" };

  it("asks expand for ideas between the two ends of a link", () => {
    const { prompt } = buildExpandPrompt({ ...meta, inputs: [concept, motif], links: [link], counts: { concepts: 2, motifs: 0 } }, SYSTEM);
    expect(prompt).toContain(`Connections to explore`);
    expect(prompt).toContain(`1. "Ebb" (concept) ↔ "Waves" (motif) — the designer sees them as connected by: both pull back`);
    expect(prompt).toContain("sit between the two ends");
  });

  it("asks where each idea came from only when images are sent", () => {
    const withImg = buildExpandPrompt({ ...meta, inputs: [image, image], counts: { concepts: 1, motifs: 1 } }, SYSTEM).prompt;
    expect(withImg).toContain("sourceImage (optional: the number of the image this comes from, 1 to 2");
    expect(withImg).toContain("box (optional: [ymin, xmin, ymax, xmax] on a 0–1000 scale");
    expect(buildExpandPrompt({ ...meta, inputs: [concept], counts: { concepts: 1, motifs: 1 } }, SYSTEM).prompt).not.toContain("sourceImage");
    const schema = expandSchema({ concepts: 1, motifs: 1 }, true) as { properties: Record<string, { items: { properties: Record<string, unknown>; required: string[] } }> };
    expect(Object.keys(schema.properties.motifs.items.properties)).toContain("box");
    expect(schema.properties.motifs.items.required).not.toContain("box");
  });

  it("renders a link as one end expressed through the other, with both ends' images", () => {
    const withImages = { ...link, from: { ...concept, imageDataUrl: PNG }, to: { ...motif, imageDataUrl: PNG } };
    const { prompt, images } = buildConceptualVariationPrompt({ ...meta, link: withImages, context: [], variant: 1, of: 1 }, "BASE");
    expect(prompt).toContain(`Make one image where "Ebb" is expressed through "Waves"`);
    expect(prompt).toContain(`Concept: "Ebb"`);
    expect(prompt).toContain(`Motif: "Waves"`);
    expect(prompt).toContain(`Image 1 is how "Ebb" was captured`);
    expect(images).toEqual([PNG, PNG]);
  });

  it("validates links and needs exactly one of idea or link", () => {
    const base = { ...meta, context: [], variant: 1, of: 1 };
    expect(() => validateRequest("conceptual_variations", { ...base, link })).not.toThrow();
    expect(() => validateRequest("conceptual_variations", { ...base, link, idea: concept })).toThrow(RequestError);
    expect(() => validateRequest("conceptual_variations", base)).toThrow(RequestError);
    expect(() => validateRequest("conceptual_variations", { ...base, link: { ...link, to: { id: "x" } } })).toThrow(RequestError);
    expect(() => validateRequest("expand", { ...meta, inputs: [], links: "nope", counts: { concepts: 1, motifs: 0 } })).toThrow(RequestError);
  });
});

describe("usage meter", () => {
  it("adds up calls and splits image from text output, counting thinking as output", async () => {
    const { UsageMeter } = await import("@/server/usage");
    const m = new UsageMeter("gemini-3-pro-image");
    m.record({ promptTokenCount: 100, candidatesTokenCount: 30 });                                   // a retry with text only
    m.record({ promptTokenCount: 100, candidatesTokenCount: 1150, thoughtsTokenCount: 20,
      candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 1120 }, { modality: "TEXT", tokenCount: 30 }] });
    m.record(undefined);                                                                          // no usage reported
    expect(m.usage).toEqual({ model: "gemini-3-pro-image", calls: 3, inputTokens: 200, outputTokens: 80, imageTokens: 1120 });
  });
});
