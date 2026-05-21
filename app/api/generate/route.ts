import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { getGeminiClient } from "@/lib/gemini/client";
import { getPrompt } from "@/lib/prompts";
import { DIMENSION_MAP, DIMENSIONS } from "@/lib/dimensions";
import { BatchLogger, nowIso, scrubBase64 } from "@/lib/logger";
import type {
  ActionType,
  ConceptCardRef,
  GenerateRequest,
  GenerateResponse,
  InsightCard,
  VisualVariationCard,
  ConceptualVariationCard,
  ConceptCard,
  ResultCard,
} from "@/types";

export const maxDuration = 300;

// ─── helpers ────────────────────────────────────────────────────────────────

function parseDataUrl(dataUrl: string): { data: string; mimeType: string } {
  const comma = dataUrl.indexOf(",");
  const header = dataUrl.substring(0, comma);
  const data = dataUrl.substring(comma + 1);
  const mimeType = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
  return { data, mimeType };
}

function buildHighlightContext(summaries: string[]): string {
  if (!summaries.length) return "";
  return `\nSaved ideas to consider:\n${summaries.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n`;
}

function buildUserInstructions(instructions: string): string {
  if (!instructions.trim()) return "";
  return `\nAdditional instructions: ${instructions.trim()}\n`;
}

// ─── JSON mode generator ─────────────────────────────────────────────────────

const JSON_MODEL = "gemini-2.5-flash";

async function generateJson<T>(
  promptText: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any,
  imageDataUrls: string[] = []
): Promise<{ result: T; rawText: string }> {
  const client = getGeminiClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = [{ text: promptText }];
  for (const url of imageDataUrls) {
    const { data, mimeType } = parseDataUrl(url);
    parts.push({ inlineData: { mimeType, data } });
  }

  const response = await client.models.generateContent({
    model: JSON_MODEL,
    contents: [{ role: "user", parts }],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: schema,
    },
  });

  const rawText = response.text ?? "";
  if (!rawText) throw new Error("Empty response from model.");
  return { result: JSON.parse(rawText) as T, rawText };
}

// ─── Image output generator (direct REST — SDK doesn't expose responseModalities) ──

const IMAGE_MODEL = "gemini-2.5-flash-image";

type ImageOutputResult = {
  text: string | null;
  imageData: string | null;
  imageMimeType: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawResponse: any;
};

