// backend/src/routes/send.ts
import { Router } from "express";
import db from "../db/knex.js";
import { sendText } from "../whatsapp.js";

export const sendRoutes = Router();

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
      .select("c.id", "c.agent_allowed", "u.wa_id")
      .first();

    if (!convo) return res.status(404).json({ error: "Conversation not found" });
    if (!convo.agent_allowed) {
      return res.status(403).json({
        error: "Agent is not allowed for this conversation (customer has not chosen Ongea na mhudumu).",
      });
    }
    if (!convo.wa_id) {
      return res
        .status(400)
        .json({ error: "Customer wa_id missing; cannot send" });
    }

    const trimmed = String(text).trim();

    // Send via WhatsApp
    await sendText(convo.wa_id, trimmed).catch((e) =>
      console.warn("sendText failed:", e)
    );

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

    res.json({ ok: true, message: msg });
  } catch (e: any) {
    console.error("POST /api/send failed", e);
    res.status(500).json({ error: e?.message ?? "send failed" });
  }
});
