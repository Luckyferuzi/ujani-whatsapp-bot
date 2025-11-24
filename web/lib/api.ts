// web/lib/api.ts

// Base URL of your backend API, e.g.
// NEXT_PUBLIC_API_BASE=https://ujani-whatsapp-bot.onrender.com
export const API = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/+$/, "");
const INBOX_KEY = process.env.NEXT_PUBLIC_INBOX_ACCESS_KEY ?? "";

// Small helper type so consumers can see HTTP status if needed
export type ApiError = Error & { status?: number };

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!API) {
    throw new Error(
      'NEXT_PUBLIC_API_BASE is missing. ' +
        'Set it in your environment, e.g. NEXT_PUBLIC_API_BASE=https://ujani-whatsapp-bot.onrender.com'
    );
  }

  const url = `${API}${path}`;

  // Build headers as a plain object so we can safely add our custom header
  const originalHeaders = init.headers ?? {};
  const headersObj: Record<string, string> =
    originalHeaders instanceof Headers
      ? Object.fromEntries(originalHeaders.entries())
      : Array.isArray(originalHeaders)
      ? Object.fromEntries(originalHeaders)
      : { ...originalHeaders };

  // Attach inbox key for admin UI auth, if configured
  if (INBOX_KEY) {
    headersObj["x-inbox-key"] = INBOX_KEY;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: headersObj,
      cache: "no-store",
    });
  } catch (err: any) {
    console.error("[api] request failed", err);
    const e: ApiError = new Error("Failed to reach API");
    throw e;
  }

  if (!res.ok) {
    let body: any = undefined;
    try {
      body = await res.json();
    } catch {
      // ignore non-JSON error bodies
    }
    console.error("[api] non-OK response", res.status, body);
    const e: ApiError = new Error(
      body?.error ?? `API error (${res.status})`
    );
    e.status = res.status;
    throw e;
  }

  return (await res.json()) as T;
}

// Optional helpers – safe even if not used elsewhere
export function get<T>(path: string, init?: RequestInit) {
  return api<T>(path, { ...init, method: "GET" });
}

export function post<T>(path: string, body?: unknown, init?: RequestInit) {
  return api<T>(path, {
    ...init,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