/** Call Gemini with image output. imageDataUrl is optional — omit for text-only input. */
async function generateImageOutput(
  promptText: string,
  imageDataUrl?: string
): Promise<ImageOutputResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = [{ text: promptText }];
  if (imageDataUrl) {
    const { data, mimeType } = parseDataUrl(imageDataUrl);
    parts.push({ inlineData: { mimeType, data } });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(IMAGE_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const payload = {
    contents: [{ role: "user", parts }],
    generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(180_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${body}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawResponse: any = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const responseParts: any[] = rawResponse?.candidates?.[0]?.content?.parts ?? [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const textPart = responseParts.find((p: any) => p.text != null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imgPart = responseParts.find((p: any) => p.inlineData != null);

  return {
    text: textPart?.text ?? null,
    imageData: imgPart?.inlineData?.data ?? null,
    imageMimeType: imgPart?.inlineData?.mimeType ?? "image/png",
    rawResponse,
  };
}

// Keep the old name as an alias used by visual variations handler below
const generateWithImageOutput = (prompt: string, url: string) => generateImageOutput(prompt, url);

// ─── Action handlers ─────────────────────────────────────────────────────────

const insightSchema = {
  type: Type.OBJECT,
  required: ["insights"],
  properties: {
    insights: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["title", "summary", "evidence", "implication"],
        properties: {
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
          evidence: { type: Type.STRING },
          implication: { type: Type.STRING },
        },
      },
    },
  },
};

async function handleUnpackBrief(req: GenerateRequest, log: BatchLogger): Promise<InsightCard[]> {
  const prompt = `${getPrompt("UNPACK_BRIEF")}

Design Brief:
${req.brief || "(none provided)"}
${buildHighlightContext(req.highlightSummaries)}${buildUserInstructions(req.userInstructions)}
Return a JSON object with an "insights" array. Each insight has: title (3–6 words), summary (1–2 sentences), evidence (what in the brief suggests this), implication (what this means for the design direction).

Generate 5–8 insights covering: design goals, constraints, tensions or ambiguities, promising design dimensions to explore, and distinct idea directions.`;

  log.write("request.json", { model: JSON_MODEL, imageCount: 0, prompt });

  const startedAt = nowIso();
  const { result: data, rawText } = await generateJson<{
    insights: Omit<InsightCard, "id" | "type" | "createdAt">[];
  }>(prompt, insightSchema);
  const endedAt = nowIso();

  log.write("response.json", { rawText });

  const cards = (data.insights ?? []).map((item) => ({
    id: crypto.randomUUID(),
    type: "insight" as const,
    createdAt: new Date().toISOString(),
    ...item,
  }));

  log.write("result.json", cards);
  log.write("timing.json", { startedAt, endedAt, durationSeconds: msDiff(startedAt, endedAt) });
  return cards;
}

async function handleAnalyzeDraft(req: GenerateRequest, log: BatchLogger): Promise<InsightCard[]> {
  if (!req.draftDataUrls.length) throw new Error("No draft images provided.");

  const prompt = `${getPrompt("ANALYZE_DRAFT")}

Design Context:
${req.brief || "(none provided)"}
${buildHighlightContext(req.highlightSummaries)}${buildUserInstructions(req.userInstructions)}
Examine the draft carefully. Return a JSON object with an "insights" array. Each insight has: title (3–6 words), summary (1–2 sentences), evidence (specific visual observations — what you actually see), implication (what this means for the design direction).

Generate 5–8 insights covering: what the draft does well, missing opportunities, inferred design priorities, weaknesses or blind spots, and next directions.`;

  log.write("request.json", { model: JSON_MODEL, imageCount: req.draftDataUrls.length, prompt });

  const startedAt = nowIso();
  const { result: data, rawText } = await generateJson<{
    insights: Omit<InsightCard, "id" | "type" | "createdAt">[];
  }>(prompt, insightSchema, req.draftDataUrls);
  const endedAt = nowIso();

  log.write("response.json", { rawText });

  const cards = (data.insights ?? []).map((item) => ({
    id: crypto.randomUUID(),
    type: "insight" as const,
    createdAt: new Date().toISOString(),
    ...item,
  }));

  log.write("result.json", cards);
  log.write("timing.json", { startedAt, endedAt, durationSeconds: msDiff(startedAt, endedAt) });
  return cards;
}

async function handleAnalyzeReferences(req: GenerateRequest, log: BatchLogger): Promise<InsightCard[]> {
  if (!req.referenceDataUrls.length) throw new Error("No reference images provided.");

  const prompt = `${getPrompt("ANALYZE_REFERENCES")}

Design Context:
${req.brief || "(none provided)"}
${buildHighlightContext(req.highlightSummaries)}${buildUserInstructions(req.userInstructions)}
Return a JSON object with an "insights" array. Each insight has: title (3–6 words), summary (1–2 sentences), evidence (specific observations from the references), implication (how this could be applied to the design).

Generate 5–8 insights covering: reusable patterns, noteworthy layout or interaction ideas, stylistic cues, what seems worth borrowing, and what may be risky to overcopy.`;

  log.write("request.json", { model: JSON_MODEL, imageCount: req.referenceDataUrls.length, prompt });

  const startedAt = nowIso();
  const { result: data, rawText } = await generateJson<{
    insights: Omit<InsightCard, "id" | "type" | "createdAt">[];
  }>(prompt, insightSchema, req.referenceDataUrls);
  const endedAt = nowIso();

  log.write("response.json", { rawText });

  const cards = (data.insights ?? []).map((item) => ({
    id: crypto.randomUUID(),
    type: "insight" as const,
    createdAt: new Date().toISOString(),
    ...item,
  }));

  log.write("result.json", cards);
  log.write("timing.json", { startedAt, endedAt, durationSeconds: msDiff(startedAt, endedAt) });
  return cards;
}

async function handleVisualVariations(req: GenerateRequest, log: BatchLogger): Promise<VisualVariationCard[]> {
  if (!req.draftDataUrls.length) throw new Error("No draft image provided for visual variations.");

  const basePrompt = getPrompt("VISUAL_VARIATIONS").replace("[A CONCEPT]", req.brief || "this design");
  const imageDataUrl = req.draftDataUrls[0];

  const dimensionIds = req.dimensionIds.length > 0 ? req.dimensionIds : DIMENSIONS.map((d) => d.id);
  const targetDimensions = dimensionIds.map((id) => DIMENSION_MAP[id]).filter(Boolean);
  const extraContext = `${buildHighlightContext(req.highlightSummaries)}${buildUserInstructions(req.userInstructions)}`;

  // Log overall batch metadata
  log.write("batch.json", {
    model: IMAGE_MODEL,
    dimensionIds,
    imageCount: 1,
    startedAt: nowIso(),
  });

  const batchStart = nowIso();

  // Fire all dimension calls in parallel — each gets its own subdirectory
  const results = await Promise.allSettled(
    targetDimensions.map(async (dim) => {
      const dimDir = log.subdir(dim.id);

      const prompt = `${basePrompt}

---

Focus specifically on the **${dim.label}** dimension: ${dim.summary}.${extraContext}
Analyze the attached design image on this specific Arnheim dimension. Then generate a 5x3 panel of visual variations that deliberately strengthens the ${dim.label} dimension. The improvement should be immediately apparent when comparing to the original.

Provide your analysis first (2–3 sentences), then the variation panel image.`;

      // request.json (no base64 — keep it readable)
      writeJsonRelative(dimDir, "request.json", {
        dimensionId: dim.id,
        dimensionLabel: dim.label,
        model: IMAGE_MODEL,
        prompt,
      });

      const startedAt = nowIso();
      let rawResponse: unknown = null;
      let genResult: Awaited<ReturnType<typeof generateWithImageOutput>> | null = null;

      try {
        genResult = await generateWithImageOutput(prompt, imageDataUrl);
        rawResponse = genResult.rawResponse;
      } catch (err) {
        const endedAt = nowIso();
        writeJsonRelative(dimDir, "error.json", { error: String(err) });
        writeJsonRelative(dimDir, "timing.json", {
          startedAt,
          endedAt,
          durationSeconds: msDiff(startedAt, endedAt),
          status: "error",
        });
        throw err;
      }

      const endedAt = nowIso();

      // response_raw.json — base64 scrubbed, image saved separately
      writeJsonRelative(dimDir, "response_raw.json", scrubBase64(rawResponse));

      // Save generated image as actual file
      if (genResult.imageData) {
        const ext = genResult.imageMimeType.includes("png") ? ".png" : ".jpg";
        writeImageRelative(dimDir, `output${ext}`, genResult.imageData);
      }

      const card: VisualVariationCard = {
        id: crypto.randomUUID(),
        type: "visual_variation",
        title: `${dim.label} Variation`,
        dimensionId: dim.id,
        dimensionLabel: dim.label,
        analysisText: genResult.text ?? "",
        imageDataUrl: genResult.imageData
          ? `data:${genResult.imageMimeType};base64,${genResult.imageData}`
          : undefined,
        imageMimeType: genResult.imageMimeType,
        createdAt: new Date().toISOString(),
      };

      writeJsonRelative(dimDir, "result.json", {
        dimensionId: card.dimensionId,
        dimensionLabel: card.dimensionLabel,
        analysisText: card.analysisText,
        hasImage: !!genResult.imageData,
      });
      writeJsonRelative(dimDir, "timing.json", {
        startedAt,
        endedAt,
        durationSeconds: msDiff(startedAt, endedAt),
        status: "ok",
      });

      return card;
    })
  );

  const batchEnd = nowIso();
  const cards: VisualVariationCard[] = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    const dim = targetDimensions[i];
    return {
      id: crypto.randomUUID(),
      type: "visual_variation" as const,
      title: `${dim.label} Variation`,
      dimensionId: dim.id,
      dimensionLabel: dim.label,
      analysisText: "",
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      createdAt: new Date().toISOString(),
    };
  });

  log.write("batch_summary.json", {
    startedAt: batchStart,
    finishedAt: batchEnd,
    totalDurationSeconds: msDiff(batchStart, batchEnd),
    succeeded: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
  });

  return cards;
}

const conceptualSchema = {
  type: Type.OBJECT,
  required: ["variations"],
  properties: {
    variations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["title", "coreIdea", "howItDiffers", "whyItMayWork", "bestUseCase", "tradeoffs", "nextStep"],
        properties: {
          title: { type: Type.STRING },
          coreIdea: { type: Type.STRING },
          howItDiffers: { type: Type.STRING },
          whyItMayWork: { type: Type.STRING },
          bestUseCase: { type: Type.STRING },
          tradeoffs: { type: Type.STRING },
          nextStep: { type: Type.STRING },
        },
      },
    },
  },
};

