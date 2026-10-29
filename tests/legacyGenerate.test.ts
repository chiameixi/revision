import { describe, expect, it } from "vitest";
import { buildLegacyRequest, legacyCardsToOutputs, readableError } from "@/services/legacyGenerate";
import type { IdeaNode } from "@/domain/types";
import type { ResultCard } from "@/types";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

function n(id: string, role: IdeaNode["role"], extra: Partial<IdeaNode> = {}): IdeaNode {
  return { id, role, title: id, origin: { kind: "user" }, createdAt: "t", ...extra };
}

const img = n("img", "visual", { image: { imageId: "i1", mimeType: "image/png" } });
const concept = n("Ebb", "concept", { body: "pulling back" });
const motif = n("Waves", "motif", { body: "curves", details: { howItConveysIdea: "rhythm" } });
const note = n("note", "note", { body: "keep it blue" });
const images = { i1: PNG };

describe("buildLegacyRequest", () => {
  it("expands text-only selections by unpacking the brief with them as context", () => {
    const r = buildLegacyRequest("expand", [concept, note], "Tides", images);
    expect(r.ok && r.body.action).toBe("unpack_brief");
    expect(r.ok && r.body.typedContext.concepts[0]).toContain("Ebb");
    expect(r.ok && r.body.typedContext.notes[0]).toContain("keep it blue");
  });

  it("expands selections with images by analyzing them", () => {
    const r = buildLegacyRequest("expand", [img, concept], "Tides", images);
    expect(r.ok && r.body.action).toBe("analyze");
    expect(r.ok && r.body.draftDataUrls).toEqual([PNG]);
  });

  it("refuses to expand with no brief and no selection", () => {
    expect(buildLegacyRequest("expand", [], "  ", images)).toEqual({ ok: false, error: expect.any(String) });
  });

  it("needs an image for visual variations", () => {
    expect(buildLegacyRequest("visual_variations", [concept], "b", images).ok).toBe(false);
    const r = buildLegacyRequest("visual_variations", [img, concept], "b", images, { dimensionIds: ["balance"] });
    expect(r.ok && r.body.dimensionIds).toEqual(["balance"]);
  });

  it("refuses visual variations with no dimensions chosen", () => {
    expect(buildLegacyRequest("visual_variations", [img], "b", images, { dimensionIds: [] }).ok).toBe(false);
  });

  it("renders each concept and motif in conceptual variations, using images as the base", () => {
    const r = buildLegacyRequest("conceptual_variations", [concept, motif, img, note], "b", images);
    expect(r.ok && r.body.conceptCards?.map((c) => c.title)).toEqual(["Ebb", "Waves"]);
    expect(r.ok && r.body.conceptCards?.[1].rationale).toBe("rhythm");
    expect(r.ok && r.body.draftDataUrls).toEqual([PNG]);
    expect(r.ok && r.body.typedContext.concepts).toEqual([]);
  });

  it("needs a concept or motif for conceptual variations", () => {
    expect(buildLegacyRequest("conceptual_variations", [img, note], "b", images).ok).toBe(false);
  });
});

describe("legacyCardsToOutputs", () => {
  const cards: ResultCard[] = [
    { id: "x", type: "concept", title: "New", description: "d", rationale: "r", createdAt: "t" },
    { id: "y", type: "visual", title: "Balance", dimensionLabel: "Balance", analysisText: "a", imageDataUrl: PNG, createdAt: "t" },
    { id: "z", type: "visual", title: "Shape", dimensionLabel: "Shape", analysisText: "", error: "timeout", createdAt: "t" },
  ];

  it("makes generated nodes with fresh IDs and provenance from every input", () => {
    const out = legacyCardsToOutputs(cards, "visual_variations", "r1", [img, concept]);
    expect(out.nodes).toHaveLength(2);
    expect(out.nodes[0]).toMatchObject({ role: "concept", body: "d", details: { rationale: "r" }, origin: { kind: "generated", runId: "r1" } });
    expect(out.nodes[0].id).not.toBe("x");
    expect(out.edges.filter((e) => e.to === out.nodes[0].id).map((e) => e.from)).toEqual(["img", "Ebb"]);
  });

  it("stores returned images separately and records the dimension", () => {
    const out = legacyCardsToOutputs(cards, "visual_variations", "r1", [img]);
    const visual = out.nodes[1];
    expect(visual.image?.imageId).toBe(out.images[0].imageId);
    expect(out.images[0].dataUrl).toBe(PNG);
    expect(visual.origin).toMatchObject({ params: { dimensionId: "balance" } });
  });

  it("reports failed outputs instead of making empty nodes", () => {
    const out = legacyCardsToOutputs(cards, "visual_variations", "r1", [img]);
    expect(out.failed).toEqual(["timeout"]);
  });

  it("connects each conceptual variation only to the idea it renders, plus the base image", () => {
    const rendered: ResultCard[] = [
      { id: "v", type: "visual", title: "Waves", dimensionLabel: "Waves", analysisText: "", imageDataUrl: PNG, createdAt: "t" },
    ];
    const out = legacyCardsToOutputs(rendered, "conceptual_variations", "r1", [concept, motif, img]);
    expect(out.edges.map((e) => e.from)).toEqual(["Waves", "img"]);
  });
});

describe("readableError", () => {
  it("pulls the message out of a provider's JSON error", () => {
    const raw = JSON.stringify({ error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" } });
    expect(readableError(raw)).toBe("API key not valid. Please pass a valid API key.");
  });

  it("leaves plain messages alone and shortens long ones", () => {
    expect(readableError("Network error")).toBe("Network error");
    expect(readableError("x".repeat(300))).toHaveLength(198);
  });
});
