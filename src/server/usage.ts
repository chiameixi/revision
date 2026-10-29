import type { Usage } from "@/domain/wire";

// Adds up what one request used across all its model calls (retries included).
export class UsageMeter {
  readonly usage: Usage;
  constructor(model: string) {
    this.usage = { model, calls: 0, inputTokens: 0, outputTokens: 0, imageTokens: 0 };
  }

  // Gemini reports usage the same way from the SDK and from REST.
  record(meta: unknown) {
    type Detail = { modality?: string; tokenCount?: number };
    const m = (meta ?? {}) as {
      promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number;
      candidatesTokensDetails?: Detail[];
    };
    const image = (m.candidatesTokensDetails ?? []).filter((d) => d.modality === "IMAGE").reduce((sum, d) => sum + (d.tokenCount ?? 0), 0);
    this.usage.calls += 1;
    this.usage.inputTokens += m.promptTokenCount ?? 0;
    this.usage.imageTokens += image;
    this.usage.outputTokens += Math.max(0, (m.candidatesTokenCount ?? 0) - image) + (m.thoughtsTokenCount ?? 0);
  }
}
