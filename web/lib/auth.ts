// web/lib/auth.ts
import { API } from "./api";

export type AuthUser = {
  id: number;
  email: string;
  // NOTE: backend can return additional roles; keep this union in sync.
  role: "admin" | "supervisor" | "staff";

  // Profile fields (nullable)
  full_name?: string | null;
  phone?: string | null;
  business_name?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
};

export type AuthResponse = {
  user: AuthUser;
  token: string;
};

const TOKEN_KEY = "ujani_auth_token";
const USER_KEY = "ujani_auth_user";
const LAST_ACTIVITY_KEY = "ujani_auth_last_activity";

async function authPost(path: string, body: unknown): Promise<AuthResponse> {
  if (!API) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE is missing. Set NEXT_PUBLIC_API_BASE in your environment."
    );
  }

  const res = await fetch(API + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // ignore JSON parse errors
  }

  if (!res.ok) {
    const message =
      (data && (data.error || data.message)) ||
      `Request failed (${res.status})`;
    throw new Error(message);
  }

  return data as AuthResponse;
}

export function bootstrapAdmin(email: string, password: string) {
  return authPost("/auth/bootstrap-admin", { email, password });
}

export function login(email: string, password: string) {
  return authPost("/auth/login", { email, password });
}

export function saveAuth(auth: AuthResponse) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, auth.token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(auth.user));
  window.localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
}

export function clearAuth() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(LAST_ACTIVITY_KEY);
}

export function touchActivity() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
}

export function loadAuth():
  | { token: string; user: AuthUser; lastActivity: number | null }
  | null {
  if (typeof window === "undefined") return null;

  const token = window.localStorage.getItem(TOKEN_KEY);
  const userRaw = window.localStorage.getItem(USER_KEY);
  const lastRaw = window.localStorage.getItem(LAST_ACTIVITY_KEY);

  if (!token || !userRaw) return null;

  try {
    const user = JSON.parse(userRaw) as AuthUser;
    const lastActivity = lastRaw ? Number(lastRaw) : null;
    return {
      token,
      user,
      lastActivity: lastActivity && !isNaN(lastActivity) ? lastActivity : null,
    };
  } catch {
    return null;
  }
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

/* ======================= Authenticated JSON helpers ======================= */

function requireToken(): string {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Session imeisha. Tafadhali ingia tena.");
  }
  return token;
}

async function authedJson<T>(path: string, init: RequestInit): Promise<T> {
  if (!API) {
    throw new Error("NEXT_PUBLIC_API_BASE is missing.");
  }
  const token = requireToken();

  const res = await fetch(API + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // ignore parse errors
  }

  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data as T;
}

export function authGet<T>(path: string): Promise<T> {
  return authedJson<T>(path, { method: "GET" });
}

export function authPostJson<T>(path: string, body: unknown): Promise<T> {
  return authedJson<T>(path, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export function authPatchJson<T>(path: string, body: unknown): Promise<T> {
  return authedJson<T>(path, {
    method: "PATCH",
    body: JSON.stringify(body ?? {}),
  });
}

export async function authPostForm<T>(path: string, form: FormData): Promise<T> {
  if (!API) {
    throw new Error("NEXT_PUBLIC_API_BASE is missing.");
  }

  const token = getAuthToken(); // ✅ uses ujani_auth_token
  if (!token) {
    throw new Error("Session imeisha. Tafadhali ingia tena.");
  }

  const res = await fetch(API + path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      // ❗ Do not set Content-Type for FormData (browser sets boundary)
    },
    body: form,
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {}

  if (!res.ok) {
const msg =
  (data && (data.message || data.error)) ||
  `Request failed (${res.status})`;

const extra =
  data?.details ? ` | details: ${typeof data.details === "string" ? data.details : JSON.stringify(data.details)}` : "";

throw new Error(msg + extra);

  }

  return data as T;
}


export function authDelete(path: string): Promise<void> {
  return authedJson<void>(path, { method: "DELETE" });
}
