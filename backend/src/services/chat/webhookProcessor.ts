import db from "../../db/knex.js";
import {
  findMessageByWaMessageId,
  getOrCreateConversationForPhone,
  insertInboundMessage,
  updateConversationLastUserMessageAt,
  upsertCustomerByWa,
  upsertWhatsAppPhoneNumber,
} from "../../db/queries.js";
import type { Lang } from "../../i18n.js";
import { emit } from "../../sockets.js";
import {
  addToCart,
  clearCart,
  getCart,
  getFlow,
  getLang,
  getPendingQty,
  getChatSession,
  setPendingQty,
  type CartItem,
  type FlowStep,
} from "./sessionState.js";
import { rememberCustomerPhoneNumberId } from "../../whatsapp.js";
import { sendBotText } from "./transport.js";

type Incoming = {
  text?: string;
  messageType?: string;
  mediaId?: string;
  hasLocation?: boolean;
  lat?: number;
  lon?: number;
};

type InteractiveSelection = {
  id?: string;
  title?: string;
};

type ProcessorDeps = {
  getDevIntroText(lang: Lang): string | null;
  getInvalidQuantityText(lang: Lang): string;
  getAddedWithQtyText(lang: Lang, item: CartItem): string;
  showEntryMenu(user: string, lang: Lang): Promise<unknown>;
  showMainMenu(user: string, lang: Lang): Promise<unknown>;
  showCart(user: string, lang: Lang): Promise<unknown>;
  onInteractive(user: string, id: string, lang: Lang): Promise<unknown>;
  onFlow(user: string, step: FlowStep, m: Incoming, lang: Lang): Promise<unknown>;
  onSessionMessage(user: string, m: Incoming, lang: Lang): Promise<unknown>;
  showOrderDetailsAndActions(user: string, orderId: number, lang: Lang): Promise<unknown>;
  isAgentAllowed(waId: string): Promise<boolean>;
};

export function extractInteractiveSelection(msg: any): InteractiveSelection {
  if (msg?.type !== "interactive") return {};
  const itype = msg.interactive?.type;
  if (itype === "list_reply") {
    return {
      id: msg.interactive?.list_reply?.id,
      title: msg.interactive?.list_reply?.title || undefined,
    };
  }
  if (itype === "button_reply") {
    return {
      id: msg.interactive?.button_reply?.id,
      title: msg.interactive?.button_reply?.title || undefined,
    };
  }
  return {};
}

export function isGreetingMenuTrigger(
  text: string | undefined,
  sessionState: string | undefined,
  activeFlow: FlowStep | null
): boolean {
  const txt = (text || "").trim().toLowerCase();
  if ((sessionState && sessionState !== "IDLE") || activeFlow) return false;
  return !text || ["hi", "hello", "mambo", "start", "anza", "menu", "menyu"].includes(txt);
}

