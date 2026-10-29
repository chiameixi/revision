import { describe, expect, it } from "vitest";
import { outputsFor, planRun, readableError, type Job } from "@/services/generate";
import type { IdeaNode } from "@/domain/types";
import type { ActionRequest } from "@/domain/wire";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

function n(id: string, role: IdeaNode["role"], extra: Partial<IdeaNode> = {}): IdeaNode {
  return { id, role, title: id, origin: { kind: "user" }, createdAt: "t", ...extra };
}

const img = n("img", "visual", { image: { imageId: "i1", mimeType: "image/png" } });
const img2 = n("img2", "visual", { image: { imageId: "i2", mimeType: "image/png" } });
const concept = n("Ebb", "concept", { body: "pulling back" });
const motif = n("Waves", "motif", { body: "curves" });
const note = n("note", "note", { body: "keep it blue" });
const images = { i1: PNG, i2: PNG };

function jobs(plan: ReturnType<typeof planRun>): Job[] {
  if (!plan.ok) throw new Error(plan.error);
  return plan.jobs;
}

describe("planRun: expand", () => {
  it("makes one job with every input and the default counts", () => {
    const [job] = jobs(planRun("expand", [concept, img], "Tides", images, "r1"));
    const req = job.req as ActionRequest<"expand">;
    expect(req.inputs.map((x) => x.id)).toEqual(["Ebb", "img"]);
    expect(req.inputs[1].imageDataUrl).toBe(PNG);
    expect(req.counts).toEqual({ concepts: 4, motifs: 4 });
    expect(job.parents).toEqual(["Ebb", "img"]);
  });

  it("runs on the brief alone", () => {
    expect(planRun("expand", [], "Tides", images, "r1").ok).toBe(true);
  });

  it("refuses with no brief and no selection, or with nothing to generate", () => {
    expect(planRun("expand", [], " ", images, "r1").ok).toBe(false);
    expect(planRun("expand", [concept], "b", images, "r1", { counts: { concepts: 0, motifs: 0 } }).ok).toBe(false);
  });
});

describe("planRun: visual variations", () => {
  it("varies the first image, once per dimension, with the rest as context", () => {
    const js = jobs(planRun("visual_variations", [concept, img, img2], "b", images, "r1", { dimensionIds: ["balance", "color"] }));
    expect(js.map((j) => (j.req as ActionRequest<"visual_variations">).dimensionId)).toEqual(["balance", "color"]);
    const req = js[0].req as ActionRequest<"visual_variations">;
    expect(req.base.id).toBe("img");
    expect(req.context.map((x) => x.id)).toEqual(["Ebb", "img2"]);
    expect(js[0].label).toBe("Balance variation");
  });

  it("needs an image and at least one dimension", () => {
    expect(planRun("visual_variations", [concept], "b", images, "r1").ok).toBe(false);
    expect(planRun("visual_variations", [img], "b", images, "r1", { dimensionIds: [] }).ok).toBe(false);
  });
});

describe("planRun: conceptual variations", () => {
  it("makes one job per idea per image, with the first other image as base", () => {
    const js = jobs(planRun("conceptual_variations", [concept, motif, img, note, img2], "b", images, "r1", { imagesPerIdea: 2 }));
    expect(js).toHaveLength(4);
    const reqs = js.map((j) => j.req as ActionRequest<"conceptual_variations">);
    expect(reqs.map((r) => `${r.idea.id} ${r.variant}/${r.of}`)).toEqual(["Ebb 1/2", "Ebb 2/2", "Waves 1/2", "Waves 2/2"]);
    expect(reqs[0].base?.id).toBe("img");
    expect(reqs[0].context.map((x) => x.id)).toEqual(["note", "img2"]);
    expect(js[0].parents).toEqual(["Ebb", "img"]);
  });

  it("works without a base image", () => {
    const [job] = jobs(planRun("conceptual_variations", [concept], "b", images, "r1"));
    expect((job.req as ActionRequest<"conceptual_variations">).base).toBeUndefined();
    expect(job.parents).toEqual(["Ebb"]);
  });

  it("needs a concept or motif", () => {
    expect(planRun("conceptual_variations", [img, note], "b", images, "r1").ok).toBe(false);
  });
});

describe("outputsFor", () => {
  it("turns expand results into concept and motif nodes connected to every input", () => {
    const [job] = jobs(planRun("expand", [concept, img], "b", images, "r1"));
    const out = outputsFor(job, {
      concepts: [{ title: "Undertow", description: "d", rationale: "r" }],
      motifs: [{ title: "Foam", visualQuality: "v", howItConveysIdea: "h", category: "texture" }],
    }, "r1");
    expect(out.nodes.map((x) => `${x.role}:${x.title}`)).toEqual(["concept:Undertow", "motif:Foam"]);
    expect(out.nodes[0]).toMatchObject({ body: "d", details: { rationale: "r" }, origin: { kind: "generated", action: "expand", runId: "r1" } });
    expect(out.edges.filter((e) => e.to === out.nodes[1].id).map((e) => e.from)).toEqual(["Ebb", "img"]);
    expect(out.images).toEqual([]);
  });

  it("stores a variation's image separately and records the dimension", () => {
    const [job] = jobs(planRun("visual_variations", [img], "b", images, "r1", { dimensionIds: ["balance"] }));
    const out = outputsFor(job, { imageDataUrl: PNG, text: "stronger balance" }, "r1");
    const node = out.nodes[0];
    expect(node).toMatchObject({ role: "visual", title: "Balance variation", body: "stronger balance", origin: { params: { dimensionId: "balance" } } });
    expect(node.image?.imageId).toBe(out.images[0].imageId);
    expect(out.images[0].dataUrl).toBe(PNG);
  });

  it("connects a conceptual variation only to its idea and base", () => {
    const [job] = jobs(planRun("conceptual_variations", [concept, motif, img], "b", images, "r1"));
    const out = outputsFor(job, { imageDataUrl: PNG, text: "" }, "r1");
    expect(out.nodes[0]).toMatchObject({ role: "visual", title: "Ebb" });
    expect(out.nodes[0].body).toBeUndefined();
    expect(out.edges.map((e) => e.from)).toEqual(["Ebb", "img"]);
  });
});

describe("readableError", () => {
  it("pulls the message out of a provider's JSON error, even with a prefix", () => {
    const raw = `Gemini API error (400): ${JSON.stringify({ error: { code: 400, message: "API key not valid." } })}`;
    expect(readableError(raw)).toBe("API key not valid.");
  });

  it("leaves plain messages alone and shortens long ones", () => {
    expect(readableError("Network error")).toBe("Network error");
    expect(readableError("x".repeat(300))).toHaveLength(198);
  });
});
