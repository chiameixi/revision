/**
 * src/server/model.ts
 *
 * Responsibility: The only place that talks to Gemini. Two calls:
 *   callText  — JSON output against a schema, via the @google/genai SDK.
 *   callImage — TEXT + IMAGE output, via REST, because the SDK's typed config
 *               doesn't expose responseModalities.
 *
 * Changing a model or provider should only touch this file.
 */

import "server-only";
import { getGeminiClient } from "@/lib/gemini/client";
import { UsageMeter } from "./usage";

export { UsageMeter };

export const TEXT_MODEL = "gemini-3.5-flash";
export const IMAGE_MODEL = "gemini-3-pro-image";
const IMAGE_TIMEOUT_MS = 180_000;
const IMAGE_ATTEMPTS = 3;

function parseDataUrl(dataUrl: string): { data: string; mimeType: string } {
  const comma = dataUrl.indexOf(",");
  const mimeType = dataUrl.slice(0, comma).match(/:(.*?);/)?.[1] ?? "image/jpeg";
  return { data: dataUrl.slice(comma + 1), mimeType };
}

function parts(prompt: string, images: string[]) {
  return [{ text: prompt }, ...images.map((url) => ({ inlineData: parseDataUrl(url) }))];
}

function logPrompt(label: string, model: string, prompt: string, imageCount: number) {
  const border = "─".repeat(64);
  console.log(`\n┌${border}\n│ GEMINI PROMPT  ${label}  model=${model}  images=${imageCount}\n├${border}`);
  prompt.split("\n").forEach((line) => console.log(`│ ${line}`));
  console.log(`└${border}\n`);
}

export async function callText<T>(
  label: string,
  prompt: string,
  images: string[],
  schema: unknown,
  meter: UsageMeter,
): Promise<{ result: T; rawText: string }> {
  logPrompt(label, TEXT_MODEL, prompt, images.length);
  const response = await getGeminiClient().models.generateContent({
    model: TEXT_MODEL,
    contents: [{ role: "user", parts: parts(prompt, images) }],
    config: { responseMimeType: "application/json", responseJsonSchema: schema },
  });
  meter.record(response.usageMetadata);
  const rawText = response.text ?? "";
  if (!rawText) throw new Error("The model returned an empty response.");
  return { result: JSON.parse(rawText) as T, rawText };
}

export interface ImageResult {
  text: string;
  imageData: string | null;   // base64
  mimeType: string;
  rawResponse: unknown;
  attempts: number;
}

async function callImageOnce(prompt: string, images: string[], meter: UsageMeter): Promise<Omit<ImageResult, "attempts">> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(IMAGE_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: parts(prompt, images) }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
    signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Gemini API error (${res.status}): ${await res.text()}`);

  const rawResponse = await res.json();
  meter.record(rawResponse?.usageMetadata);
  type Part = { text?: string; inlineData?: { data: string; mimeType: string } };
  const responseParts: Part[] = rawResponse?.candidates?.[0]?.content?.parts ?? [];
  const img = responseParts.find((p) => p.inlineData);
  return {
    text: responseParts.filter((p) => p.text).map((p) => p.text).join("\n").trim(),
    imageData: img?.inlineData?.data ?? null,
    mimeType: img?.inlineData?.mimeType ?? "image/png",
    rawResponse,
  };
}

// The model sometimes answers with text only even when asked for an image;
// retrying fixes most of those without changing the prompt.
export async function callImage(label: string, prompt: string, images: string[], meter: UsageMeter): Promise<ImageResult> {
  logPrompt(label, IMAGE_MODEL, prompt, images.length);
  let last: Omit<ImageResult, "attempts"> | null = null;
  for (let attempt = 1; attempt <= IMAGE_ATTEMPTS; attempt++) {
    last = await callImageOnce(prompt, images, meter);
    if (last.imageData) return { ...last, attempts: attempt };
    if (attempt < IMAGE_ATTEMPTS) console.warn(`[${label}] no image on attempt ${attempt}/${IMAGE_ATTEMPTS}, retrying…`);
  }
  return { ...last!, attempts: IMAGE_ATTEMPTS };
}
