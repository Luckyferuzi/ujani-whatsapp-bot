import { Router } from "express";
import multer from "multer";
import { requireSession, requireAdmin } from "../middleware/sessionAuth.js";
import crypto from "crypto";
import {
  getAppIdEffective,
  getGraphApiVersionEffective,
  getPhoneNumberIdEffective,
  getWhatsAppTokenEffective,
} from "../runtime/companySettings.js";

export const whatsappProfilePhotoRoutes = Router();

/**
 * ENV required (use your existing names):
 * - WHATSAPP_TOKEN       : permanent/system-user token for Graph API
 * - PHONE_NUMBER_ID      : WhatsApp phone-number-id
 * - APP_ID               : Meta App ID (required for /{app-id}/uploads)
 * - GRAPH_API_VERSION    : optional, default v19.0
 */

const upload = multer({
  storage: multer.memoryStorage(), // no local files
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith("image/")) return cb(null, true);
    cb(new Error("invalid_file_type"));
  },
});

type GraphResult =
  | { ok: true; status: number; json: any; text: string }
  | { ok: false; status: number; json: any; text: string };

async function graphFetch(url: string, init: RequestInit): Promise<GraphResult> {
  const r = await fetch(url, init);
  const text = await r.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (!r.ok) return { ok: false, status: r.status, json, text };
  return { ok: true, status: r.status, json, text };
}

