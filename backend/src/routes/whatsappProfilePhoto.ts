import { Router } from "express";
import multer from "multer";
import { env } from "../config.js";

export const whatsappProfilePhotoRoutes = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith("image/")) return cb(null, true);
    cb(new Error("invalid_file_type"));
  },
});

// You likely already have auth middleware in your project.
// Replace this with your existing session/auth middleware.
function requireAdmin(req: any, res: any, next: any) {
  const u = req.user; // assumes your auth middleware sets req.user
  if (!u || u.role !== "admin") return res.status(403).json({ error: "admin_only" });
  next();
}

async function graphFetch(url: string, init: RequestInit) {
  const r = await fetch(url, init);
  const text = await r.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch {}
  if (!r.ok) {
    return { ok: false, status: r.status, json, text };
  }
  return { ok: true, status: r.status, json, text };
}

/**
 * POST /settings/whatsapp-profile-photo
 * multipart/form-data: file=<image>
 *
 * Implements:
 * 1) POST /{version}/app/uploads?file_length=&file_type=&file_name=  :contentReference[oaicite:12]{index=12}
 * 2) POST /{version}/{Upload-ID} with headers: file_offset:0, Content-Type:image/*  :contentReference[oaicite:13]{index=13}
 * 3) POST /{version}/{Phone-Number-ID}/whatsapp_business_profile with profile_picture_handle :contentReference[oaicite:14]{index=14}
 */
whatsappProfilePhotoRoutes.post(
  "/whatsapp-profile-photo",
  requireAdmin,
  upload.single("file"),
  async (req: any, res) => {
    const token = process.env.WHATSAPP_OKEN; // permanent/system-user token
    const version = process.env.META_GRAPH_VERSION || "v18.0";
    const phoneNumberId = process.env.PHONE_NUMBER_ID;
    const appId = (process.env as any).APP_ID || "";
if (!appId) return res.status(500).json({ error: "APP_ID_missing" });

    if (!token) return res.status(500).json({ error: "META_ACCESS_TOKEN_missing" });
    if (!phoneNumberId) return res.status(500).json({ error: "WA_PHONE_NUMBER_ID_missing" });

    const f = req.file;
    if (!f) return res.status(400).json({ error: "missing_file" });

    // 1) Create upload session
const createUrl =
  `https://graph.facebook.com/${version}/${appId}/uploads` +
  `?file_length=${encodeURIComponent(String(f.size))}` +
  `&file_type=${encodeURIComponent(f.mimetype)}` +
  `&file_name=${encodeURIComponent(f.originalname || "profile.jpg")}`;

    const sessionResp = await graphFetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!sessionResp.ok) {
      return res.status(502).json({
        error: "upload_session_failed",
        details: sessionResp.json ?? sessionResp.text,
      });
    }

    const uploadId = sessionResp.json?.id || sessionResp.json?.upload_id || sessionResp.json?.uri;
    if (!uploadId) {
      return res.status(502).json({ error: "upload_session_no_id", details: sessionResp.json });
    }

    // 2) Upload the binary file data (file_offset must be header and must be 0). :contentReference[oaicite:15]{index=15}
    const uploadUrl = `https://graph.facebook.com/${version}/${encodeURIComponent(uploadId)}`;

    const uploadResp = await graphFetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": f.mimetype,
        // must be header, not query param :contentReference[oaicite:16]{index=16}
        "file_offset": "0",
      } as any,
      body: f.buffer,
    });

    if (!uploadResp.ok) {
      return res.status(502).json({
        error: "upload_binary_failed",
        details: uploadResp.json ?? uploadResp.text,
      });
    }

    // Response returns a handle (used as profile_picture_handle). :contentReference[oaicite:17]{index=17}
    const handle =
      uploadResp.json?.h ||
      uploadResp.json?.handle ||
      uploadResp.json?.id;

    if (!handle) {
      return res.status(502).json({
        error: "upload_no_handle",
        details: uploadResp.json ?? uploadResp.text,
      });
    }

    // 3) Update business profile with profile_picture_handle :contentReference[oaicite:18]{index=18}
    const updateUrl = `https://graph.facebook.com/${version}/${phoneNumberId}/whatsapp_business_profile`;

    const updateResp = await graphFetch(updateUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        profile_picture_handle: handle,
      }),
    });

    if (!updateResp.ok) {
      return res.status(502).json({
        ok: false,
        applied: false,
        handle,
        error: "business_profile_update_failed",
        details: updateResp.json ?? updateResp.text,
      });
    }

    return res.json({
      ok: true,
      applied: true,
      handle,
    });
  }
);
