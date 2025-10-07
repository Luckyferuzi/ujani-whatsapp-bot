// src/routes/webhook.ts
import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import pino from "pino";

import { env } from "../config.js";
import { t, type Lang } from "../i18n.js";
import { calcDeliveryFareTZS, buildQuoteLine } from "../delivery.js";
import { resolveDarLocation } from "../wards.js";

import {
  getSession,
  setExpecting,
  setLang as setLangSess,
  setFullName,
  setPhoneNumber,
  updateCheckout,
} from "../session.js";

import {
  sendText,
  sendInteractiveButtons, // assumes your whatsapp.ts has this (id/title)
} from "../whatsapp.js";

const logger = pino({ name: "webhook" });
export const webhook = Router();

/* -------------------------------------------------------------------------- */
/*                         GET: Meta Verification                             */
/* -------------------------------------------------------------------------- */

webhook.get("/", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === env.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/* -------------------------------------------------------------------------- */
/*                         POST: Signature Check                              */
/* -------------------------------------------------------------------------- */

function verifySignature(req: Request): boolean {
  const appSecret = env.APP_SECRET;
  if (!appSecret) return true; // permissive if not configured
  try {
    const raw = (req as any).rawBody as Buffer; // ensure your body-parser keeps rawBody
    const header = req.headers["x-hub-signature-256"] as string | undefined;
    if (!raw || !header) return true; // soft-accept to avoid retries
    const hmac = crypto.createHmac("sha256", appSecret);
    hmac.update(raw);
    const expected = "sha256=" + hmac.digest("hex");
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(header));
  } catch {
    return true;
  }
}

/* -------------------------------------------------------------------------- */
/*                        WhatsApp inbound: parsing                           */
/* -------------------------------------------------------------------------- */

type InMsg = {
  from: string;
  text?: string;
  interactiveId?: string;
  interactiveTitle?: string;
  lang?: Lang;
};

