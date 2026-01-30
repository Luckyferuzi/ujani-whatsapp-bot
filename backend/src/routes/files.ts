import { Router } from "express";
import multer from "multer";
import { createHash, randomBytes } from "crypto";
import db from "../db/knex.js";
import { requireSession } from "../middleware/sessionAuth.js";

export const filesRoutes = Router();
export const publicMediaRoutes = Router();

const upload = multer({
  storage: multer.memoryStorage(), // IMPORTANT: no local files
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith("image/")) return cb(null, true);
    cb(new Error("invalid_file_type"));
  },
});

/**
 * POST /files/avatar
 * multipart/form-data: file=<image>
 * Stores bytes in DB and returns public URL.
 */
filesRoutes.post("/avatar", requireSession, upload.single("file"), async (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: "missing_file" });

  const token = randomBytes(24).toString("hex"); // public-safe id
  const sha256 = createHash("sha256").update(f.buffer).digest("hex");

  const user = (req as any).user as { id: number };

  await db("media_files").insert({
    token,
    created_by_user_id: user?.id ?? null,
    purpose: "avatar",
    file_name: f.originalname ?? null,
    mime_type: f.mimetype,
    size_bytes: f.size,
    sha256,
    data: f.buffer,
  });

  const base =
    (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "") ||
    `${req.protocol}://${req.get("host")}`;

  const url = `${base}/public/media/${token}`;
  return res.json({ url, token });
});

/**
 * GET /public/media/:token
 * Publicly serves image bytes (needed if WhatsApp must fetch it via URL).
 */
publicMediaRoutes.get("/media/:token", async (req, res) => {
  const token = String(req.params.token || "").trim();
  if (!token) return res.status(400).end();

  const row = await db("media_files")
    .select("mime_type", "data", "size_bytes")
    .where({ token })
    .first<{ mime_type: string; data: Buffer; size_bytes: number }>();

  if (!row) return res.status(404).end();

  res.setHeader("Content-Type", row.mime_type || "application/octet-stream");
  res.setHeader("Content-Length", String(row.size_bytes || row.data.length));

  // cache-friendly (safe because token is unique and immutable)
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

  return res.status(200).send(row.data);
});

/**
 * POST /files/product-image
 * multipart/form-data: file=<image>
 * Stores bytes in DB and returns a public URL (usable for WhatsApp Catalog).
 */
filesRoutes.post("/product-image", requireSession, upload.single("file"), async (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: "missing_file" });

  const token = randomBytes(24).toString("hex"); // public-safe id
  const sha256 = createHash("sha256").update(f.buffer).digest("hex");

  const user = (req as any).user as { id: number };

  await db("media_files").insert({
    token,
    created_by_user_id: user?.id ?? null,
    purpose: "product_image",
    file_name: f.originalname ?? null,
    mime_type: f.mimetype,
    size_bytes: f.size,
    sha256,
    data: f.buffer,
  });

  const base =
    (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "") ||
    `${req.protocol}://${req.get("host")}`;

  const url = `${base}/public/media/${token}`;
  return res.json({ url, token });
});
