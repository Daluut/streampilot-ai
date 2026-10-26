// Browser-side API client. Every failure is turned into a short, user-facing message.

export type ActionResult = { ok: true; message?: string } | { ok: false; message: string };

export async function apiRequest<T extends object = Record<string, unknown>>(
  path: string,
  options: { method?: "GET" | "POST" | "PATCH"; body?: unknown } = {},
): Promise<{ ok: true; data: T } | { ok: false; message: string; status: number }> {
  try {
    const response = await fetch(path, {
      method: options.method ?? "GET",
      headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
    });
    const data = (await response.json().catch(() => null)) as
      | (T & { error?: { message?: string } })
      | null;
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: data?.error?.message ?? `The request failed (HTTP ${response.status}).`,
      };
    }
    return { ok: true, data: (data ?? {}) as T };
  } catch {
    return { ok: false, status: 0, message: "Cannot reach the StreamPilot server. Check that it is running." };
  }
}
