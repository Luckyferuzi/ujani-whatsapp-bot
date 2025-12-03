// backend/src/routes/auth.ts

import { Router } from "express";
import db from "../db/knex.js";
import { z } from "zod";
import { randomBytes, pbkdf2Sync, timingSafeEqual } from "crypto";
import { requireSession, requireAdmin } from "../middleware/sessionAuth.js";

export const authRoutes = Router();

/* ---------------------- Password hashing + helpers ---------------------- */

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 100_000, 64, "sha512").toString(
    "hex"
  );
  return `${salt}:${hash}`;
}

function verifyPassword(
  password: string,
  stored: string | null | undefined
): boolean {
  if (!stored) return false;
  const parts = stored.split(":");
  if (parts.length !== 2) return false;

  const [salt, hash] = parts;
  const candidate = pbkdf2Sync(password, salt, 100_000, 64, "sha512").toString(
    "hex"
  );

  try {
    return timingSafeEqual(
      Buffer.from(hash, "hex"),
      Buffer.from(candidate, "hex")
    );
  } catch {
    return false;
  }
}

async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await db("sessions").insert({
    token,
    user_id: userId,
  });
  return token;
}

/* ------------------ 1) One-time admin registration ------------------ */
/**
 * POST /auth/bootstrap-admin
 * Body: { email, password }
 * Only works when there are NO users yet.
 */
authRoutes.post("/bootstrap-admin", async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
  });

  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_payload" });
  }

  const { email, password } = parsed.data;

  const row = await db("users")
    .count<{ count: string }>({ count: "*" })
    .first();

  const hasUsers = row && Number(row.count) > 0;
  if (hasUsers) {
    return res.status(403).json({
      error: "admin_exists",
      message: "Admin already exists. Use /auth/login instead.",
    });
  }

  const [user] = await db("users")
    .insert(
      {
        email: email.toLowerCase().trim(),
        password_hash: hashPassword(password),
        role: "admin",
      },
      ["id", "email", "role"]
    )
    .catch((err: any) => {
      console.error("[auth] bootstrap-admin failed", err);
      throw err;
    });

  const token = await createSession(user.id);

  return res.status(201).json({ user, token });
});

/* -------------------------- 2) Login (admin/staff) -------------------------- */
/**
 * POST /auth/login
 * Body: { email, password }
 */
authRoutes.post("/login", async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });

  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_credentials" });
  }

  const { email, password } = parsed.data;

  const user = await db("users")
    .where({ email: email.toLowerCase().trim() })
    .first<{
      id: number;
      email: string;
      password_hash: string | null;
      role: "admin" | "staff";
    }>();

  if (!user || !user.password_hash) {
    return res.status(401).json({ error: "invalid_credentials" });
  }

  if (!verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: "invalid_credentials" });
  }

  const token = await createSession(user.id);

  return res.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    token,
  });
});

/* ------------------------------ 3) Who am I? ------------------------------ */
/**
 * GET /auth/me
 * header: Authorization: Bearer <token>
 */
authRoutes.get("/me", requireSession, async (req, res) => {
  const user = (req as any).user;
  return res.json({ user });
});

/* ----------------------- 4) Admin creates staff user ----------------------- */
/**
 * POST /auth/staff
 * header: Authorization: Bearer <admin token>
 * Body: { email, password }
 */
authRoutes.post(
  "/staff",
  requireSession,
  requireAdmin,
  async (req, res) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(6),
    });

    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_payload" });
    }

    const { email, password } = parsed.data;

    const existing = await db("users")
      .where({ email: email.toLowerCase().trim() })
      .first();
    if (existing) {
      return res.status(400).json({ error: "user_exists" });
    }

    const [user] = await db("users")
      .insert(
        {
          email: email.toLowerCase().trim(),
          password_hash: hashPassword(password),
          role: "staff",
        },
        ["id", "email", "role"]
      )
      .catch((err: any) => {
        console.error("[auth] create staff failed", err);
        throw err;
      });

    return res.status(201).json({ user });
  }
);

/* -------------------------- 5) Admin lists users -------------------------- */
/**
 * GET /auth/users
 * header: Authorization: Bearer <admin token>
 */
authRoutes.get("/users", requireSession, requireAdmin, async (_req, res) => {
  const users = await db("users")
    .select("id", "email", "role", "created_at")
    .orderBy("created_at", "asc");

  return res.json({ users });
});

/* ----------------------- 6) User updates own profile ----------------------- */
/**
 * PATCH /auth/profile
 * header: Authorization: Bearer <token>
 * Body: { email?: string, password?: string }
 */
authRoutes.patch("/profile", requireSession, async (req, res) => {
  const current = (req as any).user as {
    id: number;
    email: string;
    role: "admin" | "staff";
  };

  const schema = z.object({
    email: z.string().email().optional(),
    password: z.string().min(6).optional(),
  });

  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_payload" });
  }

  const { email, password } = parsed.data;

  const updates: Record<string, any> = {};

  if (email) {
    updates.email = email.toLowerCase().trim();
  }
  if (password) {
    updates.password_hash = hashPassword(password);
  }

  if (Object.keys(updates).length === 0) {
    return res.json({ ok: true });
  }

  try {
    await db("users").where({ id: current.id }).update(updates);
  } catch (err: any) {
    console.error("[auth] profile update failed", err);
    return res.status(500).json({ error: "update_failed" });
  }

  return res.json({ ok: true });
});
