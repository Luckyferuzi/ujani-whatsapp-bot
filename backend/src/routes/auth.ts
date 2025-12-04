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
authRoutes.post("/bootstrap-admin", async (req, res) => {
  try {
    const body = req.body ?? {};
    const rawEmail = body.email;
    const rawPassword = body.password;

    // Basic checks instead of strict Zod
    if (!rawEmail || !rawPassword) {
      return res.status(400).json({
        error: "missing_fields",
        message: "Email na nenosiri vinahitajika.",
      });
    }

    const email = String(rawEmail).toLowerCase().trim();
    const password = String(rawPassword);

    // Very light validation, so you don't get "invalid_payload" for minor issues
    if (!email.includes("@") || !email.includes(".")) {
      return res.status(400).json({
        error: "invalid_email",
        message: "Barua pepe si sahihi.",
      });
    }

    if (password.length < 4) {
      return res.status(400).json({
        error: "weak_password",
        message: "Nenosiri liwe angalau herufi 4.",
      });
    }

    // Check if there's already at least one user
    const row = await db("users")
      .count<{ count: string }>({ count: "*" })
      .first();

    const hasUsers = row && Number(row.count) > 0;
    if (hasUsers) {
      return res.status(403).json({
        error: "admin_exists",
        message: "Admin tayari yupo. Tumia /auth/login badala yake.",
      });
    }

    // Create the first admin user
    const [user] = await db("users")
      .insert(
        {
          email,
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
  } catch (err) {
    console.error("[auth] bootstrap-admin unexpected error", err);
    return res.status(500).json({
      error: "internal_error",
      message: "Imeshindikana kusajili admin kwa sasa.",
    });
  }
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
    try {
      const body = req.body ?? {};
      const rawEmail = body.email;
      const rawPassword = body.password;

      // Basic presence checks
      if (!rawEmail || !rawPassword) {
        return res.status(400).json({
          error: "missing_fields",
          message: "Email na nenosiri vinahitajika.",
        });
      }

      const email = String(rawEmail).toLowerCase().trim();
      const password = String(rawPassword);

      // Very light email validation
      if (!email.includes("@") || !email.includes(".")) {
        return res.status(400).json({
          error: "invalid_email",
          message: "Barua pepe si sahihi.",
        });
      }

      // Simple password rule
      if (password.length < 4) {
        return res.status(400).json({
          error: "weak_password",
          message: "Nenosiri liwe angalau herufi 4.",
        });
      }

      // Check if user already exists
      const existing = await db("users")
        .where({ email })
        .first();
      if (existing) {
        return res.status(400).json({
          error: "user_exists",
          message: "Mtumiaji mwenye barua pepe hii tayari yupo.",
        });
      }

      // Create staff user
      const [user] = await db("users")
        .insert(
          {
            email,
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
    } catch (err) {
      console.error("[auth] create staff unexpected error", err);
      return res.status(500).json({
        error: "internal_error",
        message: "Imeshindikana kuongeza mfanyakazi mpya.",
      });
    }
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

// GET /auth/users/:userId/activity
// Overall activity summary for a user.
// NOTE: current schema does not link orders/incomes/expenses to users,
// so these numbers are overall system stats, not per-user.
authRoutes.get(
  "/users/:userId/activity",
  requireSession,
  requireAdmin,
  async (req, res) => {
    try {
      const userId = Number(req.params.userId);
      if (!Number.isFinite(userId)) {
        return res.status(400).json({ error: "invalid_user_id" });
      }

      const user = await db("users")
        .select("id", "email", "role", "created_at")
        .where({ id: userId })
        .first();

      if (!user) {
        return res.status(404).json({ error: "user_not_found" });
      }

      // These use only existing columns:
      // orders.status, orders.created_at
      // incomes.id, expenses.id

      const ordersAgg = await db("orders")
        .where({ status: "delivered" })
        .count<{ count: string }>("id as count")
        .first();

      const lastOrderRow = await db("orders")
        .where({ status: "delivered" })
        .max<{ last_order_at: string | null }>(
          "created_at as last_order_at"
        )
        .first();

      const incomesAgg = await db("incomes")
        .count<{ count: string }>("id as count")
        .first();

      const expensesAgg = await db("expenses")
        .count<{ count: string }>("id as count")
        .first();

      const completed_orders =
        Number(ordersAgg?.count ?? 0) || 0;
      const incomes_recorded =
        Number(incomesAgg?.count ?? 0) || 0;
      const expenses_recorded =
        Number(expensesAgg?.count ?? 0) || 0;
      const last_order_at =
        lastOrderRow?.last_order_at ?? null;

      return res.json({
        user,
        stats: {
          completed_orders,
          incomes_recorded,
          expenses_recorded,
          last_order_at,
        },
      });
    } catch (err) {
      console.error("[auth] user activity failed", err);
      return res.status(500).json({
        error: "internal_error",
        message: "Imeshindikana kupakua taarifa za shughuli.",
      });
    }
  }
);


// PATCH /auth/users/:userId
// Update email and/or role.
authRoutes.patch(
  "/users/:userId",
  requireSession,
  requireAdmin,
  async (req, res) => {
    try {
      const userId = Number(req.params.userId);
      if (!Number.isFinite(userId)) {
        return res.status(400).json({ error: "invalid_user_id" });
      }

      const body = req.body ?? {};
      const updates: any = {};

      if (body.email) {
        const email = String(body.email).toLowerCase().trim();
        if (!email.includes("@") || !email.includes(".")) {
          return res.status(400).json({
            error: "invalid_email",
            message: "Barua pepe si sahihi.",
          });
        }
        updates.email = email;
      }

      if (body.role) {
        const role = String(body.role);
        if (role !== "admin" && role !== "staff") {
          return res.status(400).json({ error: "invalid_role" });
        }
        updates.role = role;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "nothing_to_update" });
      }

      // 1) run the update (returns number of affected rows)
      const updatedCount = await db("users")
        .where({ id: userId })
        .update(updates);

      if (!updatedCount) {
        return res.status(404).json({ error: "user_not_found" });
      }

      // 2) fetch the updated row
      const updated = await db("users")
        .select("id", "email", "role", "created_at")
        .where({ id: userId })
        .first();

      if (!updated) {
        return res.status(404).json({ error: "user_not_found" });
      }

      return res.json({ user: updated });
    } catch (err) {
      console.error("[auth] update user failed", err);
      return res.status(500).json({
        error: "internal_error",
        message: "Imeshindikana kusasisha mtumiaji.",
      });
    }
  }
);


// DELETE /auth/users/:userId
authRoutes.delete(
  "/users/:userId",
  requireSession,
  requireAdmin,
  async (req, res) => {
    try {
      const userId = Number(req.params.userId);
      if (!Number.isFinite(userId)) {
        return res.status(400).json({ error: "invalid_user_id" });
      }

      // Optional: prevent deleting yourself or last admin, if you want.
      // For now we just delete.
      const deleted = await db("users")
        .where({ id: userId })
        .del();

      if (!deleted) {
        return res.status(404).json({ error: "user_not_found" });
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error("[auth] delete user failed", err);
      return res.status(500).json({
        error: "internal_error",
        message: "Imeshindikana kufuta mtumiaji.",
      });
    }
  }
);
