/**
 * app/api/generate/route.ts
 *
 * Responsibility: Single POST endpoint for all six generation actions.
 *
 * Request: `GenerateRequest` (action, brief, userInstructions, draftDataUrls,
 * referenceDataUrls, highlightSummaries, dimensionIds, conceptCards?)
 * Response: `GenerateResponse` ({ cards, error? })
 *
 * Each action is handled by a dedicated async function:
 *   unpack_brief          → `handleUnpackBrief`  → ConceptCard[]
 *   analyze               → `handleAnalyze`       → MotifCard[]
 *   visual_variations     → `handleVisualVariations` → VisualCard[]  (parallel)
 *   conceptual_variations → `handleConceptualVariations` → VisualCard[]  (phase 1: JSON concepts; phase 2: parallel image)
 *   generate_concept_visuals → `handleGenerateConceptVisuals` → VisualCard[] (parallel)
 *   user_added            → no-op (returns [])
 *
 * Two Gemini call patterns are used:
 *
 * 1. JSON mode (`generateJson`): uses `@google/genai` SDK with
 *    `responseMimeType: "application/json"` and a `responseJsonSchema` to get
 *    structured output in a single call.  Model: `gemini-2.5-flash`.
 *
 * 2. Image output (`generateImageOutput`): uses a direct REST fetch because
 *    the `@google/genai` SDK does not cleanly expose `responseModalities`.
 *    Requests both TEXT and IMAGE modalities.  Model: `gemini-2.5-flash-image`.
 *    Visual variations and concept-visual generation both use this pattern with
 *    `Promise.allSettled` so one failing dimension does not abort the batch.
 *
 * Logging: every call writes JSON artefacts to `logs/<timestamp>/<action>/`
 * via `BatchLogger`.  Image bytes are also saved to disk for inspection.
 * `scrubBase64` removes raw base64 strings before writing response logs to
 * keep file sizes manageable.
 *
 * `maxDuration = 300` allows up to 5 minutes; needed for large parallel batches.
 */

import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { getGeminiClient } from "@/lib/gemini/client";
import { getPrompt } from "@/lib/prompts";
import { DIMENSION_MAP, DIMENSIONS } from "@/lib/dimensions";
import { BatchLogger, nowIso, scrubBase64 } from "@/lib/logger";
import type {
  ActionType,
  ConceptCard,
  ConceptCardRef,
  GenerateRequest,
  GenerateResponse,
  MotifCard,
  VisualCard,
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

// ─── Prompt logger ───────────────────────────────────────────────────────────

function logPrompt(label: string, model: string, prompt: string, imageCount = 0) {
  const border = "─".repeat(64);
  console.log(`\n┌${border}`);
  console.log(`│ GEMINI PROMPT  ${label}  model=${model}  images=${imageCount}`);
  console.log(`├${border}`);
  prompt.split("\n").forEach((line) => console.log(`│ ${line}`));
  console.log(`└${border}\n`);
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

// ─── Image output generator ────────────────────────────────────────────────────
// Uses direct REST rather than the SDK because `@google/genai` does not expose
// `responseModalities` in its typed config surface.

const IMAGE_MODEL = "gemini-2.5-flash-image";

type ImageOutputResult = {
  text: string | null;
  imageData: string | null;
  imageMimeType: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawResponse: any;
};

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

const generateWithImageOutput = (prompt: string, url: string) => generateImageOutput(prompt, url);

// ─── Schemas ──────────────────────────────────────────────────────────────────

// Shared by unpack_brief and conceptual_variations
const conceptSchema = {
  type: Type.OBJECT,
  required: ["concepts"],
  properties: {
    concepts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["title", "description", "rationale"],
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          rationale: { type: Type.STRING },
        },
      },
    },
  },
};

// Used by analyze
const motifSchema = {
  type: Type.OBJECT,
  required: ["motifs"],
  properties: {
    motifs: {
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
    },
  },
};

// ─── Action handlers ─────────────────────────────────────────────────────────

