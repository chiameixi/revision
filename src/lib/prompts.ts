import "server-only";
import fs from "fs";
import path from "path";

type PromptKey = "VISUAL_VARIATIONS" | "CONCEPTUAL_VARIATIONS";

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
