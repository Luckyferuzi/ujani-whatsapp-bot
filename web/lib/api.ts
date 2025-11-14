// web/lib/api.ts

// Base URL of your backend API, e.g.
// NEXT_PUBLIC_API_BASE=https://ujani-whatsapp-bot.onrender.com
export const API = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/+$/, "");

// Small helper type so consumers can see HTTP status if needed
export type ApiError = Error & { status?: number };

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API) {
    throw new Error(
      'NEXT_PUBLIC_API_BASE is missing. ' +
        'Set it in your environment, e.g. NEXT_PUBLIC_API_BASE=https://ujani-whatsapp-bot.onrender.com'
    );
  }

  const url = `${API}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      cache: "no-store",
    });
  } catch (err) {
    console.error("API network error", { url, error: err });
    const e: ApiError = new Error("Network error while calling API");
    e.status = undefined;
    throw e;
  }

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  let payload: unknown = null;

  if (isJson) {
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
  } else {
    try {
      payload = await res.text();
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    const baseMsg = `API error ${res.status} ${res.statusText}`;
    const maybeError =
      payload && typeof payload === "object" && "error" in (payload as any)
        ? `: ${(payload as any).error}`
        : "";

    const e: ApiError = new Error(baseMsg + maybeError);
    e.status = res.status;

    console.error("API HTTP error", {
      url,
      status: res.status,
      payload,
    });

    throw e;
  }

  return payload as T;
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
