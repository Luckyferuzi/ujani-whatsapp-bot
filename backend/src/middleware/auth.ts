// backend/src/middleware/auth.ts
import { Request, Response, NextFunction } from "express";
import { env } from "../config.js";

/**
 * Simple header-based auth for /api.
 * Frontend must send:  x-inbox-key: <INBOX_ACCESS_KEY>
 */
export function requireInboxAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const required = process.env.INBOX_ACCESS_KEY || env.PUBLIC_BASE_URL; // env parse ensures dotenv loaded
  // Prefer explicit INBOX_ACCESS_KEY; PUBLIC_BASE_URL fallback prevents crash in dev.

  if (!process.env.INBOX_ACCESS_KEY) {
    console.warn(
      "[auth] INBOX_ACCESS_KEY is not set; /api is effectively unprotected."
    );
    // In dev you might want to allow; in prod you should enforce setting this.
    // For now, if not set, just continue.
    return next();
  }

  const provided =
    (req.headers["x-inbox-key"] as string | undefined) ||
    (req.query.key as string | undefined);

  if (!provided || provided !== process.env.INBOX_ACCESS_KEY) {
    return res.status(401).json({ error: "unauthorized" });
  }

  return next();
}
