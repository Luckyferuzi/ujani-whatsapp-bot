import { Router } from "express";
import multer from "multer";
import { requireSession, requireAdmin } from "../middleware/sessionAuth.js";

export const whatsappProfilePhotoRoutes = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith("image/")) return cb(null, true);
    cb(new Error("invalid_file_type"));
  },
});

async function graphFetch(url: string, init: RequestInit) {
  const r = await fetch(url, init);
  const text = await r.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch {}
  if (!r.ok) return { ok: false, status: r.status, json, text };
  return { ok: true, status: r.status, json, text };
}

whatsappProfilePhotoRoutes.post(
  "/whatsapp-profile-photo",
  requireSession,     // ✅ ensures req.user exists
  requireAdmin,       // ✅ uses your real role logic (403 "forbidden" if not admin)
  upload.single("file"),
  async (req: any, res) => {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.PHONE_NUMBER_ID;
    const version = process.env.GRAPH_API_VERSION || "v19.0";
    const appId = process.env.APP_ID; // needed for resumable upload session

    if (!token) return res.status(500).json({ error: "WHATSAPP_TOKEN_missing" });
    if (!phoneNumberId) return res.status(500).json({ error: "PHONE_NUMBER_ID_missing" });
    if (!appId) return res.status(500).json({ error: "APP_ID_missing" });

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
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!sessionResp.ok) {
      return res.status(502).json({ error: "upload_session_failed", details: sessionResp.json ?? sessionResp.text });
    }

    const uploadId = sessionResp.json?.id;
    if (!uploadId) {
      return res.status(502).json({ error: "upload_session_no_id", details: sessionResp.json });
    }

    // 2) Upload binary
    const uploadUrl = `https://graph.facebook.com/${version}/${encodeURIComponent(uploadId)}`;

    const uploadResp = await graphFetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": f.mimetype,
        file_offset: "0",
      } as any,
      body: f.buffer,
    });

    if (!uploadResp.ok) {
      return res.status(502).json({ error: "upload_binary_failed", details: uploadResp.json ?? uploadResp.text });
    }

    const handle = uploadResp.json?.h || uploadResp.json?.handle;
    if (!handle) {
      return res.status(502).json({ error: "upload_no_handle", details: uploadResp.json ?? uploadResp.text });
    }

    // 3) Apply to WhatsApp Business Profile
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

    return res.json({ ok: true, applied: true, handle });
  }
);
