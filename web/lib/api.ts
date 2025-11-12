export const API = process.env.NEXT_PUBLIC_API_BASE!;
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, { ...init, cache: "no-store" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
