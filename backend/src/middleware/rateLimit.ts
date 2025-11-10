// src/middleware/rateLimit.ts
import type { Request, Response, NextFunction } from 'express';

type Options = {
  windowMs?: number;
  max?: number;
};

type Entry = {
  count: number;
  resetAt: number;
};

// Very small in-memory IP-based limiter (per-process).
// Good enough for Render free tier single dyno; replace with Redis if you scale.
export function rateLimit(opts: Options = {}) {
  const windowMs = opts.windowMs ?? 60_000; // 1 minute
  const max = opts.max ?? 120; // requests per IP per window
  const hits = new Map<string, Entry>();

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const now = Date.now();
      const key = (req.ip || (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown')
        .toString()
        .split(',')[0]
        .trim();

      const e = hits.get(key);
      if (!e || e.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return next();
      }

      e.count += 1;
      if (e.count > max) {
        const retryAfter = Math.ceil((e.resetAt - now) / 1000);
        res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json({ error: 'Too Many Requests' });
      }

      return next();
    } catch {
      // fail open
      return next();
    }
  };
}
