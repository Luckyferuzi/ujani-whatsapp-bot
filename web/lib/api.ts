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
      "NEXT_PUBLIC_API_BASE is missing. " +
        "Set it in your environment, e.g. NEXT_PUBLIC_API_BASE=https://ujani-whatsapp-bot.onrender.com"
    );
  }

  const url = API + path;

  const headers = new Headers(init.headers ?? {});
  if (INBOX_KEY) {
    headers.set("X-Inbox-Key", INBOX_KEY);
  }

  const res = await fetch(url, {
    ...init,
    headers,
  });

  // --- Special case: 204 No Content (e.g. DELETE) ---
  if (res.status === 204) {
    // No body to parse, just return undefined
    return undefined as unknown as T;
  }

  // --- Handle non-OK responses (4xx / 5xx) ---
  if (!res.ok) {
    let body: any = undefined;
    try {
      body = await res.json();
    } catch {
      // ignore parse errors – some error responses are not JSON
    }
    console.error("[api] non-OK response", res.status, body ?? {});
    const e: ApiError = new Error(body?.error ?? `API error (${res.status})`);
    e.status = res.status;
    throw e;
  }

  // --- OK response: try to parse JSON, but handle empty body ---
  const text = await res.text();
  if (!text) {
    return undefined as unknown as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch (err) {
    console.error("[api] failed to parse JSON", err, { text });
    const e: ApiError = new Error("Failed to parse API JSON response");
    e.status = res.status;
    throw e;
  }
}

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

export function put<T>(path: string, body?: unknown, init?: RequestInit) {
  return api<T>(path, {
    ...init,
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function patch<T>(path: string, body?: unknown, init?: RequestInit) {
  return api<T>(path, {
    ...init,
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
