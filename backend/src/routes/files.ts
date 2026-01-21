// backend/src/routes/files.ts
import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { requireSession } from "../middleware/sessionAuth.js";

export const filesRoutes = Router();

// Store uploads under backend/uploads/avatars
const AVATAR_DIR = path.resolve(process.cwd(), "uploads", "avatars");
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AVATAR_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const allowed = new Set([".png", ".jpg", ".jpeg", ".webp"]);
    const safeExt = allowed.has(ext) ? ext : ".jpg";

    const id =
      Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);

    cb(null, `avatar-${id}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    // accept only images
    if (file.mimetype?.startsWith("image/")) return cb(null, true);
    cb(new Error("invalid_file_type"));
  },
});

/**
 * POST /files/avatar
 * multipart/form-data: file=<image>
 * returns: { url, path }
 */
filesRoutes.post(
  "/avatar",
  requireSession,
  upload.single("file"),
  async (req, res) => {
    const f = req.file;
    if (!f) return res.status(400).json({ error: "missing_file" });

    const publicPath = `/uploads/avatars/${f.filename}`;
    const host = req.get("host");

    // Prefer explicit public base if provided (better behind proxies)
    const base =
      process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") ||
      `${req.protocol}://${host}`;

    return res.json({
      path: publicPath,
      url: `${base}${publicPath}`,
    });
  }
);
