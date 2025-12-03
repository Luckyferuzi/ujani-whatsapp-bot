// web/lib/auth.ts
import { API } from "./api";

export type AuthUser = {
  id: number;
  email: string;
  role: "admin" | "staff";
};

export type AuthResponse = {
  user: AuthUser;
  token: string;
};

async function authRequest(
  path: string,
  body: unknown
): Promise<AuthResponse> {
  if (!API) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE is missing. Set it in your environment, e.g. NEXT_PUBLIC_API_BASE=https://ujani-whatsapp-bot.onrender.com"
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
    // ignore JSON parse errors, we'll handle below
  }

  if (!res.ok) {
    const message =
      (data && (data.error || data.message)) ||
      `Request failed (${res.status})`;
    const err = new Error(message);
    throw err;
  }

  return data as AuthResponse;
}

// One-time admin setup (only works if backend allows it)
export function bootstrapAdmin(email: string, password: string) {
  return authRequest("/auth/bootstrap-admin", { email, password });
}

// Normal login for admin/staff
export function login(email: string, password: string) {
  return authRequest("/auth/login", { email, password });
}

// Store token + user in localStorage for later use
export function saveAuth(auth: AuthResponse) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("ujani_auth_token", auth.token);
  window.localStorage.setItem("ujani_auth_user", JSON.stringify(auth.user));
}

export function clearAuth() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("ujani_auth_token");
  window.localStorage.removeItem("ujani_auth_user");
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("ujani_auth_token");
}
