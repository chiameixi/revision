/**
 * app/api/generate/route.ts
 *
 * Responsibility: Single POST endpoint for all generation actions.
 *
 * Request: `GenerateRequest` (action, brief, userInstructions, draftDataUrls,
 * referenceDataUrls, typedContext, dimensionIds, conceptCards?)
 * Response: `GenerateResponse` ({ cards, error? })
 *
 * Each action is handled by a dedicated async function:
 *   unpack_brief          → `handleUnpackBrief`       → ConceptCard[]
 *   analyze               → `handleAnalyze`            → ConceptCard[] + MotifCard[]
 *   visual_variations     → `handleVisualVariations`   → VisualCard[]  (parallel per dimension)
 *   conceptual_variations → `handleConceptualVariations` → VisualCard[] (parallel per concept)
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
 *    Visual variations and conceptual variations use this pattern with
 *    `Promise.allSettled` so one failing item does not abort the batch.
 *
 * Context: typed context (typedContext) replaces the old flat `highlightSummaries`
 * array. Cards are split by type so each section in the prompt carries semantic
 * meaning: concepts = direction to build on, motifs = visual language to maintain,
 * visuals = territory already explored (with optional image data).
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
  TypedContext,
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

// Builds distinct labeled prompt sections from typed context.
// Each card type gets its own section so the model understands the semantic
// role of each piece of context.
function buildTypedContext(ctx: TypedContext): string {
  const parts: string[] = [];

  if (ctx.concepts.length) {
    parts.push(`Conceptual directions to build on:\n${ctx.concepts.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
  }
  if (ctx.motifs.length) {
    parts.push(`Visual language / motifs to maintain:\n${ctx.motifs.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
  }
  if (ctx.visuals.length) {
    parts.push(`Visuals already explored:\n${ctx.visuals.map((v, i) => `${i + 1}. ${v.text}`).join("\n")}`);
  }
  if (ctx.notes.length) {
    parts.push(`User notes:\n${ctx.notes.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
  }

  return parts.length ? `\n${parts.join("\n\n")}\n` : "";
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

const JSON_MODEL = "gemini-3.5-flash";

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

const IMAGE_MODEL = "gemini-3-pro-image";

type ImageOutputResult = {
  text: string | null;
  imageData: string | null;
  imageMimeType: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawResponse: any;
};

async function generateImageOutput(
  promptText: string,
  imageDataUrls: string[] = []
): Promise<ImageOutputResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = [{ text: promptText }];
  for (const url of imageDataUrls) {
    const { data, mimeType } = parseDataUrl(url);
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

// ─── Schemas ──────────────────────────────────────────────────────────────────

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

// Dual-output schema used by analyze: returns both concepts and motifs in one call.
const analyzeSchema = {
  type: Type.OBJECT,
  required: ["concepts", "motifs"],
  properties: {
    concepts: conceptSchema.properties.concepts,
    motifs: motifSchema.properties.motifs,
  },
};

// ─── Action handlers ─────────────────────────────────────────────────────────

async function handleUnpackBrief(req: GenerateRequest, log: BatchLogger): Promise<ConceptCard[]> {
  const context = buildTypedContext(req.typedContext);

  const prompt = `${getPrompt("UNPACK_BRIEF")}

Design Brief:
${req.brief || "(none provided)"}
${context}${buildUserInstructions(req.userInstructions)}
Return a JSON object with a "concepts" array. Each concept has:
- title (2–5 words: plain, direct label for the idea — no poetic flourishes, no metaphors, no adjective stacking; e.g. "Controlled Uncertainty" not "Whispers of Elegant Tension")
- description (1–2 sentences: the abstract idea or design intention — its meaning, tension, or emotional register — not a prescription for colors, shapes, or layouts)
- rationale (1–2 sentences: why this conceptual direction is worth pursuing)

Generate 5–8 distinct concept directions covering: core design tensions, underlying values, emotional registers, and meaningful ambiguities. Think conceptually — each concept should name an idea or intention, not describe a visual style.`;

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

async function handleAnalyze(req: GenerateRequest, log: BatchLogger): Promise<ResultCard[]> {
  const allImages = [...req.draftDataUrls, ...req.referenceDataUrls];
  if (!allImages.length) throw new Error("No images provided for analysis.");

  const hasDrafts = req.draftDataUrls.length > 0;
  const hasRefs = req.referenceDataUrls.length > 0;

  const contextNote = hasDrafts && hasRefs
    ? `You are looking at ${req.draftDataUrls.length} draft image(s) followed by ${req.referenceDataUrls.length} reference image(s).`
    : hasDrafts
    ? `You are looking at ${req.draftDataUrls.length} draft image(s).`
    : `You are looking at ${req.referenceDataUrls.length} reference image(s).`;

  const context = buildTypedContext(req.typedContext);

  const prompt = `${getPrompt("ANALYZE")} Examine the provided images to extract both concept-level interpretations and visual motifs.

${contextNote}
Design brief: ${req.brief || "(none provided)"}
${context}${buildUserInstructions(req.userInstructions)}
Return a JSON object with two arrays:

"concepts": abstract concept directions expressed or implied by these images — not descriptions of what you see visually, but the underlying ideas, tensions, and meanings. Each concept has:
- title (2–5 words: plain, direct label for the idea — no poetic flourishes, no metaphors, no adjective stacking; e.g. "Earned Vulnerability" not "Delicate Whispers of Fragile Grace")
- description (1–2 sentences: the abstract design intention — the meaning, tension, or emotional register the work conveys — not a literal visual description)
- rationale (1–2 sentences: why this conceptual direction is interesting or worth exploring)
Generate 3–5 distinct concepts that name ideas, not visual recipes.

"motifs": reusable visual elements or qualities you observe. Each motif has:
- title (2–5 words)
- visualQuality (1–2 sentences: what it looks like, how it manifests visually)
- howItConveysIdea (1–2 sentences: what concept, feeling, or meaning this quality communicates)
- category (one of: color, texture, form, composition, subject, style, typography)
Generate 4–7 distinct motifs covering different visual dimensions.`;

  log.write("request.json", { model: JSON_MODEL, imageCount: allImages.length, prompt });
  logPrompt("analyze", JSON_MODEL, prompt, allImages.length);
  const startedAt = nowIso();
  const { result: data, rawText } = await generateJson<{
    concepts: Omit<ConceptCard, "id" | "type" | "createdAt">[];
    motifs: Omit<MotifCard, "id" | "type" | "createdAt">[];
  }>(prompt, analyzeSchema, allImages);
  const endedAt = nowIso();
  log.write("response.json", { rawText });

  const conceptCards: ConceptCard[] = (data.concepts ?? []).map((item) => ({
    id: crypto.randomUUID(),
    type: "concept" as const,
    createdAt: new Date().toISOString(),
    ...item,
  }));

  const motifCards: MotifCard[] = (data.motifs ?? []).map((item) => ({
    id: crypto.randomUUID(),
    type: "motif" as const,
    createdAt: new Date().toISOString(),
    ...item,
  }));

  const cards: ResultCard[] = [...conceptCards, ...motifCards];
  log.write("result.json", cards);
  log.write("timing.json", { startedAt, endedAt, durationSeconds: msDiff(startedAt, endedAt) });
  return cards;
}

async function handleVisualVariations(req: GenerateRequest, log: BatchLogger): Promise<VisualCard[]> {
  if (!req.draftDataUrls.length) throw new Error("No draft image provided for visual variations.");

  const basePrompt = getPrompt("VISUAL_VARIATIONS").replace("[A CONCEPT]", req.brief || "this design");

  // All user-selected draft images; the first is the primary analysis target.
  // Additional drafts and refs are passed as supporting context images.
  const [primaryDraft, ...extraDrafts] = req.draftDataUrls;
  const styleRefImages = [...extraDrafts, ...req.referenceDataUrls];

  const dimensionIds = req.dimensionIds.length > 0 ? req.dimensionIds : DIMENSIONS.map((d) => d.id);
  const targetDimensions = dimensionIds.map((id) => DIMENSION_MAP[id]).filter(Boolean);
  const context = buildTypedContext(req.typedContext);
  const extraContext = `${context}${buildUserInstructions(req.userInstructions)}`;

  log.write("batch.json", {
    model: IMAGE_MODEL,
    dimensionIds,
    imageCount: 1 + styleRefImages.length,
    startedAt: nowIso(),
  });

  const batchStart = nowIso();

  // Run all selected dimensions concurrently. Promise.allSettled ensures a
  // single slow or failed dimension does not cancel the others.
  const results = await Promise.allSettled(
    targetDimensions.map(async (dim) => {
      const dimDir = log.subdir(dim.id);

      const styleRefNote = styleRefImages.length
        ? `\n(Additional images provided as style references.)\n`
        : "";

      const prompt = `${basePrompt}

---

Focus specifically on the **${dim.label}** dimension: ${dim.summary}.${extraContext}${styleRefNote}
Analyze the attached design image on this specific Arnheim dimension. Then generate a 5x3 panel of visual variations that deliberately strengthens the ${dim.label} dimension. The improvement should be immediately apparent when comparing to the original.

Provide your analysis first (2–3 sentences), then the variation panel image.`;

      writeJsonRelative(dimDir, "request.json", {
        dimensionId: dim.id,
        dimensionLabel: dim.label,
        model: IMAGE_MODEL,
        prompt,
      });
      logPrompt(`visual_variations [${dim.label}]`, IMAGE_MODEL, prompt, 1 + styleRefImages.length);

      const startedAt = nowIso();
      let rawResponse: unknown = null;
      let genResult: Awaited<ReturnType<typeof generateImageOutput>> | null = null;

      try {
        genResult = await generateImageOutput(prompt, [primaryDraft, ...styleRefImages]);
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

// Generates a 2×2 image panel for each selected ConceptCard.
// Context: MotifCards constrain visual language; VisualCards (with images) show
// territory already explored; draftDataUrls / referenceDataUrls provide style refs.
async function handleConceptualVariations(req: GenerateRequest, log: BatchLogger): Promise<VisualCard[]> {
  const concepts: ConceptCardRef[] = req.conceptCards ?? [];
  if (!concepts.length) throw new Error("No concept cards selected for conceptual variations.");

  const basePrompt = getPrompt("CONCEPTUAL_VARIATIONS");

  // Style reference images: user-selected drafts + refs + any VisualCard images from context
  const visualContextImages = req.typedContext.visuals
    .filter((v) => v.imageDataUrl)
    .map((v) => v.imageDataUrl!);
  const styleImages = [...req.draftDataUrls, ...req.referenceDataUrls, ...visualContextImages];

  // Text-only context from motifs, notes, and visual analysis text
  const motifContext = req.typedContext.motifs.length
    ? `\nVisual language / motifs to maintain:\n${req.typedContext.motifs.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n`
    : "";
  const visualTextContext = req.typedContext.visuals.length
    ? `\nVisuals already explored:\n${req.typedContext.visuals.map((v, i) => `${i + 1}. ${v.text}`).join("\n")}\n`
    : "";
  const noteContext = req.typedContext.notes.length
    ? `\nUser notes:\n${req.typedContext.notes.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n`
    : "";

  const batchStart = nowIso();
  log.write("batch.json", {
    model: IMAGE_MODEL,
    conceptCount: concepts.length,
    styleImageCount: styleImages.length,
    startedAt: batchStart,
  });

  const results = await Promise.allSettled(
    concepts.map(async (concept, i) => {
      const safeLabel = concept.title.slice(0, 30).replace(/\W+/g, "_");
      const cardDir = log.subdir(`concept_${i}_${safeLabel}`);

      const styleRefNote = styleImages.length
        ? `\n(${styleImages.length} style reference image(s) provided — maintain the overall visual style and medium.)\n`
        : "";

      const prompt = `${basePrompt}

Concept: "${concept.title}"
Description: ${concept.description}
Rationale: ${concept.rationale}

Overall design brief: ${req.brief || "(none provided)"}
${motifContext}${visualTextContext}${noteContext}${styleRefNote}${buildUserInstructions(req.userInstructions)}`;

      writeJsonRelative(cardDir, "request.json", {
        conceptTitle: concept.title,
        model: IMAGE_MODEL,
        styleImageCount: styleImages.length,
        prompt,
      });
      logPrompt(`conceptual_variations ["${concept.title}"]`, IMAGE_MODEL, prompt, styleImages.length);

      const dimStart = nowIso();
      let genResult: ImageOutputResult;
      try {
        genResult = await generateImageOutput(prompt, styleImages);
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

  log.write("batch_summary.json", {
    startedAt: batchStart,
    finishedAt: batchEnd,
    totalDurationSeconds: msDiff(batchStart, batchEnd),
    conceptCount: concepts.length,
    succeeded: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
  });

  return cards;
}

// ─── utilities used inside subdirs ──────────────────────────────────────────

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

// ─── Route handler ────────────────────────────────────────────────────────────

const handlers: Record<ActionType, (req: GenerateRequest, log: BatchLogger) => Promise<ResultCard[]>> = {
  unpack_brief: handleUnpackBrief,
  analyze: handleAnalyze,
  visual_variations: handleVisualVariations,
  conceptual_variations: handleConceptualVariations,
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
