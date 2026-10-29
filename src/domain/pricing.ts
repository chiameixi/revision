// Estimated cost of Gemini calls, from the token counts each response reports.
// List prices in USD per 1M tokens, paid tier, no batch or caching discounts.
// Update here when prices change; nothing else needs to.
//
// Sources (checked 2026-10):
// - gemini-3-pro-image: https://ai.google.dev/gemini-api/docs/pricing
//   (image output $120/1M tokens ≈ $0.134 per 1K/2K image)
// - gemini-3.5-flash: third-party listings (e.g. tokencost.app); not yet
//   confirmed on Google's page. Output price includes thinking tokens.

import type { Usage } from "./wire";

export const PRICES_CHECKED = "October 2026";

const PRICES: Record<string, { input: number; output: number; image?: number }> = {
  "gemini-3.5-flash": { input: 1.5, output: 9 },
  "gemini-3-pro-image": { input: 2, output: 12, image: 120 },
};

// Null when the model isn't in the table, so the UI can say "unknown" instead of $0.
export function costUsd(u: Usage): number | null {
  const p = PRICES[u.model];
  if (!p) return null;
  return (u.inputTokens * p.input + u.outputTokens * p.output + u.imageTokens * (p.image ?? p.output)) / 1_000_000;
}

export function formatUsd(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}
