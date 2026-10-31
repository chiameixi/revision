/**
 * POST /api/actions/[id]
 *
 * One request = one output (one image, or one batch of concepts and motifs
 * for expand). The browser plans a run into several of these and sends them
 * in parallel, so progress shows as each finishes and one failure doesn't
 * sink the rest. Request and response shapes: src/domain/wire.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import type { ActionReply } from "@/domain/wire";
import { ActionFailed, runAction } from "@/server/registry";
import { isActionType, RequestError, validateRequest } from "@/server/validate";

// Image calls can take a couple of minutes, with retries.
export const maxDuration = 300;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isActionType(id)) {
    return NextResponse.json<ActionReply>({ error: `Unknown action: ${id}` }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ActionReply>({ error: "The request body isn't valid JSON." }, { status: 400 });
  }

  try {
    const req = validateRequest(id, body);
    const { result, usage } = await runAction(id, req);
    return NextResponse.json<ActionReply>({ result, usage });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof RequestError ? 400 : 502;
    if (status === 502) console.error(`[actions/${id}]`, message);
    const usage = err instanceof ActionFailed ? err.usage : undefined;
    return NextResponse.json<ActionReply>({ error: message, usage }, { status });
  }
}
