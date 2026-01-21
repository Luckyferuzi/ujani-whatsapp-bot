import { Request, Response, NextFunction } from "express";
import db from "../db/knex.js";

export async function requireSession(req: Request, res: Response, next: NextFunction) {
  const token =
    (req.headers["authorization"] as string | undefined)?.replace("Bearer ", "") ||
    (req.cookies?.ujani_session as string | undefined);

  if (!token) return res.status(401).json({ error: "unauthorized" });

  const session = await db("sessions")
    .join("users", "sessions.user_id", "users.id")
    .where("sessions.token", token)
    .select(
      "users.id",
      "users.email",
      "users.role",
      "users.full_name",
      "users.phone",
      "users.business_name",
      "users.avatar_url",
      "users.bio"
    )
    .first();

  if (!session) return res.status(401).json({ error: "invalid_session" });

  (req as any).user = {
    id: session.id,
    email: session.email,
    role: session.role,
    full_name: (session as any).full_name ?? null,
    phone: (session as any).phone ?? null,
    business_name: (session as any).business_name ?? null,
    avatar_url: (session as any).avatar_url ?? null,
    bio: (session as any).bio ?? null,
  };

  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!(req as any).user || (req as any).user.role !== "admin") {
    return res.status(403).json({ error: "forbidden" });
  }
  next();
}