async function handleConceptualVariations(req: GenerateRequest, log: BatchLogger): Promise<ConceptualVariationCard[]> {
  const basePrompt = getPrompt("CONCEPTUAL_VARIATIONS");
  const images = [...req.draftDataUrls, ...req.referenceDataUrls].slice(0, 4);

  const prompt = `${basePrompt}

Design context: ${req.brief || "(none provided)"}
${buildHighlightContext(req.highlightSummaries)}${buildUserInstructions(req.userInstructions)}
Return a JSON object with a "variations" array. Each variation has: title (3–6 words), coreIdea (1 sentence), howItDiffers (how this differs from the starting point), whyItMayWork (why this direction is promising), bestUseCase (when/for whom this works best), tradeoffs (potential downsides), nextStep (one concrete next action).

Generate 4–6 genuinely distinct conceptual variations — not just surface rewrites of the same concept.`;

  log.write("request.json", { model: JSON_MODEL, imageCount: images.length, prompt });

  const startedAt = nowIso();
  const { result: data, rawText } = await generateJson<{
    variations: Omit<ConceptualVariationCard, "id" | "type" | "createdAt">[];
  }>(prompt, conceptualSchema, images);
  const endedAt = nowIso();

  log.write("response.json", { rawText });

  const cards = (data.variations ?? []).map((item) => ({
    id: crypto.randomUUID(),
    type: "conceptual_variation" as const,
    createdAt: new Date().toISOString(),
    ...item,
  }));

  log.write("result.json", cards);
  log.write("timing.json", { startedAt, endedAt, durationSeconds: msDiff(startedAt, endedAt) });
  return cards;
}

