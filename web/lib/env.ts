"use client";

type WebRuntimeEnv = {
  apiBase: string;
  inboxAccessKey: string;
  vercel: boolean;
};

let cached: WebRuntimeEnv | null = null;

export function getWebRuntimeEnv(): WebRuntimeEnv {
  if (cached) return cached;

  const apiBase = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/+$/, "");
  const inboxAccessKey = process.env.NEXT_PUBLIC_INBOX_ACCESS_KEY ?? "";

  cached = {
    apiBase,
    inboxAccessKey,
    vercel: process.env.NEXT_PUBLIC_VERCEL_ENV != null || process.env.VERCEL === "1",
  };

  return cached;
}

export function assertWebApiBase() {
  const { apiBase } = getWebRuntimeEnv();
  if (!apiBase) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE is missing. Configure it in Vercel or your local web env so the frontend can reach Render."
    );
  }
  return apiBase;
}
