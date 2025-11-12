import { Router } from "express";
import db from "../db/knex.js";

export const sendRoutes = Router();

/**
 * POST /api/send
 * body: { conversationId: string, text?: string, templateId?: string, variables?: any }
 * Enforces: agent_allowed AND (within 24h OR template)
 */
sendRoutes.post("/send", async (req, res) => {
  try {
    const { conversationId, text, templateId, variables } = req.body ?? {};
    if (!conversationId) return res.status(400).json({ error: "conversationId required" });

    const convo = await db("conversations").where({ id: conversationId }).first("*");
    if (!convo) return res.status(404).json({ error: "Conversation not found" });

    const last = new Date(convo.last_user_message_at ?? 0).getTime();
    const within24h = Date.now() - last < 24 * 60 * 60 * 1000;

    if (!convo.agent_allowed) {
      return res.status(403).json({ error: "Bot active — customer must tap 'Ongea na mhudumu'." });
    }
    if (!within24h && !templateId) {
      return res.status(403).json({ error: "Outside 24h — send a template instead." });
    }

    const token = process.env.ACCESS_TOKEN!;
    const phoneNumberId = process.env.PHONE_NUMBER_ID!;
    const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;

    const customer = await db("customers").where({ id: convo.customer_id }).first("*");
    const to = customer?.wa_id || customer?.phone;
    if (!to) return res.status(400).json({ error: "Customer phone/wa_id missing" });

    let body: any;
    if (templateId) {
      body = {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateId,
          language: { code: "en_US" },
          components: variables ? [{ type: "body", parameters: variables }] : []
        }
      };
    } else if (text) {
      body = { messaging_product: "whatsapp", to, type: "text", text: { body: text } };
    } else {
      return res.status(400).json({ error: "text or templateId required" });
    }

    // Node 18+ has global fetch; no extra deps
    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return res.status(resp.status).json({ error: "WhatsApp send failed", details: data });
    }

    // log outbound message
    const [msg] = await db("messages")
      .insert({
        conversation_id: conversationId,
        direction: "out",
        type: templateId ? "template" : "text",
        body: text ?? `[template:${templateId}]`,
        status: "sent"
      })
      .returning("*");

    // notify UI
    req.app.get("io")?.emit("message.created", {
      id: msg.id,
      conversation_id: conversationId
    });

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "send failed" });
  }
});