function asString(v: any): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function buildMultipartBody(
  fields: Array<{ name: string; value: string }>,
  files: Array<{ name: string; filename: string; mime: string; data: Buffer }>
): { body: Buffer; contentType: string } {
  const boundary = "----ujaniBoundary" + crypto.randomBytes(12).toString("hex");
  const chunks: Buffer[] = [];

  const push = (s: string) => chunks.push(Buffer.from(s, "utf8"));

  for (const f of fields) {
    push(`--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="${f.name}"\r\n\r\n`);
    push(`${f.value}\r\n`);
  }

  for (const file of files) {
    push(`--${boundary}\r\n`);
    push(
      `Content-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\n`
    );
    push(`Content-Type: ${file.mime}\r\n\r\n`);
    chunks.push(file.data);
    push(`\r\n`);
  }

  push(`--${boundary}--\r\n`);

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/**
 * POST /settings/whatsapp-profile-photo
 * multipart/form-data: file=<image>
 *
 * Flow:
 * 1) Create upload session: POST https://graph.facebook.com/{ver}/{appId}/uploads?file_length=&file_type=&file_name=
 * 2) Upload binary: POST https://graph.facebook.com/{ver}/{uploadId}  (or https://graph.facebook.com/{uploadId})
 *    - header: file_offset: 0
 *    - auth: Authorization: OAuth <token>  (most compatible)
 * 3) Apply to WhatsApp Business Profile:
 *    POST https://graph.facebook.com/{ver}/{phoneNumberId}/whatsapp_business_profile
 *    body: { messaging_product:"whatsapp", profile_picture_handle:<handle> }
 */
whatsappProfilePhotoRoutes.post(
  "/whatsapp-profile-photo",
  requireSession,
  requireAdmin,
  upload.single("file"),
  async (req: any, res) => {
    const token = getWhatsAppTokenEffective() || process.env.WHATSAPP_TOKEN;
    const phoneNumberId = getPhoneNumberIdEffective() || process.env.PHONE_NUMBER_ID;
    const appId = getAppIdEffective() || process.env.APP_ID;
    const version = getGraphApiVersionEffective();

    if (!token) return res.status(500).json({ error: "WHATSAPP_TOKEN_missing" });
    if (!phoneNumberId) return res.status(500).json({ error: "PHONE_NUMBER_ID_missing" });
    if (!appId) return res.status(500).json({ error: "APP_ID_missing" });

const f = req.file;
if (!f) return res.status(400).json({ error: "missing_file" });
// ✅ from here onward, TS knows f is defined


    const fileName = (f.originalname || "profile.jpg").slice(0, 120);
    const mimeType = f.mimetype || "application/octet-stream";
    const size = f.size ?? f.buffer?.length ?? 0;

    // -------------------------
    // 1) Create upload session
    // -------------------------
    const createUrl =
      `https://graph.facebook.com/${version}/${appId}/uploads` +
      `?file_length=${encodeURIComponent(String(size))}` +
      `&file_type=${encodeURIComponent(mimeType)}` +
      `&file_name=${encodeURIComponent(fileName)}`;

    const sessionResp = await graphFetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!sessionResp.ok) {
      return res.status(502).json({
        error: "upload_session_failed",
        message: "Failed to create resumable upload session.",
        details: sessionResp.json ?? sessionResp.text,
      });
    }

    const uploadId = sessionResp.json?.id;
    if (!uploadId) {
      return res.status(502).json({
        error: "upload_session_no_id",
        message: "Upload session created but no 'id' returned.",
        details: sessionResp.json ?? sessionResp.text,
      });
    }

    // -------------------------------------
    // 2) Upload binary to the upload session
    // -------------------------------------
    const urlV = `https://graph.facebook.com/${version}/${uploadId}`; // IMPORTANT: do NOT encode uploadId
    const urlNoV = `https://graph.facebook.com/${uploadId}`;

    async function tryRaw(url: string): Promise<GraphResult> {
      return graphFetch(url, {
        method: "POST",
        headers: {
          // OAuth header tends to be most compatible in this step
          Authorization: `OAuth ${token}`,
          "Content-Type": mimeType,
          "Content-Length": String(size),
          file_offset: "0",
        } as any,
        body: f.buffer,
      });
    }

    async function tryMultipart(url: string, fileField: "file" | "source"): Promise<GraphResult> {
      const mp = buildMultipartBody(
        [],
        [
          {
            name: fileField,
            filename: fileName,
            mime: mimeType,
            data: f.buffer,
          },
        ]
      );

      return graphFetch(url, {
        method: "POST",
        headers: {
          Authorization: `OAuth ${token}`,
          "Content-Type": mp.contentType,
          "Content-Length": String(mp.body.length),
          file_offset: "0",
        } as any,
        body: mp.body,
      });
    }

    // Attempt order: raw (versioned), raw (unversioned), multipart(file), multipart(source) for both URLs
    let uploadResp = await tryRaw(urlV);
    if (!uploadResp.ok) uploadResp = await tryRaw(urlNoV);

    if (!uploadResp.ok) uploadResp = await tryMultipart(urlV, "file");
    if (!uploadResp.ok) uploadResp = await tryMultipart(urlNoV, "file");

    if (!uploadResp.ok) uploadResp = await tryMultipart(urlV, "source");
    if (!uploadResp.ok) uploadResp = await tryMultipart(urlNoV, "source");

    if (!uploadResp.ok) {
      return res.status(502).json({
        error: "upload_binary_failed",
        message: "Meta upload failed at step 2 (binary upload).",
        details: uploadResp.json ?? uploadResp.text,
        tried: [urlV, urlNoV],
        hint:
          "Common causes: wrong APP_ID, wrong token type/permissions, or uploadId being encoded. This route avoids encoding.",
      });
    }

    // Handle extraction (Meta commonly returns 'h')
    const handle =
      uploadResp.json?.h ||
      uploadResp.json?.handle ||
      uploadResp.json?.id ||
      "";

    if (!handle) {
      return res.status(502).json({
        error: "upload_no_handle",
        message: "Meta upload succeeded but did not return a profile picture handle.",
        details: uploadResp.json ?? uploadResp.text,
      });
    }

    // ------------------------------------
    // 3) Apply to WhatsApp Business Profile
    // ------------------------------------
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
  // Don't fail the whole request — upload worked; apply may fail due to token/permission mismatch.
  // Return 200 so the UI can show a warning instead of an error toast.
  return res.status(200).json({
    ok: true,
    applied: false,
    handle,
    warning: "business_profile_update_failed",
    message:
      "Photo uploaded, but applying to WhatsApp profile failed. Check token permissions and that PHONE_NUMBER_ID belongs to this token/WABA.",
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
