// web/lib/api.ts
export const API = process.env.NEXT_PUBLIC_API_BASE ?? ""; // empty => use rewrites

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, { ...init, cache: "no-store" });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`API ${path} failed: ${r.status} ${r.statusText}\n${text}`);
  }
  return r.json();
}
