import { describe, expect, it } from "vitest";
import { outputsFor, planRun, readableError, toRegion, type Job, type Selection } from "@/services/generate";
import { BRIEF_ID, type IdeaNode } from "@/domain/types";
import type { ActionRequest } from "@/domain/wire";
import { DIMENSION_MAP, OFFERED_DIMENSIONS } from "@/lib/dimensions";

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

const sel = (nodes: IdeaNode[], links: Selection["links"] = []): Selection => ({ nodes, links });

function jobs(plan: ReturnType<typeof planRun>): Job[] {
  if (!plan.ok) throw new Error(plan.error);
  return plan.jobs;
}

describe("planRun: expand", () => {
  it("makes one job with every input and the default counts", () => {
    const [job] = jobs(planRun("expand", sel([concept, img]), "Tides", images, "r1"));
    const req = job.req as ActionRequest<"expand">;
    expect(req.inputs.map((x) => x.id)).toEqual(["Ebb", "img"]);
    expect(req.inputs[1].imageDataUrl).toBe(PNG);
    expect(req.counts).toEqual({ concepts: 4, motifs: 4 });
    expect(job.parents).toEqual(["Ebb", "img"]);
  });

  it("runs on the brief alone", () => {
    expect(planRun("expand", sel([]), "Tides", images, "r1").ok).toBe(true);
  });

  it("refuses with no brief and no selection, or with nothing to generate", () => {
    expect(planRun("expand", sel([]), " ", images, "r1").ok).toBe(false);
    expect(planRun("expand", sel([concept]), "b", images, "r1", { counts: { concepts: 0, motifs: 0 } }).ok).toBe(false);
  });
});

describe("planRun: visual variations", () => {
  it("varies the first image, once per dimension, with the rest as context", () => {
    const js = jobs(planRun("visual_variations", sel([concept, img, img2]), "b", images, "r1", { dimensionIds: ["balance", "color"] }));
    expect(js.map((j) => (j.req as ActionRequest<"visual_variations">).dimensionId)).toEqual(["balance", "color"]);
    const req = js[0].req as ActionRequest<"visual_variations">;
    expect(req.base.id).toBe("img");
    expect(req.context.map((x) => x.id)).toEqual(["Ebb", "img2"]);
    expect(js[0].label).toBe("Balance variation");
  });

  it("uses only the offered dimensions by default", () => {
    const js = jobs(planRun("visual_variations", sel([img]), "b", images, "r1"));
    expect(js.map((j) => (j.req as ActionRequest<"visual_variations">).dimensionId)).toEqual(["balance", "shape", "light", "color", "dynamics"]);
  });

  it("keeps the labels of hidden dimensions, for nodes already made with them", () => {
    expect(DIMENSION_MAP.form).toMatchObject({ label: "Form", hidden: true });
    expect(OFFERED_DIMENSIONS.map((d) => d.id)).not.toContain("form");
  });

  it("needs an image and at least one dimension", () => {
    expect(planRun("visual_variations", sel([concept]), "b", images, "r1").ok).toBe(false);
    expect(planRun("visual_variations", sel([img]), "b", images, "r1", { dimensionIds: [] }).ok).toBe(false);
  });
});

describe("planRun: conceptual variations", () => {
  it("makes one job per idea per image, with the first other image as base", () => {
    const js = jobs(planRun("conceptual_variations", sel([concept, motif, img, note, img2]), "b", images, "r1", { imagesPerIdea: 2 }));
    expect(js).toHaveLength(4);
    const reqs = js.map((j) => j.req as ActionRequest<"conceptual_variations">);
    expect(reqs.map((r) => `${r.idea?.id} ${r.variant}/${r.of}`)).toEqual(["Ebb 1/2", "Ebb 2/2", "Waves 1/2", "Waves 2/2"]);
    expect(reqs[0].base?.id).toBe("img");
    expect(reqs[0].context.map((x) => x.id)).toEqual(["note", "img2"]);
    expect(js[0].parents).toEqual(["Ebb", "img"]);
  });

  it("works without a base image", () => {
    const [job] = jobs(planRun("conceptual_variations", sel([concept]), "b", images, "r1"));
    expect((job.req as ActionRequest<"conceptual_variations">).base).toBeUndefined();
    expect(job.parents).toEqual(["Ebb"]);
  });

  it("needs a concept or motif", () => {
    expect(planRun("conceptual_variations", sel([img, note]), "b", images, "r1").ok).toBe(false);
  });
});