const conceptSchema = {
  type: Type.OBJECT,
  required: ["concepts"],
  properties: {
    concepts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["title", "coreIdea", "interactionDirection", "visualDirection", "bestFor", "risks", "nextStep"],
        properties: {
          title: { type: Type.STRING },
          coreIdea: { type: Type.STRING },
          interactionDirection: { type: Type.STRING },
          visualDirection: { type: Type.STRING },
          bestFor: { type: Type.STRING },
          risks: { type: Type.STRING },
          nextStep: { type: Type.STRING },
        },
      },
    },
  },
};

async function handleSynthesize(req: GenerateRequest, log: BatchLogger): Promise<ConceptCard[]> {
  if (!req.highlightSummaries.length) throw new Error("No saved highlights to synthesize.");

  const prompt = `${getPrompt("SYNTHESIZE")}

Design Context:
${req.brief || "(none provided)"}

Saved Ideas:
${req.highlightSummaries.map((s, i) => `${i + 1}. ${s}`).join("\n\n")}
${buildUserInstructions(req.userInstructions)}
Return a JSON object with a "concepts" array. Each concept has: title (3–6 words), coreIdea (1–2 sentences), interactionDirection (key behavioral principles), visualDirection (key visual and aesthetic principles), bestFor (ideal use case or audience), risks (main risks or open questions), nextStep (one concrete next action).

Generate 3–5 distinct concept directions that synthesize and elevate the best threads from the saved ideas.`;

  log.write("request.json", { model: JSON_MODEL, imageCount: 0, prompt });

  const startedAt = nowIso();
  const { result: data, rawText } = await generateJson<{
    concepts: Omit<ConceptCard, "id" | "type" | "createdAt">[];
  }>(prompt, conceptSchema);
  const endedAt = nowIso();

  log.write("response.json", { rawText });

  const cards = (data.concepts ?? []).map((item) => ({
    id: crypto.randomUUID(),
    type: "concept" as const,
    createdAt: new Date().toISOString(),
    ...item,
  }));

  log.write("result.json", cards);
  log.write("timing.json", { startedAt, endedAt, durationSeconds: msDiff(startedAt, endedAt) });
  return cards;
}

// ─── utilities used inside visual variation subdirs ──────────────────────────

import fs from "fs";
import path from "path";

function writeJsonRelative(dir: string, name: string, data: unknown): void {
  fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2), "utf-8");
}

function writeImageRelative(dir: string, name: string, base64: string): void {
  fs.writeFileSync(path.join(dir, name), Buffer.from(base64, "base64"));
}

function msDiff(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 10) / 100;
}

