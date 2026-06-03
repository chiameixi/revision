/**
 * src/lib/prompts.ts
 *
 * Responsibility: Server-side loader for the named prompt sections in
 * `prompts.txt` at the project root.
 *
 * The file uses a simple `[SECTION_NAME]` delimiter format — each section
 * starts with a bracketed uppercase key and continues until the next key or
 * end of file.  `getPrompt(key)` returns the trimmed text for a section.
 *
 * Design decisions:
 * - Marked `server-only` so the raw prompt text never reaches the browser
 *   bundle (which would expose system prompt content to users).
 * - Parsed once and cached in a module-level variable to avoid repeated disk
 *   reads on every API call during a long session.
 * - Using `process.cwd()` rather than `__dirname` keeps the path relative to
 *   the Next.js project root regardless of where the compiled output lives.
 */

import "server-only";
import fs from "fs";
import path from "path";

type PromptKey =
  | "VISUAL_VARIATIONS"
  | "CONCEPTUAL_VARIATIONS"
  | "UNPACK_BRIEF"
  | "ANALYZE_DRAFT"
  | "ANALYZE_REFERENCES"
  | "GENERATE_CONCEPT_VISUALS"
  | "SYNTHESIZE";

let cache: Record<string, string> | null = null;

function load(): Record<string, string> {
  if (cache) return cache;

  const filePath = path.join(process.cwd(), "prompts.txt");
  const text = fs.readFileSync(filePath, "utf-8");

  const result: Record<string, string> = {};
  // Split on [SECTION_NAME] markers
  const parts = text.split(/\[([A-Z_]+)\]/);
  for (let i = 1; i < parts.length; i += 2) {
    result[parts[i].trim()] = (parts[i + 1] ?? "").trim();
  }

  cache = result;
  return cache;
}

export function getPrompt(key: PromptKey): string {
  const prompts = load();
  const val = prompts[key];
  if (!val) throw new Error(`Prompt section not found: ${key}`);
  return val;
}
