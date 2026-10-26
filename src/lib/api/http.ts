// Helpers for route handlers. Errors use a stable { error: { code, message } } shape and never
// include stack traces or internal details.

import { NextResponse } from "next/server";
import type { ZodType } from "zod";

const MAX_BODY_BYTES = 8 * 1024;

export function apiError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export function apiOk<T extends object>(body: T, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

/** Reads and validates a small JSON body. Empty bodies are treated as an empty object. */
export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<ParseResult<T>> {
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    return { ok: false, response: apiError(413, "payload_too_large", "The request is too large.") };
  }
  let json: unknown = {};
  if (text.trim().length > 0) {
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, response: apiError(400, "invalid_json", "The request body must be valid JSON.") };
    }
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "The request is invalid.";
    return { ok: false, response: apiError(400, "invalid_request", message) };
  }
  return { ok: true, data: parsed.data };
}
