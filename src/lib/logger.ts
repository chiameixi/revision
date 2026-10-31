import "server-only";
import fs from "fs";
import path from "path";

/**
 * Debug log of every model call, for inspecting prompts and raw responses.
 * (The study's event log is separate and lives with the project data.)
 *
 * One folder per run, one subfolder per request in that run:
 *   logs/<date>_<runId>_<action>/<item>/
 *     request.json, response_raw.json, result.json, timing.json, output.png, error.json
 *
 * The runId matches the run.started / run.done events and the nodes'
 * origin.runId, so a node can be traced back to the exact prompt.
 */

const LOG_ROOT = path.join(process.cwd(), "logs");

export function nowIso(): string {
  return new Date().toISOString();
}

// Scrub large base64 blobs from objects — keeps log files readable
export function scrubBase64(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(scrubBase64);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, val]) => {
        if (k === "data" && typeof val === "string" && val.length > 200) {
          const kb = Math.round((val.length * 3) / 4 / 1024);
          return [k, `<base64 ~${kb}KB omitted>`];
        }
        return [k, scrubBase64(val)];
      })
    );
  }
  return v;
}

function safeName(s: string): string {
  return s.replace(/[^\w.-]+/g, "_").slice(0, 60) || "item";
}

export class RunLogger {
  readonly dir: string;
  private readonly startedAt = nowIso();

  constructor(action: string, runId: string, item: string, meta: Record<string, unknown> = {}) {
    const day = this.startedAt.slice(0, 10);
    const runDir = path.join(LOG_ROOT, `${day}_${safeName(runId)}_${action}`);
    this.dir = path.join(runDir, safeName(item));
    fs.mkdirSync(this.dir, { recursive: true });
    // Same for every request in the run; later writes just overwrite it.
    fs.writeFileSync(path.join(runDir, "meta.json"), JSON.stringify({ action, runId, ...meta }, null, 2));
  }

  write(name: string, data: unknown): void {
    fs.writeFileSync(path.join(this.dir, name), JSON.stringify(data, null, 2), "utf-8");
  }

  writeImage(name: string, base64: string): void {
    fs.writeFileSync(path.join(this.dir, name), Buffer.from(base64, "base64"));
  }

  finish(status: "ok" | "error", extra: Record<string, unknown> = {}): void {
    const endedAt = nowIso();
    this.write("timing.json", {
      startedAt: this.startedAt,
      endedAt,
      durationSeconds: Math.round((Date.parse(endedAt) - Date.parse(this.startedAt)) / 10) / 100,
      status,
      ...extra,
    });
  }
}
