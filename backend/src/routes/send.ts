// backend/src/routes/send.ts
import { Router } from "express";
import db from "../db/knex.js";
import multer from "multer";
import { sendText, sendMediaById, uploadMedia } from "../whatsapp.js";


export const sendRoutes = Router();
const upload = multer(); // memory storage

/**
 * POST /api/send
 * body: { conversationId: number, text?: string }
 *
 * Rules:
 * - conversation.agent_allowed must be true (customer chose ACTION_TALK_TO_AGENT)
 * - we log message in DB and send via WhatsApp
 */
sendRoutes.post("/send", async (req, res) => {
  try {
    const { conversationId, text } = req.body ?? {};
    const id = Number(conversationId);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "conversationId required" });
    }

    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: "text required" });
    }

    const convo = await db("conversations as c")
      .leftJoin("customers as u", "u.id", "c.customer_id")
      .where("c.id", id)
      .select("c.id", "c.agent_allowed", "c.phone_number_id", "u.wa_id")
      .first();

    if (!convo) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    if (!convo.agent_allowed) {
      return res.status(403).json({
        error:
          "Agent is not allowed for this conversation (customer has not chosen Ongea na mhudumu).",
      });
    }

    if (!convo.wa_id) {
      return res
        .status(400)
        .json({ error: "Customer wa_id missing; cannot send" });
    }

    const trimmed = String(text).trim();

    // Send via WhatsApp – if this fails, throw and let the outer catch handle it
    await sendText(convo.wa_id, trimmed, { phoneNumberId: (convo as any).phone_number_id ?? null });

    // Log outgoing message
    const [msg] = await db("messages")
      .insert({
        conversation_id: id,
        direction: "out",
        type: "text",
        body: trimmed,
        status: "sent",
      })
      .returning([
        "id",
        "conversation_id",
        "direction",
        "type",
        "body",
        "status",
        "created_at",
      ]);

    // Let UI know
    req.app.get("io")?.emit("message.created", {
      conversation_id: id,
      message: msg,
    });

    return res.json({ ok: true, message: msg });
  } catch (e: any) {
    console.error("POST /api/send failed", e);
    return res
      .status(500)
      .json({ error: e?.message ?? "send failed (WhatsApp error)" });
  }
});


/**
 * POST /api/upload-media
 * multipart/form-data:
 *  - file: binary
 *  - conversationId: number
 *  - kind?: "image" | "video" | "audio" | "document"
 */
sendRoutes.post(
  "/upload-media",
  upload.single("file"),
  async (req, res) => {
    try {
      const { conversationId, kind } = req.body ?? {};
      const id = Number(conversationId);
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "Missing file" });
      }

      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: "Invalid conversationId" });
      }

      // Find conversation + customer wa_id + agent_allowed (same as /send)
      const convo = await db("conversations")
        .where({ "conversations.id": id })
        .join("customers as cu", "cu.id", "conversations.customer_id")
        .select("conversations.agent_allowed", "conversations.phone_number_id", "cu.wa_id")
        .first();

      if (!convo) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      if (!convo.agent_allowed) {
        return res
          .status(403)
          .json({ error: "Agent is not allowed for this conversation" });
      }

      const waId = (convo as any).wa_id as string | null;
      if (!waId) {
        return res
          .status(400)
          .json({ error: "Customer wa_id missing; cannot send media" });
      }

      const mime = file.mimetype || "application/octet-stream";
      const filename = file.originalname || "file";

          // Infer type if not provided.
      // NOTE: WhatsApp does NOT accept SVG as an "image" message,
      // so we send SVG as a generic document instead.
      let type: "image" | "video" | "audio" | "document" = "document";

      if (
        kind === "image" ||
        kind === "video" ||
        kind === "audio" ||
        kind === "document"
      ) {
        type = kind;
      } else if (mime.startsWith("image/")) {
        if (mime === "image/svg+xml") {
          // SVG -> send as document
          type = "document";
        } else {
          type = "image";
        }
      } else if (mime.startsWith("video/")) {
        type = "video";
      } else if (mime.startsWith("audio/")) {
        type = "audio";
      }


      // 1) Upload media to WhatsApp → get mediaId
      const mediaId = await uploadMedia(file.buffer, filename, mime, {
        phoneNumberId: (convo as any).phone_number_id ?? null,
      });

      // 2) Send media message
      await sendMediaById(waId, type, mediaId, undefined, {
        phoneNumberId: (convo as any).phone_number_id ?? null,
      });

      // 3) Store outbound message in DB with MEDIA marker
      const [msg] = await db("messages")
        .insert({
          conversation_id: id,
          direction: "outbound",
          type,
          body: `MEDIA:${type}:${mediaId}`,
          status: "sent",
        })
        .returning([
          "id",
          "conversation_id",
          "direction",
          "type",
          "body",
          "status",
          "created_at",
        ]);

      // 4) Emit socket event so UI updates in real-time
      req.app.get("io")?.emit("message.created", {
        conversation_id: id,
        message: msg,
      });

      res.json({ ok: true, message: msg });
    } catch (e: any) {
      console.error("POST /api/upload-media failed", e);
      res
        .status(500)
        .json({ error: e?.message ?? "Failed to upload / send media" });
    }
  }
);

// POST /api/send-media
// body: { conversationId: number, kind: "image" | "video" | "audio" | "document", mediaId: string }
sendRoutes.post("/send-media", async (req, res) => {
  try {
    const { conversationId, kind, mediaId } = req.body ?? {};
    const id = Number(conversationId);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid conversationId" });
    }

    if (!mediaId || typeof mediaId !== "string") {
      return res.status(400).json({ error: "Missing mediaId" });
    }

    // Load conversation + customer
    const convo = await db("conversations as c")
      .leftJoin("customers as u", "u.id", "c.customer_id")
      .where("c.id", id)
      .select("c.id", "c.agent_allowed", "c.phone_number_id", "u.wa_id")
      .first();

    if (!convo) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    if (!convo.agent_allowed) {
      return res.status(403).json({
        error:
          "Agent is not allowed for this conversation (customer has not chosen Ongea na mhudumu).",
      });
    }

    const waId = (convo as any).wa_id as string | null;
    if (!waId) {
      return res
        .status(400)
        .json({ error: "Customer wa_id missing; cannot send media" });
    }

    // Normalise media type
    let type: "image" | "video" | "audio" | "document" = "document";
    if (
      kind === "image" ||
      kind === "video" ||
      kind === "audio" ||
      kind === "document"
    ) {
      type = kind;
    }

    // 1) Re-send media via WhatsApp
    await sendMediaById(waId, type, mediaId, undefined, {
      phoneNumberId: (convo as any).phone_number_id ?? null,
    });

    // 2) Log outgoing message
    const [msg] = await db("messages")
      .insert({
        conversation_id: id,
        direction: "out",
        type,
        body: `MEDIA:${type}:${mediaId}`,
        status: "sent",
      })
      .returning([
        "id",
        "conversation_id",
        "direction",
        "type",
        "body",
        "status",
        "created_at",
      ]);

    // 3) Notify UI
    req.app.get("io")?.emit("message.created", {
      conversation_id: id,
      message: msg,
    });

    return res.json({ ok: true, message: msg });
  } catch (e: any) {
    console.error("POST /api/send-media failed", e);
    return res
      .status(500)
      .json({ error: e?.message ?? "Failed to resend media" });
  }
});