async function handleUnpackBrief(req: GenerateRequest, log: BatchLogger): Promise<ConceptCard[]> {
  const prompt = `${getPrompt("UNPACK_BRIEF")}

Design Brief:
${req.brief || "(none provided)"}
${buildHighlightContext(req.highlightSummaries)}${buildUserInstructions(req.userInstructions)}
Return a JSON object with a "concepts" array. Each concept has:
- title (3–6 words)
- description (1–2 sentences: what this concept means for the design, its core approach)
- rationale (1–2 sentences: why this direction is promising or worth pursuing)

Generate 5–8 distinct concept directions covering: core design goals, key tensions or ambiguities, distinct aesthetic or interaction directions, and promising areas to explore.`;

  log.write("request.json", { model: JSON_MODEL, imageCount: 0, prompt });
  logPrompt("unpack_brief", JSON_MODEL, prompt, 0);
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

async function handleAnalyze(req: GenerateRequest, log: BatchLogger): Promise<MotifCard[]> {
  const allImages = [...req.draftDataUrls, ...req.referenceDataUrls];
  if (!allImages.length) throw new Error("No images provided for analysis.");

  const hasDrafts = req.draftDataUrls.length > 0;
  const hasRefs = req.referenceDataUrls.length > 0;

  const contextNote = hasDrafts && hasRefs
    ? `You are looking at ${req.draftDataUrls.length} draft image(s) followed by ${req.referenceDataUrls.length} reference image(s).`
    : hasDrafts
    ? `You are looking at ${req.draftDataUrls.length} draft image(s).`
    : `You are looking at ${req.referenceDataUrls.length} reference image(s).`;

  // If highlights are present, ground the analysis in them; otherwise use the brief
  // so the model has at least some design context.
  const conceptContext = req.highlightSummaries.length
    ? `\nDesign concepts to consider:\n${req.highlightSummaries.join("\n")}\n`
    : `\nDesign context: ${req.brief || "(none provided)"}\n`;

  const prompt = `You are an expert visual designer analyzing design images to extract visual motifs.

${contextNote}
${conceptContext}${buildUserInstructions(req.userInstructions)}
Examine all provided images. For each significant visual element, pattern, or quality you observe, extract it as a motif. A motif is a distinctive visual characteristic that could be reused or adapted in new designs to convey specific ideas.

Return a JSON object with a "motifs" array. Each motif has:
- title (2–5 words, the name of this motif)
- visualQuality (1–2 sentences: what it looks like, how it manifests visually in the image)
- howItConveysIdea (1–2 sentences: what concept, feeling, or meaning this visual quality communicates)
- category (one of: color, texture, form, composition, subject, style, typography)

Generate 5–9 distinct motifs covering different visual dimensions of the images.`;

  log.write("request.json", { model: JSON_MODEL, imageCount: allImages.length, prompt });
  logPrompt("analyze", JSON_MODEL, prompt, allImages.length);
  const startedAt = nowIso();
  const { result: data, rawText } = await generateJson<{
    motifs: Omit<MotifCard, "id" | "type" | "createdAt">[];
  }>(prompt, motifSchema, allImages);
  const endedAt = nowIso();
  log.write("response.json", { rawText });
  const cards = (data.motifs ?? []).map((item) => ({
    id: crypto.randomUUID(),
    type: "motif" as const,
    createdAt: new Date().toISOString(),
    ...item,
  }));
  log.write("result.json", cards);
  log.write("timing.json", { startedAt, endedAt, durationSeconds: msDiff(startedAt, endedAt) });
  return cards;
}

async function handleVisualVariations(req: GenerateRequest, log: BatchLogger): Promise<VisualCard[]> {
  if (!req.draftDataUrls.length) throw new Error("No draft image provided for visual variations.");

  const basePrompt = getPrompt("VISUAL_VARIATIONS").replace("[A CONCEPT]", req.brief || "this design");
  const imageDataUrl = req.draftDataUrls[0];

  const dimensionIds = req.dimensionIds.length > 0 ? req.dimensionIds : DIMENSIONS.map((d) => d.id);
  const targetDimensions = dimensionIds.map((id) => DIMENSION_MAP[id]).filter(Boolean);
  const extraContext = `${buildHighlightContext(req.highlightSummaries)}${buildUserInstructions(req.userInstructions)}`;

  log.write("batch.json", {
    model: IMAGE_MODEL,
    dimensionIds,
    imageCount: 1,
    startedAt: nowIso(),
  });

  const batchStart = nowIso();

  // Run all selected dimensions concurrently. Promise.allSettled ensures a
  // single slow or failed dimension does not cancel the others.
  const results = await Promise.allSettled(
    targetDimensions.map(async (dim) => {
      const dimDir = log.subdir(dim.id);

      const prompt = `${basePrompt}

---

Focus specifically on the **${dim.label}** dimension: ${dim.summary}.${extraContext}
Analyze the attached design image on this specific Arnheim dimension. Then generate a 5x3 panel of visual variations that deliberately strengthens the ${dim.label} dimension. The improvement should be immediately apparent when comparing to the original.

Provide your analysis first (2–3 sentences), then the variation panel image.`;

      writeJsonRelative(dimDir, "request.json", {
        dimensionId: dim.id,
        dimensionLabel: dim.label,
        model: IMAGE_MODEL,
        prompt,
      });
      logPrompt(`visual_variations [${dim.label}]`, IMAGE_MODEL, prompt, 1);

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
      writeJsonRelative(dimDir, "response_raw.json", scrubBase64(rawResponse));

      if (genResult.imageData) {
        const ext = genResult.imageMimeType.includes("png") ? ".png" : ".jpg";
        writeImageRelative(dimDir, `output${ext}`, genResult.imageData);
      }

      const card: VisualCard = {
        id: crypto.randomUUID(),
        type: "visual",
        title: `${dim.label} Variation`,
        dimensionLabel: dim.label,
        analysisText: genResult.text ?? "",
        imageDataUrl: genResult.imageData
          ? `data:${genResult.imageMimeType};base64,${genResult.imageData}`
          : undefined,
        imageMimeType: genResult.imageMimeType,
        createdAt: new Date().toISOString(),
      };

      writeJsonRelative(dimDir, "result.json", {
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
  const cards: VisualCard[] = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    const dim = targetDimensions[i];
    return {
      id: crypto.randomUUID(),
      type: "visual" as const,
      title: `${dim.label} Variation`,
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

async function handleConceptualVariations(req: GenerateRequest, log: BatchLogger): Promise<VisualCard[]> {
  const basePrompt = getPrompt("CONCEPTUAL_VARIATIONS");
  const inputImages = [...req.draftDataUrls, ...req.referenceDataUrls].slice(0, 4);
  const referenceImage = req.draftDataUrls[0] ?? req.referenceDataUrls[0];

  // ── Phase 1: generate concept directions (fast JSON call) ─────────────────
  const conceptPrompt = `${basePrompt}

Design context: ${req.brief || "(none provided)"}
${buildHighlightContext(req.highlightSummaries)}${buildUserInstructions(req.userInstructions)}
Return a JSON object with a "concepts" array. Each concept has:
- title (3–6 words)
- description (1–2 sentences: what this concept direction means, its core approach)
- rationale (1–2 sentences: why this direction is worth pursuing, what makes it promising)

Generate 4–6 genuinely distinct concept directions — not just surface rewrites of the same idea.`;

  log.write("concepts_request.json", { model: JSON_MODEL, imageCount: inputImages.length, prompt: conceptPrompt });
  logPrompt("conceptual_variations [phase 1: concepts]", JSON_MODEL, conceptPrompt, inputImages.length);
  const conceptStart = nowIso();
  const { result: conceptData, rawText } = await generateJson<{
    concepts: Omit<ConceptCard, "id" | "type" | "createdAt">[];
  }>(conceptPrompt, conceptSchema, inputImages);
  const conceptEnd = nowIso();
  log.write("concepts_response.json", { rawText });
  log.write("concepts_timing.json", { startedAt: conceptStart, endedAt: conceptEnd, durationSeconds: msDiff(conceptStart, conceptEnd) });

  const concepts = conceptData.concepts ?? [];

  // ── Phase 2: generate a visual panel for each concept in parallel ─────────
  const batchStart = nowIso();
  log.write("visuals_batch.json", { model: IMAGE_MODEL, conceptCount: concepts.length, startedAt: batchStart });

  const results = await Promise.allSettled(
    concepts.map(async (concept, i) => {
      const safeLabel = concept.title.slice(0, 30).replace(/\W+/g, "_");
      const cardDir = log.subdir(`concept_${i}_${safeLabel}`);

      const visualPrompt = `${getPrompt("GENERATE_CONCEPT_VISUALS")}

Concept: "${concept.title}"
Description: ${concept.description}
Rationale: ${concept.rationale}

Overall design context: ${req.brief || "(none provided)"}
${buildUserInstructions(req.userInstructions)}
Generate a 2×2 panel of 4 distinct visuals. Each visual should use clearly different visual elements, but all should strongly express the concept above.`;

      writeJsonRelative(cardDir, "request.json", {
        conceptTitle: concept.title,
        model: IMAGE_MODEL,
        hasReferenceImage: !!referenceImage,
        prompt: visualPrompt,
      });
      logPrompt(`conceptual_variations [phase 2: "${concept.title}"]`, IMAGE_MODEL, visualPrompt, referenceImage ? 1 : 0);

      const dimStart = nowIso();
      let genResult: ImageOutputResult;
      try {
        genResult = await generateImageOutput(visualPrompt, referenceImage);
      } catch (err) {
        const dimEnd = nowIso();
        writeJsonRelative(cardDir, "error.json", { error: String(err) });
        writeJsonRelative(cardDir, "timing.json", { startedAt: dimStart, endedAt: dimEnd, status: "error" });
        throw err;
      }

      const dimEnd = nowIso();
      writeJsonRelative(cardDir, "response_raw.json", scrubBase64(genResult.rawResponse));
      if (genResult.imageData) {
        const ext = genResult.imageMimeType.includes("png") ? ".png" : ".jpg";
        writeImageRelative(cardDir, `output${ext}`, genResult.imageData);
      }
      writeJsonRelative(cardDir, "timing.json", { startedAt: dimStart, endedAt: dimEnd, durationSeconds: msDiff(dimStart, dimEnd), status: "ok" });

      return {
        id: crypto.randomUUID(),
        type: "visual" as const,
        title: concept.title,
        dimensionLabel: concept.title,
        analysisText: concept.description,
        imageDataUrl: genResult.imageData
          ? `data:${genResult.imageMimeType};base64,${genResult.imageData}`
          : undefined,
        imageMimeType: genResult.imageMimeType,
        createdAt: new Date().toISOString(),
      } satisfies VisualCard;
    })
  );

  const batchEnd = nowIso();
  const cards: VisualCard[] = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    const concept = concepts[i];
    return {
      id: crypto.randomUUID(),
      type: "visual" as const,
      title: concept.title,
      dimensionLabel: concept.title,
      analysisText: concept.description,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      createdAt: new Date().toISOString(),
    };
  });

  log.write("visuals_batch_summary.json", {
    startedAt: batchStart,
    finishedAt: batchEnd,
    totalDurationSeconds: msDiff(batchStart, batchEnd),
    conceptCount: concepts.length,
    succeeded: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
  });

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

async function handleGenerateConceptVisuals(req: GenerateRequest, log: BatchLogger): Promise<VisualCard[]> {
  const cards: ConceptCardRef[] = req.conceptCards ?? [];
  if (!cards.length) throw new Error("No concept cards selected.");

  const imageDataUrl = req.draftDataUrls[0];
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

Concept: "${card.title}"
Description: ${card.description}
Rationale: ${card.rationale}

Overall design context: ${req.brief || "(none provided)"}
${extraContext}
Generate a 2×2 panel of 4 distinct visuals. Each visual should use clearly different visual elements, but all should strongly express the concept above.`;

      writeJsonRelative(cardDir, "request.json", {
        cardId: card.id,
        cardTitle: card.title,
        model: IMAGE_MODEL,
        hasReferenceImage: !!imageDataUrl,
        prompt,
      });
      logPrompt(`generate_concept_visuals ["${card.title}"]`, IMAGE_MODEL, prompt, imageDataUrl ? 1 : 0);

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
        type: "visual" as const,
        title: `${card.title} — Visuals`,
        dimensionLabel: card.title,
        analysisText: genResult.text ?? card.description,
        imageDataUrl: genResult.imageData
          ? `data:${genResult.imageMimeType};base64,${genResult.imageData}`
          : undefined,
        imageMimeType: genResult.imageMimeType,
        createdAt: new Date().toISOString(),
      } satisfies VisualCard;
    })
  );

  const batchEnd = nowIso();
  const output: VisualCard[] = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    const card = cards[i];
    return {
      id: crypto.randomUUID(),
      type: "visual" as const,
      title: `${card.title} — Visuals`,
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
  analyze: handleAnalyze,
  visual_variations: handleVisualVariations,
  conceptual_variations: handleConceptualVariations,
  generate_concept_visuals: handleGenerateConceptVisuals,
  user_added: async () => [],
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
