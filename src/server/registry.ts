/**
 * src/server/registry.ts
 *
 * Responsibility: One entry per generation action. Each entry turns a
 * validated request into one model call and returns the result. The route
 * looks actions up here, so adding an action means adding an entry.
 *
 * Every call is logged under logs/ (see RunLogger), keyed by runId.
 */

import "server-only";
import type { ActionType } from "@/domain/types";
import type { ActionContract, ActionRequest, ActionResponse, ExpandResponse } from "@/domain/wire";
import { getPrompt } from "@/lib/prompts";
import { DIMENSION_MAP } from "@/lib/dimensions";
import { RunLogger, scrubBase64 } from "@/lib/logger";
import { callImage, callText, IMAGE_MODEL, TEXT_MODEL } from "./model";
import {
  buildConceptualVariationPrompt,
  buildExpandPrompt,
  buildVisualVariationPrompt,
  expandSchema,
} from "./prompts";

interface ActionDef<A extends ActionType> {
  // Names this request's log folder within the run, e.g. a dimension ID.
  item(req: ActionRequest<A>): string;
  run(req: ActionRequest<A>, log: RunLogger): Promise<ActionResponse<A>>;
}

async function imageCall(label: string, prompt: string, images: string[], log: RunLogger) {
  log.write("request.json", { model: IMAGE_MODEL, imageCount: images.length, prompt });
  const out = await callImage(label, prompt, images);
  log.write("response_raw.json", scrubBase64(out.rawResponse));
  if (!out.imageData) throw new Error(`No image came back after ${out.attempts} attempts.`);
  log.writeImage(out.mimeType.includes("png") ? "output.png" : "output.jpg", out.imageData);
  log.write("result.json", { text: out.text, attempts: out.attempts });
  return { imageDataUrl: `data:${out.mimeType};base64,${out.imageData}`, text: out.text };
}

const expand: ActionDef<"expand"> = {
  item: () => "expand",
  async run(req, log) {
    const { prompt, images } = buildExpandPrompt(req, {
      unpackBrief: getPrompt("UNPACK_BRIEF"),
      analyze: getPrompt("ANALYZE"),
    });
    log.write("request.json", { model: TEXT_MODEL, imageCount: images.length, counts: req.counts, prompt });
    const { result, rawText } = await callText<Partial<ExpandResponse>>("expand", prompt, images, expandSchema(req.counts));
    log.write("response.json", { rawText });
    const out: ExpandResponse = {
      concepts: (result.concepts ?? []).slice(0, req.counts.concepts),
      motifs: (result.motifs ?? []).slice(0, req.counts.motifs),
    };
    log.write("result.json", out);
    return out;
  },
};

const visualVariations: ActionDef<"visual_variations"> = {
  item: (req) => req.dimensionId,
  run(req, log) {
    const dim = DIMENSION_MAP[req.dimensionId];
    const { prompt, images } = buildVisualVariationPrompt(req, getPrompt("VISUAL_VARIATIONS"), dim);
    return imageCall(`visual_variations [${dim.label}]`, prompt, images, log);
  },
};

const conceptualVariations: ActionDef<"conceptual_variations"> = {
  item: (req) => `${req.idea.title}_${req.variant}of${req.of}`,
  run(req, log) {
    const { prompt, images } = buildConceptualVariationPrompt(req, getPrompt("CONCEPTUAL_VARIATIONS"));
    return imageCall(`conceptual_variations ["${req.idea.title}" ${req.variant}/${req.of}]`, prompt, images, log);
  },
};

export const registry: { [A in ActionType]: ActionDef<A> } = {
  expand,
  visual_variations: visualVariations,
  conceptual_variations: conceptualVariations,
};

export async function runAction<A extends keyof ActionContract>(action: A, req: ActionRequest<A>): Promise<ActionResponse<A>> {
  const def = registry[action] as ActionDef<A>;
  const log = new RunLogger(action, req.runId, def.item(req), { brief: req.brief.slice(0, 500) });
  try {
    const result = await def.run(req, log);
    log.finish("ok");
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.write("error.json", { error: message });
    log.finish("error");
    throw err;
  }
}