describe("outputsFor", () => {
  it("turns expand results into concept and motif nodes connected to every input", () => {
    const [job] = jobs(planRun("expand", sel([concept, img]), "b", images, "r1"));
    const out = outputsFor(job, {
      concepts: [{ title: "Undertow", description: "d", rationale: "r" }],
      motifs: [{ title: "Foam", visualQuality: "v", howItConveysIdea: "h", category: "texture" }],
    }, "r1");
    expect(out.nodes.map((x) => `${x.role}:${x.title}`)).toEqual(["concept:Undertow", "motif:Foam"]);
    expect(out.nodes[0]).toMatchObject({ body: "d", details: { rationale: "r" }, origin: { kind: "generated", action: "expand", runId: "r1" } });
    expect(out.edges.filter((e) => e.to === out.nodes[1].id).map((e) => e.from)).toEqual(["Ebb", "img"]);
    expect(out.images).toEqual([]);
  });

  it("puts each input's relation on its edge, ignoring bad entries", () => {
    const [job] = jobs(planRun("expand", sel([concept, img]), "b", images, "r1"));
    const out = outputsFor(job, {
      concepts: [],
      motifs: [{ title: "Foam", visualQuality: "v", category: "texture", relations: [
        { input: 2, word: " froth ", explanation: " Churning. " },
        { input: 2, word: "second", explanation: "ignored" },
        { input: 9, word: "bad", explanation: "" },
        { input: 1, word: " ", explanation: "no word" },
      ] }],
    }, "r1");
    const rel = (from: string) => out.edges.find((e) => e.from === from)!.relation;
    expect(rel("img")).toEqual({ word: "froth", explanation: "Churning." });
    expect(rel("Ebb")).toBeUndefined();
    expect(out.edges.every((e) => e.kind === "derived_from")).toBe(true);
  });

  it("connects a brief-only expand's outputs to the brief", () => {
    const [job] = jobs(planRun("expand", sel([]), "Tides", images, "r1"));
    expect(job.parents).toEqual([BRIEF_ID]);
    const out = outputsFor(job, { concepts: [{ title: "A", description: "", rationale: "", relations: [{ input: 1, word: "tidal", explanation: "e" }] }], motifs: [] }, "r1");
    expect(out.edges.map((e) => [e.from, e.relation])).toEqual([[BRIEF_ID, { word: "tidal", explanation: "e" }]]);
  });

  it("stores a variation's image separately and records the dimension", () => {
    const [job] = jobs(planRun("visual_variations", sel([img]), "b", images, "r1", { dimensionIds: ["balance"] }));
    const out = outputsFor(job, { imageDataUrl: PNG, text: "stronger balance" }, "r1");
    const node = out.nodes[0];
    expect(node).toMatchObject({ role: "visual", title: "Balance variation", body: "stronger balance", origin: { params: { dimensionId: "balance" } } });
    expect(node.image?.imageId).toBe(out.images[0].imageId);
    expect(out.images[0].dataUrl).toBe(PNG);
  });

  it("connects a conceptual variation only to its idea and base", () => {
    const [job] = jobs(planRun("conceptual_variations", sel([concept, motif, img]), "b", images, "r1"));
    const out = outputsFor(job, { imageDataUrl: PNG, text: "" }, "r1");
    expect(out.nodes[0]).toMatchObject({ role: "visual", title: "Ebb, visualized" });
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

describe("links", () => {
  const link = { id: "e1", from: "Ebb", to: "Waves", kind: "link" as const, relation: { word: "both pull back" }, origin: { kind: "user" as const }, createdAt: "t" };
  const linkSel = { edge: link, from: concept, to: motif };

  it("expand sends the link itself, its ends as inputs, and records the link on outputs", () => {
    const [job] = jobs(planRun("expand", { nodes: [], links: [linkSel] }, "b", images, "r1"));
    const req = job.req as ActionRequest<"expand">;
    expect(req.inputs.map((x) => x.id)).toEqual(["Ebb", "Waves"]);
    expect(req.links).toEqual([{ id: "e1", from: expect.objectContaining({ id: "Ebb" }), to: expect.objectContaining({ id: "Waves" }), relation: { word: "both pull back" } }]);
    const out = outputsFor(job, { concepts: [{ title: "Retreat", description: "", rationale: "" }], motifs: [] }, "r1");
    expect(out.nodes[0].origin).toMatchObject({ params: { sourceEdgeId: "e1" } });
    expect(out.edges.map((e) => e.from)).toEqual(["Ebb", "Waves"]);
  });

  it("doesn't pick one link to credit when several are explored", () => {
    const other = { edge: { ...link, id: "e2" }, from: motif, to: concept };
    const [job] = jobs(planRun("expand", { nodes: [], links: [linkSel, other] }, "b", images, "r1"));
    expect(job.sourceEdgeId).toBeUndefined();
  });

  it("conceptual variations render a link as one image, connected to both ends", () => {
    const js = jobs(planRun("conceptual_variations", { nodes: [img], links: [linkSel] }, "b", images, "r1"));
    expect(js).toHaveLength(1);
    const req = js[0].req as ActionRequest<"conceptual_variations">;
    expect(req.idea).toBeUndefined();
    expect(req.link?.id).toBe("e1");
    expect(req.base?.id).toBe("img");
    expect(js[0].parents).toEqual(["Ebb", "Waves", "img"]);
    const out = outputsFor(js[0], { imageDataUrl: PNG, text: "" }, "r1");
    expect(out.nodes[0]).toMatchObject({ title: "Ebb through Waves", origin: { params: { sourceEdgeId: "e1" } } });
  });

  it("renders selected ideas and links side by side, but not a link's ends on their own", () => {
    const js = jobs(planRun("conceptual_variations", { nodes: [note], links: [linkSel] }, "b", images, "r1"));
    expect(js.map((j) => j.label)).toEqual([`"Ebb" through "Waves"`]);
  });
});

describe("regions", () => {
  it("keeps only real boxes on the 0–1000 scale", () => {
    expect(toRegion([100, 200, 300.4, 400])).toEqual({ box: [100, 200, 300, 400] });
    expect(toRegion([300, 200, 100, 400])).toBeUndefined();     // upside down
    expect(toRegion([0, 0, 1200, 500])).toBeUndefined();        // off the scale
    expect(toRegion([1, 2, 3])).toBeUndefined();
    expect(toRegion("whole")).toBeUndefined();
  });

  it("puts the region on the edge from the image the idea came from", () => {
    const [job] = jobs(planRun("expand", sel([concept, img, img2]), "b", images, "r1"));
    expect(job.imageNodeIds).toEqual(["img", "img2"]);
    const out = outputsFor(job, {
      concepts: [{ title: "A", description: "", rationale: "", sourceImage: 2, box: [10, 20, 30, 40] }],
      motifs: [{ title: "B", visualQuality: "", howItConveysIdea: "", category: "form", sourceImage: 1 }],
    }, "r1");
    const edgeTo = (title: string, from: string) => out.edges.find((e) => e.from === from && e.to === out.nodes.find((n) => n.title === title)!.id)!;
    expect(edgeTo("A", "img2").region).toEqual({ box: [10, 20, 30, 40] });
    expect(edgeTo("A", "img").region).toBeUndefined();
    expect(edgeTo("A", "Ebb").region).toBeUndefined();
    expect(edgeTo("B", "img").region).toBe("whole");
  });

  it("ignores an image number that doesn't exist", () => {
    const [job] = jobs(planRun("expand", sel([img]), "b", images, "r1"));
    const out = outputsFor(job, { concepts: [{ title: "A", description: "", rationale: "", sourceImage: 5, box: [1, 1, 2, 2] }], motifs: [] }, "r1");
    expect(out.edges.every((e) => e.region === undefined)).toBe(true);
  });
});