function parseIncoming(body: any): InMsg[] {
  const out: InMsg[] = [];
  const entries = body?.entry ?? [];
  for (const e of entries) {
    const changes = e?.changes ?? [];
    for (const ch of changes) {
      const value = ch?.value;
      const contacts = value?.contacts ?? [];
      const messages = value?.messages ?? [];
      const nameLang = (contacts[0]?.profile?.name_lang || "").toLowerCase();

      for (const m of messages) {
        const item: InMsg = { from: String(m?.from || "") };
        if (!item.from) continue;

        if (nameLang === "sw") item.lang = "sw";

        if (m.type === "text" && m.text?.body) {
          item.text = String(m.text.body || "").trim();
        }

        if (m.type === "interactive") {
          const lr = m.interactive?.list_reply ?? m.interactive?.button_reply;
          if (lr) {
            item.interactiveId = lr.id;
            item.interactiveTitle = lr.title;
          }
        }

        out.push(item);
      }
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*                               Webhook: POST                                */
/* -------------------------------------------------------------------------- */

webhook.post("/", async (req: Request, res: Response) => {
  if (!verifySignature(req)) {
    logger.warn("Invalid signature (soft-accepted)");
    return res.sendStatus(200);
  }

  const inbound = parseIncoming(req.body);
  if (!inbound.length) {
    // Status webhooks / delivery receipts; nothing to reply to
    return res.sendStatus(200);
  }

  for (const m of inbound) {
    try {
      await handleMessage(m);
    } catch (err) {
      logger.error({ err }, "handleMessage failed");
    }
  }

  res.sendStatus(200);
});

/* -------------------------------------------------------------------------- */
/*                                   Logic                                    */
/* -------------------------------------------------------------------------- */

async function handleMessage(m: InMsg) {
  const from = m.from;
  const s = getSession(from);
  const lang: Lang = (m.lang ?? s.lang ?? "sw") as Lang;
  setLangSess(from, lang);

  /* ---------------------------- Interactive first ------------------------- */
  if (m.interactiveId) {
    if (m.interactiveId === "in_dar") {
      setExpecting(from, "phone_in_dar");
      await sendText({ to: from, body: t(lang, "ask_phone_in_dar") });
      return;
    }
    if (m.interactiveId === "out_dar") {
      setExpecting(from, "region_outside");
      await sendText({ to: from, body: t(lang, "ask_region_outside") });
      return;
    }
    // Unknown button → ignore and fall through to text
  }

  /* --------------------------------- Text --------------------------------- */
  const text = (m.text || "").trim();
  if (!text) {
    // Nudge to start at full name
    setExpecting(from, "full_name");
    await sendText({ to: from, body: t(lang, "ask_full_name") });
    return;
  }

  /* ------------------------- 1) Full name → in/out ------------------------ */
  if (!s.expecting || s.expecting === "full_name") {
    setFullName(from, text);
    setExpecting(from, "in_out_dar");
    const cap20 = (s: string) => (s || "").slice(0, 20);
    await sendInteractiveButtons({
      to: from,
      body: t(lang, "ask_in_out_dar"),
      buttons: [
        { id: "in_dar", title: cap20(t(lang, "btn_inside_dar") )},
        { id: "out_dar", title: cap20(t(lang, "btn_outside_dar")) },
      ],
    });
    return;
  }

  /* -------------------- 2) Inside Dar → ask phone number ------------------ */
  if (s.expecting === "phone_in_dar") {
    // keep validation permissive; remove spaces/formatting
    const cleaned = text.replace(/[^\d+]/g, "");
    setPhoneNumber(from, cleaned);
    setExpecting(from, "address_in_dar");
    await sendText({ to: from, body: t(lang, "ask_address_in_dar") });
    return;
  }

  /* --------- 3) Inside Dar → address "mtaa/eneo, wilaya" (smart fee) ------ */
  if (s.expecting === "address_in_dar") {
    if (!/[,，]/.test(text)) {
      await sendText({ to: from, body: t(lang, "invalid_address_format") });
      return;
    }

    // Resolve distance from "mtaa/eneo, wilaya"
    const resolved = resolveDarLocation(text); // { km, ward, resolvedStreet, district, used, ... }
    if (!resolved.km || resolved.km <= 0) {
      await sendText({ to: from, body: t(lang, "delivery_unknown") });
      return;
    }

    const km = resolved.km;
    const fee = calcDeliveryFareTZS(km); // rounded to nearest 500 by delivery.ts

    // Nice display like “Swahili — Kariakoo — Ilala”
    const place =
      [resolved.resolvedStreet ?? null, resolved.ward ?? null, resolved.district ?? null]
        .filter(Boolean)
        .join(" — ") || text;

    await sendText({
      to: from,
      body:
        t(lang, "delivery_quote_title") +
        "\n" +
        buildQuoteLine(place, km, fee, (p) => t(lang, "delivery_quote_line", p)),
    });

    // Save to checkout (for order submit)
    updateCheckout(from, {
      deliveryKm: km,
      deliveryFeeTZS: fee,
      matchType: resolved.used ?? "ward_only",
      matchConfidence: resolved.confidence ?? 0.9,
      resolvedStreet: resolved.resolvedStreet ?? null,
      ward: resolved.ward ?? null,
      district: resolved.district ?? null,
      receiverName: s.fullName ?? null,
      receiverPhone: s.phoneNumber ?? null,
    });

    setExpecting(from, "done_in_dar");
    await sendText({ to: from, body: t(lang, "ok") });
    return;
  }

  /* ---------------------------- 4) Outside Dar ---------------------------- */
  if (s.expecting === "region_outside") {
    // keep it simple per your request; (you can add courier calc later)
    updateCheckout(from, {
      receiverName: s.fullName ?? null,
      receiverPhone: s.phoneNumber ?? null,
    });
    setExpecting(from, "done_outside");
    await sendText({ to: from, body: t(lang, "ok") });
    return;
  }

  /* ------------------------------ Fallback -------------------------------- */
  setExpecting(from, "full_name");
  await sendText({ to: from, body: t(lang, "ask_full_name") });
}