export function createWebhookProcessor(deps: ProcessorDeps) {
  async function handleSmbMessageEchoes(
    field: string | undefined,
    ch: any,
    contacts: any[],
    businessPhoneNumberId: string | null
  ): Promise<boolean> {
    if (field !== "smb_message_echoes") return false;

    const echoes = ch?.value?.message_echoes ?? [];
    for (const emsg of echoes) {
      const to = emsg?.to as string | undefined;
      if (!to) continue;

      rememberCustomerPhoneNumberId(to, businessPhoneNumberId);

      const matchingContact = contacts.find((c: any) => c.wa_id === to);
      const profileName: string | undefined =
        (matchingContact?.profile?.name as string | undefined) ??
        (contacts[0]?.profile?.name as string | undefined);

      const { id: customerId } = await upsertCustomerByWa(to, profileName);
      const convoId = await getOrCreateConversationForPhone(customerId, businessPhoneNumberId);

      const type = (emsg?.type as string | undefined) ?? "unknown";
      let body: string | null = null;
      if (type === "text") body = emsg?.text?.body ?? null;
      else if (type === "button") body = emsg?.button?.text ?? null;
      else if (type === "interactive") body = JSON.stringify(emsg?.interactive ?? {});
      else if (type === "image" || type === "video" || type === "audio" || type === "document") {
        const mediaId = emsg?.[type]?.id ?? null;
        body = mediaId ? `MEDIA:${type}:${mediaId}` : null;
      } else {
        body = JSON.stringify(emsg ?? {});
      }

      const [msgRow] = await db("messages")
        .insert({
          conversation_id: convoId,
          wa_message_id: emsg?.id ?? null,
          direction: "out",
          message_kind: "freeform",
          type,
          body,
          status: "delivered",
        })
        .returning([
          "id",
          "conversation_id",
          "wa_message_id",
          "direction",
          "type",
          "body",
          "status",
          "message_kind",
          "status_reason",
          "error_code",
          "error_title",
          "error_details",
          "created_at",
        ]);

      emit("message.created", { conversation_id: convoId, message: msgRow });
    }

    return true;
  }

  async function processCatalogOrder(from: string, lang: Lang, msg: any) {
    await clearCart(from);

    const productItems = msg.order.product_items as any[];
    const requestedSkus = Array.from(
      new Set(
        productItems
          .map((it) => String(it?.product_retailer_id ?? "").trim())
          .filter(Boolean)
      )
    );

    const rows = await db("products")
      .whereIn("sku", requestedSkus)
      .select<{ sku: string; name: string; price_tzs: number }[]>("sku", "name", "price_tzs");

    const bySku = new Map(rows.map((r) => [r.sku, r]));

    for (const it of productItems) {
      const sku = String(it?.product_retailer_id ?? "").trim();
      if (!sku) continue;

      const qty = Math.max(1, Math.floor(Number(it?.quantity ?? 1)));
      const p = bySku.get(sku);
      if (!p) continue;

      await addToCart(from, {
        sku,
        name: p.name,
        qty,
        unitPrice: Number(p.price_tzs ?? 0),
      });
    }

    const cartNow = await getCart(from);
    const missingSkus = requestedSkus.filter((sku) => !bySku.has(sku));

    if (missingSkus.length > 0) {
      const shown = missingSkus.slice(0, 5).join(", ");
      const more = missingSkus.length > 5 ? " ..." : "";
      await sendBotText(
        from,
        lang === "sw"
          ? `âš ï¸ Baadhi ya bidhaa ulizochagua kwenye Catalog hazipo kwenye mfumo wetu bado: ${shown}${more}\nUnaweza kuagiza hizo kwa chat kwa kubonyeza *Oda kwa Chat* au kuandika *MENU*.`
          : `âš ï¸ Some items you selected from the catalog are not available in our system yet: ${shown}${more}\nYou can order those via chat by pressing *Order by Chat* or typing *MENU*.`
      );
    }

    if (!cartNow.length) {
      await sendBotText(
        from,
        lang === "sw"
          ? "Nimepokea oda kutoka Catalog lakini sijaweza kulinganisha bidhaa kwenye mfumo. Tafadhali bonyeza *Oda kwa Chat* au andika *MENU*."
          : "I received a catalog order but couldnâ€™t match products in the system. Press *Order by Chat* or type *MENU*."
      );
      await deps.showEntryMenu(from, lang);
      return;
    }

    await sendBotText(
      from,
      lang === "sw"
        ? "âœ… Nimepokea bidhaa ulizochagua kutoka Catalog. Hapa chini ni muhtasari wa kikapu chako:"
        : "âœ… I received the items you selected from the catalog. Here is your cart summary:"
    );

    await deps.showCart(from, lang);
  }

  async function processInboundMessage(
    msg: any,
    contacts: any[],
    businessPhoneNumberId: string | null
  ) {
    const from = msg?.from as string;
    const mid = msg?.id as string | undefined;
    if (!from) return;

    rememberCustomerPhoneNumberId(from, businessPhoneNumberId);
    rememberCustomerPhoneNumberId(from, businessPhoneNumberId);

    if (mid) {
      const existing = await findMessageByWaMessageId(mid);
      if (existing) {
        console.log("[webhook.processor] duplicate inbound skipped", { from, mid });
        return;
      }
    }

    const matchingContact = contacts.find((c: any) => c.wa_id === from);
    const profileName: string | undefined =
      (matchingContact?.profile?.name as string | undefined) ??
      (contacts[0]?.profile?.name as string | undefined);

    const lang = await getLang(from);
    const session = await getChatSession(from);
    const type = msg?.type as string | undefined;
    const text: string | undefined = type === "text" ? (msg.text?.body as string) : undefined;

    console.log("[webhook.processor] inbound message", {
      from,
      mid: mid ?? null,
      type: type ?? "unknown",
      hasText: !!text,
      textPreview: (text ?? "").slice(0, 120),
      businessPhoneNumberId,
    });

    const { id: interactiveId, title: interactiveTitle } = extractInteractiveSelection(msg);

    const hasLocation = type === "location";
    const lat = hasLocation ? Number(msg.location?.latitude) : undefined;
    const lon = hasLocation ? Number(msg.location?.longitude) : undefined;
    const mediaId =
      type === "image"
        ? (msg.image?.id as string | undefined)
        : type === "document"
        ? (msg.document?.id as string | undefined)
        : type === "video"
        ? (msg.video?.id as string | undefined)
        : type === "audio"
        ? (msg.audio?.id as string | undefined)
        : undefined;

    let isFirstInboundForCustomer = false;
    try {
      const up = await upsertCustomerByWa(from, profileName, from);
      const customerId = up.id;

      const inboundBefore = await db("messages as m")
        .join("conversations as c", "c.id", "m.conversation_id")
        .where("c.customer_id", customerId)
        .andWhere("m.direction", "inbound")
        .first("m.id");
      isFirstInboundForCustomer = !inboundBefore;

      const conversationId = await getOrCreateConversationForPhone(
        customerId,
        businessPhoneNumberId
      );

      let bodyForDb: string | null = text ?? null;
      if (!bodyForDb && interactiveId) {
        bodyForDb =
          interactiveTitle && interactiveTitle.trim().length > 0
            ? interactiveTitle.trim()
            : `[interactive:${interactiveId}]`;
      }
      if (!bodyForDb && hasLocation && typeof lat === "number" && typeof lon === "number") {
        bodyForDb = `LOCATION ${lat},${lon}`;
      }
      if (!bodyForDb) {
        if (type === "image" && msg.image?.id) bodyForDb = `MEDIA:image:${msg.image.id}`;
        else if (type === "video" && msg.video?.id) bodyForDb = `MEDIA:video:${msg.video.id}`;
        else if (type === "audio" && msg.audio?.id) bodyForDb = `MEDIA:audio:${msg.audio.id}`;
        else if (type === "document" && msg.document?.id) bodyForDb = `MEDIA:document:${msg.document.id}`;
      }

      const inserted = await insertInboundMessage(
        conversationId,
        mid ?? null,
        type ?? "text",
        bodyForDb
      );

      await updateConversationLastUserMessageAt(conversationId);
      emit("message.created", { conversation_id: conversationId, message: inserted });
      emit("conversation.updated", {});
    } catch (err) {
      console.error("[webhook.processor] inbound persist error:", err);
    }

    const rawTextForAgentGate = (text || "").trim();
    const txtForAgentGate = rawTextForAgentGate.toLowerCase();
    const returnToBotKeywords = new Set(["hi", "hello", "mambo", "start", "anza", "menu", "menyu", "bot", "rudi"]);
    const wantsReturnToBotFromText =
      !interactiveId && returnToBotKeywords.has(txtForAgentGate);

    const agentAllowed = await deps.isAgentAllowed(from);
    if (agentAllowed) {
      if (!wantsReturnToBotFromText) {
        console.log("[webhook.processor] bot skip: agent mode still ON", {
          from,
          txtForAgentGate,
          interactiveId: interactiveId ?? null,
        });
        return;
      }

      const { id: customerId } = await upsertCustomerByWa(from, undefined, from);
      const conversationId = await getOrCreateConversationForPhone(
        customerId,
        businessPhoneNumberId
      );

      await db("conversations").where({ id: conversationId }).update({ agent_allowed: false });
      emit("conversation.updated", { id: conversationId, agent_allowed: false });
      console.log("[webhook.processor] customer requested return-to-bot via text", {
        from,
        text: txtForAgentGate,
        conversationId,
      });
      await deps.showEntryMenu(from, lang);
      return;
    }

    if (type === "order" && Array.isArray(msg.order?.product_items) && msg.order.product_items.length > 0) {
      await processCatalogOrder(from, lang, msg);
      return;
    }

    const devIntro = deps.getDevIntroText(lang);
    if (isFirstInboundForCustomer) {
      if (devIntro) {
        await sendBotText(from, devIntro, businessPhoneNumberId);
      }
      await deps.showMainMenu(from, lang);
      return;
    }

    if (interactiveId) {
      try {
        await deps.onInteractive(from, interactiveId, lang);
      } catch (err) {
        console.error("[webhook.processor] onInteractive error", { from, interactiveId, err });
      }
      return;
    }

    const rawText = (text || "").trim();
    if (rawText) {
      const match = rawText.match(/#(\d+)\)/);
      if (match) {
        const orderId = Number(match[1]);
        if (Number.isFinite(orderId)) {
          await deps.showOrderDetailsAndActions(from, orderId, lang);
          return;
        }
      }
    }

    const pendingQty = rawText ? await getPendingQty(from) : null;
    if (rawText && pendingQty) {
      const qty = Number.parseInt(rawText, 10);
      if (!Number.isFinite(qty) || qty <= 0) {
        await sendBotText(from, deps.getInvalidQuantityText(lang));
        return;
      }

      const item: CartItem = {
        sku: pendingQty.sku,
        name: pendingQty.name,
        qty,
        unitPrice: pendingQty.unitPrice,
      };

      await addToCart(from, item);
      await setPendingQty(from, null);
      await sendBotText(from, deps.getAddedWithQtyText(lang, item));
      await deps.showCart(from, lang);
      return;
    }

    const activeFlow = await getFlow(from);
    if (isGreetingMenuTrigger(text, session?.state, activeFlow)) {
      console.log("[webhook.processor] greeting/menu trigger", {
        from,
        text: rawText,
        sessionState: session?.state ?? "none",
      });
      await deps.showMainMenu(from, lang);
      return;
    }

    if (activeFlow) {
      console.log("[webhook.processor] routing to onFlow", {
        from,
        flow: activeFlow,
        textPreview: (text ?? "").slice(0, 120),
        hasLocation,
      });
      await deps.onFlow(
        from,
        activeFlow,
        { text, messageType: type, mediaId, hasLocation, lat, lon },
        lang
      );
      return;
    }

    console.log("[webhook.processor] routing to onSessionMessage", {
      from,
      state: session?.state ?? "none",
      textPreview: (text ?? "").slice(0, 120),
      hasLocation,
    });
    await deps.onSessionMessage(
      from,
      { text, messageType: type, mediaId, hasLocation, lat, lon },
      lang
    );
  }

  return {
    async processChange(ch: any) {
      const field = ch?.field as string | undefined;
      const contacts = ch?.value?.contacts ?? [];
      const businessPhoneNumberId: string | null =
        (ch?.value?.metadata?.phone_number_id as string | undefined) ?? null;
      const displayPhoneNumber: string | null =
        (ch?.value?.metadata?.display_phone_number as string | undefined) ?? null;

      if (businessPhoneNumberId) {
        await upsertWhatsAppPhoneNumber({
          phone_number_id: businessPhoneNumberId,
          display_phone_number: displayPhoneNumber,
        }).catch(() => {});
      }

      if (await handleSmbMessageEchoes(field, ch, contacts, businessPhoneNumberId)) {
        return;
      }

      if (field === "history" || field === "smb_app_state_sync") {
        console.log("[webhook.processor] coexistence field received", field);
        return;
      }

      const messages = ch?.value?.messages ?? [];
      if (!messages.length) {
        console.log("[webhook.processor] no messages in change payload", {
          field,
          businessPhoneNumberId,
        });
      }

      for (const msg of messages) {
        await processInboundMessage(msg, contacts, businessPhoneNumberId);
      }
    },
  };
}