async function handleGenerateConceptVisuals(req: GenerateRequest, log: BatchLogger): Promise<VisualVariationCard[]> {
  const cards: ConceptCardRef[] = req.conceptCards ?? [];
  if (!cards.length) throw new Error("No conceptual variations selected.");

  const imageDataUrl = req.draftDataUrls[0]; // optional reference for style
  const extraContext = buildUserInstructions(req.userInstructions);
  const batchStart = nowIso();

  log.write("batch.json", {
    model: IMAGE_MODEL,
    cardCount: cards.length,
    hasReferenceImage: !!imageDataUrl,
    startedAt: batchStart,
  });

  const results = await Promise.allSettled(
    cards.map(async (card) => {
      const safeName = card.title.slice(0, 30).replace(/\W+/g, "_");
      const cardDir = log.subdir(safeName);

      const prompt = `${getPrompt("GENERATE_CONCEPT_VISUALS")}

Conceptual variation: "${card.title}"
Core idea: ${card.coreIdea}
How it differs: ${card.howItDiffers}

Overall design context: ${req.brief || "(none provided)"}
${extraContext}
Generate a 2×2 panel of 4 distinct visuals. Each visual should use clearly different visual elements, but all should strongly express the core idea above.`;

      writeJsonRelative(cardDir, "request.json", {
        cardId: card.id,
        cardTitle: card.title,
        model: IMAGE_MODEL,
        hasReferenceImage: !!imageDataUrl,
        prompt,
      });

      const startedAt = nowIso();
      let genResult: ImageOutputResult;

      try {
        genResult = await generateImageOutput(prompt, imageDataUrl);
      } catch (err) {
        const endedAt = nowIso();
        writeJsonRelative(cardDir, "error.json", { error: String(err) });
        writeJsonRelative(cardDir, "timing.json", {
          startedAt, endedAt,
          durationSeconds: msDiff(startedAt, endedAt),
          status: "error",
        });
        throw err;
      }

      const endedAt = nowIso();
      writeJsonRelative(cardDir, "response_raw.json", scrubBase64(genResult.rawResponse));

      if (genResult.imageData) {
        const ext = genResult.imageMimeType.includes("png") ? ".png" : ".jpg";
        writeImageRelative(cardDir, `output${ext}`, genResult.imageData);
      }

      writeJsonRelative(cardDir, "result.json", {
        cardTitle: card.title,
        hasImage: !!genResult.imageData,
        analysisText: genResult.text,
      });
      writeJsonRelative(cardDir, "timing.json", {
        startedAt, endedAt,
        durationSeconds: msDiff(startedAt, endedAt),
        status: "ok",
      });

      return {
        id: crypto.randomUUID(),
        type: "visual_variation" as const,
        title: `${card.title} — Visuals`,
        dimensionId: "concept_visual",
        dimensionLabel: card.title,
        analysisText: genResult.text ?? card.coreIdea,
        imageDataUrl: genResult.imageData
          ? `data:${genResult.imageMimeType};base64,${genResult.imageData}`
          : undefined,
        imageMimeType: genResult.imageMimeType,
        createdAt: new Date().toISOString(),
      } satisfies VisualVariationCard;
    })
  );

  const batchEnd = nowIso();
  const output: VisualVariationCard[] = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    const card = cards[i];
    return {
      id: crypto.randomUUID(),
      type: "visual_variation" as const,
      title: `${card.title} — Visuals`,
      dimensionId: "concept_visual",
      dimensionLabel: card.title,
      analysisText: "",
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      createdAt: new Date().toISOString(),
    };
  });

  log.write("batch_summary.json", {
    startedAt: batchStart,
    finishedAt: batchEnd,
    totalDurationSeconds: msDiff(batchStart, batchEnd),
    succeeded: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
  });

  return output;
}

// ─── Route handler ────────────────────────────────────────────────────────────

const handlers: Record<ActionType, (req: GenerateRequest, log: BatchLogger) => Promise<ResultCard[]>> = {
  unpack_brief: handleUnpackBrief,
  analyze_draft: handleAnalyzeDraft,
  analyze_references: handleAnalyzeReferences,
  visual_variations: handleVisualVariations,
  conceptual_variations: handleConceptualVariations,
  generate_concept_visuals: handleGenerateConceptVisuals,
  synthesize: handleSynthesize,
};

export async function POST(request: NextRequest): Promise<NextResponse<GenerateResponse>> {
  let body: GenerateRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ cards: [], error: "Invalid request body." }, { status: 400 });
  }

  const handler = handlers[body.action];
  if (!handler) {
    return NextResponse.json({ cards: [], error: `Unknown action: ${body.action}` }, { status: 400 });
  }

  const log = new BatchLogger(body.action, body.brief);

  try {
    const cards = await handler(body, log);
    log.finalize({ cardCount: cards.length });
    return NextResponse.json({ cards });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[generate] action=${body.action} error:`, message);
    log.finalize({ cardCount: 0, error: message });
    return NextResponse.json({ cards: [], error: message }, { status: 500 });
  }
}
