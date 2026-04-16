import "server-only";
import fs from "fs";
import path from "path";

const LOG_ROOT = path.join(process.cwd(), "logs");

export function nowIso(): string {
  return new Date().toISOString();
}

// Scrub large base64 blobs from objects — keeps log files readable
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

function writeJson(p: string, data: unknown): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
}

function writeImageFile(p: string, base64: string): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, Buffer.from(base64, "base64"));
}

/**
 * One BatchLogger per API request. All log files for that request land under
 * logs/<timestamp>_<action>_<rand>/
 *
 * For single-call actions the files go directly in batchDir:
 *   meta.json, request.json, response.json, result.json, timing.json
 *
 * For visual variations each dimension gets a named subdirectory:
 *   <dim_id>/request.json, response_raw.json, result.json, timing.json, output.png
 */
export class BatchLogger {
  readonly batchDir: string;
  private readonly startedAt: string;

  constructor(action: string, brief: string) {
    const ts = nowIso().slice(0, 19).replace(/[T:]/g, "-");
    const rand = Math.random().toString(36).slice(2, 8);
    this.batchDir = path.join(LOG_ROOT, `${ts}_${action}_${rand}`);
    this.startedAt = nowIso();
    fs.mkdirSync(this.batchDir, { recursive: true });

    writeJson(path.join(this.batchDir, "meta.json"), {
      action,
      brief: brief.slice(0, 500),
      startedAt: this.startedAt,
    });
  }

  /** Resolve a path relative to batchDir (creates parent dirs). */
  resolve(...parts: string[]): string {
    return path.join(this.batchDir, ...parts);
  }

  /** Create a named subdirectory and return its absolute path. */
  subdir(name: string): string {
    const p = path.join(this.batchDir, name);
    fs.mkdirSync(p, { recursive: true });
    return p;
  }

  /** Write JSON to a path relative to batchDir. */
  write(relPath: string, data: unknown): void {
    writeJson(this.resolve(relPath), data);
  }

  /** Save a raw base64 string as a binary image file. */
  writeImage(relPath: string, base64: string): void {
    writeImageFile(this.resolve(relPath), base64);
  }

  /** Write summary.json when the batch finishes. */
  finalize(opts: { cardCount: number; error?: string }): void {
    writeJson(this.resolve("summary.json"), {
      startedAt: this.startedAt,
      finishedAt: nowIso(),
      ...opts,
    });
  }
}
