// src/routes/webhook.ts
// Clean webhook with strict string IDs for WhatsApp list rows and robust delivery flow.
//
// Key fixes for your TS2345 errors:
// - All interactive list rows are { id: string, title: string, description?: string }.
// - No object is ever passed into clamp helpers (they accept strings).
//
// Flow:
// - Buy now -> Where are you? (Outside Dar / Within Dar)
// - Outside Dar: name -> phone -> region, flat 10,000 delivery, breakdown
// - Within Dar: pickup (name+phone) OR deliver (Ward -> District), distance & fee -> breakdown
// - Defensive strings to avoid WhatsApp (#100) errors.

import type { Request, Response } from "express";
import { Router } from "express";
import pino from "pino";
import { setTimeout as sleep } from "node:timers/promises";

// Session (ensure your compiled output has these .js paths)
import {
  getSession,
  setLang,
  setExpecting,
  startCheckout,
  updateCheckout,
  setCheckoutStage,
  resetCheckout,
  setLastOrderId,
  addToCart,
  clearCart,
  cartTotal,
} from "../session.js";

// Orders
import {
  createOrder,
  getOrder,
  updateOrderAddress,
  attachTxnMessage,
  attachTxnImage,
  type OrderItem,
} from "../orders.js";

// Location + delivery
import { listDistricts, listWardsByDistrict, getDistanceKm } from "../wards.js";
import { feeForDarDistance } from "../delivery.js";

// WhatsApp helpers
import {
  sendText,
  sendInteractiveList,
  sendInteractiveButtons,
  verifyWebhookSignature,
} from "../whatsapp.js";

// i18n + product catalog
import { t } from "../i18n.js";
import {
  PRODUCTS,
  PROMAX_PACKAGES,
  PROMAX_PRICE_TZS,
  isProMaxPackageId,
  promaxPackageSummary,
  promaxPackageTitle,
  productTitle,
} from "../menu.js";

const logger = pino({ name: "webhook" });
export const router = Router();
export const webhook = router;
export default router;

/* --------------------------- UI clamp helpers --------------------------- */

const MAX_ROW_TITLE = 24;
const MAX_ROW_DESC = 72;
const MAX_SECTION_TITLE = 24;
const MAX_HEADER_TEXT = 60;
const MAX_BODY_TEXT = 1024;

const clamp = (s: string, n: number) => {
  const str = (s ?? "").toString();
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
};
const clampTitle = (s: string) => clamp(s, MAX_ROW_TITLE);
const clampDesc = (s: string) => clamp(s, MAX_ROW_DESC);
const clampSection = (s: string) => clamp(s, MAX_SECTION_TITLE);
const clampHeader = (s: string) => clamp(s, MAX_HEADER_TEXT);
const clampBody = (s: string) => clamp(s, MAX_BODY_TEXT);

function toStringStrict(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function plainTZS(n: number): string {
  return `TSh ${Math.max(0, Math.round(n || 0)).toLocaleString("en-US")}`;
}
function norm(s: string) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}
function expectingIs(from: string, key: string): boolean {
  return (getSession(from).expecting as any) === key;
}
function roundMetersUp100(m: number): number {
  if (!isFinite(m) || m <= 0) return 0;
  return Math.ceil(m / 100) * 100;
}
function roundFeeTo500(n: number): number {
  if (!isFinite(n) || n <= 0) return 0;
  return Math.ceil(n / 500) * 500;
}

/* ------------------------------ Main menu ------------------------------ */

async function sendMainMenu(to: string, lang: "sw" | "en") {
  const productsRows = [
    { id: "product_kiboko", title: clampTitle("Ujani Kiboko"), description: clampDesc("120,000 TSh") },
    { id: "product_furaha", title: clampTitle("Ujani Furaha"), description: clampDesc("85,000 TSh") },
    {
      id: "product_promax",
      title: clampTitle(productTitle("product_promax", lang)),
      description: clampDesc(promaxPackageTitle("promax_a", lang)),
    },
  ];

  const settingsRow = {
    id: "change_language",
    title: clampTitle(lang === "sw" ? "English 🇬🇧" : "Kiswahili 🇹🇿"),
    description: "",
  };

  await sendInteractiveList({
    to,
    header: clampHeader(t(lang, "menu_body")),
    body: clampBody(t(lang, "menu_body")),
    buttonText: clampTitle(t(lang, "menu_button")),
    sections: [
      { title: clampSection(t(lang, "section_products")), rows: productsRows },
      {
        title: clampSection(t(lang, "section_help")),
        rows: [
          { id: "view_cart", title: clampTitle(lang === "sw" ? "Angalia Kikapu" : "View Cart"), description: "" },
          { id: "talk_agent", title: clampTitle(t(lang, "talk_agent_title")), description: clampDesc(t(lang, "talk_agent_desc")) },
          { id: "track_order", title: clampTitle(t(lang, "track_order_title")), description: clampDesc(t(lang, "track_order_desc")) },
        ],
      },
      { title: clampSection(t(lang, "section_settings")), rows: [settingsRow] },
    ],
  });
}

async function showProductActionsList(to: string, lang: "sw" | "en", productId: string) {
  const rows = [
    { id: `action_buy_${productId}`, title: clampTitle(lang === "sw" ? "Nunua sasa" : "Buy now"), description: "" },
    { id: `action_info_${productId}`, title: clampTitle(lang === "sw" ? "Maelezo zaidi" : "More details"), description: "" },
    { id: `action_add_${productId}`, title: clampTitle(lang === "sw" ? "Ongeza kikapuni" : "Add to cart"), description: "" },
    { id: "view_cart", title: clampTitle(lang === "sw" ? "Angalia Kikapu" : "View Cart"), description: "" },
  ];
  await sendInteractiveList({
    to,
    header: clampHeader(productTitle(productId, lang)),
    body: clampBody(
      promaxPackageSummary(productId, lang) ||
        (lang === "sw" ? "Chagua hatua hapa chini." : "Choose an option below.")
    ),
    buttonText: clampTitle(t(lang, "menu_button")),
    sections: [{ title: clampSection(t(lang, "section_products")), rows }],
  });
}

/* ---------------------- Ward/District pickers (Dar) --------------------- */

type WardIndexRow = { ward: string; district: string };
let __WARD_INDEX: WardIndexRow[] | null = null;

function buildWardIndex(): WardIndexRow[] {
  if (__WARD_INDEX) return __WARD_INDEX;
  const out: WardIndexRow[] = [];
  const districts = (listDistricts() || []).map((d) => toStringStrict(d));
  for (const d of districts) {
    const wards = (listWardsByDistrict(d) || []).map((w) => toStringStrict(w));
    for (const w of wards) out.push({ ward: w, district: d });
  }
  __WARD_INDEX = out;
  return __WARD_INDEX;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function sendWardPickerAllDar(to: string, lang: "sw" | "en", pageIndex = 0) {
  const index = buildWardIndex().map((r) => ({ ward: r.ward, district: r.district }));
  const wards = index.map((r) => r.ward);
  const uniqueWards = Array.from(new Set(wards)).sort((a, b) => a.localeCompare(b));
  const pages = chunk(uniqueWards, 9);
  const page = Math.max(0, Math.min(pageIndex, Math.max(0, pages.length - 1)));
  const list = pages.length ? pages[page] : [];

  updateCheckout(to, { wardPageIndexGlobal: page } as any);

  const rows = list.map((w) => ({
    id: `pick_ward_global::${w}`,            // string id
    title: clampTitle(w),                    // string title
    description: "",
  }));
  if (page < pages.length - 1) {
    rows.push({
      id: `ward_global_next::${page + 1}`,   // string id
      title: clampTitle(lang === "sw" ? "Ifuatayo →" : "Next →"),
      description: "",
    });
  }

  await sendInteractiveList({
    to,
    header: clampHeader(lang === "sw" ? "Chagua *Sehemu unayoishi*" : "Pick your ward"),
    body: clampBody(lang === "sw" ? "Chagua sehemu (KATA) unayoishi ndani ya Dar es Salaam." : "Choose your ward (within Dar es Salaam)."),
    buttonText: clampTitle(lang === "sw" ? "Fungua" : "Open"),
    sections: [{ title: clampSection(lang === "sw" ? "Kata (Sehemu)" : "Wards"), rows }],
  });

  setExpecting(to, "select_ward_global" as any);
  setCheckoutStage(to, "asked_ward_global" as any);
}

function districtsForWard(ward: string): string[] {
  const idx = buildWardIndex();
  const wNorm = norm(ward);
  const hits = idx
    .filter((r) => norm(r.ward) === wNorm)
    .map((r) => r.district)
    .filter(Boolean);

  const uniq = Array.from(new Set(hits));
  if (uniq.length > 0) return uniq;

  const all = (listDistricts() || []) as string[];
  if (all.length > 0) return all;

  return ["Ilala", "Kinondoni", "Temeke", "Ubungo", "Kigamboni"];
}

async function sendDistrictConfirmAfterWard(to: string, lang: "sw" | "en", ward: string) {
  updateCheckout(to, { addressWard: ward, addressCountry: "Dar es Salaam" } as any);

  const choices = districtsForWard(ward);
  const rows = choices.slice(0, 10).map((d) => ({
    id: `confirm_district_after_ward::${d}`, // string id
    title: clampTitle(d || (lang === "sw" ? "Haijulikani" : "Unknown")),
    description: "",
  }));

  await sendInteractiveList({
    to,
    header: clampHeader(lang === "sw" ? "Chagua Wilaya uliopo" : "Choose your district"),
    body: clampBody((lang === "sw" ? "Sehemu: " : "Ward: ") + ward),
    buttonText: clampTitle(lang === "sw" ? "Chagua" : "Choose"),
    sections: [{ title: clampSection(lang === "sw" ? "Wilaya" : "District"), rows }],
  });

  setExpecting(to, "confirm_district_after_ward" as any);
  setCheckoutStage(to, "asked_district_after_ward" as any);
}

/* -------------------- Finalize Dar delivery (no street) -------------------- */

async function finalizeDarDeliveryOrder(to: string, lang: "sw" | "en") {
  const s = (getSession(to).checkout ?? {}) as any;
  const district = toStringStrict(s.addressCity || "");
  const ward = toStringStrict(s.addressWard || "");

  let km = getDistanceKm(district, ward);
  if (typeof km !== "number" || !isFinite(km)) km = 7.0; // safe default

  const metersRounded = roundMetersUp100((km || 0) * 1000);
  const kmDisplay = metersRounded / 1000;
  const baseFee = feeForDarDistance(kmDisplay);
  const fee = roundFeeTo500(baseFee);

  let items: OrderItem[] = [];
  if (!s.productId) {
    items = getSession(to).cart.items.map((it: any) => ({ ...it }));
  } else {
    const price = isProMaxPackageId(s.productId)
      ? PROMAX_PRICE_TZS
      : PRODUCTS.find((p) => p.id === s.productId)?.priceTZS ?? 0;
    const title = isProMaxPackageId(s.productId)
      ? `${productTitle("product_promax", lang)} — ${promaxPackageTitle(s.productId, lang)}`
      : productTitle(s.productId, lang);
    items.push({ productId: s.productId, title, qty: 1, priceTZS: price });
  }

  if (fee > 0) {
    items.push({
      productId: "delivery_fee_dar",
      title: lang === "sw"
        ? `Nauli (Keko → ${ward}, ${district} ~${kmDisplay.toFixed(1)} km)`
        : `Delivery (Keko → ${ward}, ${district} ~${kmDisplay.toFixed(1)} km)`,
      qty: 1,
      priceTZS: fee,
    });
  }

  const order = createOrder({
    items,
    lang,
    customerPhone: to,
    customerName: s.customerName || "",
    addressStreet: "",
    addressCity: district,
    addressCountry: "Dar es Salaam",
  });

  setLastOrderId(to, order.orderId);
  clearCart(to);

  const productTotal = (order.items || [])
    .filter((it) => !/^delivery_fee_/.test(it.productId))
    .reduce((sum, it) => sum + it.priceTZS * (it.qty || 1), 0);

  const lines = [
    lang === "sw" ? "🧾 *Muhtasari wa Oda*" : "🧾 *Order Summary*",
    `${lang === "sw" ? "Bidhaa" : "Products"}: ${plainTZS(productTotal)}`,
    `${lang === "sw" ? "Nauli ya mahali" : "Delivery fee"}: ${plainTZS(fee)}`,
    `${lang === "sw" ? "Jumla" : "Total"}: ${plainTZS(order.totalTZS || 0)}`,
    "",
    `*Order ID:* ${order.orderId}`,
    `${lang === "sw" ? "Mahali" : "Location"}: ${ward}, ${district}`,
  ].join("\n");

  await sendText({ to, body: lines });

  await sleep(300);
  await sendInteractiveButtons({
    to,
    body: clampBody(t(lang, "order_next_actions")),
    buttons: [
      { id: "pay_now", title: clampTitle(t(lang, "btn_pay_now")) },
      { id: "edit_address", title: clampTitle(t(lang, "btn_edit_address")) },
      { id: "back_menu", title: clampTitle(t(lang, "btn_back_menu")) },
    ],
  });

  resetCheckout(to);
}

/* ------------------------------- Webhook ------------------------------- */

// GET verify
router.get("/", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  if (mode === "subscribe" && token === VERIFY_TOKEN) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

// POST
router.post("/", async (req: Request, res: Response) => {
  try {
    const appSecret = process.env.APP_SECRET || "";
    if (appSecret) {
      const sig = (req.headers["x-hub-signature-256"] as string) || "";
      const raw = (req as any).rawBody || (req as any).bodyRaw || "";
      if (!verifyWebhookSignature(raw, sig)) {
        logger.warn({ reason: "bad_signature" }, "Webhook signature verify failed");
        return res.sendStatus(403);
      }
    }

    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages || [];

    for (const m of messages) {
      const from = m?.from || m?.contacts?.[0]?.wa_id || "";
      const type = m?.type;
      const textBody = (type === "text" ? m?.text?.body : undefined) || "";
      const listReplyId =
        type === "interactive" && m?.interactive?.type === "list_reply" ? m?.interactive?.list_reply?.id : undefined;
      const buttonReplyId =
        type === "interactive" && m?.interactive?.type === "button_reply" ? m?.interactive?.button_reply?.id : undefined;

      // Language toggles
      if (textBody === "EN") { setLang(from, "en"); await sendMainMenu(from, "en"); continue; }
      if (textBody === "SW") { setLang(from, "sw"); await sendMainMenu(from, "sw"); continue; }
      const lang: "sw" | "en" = getSession(from).lang || "sw";

      // Menu
      if (textBody === "MENU" || buttonReplyId === "back_menu") { await sendMainMenu(from, lang); continue; }

      // Change language item
      if (listReplyId === "change_language") {
        const next = lang === "sw" ? "en" : "sw";
        setLang(from, next);
        await sendMainMenu(from, next);
        continue;
      }

      /* ------------------------- Product entry points ------------------------ */

      if (listReplyId === "product_kiboko" || listReplyId === "product_furaha") {
        await showProductActionsList(from, lang, listReplyId);
        continue;
      }

      if (listReplyId === "product_promax") {
        const rows = PROMAX_PACKAGES.map((pid) => {
          const pidStr = toStringStrict(pid);
          return {
            id: pidStr,                                               // ensure string id
            title: clampTitle(promaxPackageTitle(pidStr, lang)),
            description: clampDesc(promaxPackageSummary(pidStr, lang)),
          };
        });
        await sendInteractiveList({
          to: from,
          header: clampHeader(productTitle("product_promax", lang)),
          body: clampBody(t(lang, "menu_body")),
          buttonText: clampTitle(t(lang, "menu_button")),
          sections: [{ title: clampSection(t(lang, "section_products")), rows }],
        });
        continue;
      }

      if (listReplyId && isProMaxPackageId(listReplyId)) {
        await showProductActionsList(from, lang, listReplyId);
        continue;
      }

      if (listReplyId?.startsWith("action_info_")) {
        const pid = listReplyId.replace("action_info_", "");
        const key =
          pid === "product_kiboko"
            ? "kiboko_more_bullets"
            : pid === "product_furaha"
            ? "furaha_more_bullets"
            : isProMaxPackageId(pid)
            ? "promax_detail_promax_a"
            : null;
        await sendText({ to: from, body: key ? t(lang, key) : t(lang, "not_found") });
        await sleep(200);
        await showProductActionsList(from, lang, pid);
        continue;
      }

      if (listReplyId?.startsWith("action_add_")) {
        const pid = listReplyId.replace("action_add_", "");
        const title = isProMaxPackageId(pid)
          ? `${productTitle("product_promax", lang)} — ${promaxPackageTitle(pid, lang)}`
          : productTitle(pid, lang);
        const price =
          pid === "product_kiboko"
            ? PRODUCTS.find((p) => p.id === "product_kiboko")?.priceTZS ?? 0
            : pid === "product_furaha"
            ? PRODUCTS.find((p) => p.id === "product_furaha")?.priceTZS ?? 0
            : PROMAX_PRICE_TZS;
        addToCart(from, { productId: pid, title, qty: 1, priceTZS: price });
        await sendText({ to: from, body: t(lang, "cart_added", { title }) });
        await sleep(200);
        await showProductActionsList(from, lang, pid);
        continue;
      }

      // BUY NOW -> ask area
      if (listReplyId?.startsWith("action_buy_")) {
        const pid = listReplyId.replace("action_buy_", "");
        const title = isProMaxPackageId(pid)
          ? `${productTitle("product_promax", lang)} — ${promaxPackageTitle(pid, lang)}`
          : productTitle(pid, lang);
        const price =
          pid === "product_kiboko"
            ? PRODUCTS.find((p) => p.id === "product_kiboko")?.priceTZS ?? 0
            : pid === "product_furaha"
            ? PRODUCTS.find((p) => p.id === "product_furaha")?.priceTZS ?? 0
            : PROMAX_PRICE_TZS;

        startCheckout(from, pid, title, price);

        await sendInteractiveButtons({
          to: from,
          body: clampBody(lang === "sw" ? "Unapatikana wapi?" : "Where are you located?"),
          buttons: [
            { id: "area_outside", title: clampTitle(lang === "sw" ? "Nje ya Dar" : "Outside Dar") },
            { id: "area_dar", title: clampTitle(lang === "sw" ? "Ndani ya Dar" : "Within Dar") },
          ],
        });
        continue;
      }

      /* ------------------------------ Cart helpers --------------------------- */

      if (listReplyId === "view_cart") {
        const items = getSession(from).cart.items;
        if (!items.length) {
          await sendText({ to: from, body: t(lang, "cart_empty") });
          await sendMainMenu(from, lang);
          continue;
        }
        const lines = items
          .map((it) =>
            t(lang, "cart_summary_line", {
              title: it.title,
              qty: it.qty,
              price: plainTZS(it.priceTZS * it.qty),
            })
          )
          .join("\n");
        await sendText({
          to: from,
          body: `*${t(lang, "cart_title")}*\n${lines}\n${t(lang, "cart_summary_total", {
            total: plainTZS(cartTotal(from)),
          })}`,
        });
        await sleep(200);
        await sendInteractiveButtons({
          to: from,
          body: clampBody(t(lang, "cart_actions")),
          buttons: [
            { id: "cart_checkout", title: clampTitle(t(lang, "btn_cart_checkout")) },
            { id: "cart_clear", title: clampTitle(t(lang, "btn_cart_clear")) },
            { id: "back_menu", title: clampTitle(t(lang, "btn_cart_back")) },
          ],
        });
        continue;
      }

      if (buttonReplyId === "cart_checkout") {
        if (!getSession(from).cart.items.length) {
          await sendText({ to: from, body: t(lang, "cart_empty") });
          await sendMainMenu(from, lang);
          continue;
        }
        startCheckout(from);
        await sendInteractiveButtons({
          to: from,
          body: clampBody(lang === "sw" ? "Unapatikana wapi?" : "Where are you located?"),
          buttons: [
            { id: "area_outside", title: clampTitle(lang === "sw" ? "Nje ya Dar" : "Outside Dar") },
            { id: "area_dar", title: clampTitle(lang === "sw" ? "Ndani ya Dar" : "Within Dar") },
          ],
        });
        continue;
      }

      if (buttonReplyId === "cart_clear") {
        clearCart(from);
        await sendText({ to: from, body: t(lang, "cart_cleared") });
        await sendMainMenu(from, lang);
        continue;
      }

      /* ------------------------------- Area step ----------------------------- */

      if (buttonReplyId === "area_outside") {
        updateCheckout(from, { addressCountry: "OUTSIDE_DAR" } as any);
        setExpecting(from, "outside_names");
        setCheckoutStage(from, "asked_outside_names");
        await sendText({
          to: from,
          body:
            lang === "sw"
              ? "Andika *majina yatakayotumika kusafirishia mzigo wako*."
              : "Type the full name for shipping.",
        });
        continue;
      }

      if (buttonReplyId === "area_dar") {
        updateCheckout(from, { addressCountry: "Dar es Salaam" } as any);
        await sendInteractiveButtons({
          to: from,
          body: clampBody(lang === "sw" ? "Unakuja ofisini au kuletewa?" : "Pick up at office or get it delivered?"),
          buttons: [
            { id: "fulfill_pickup", title: clampTitle(lang === "sw" ? "Kuja ofisini" : "Pick up") },
            { id: "fulfill_delivery", title: clampTitle(lang === "sw" ? "Kuletewa" : "Deliver") },
          ],
        });
        continue;
      }

      /* --------------------------- Outside Dar flow -------------------------- */

      if (textBody && expectingIs(from, "outside_names")) {
        updateCheckout(from, { customerName: textBody } as any);
        setExpecting(from, "outside_phone");
        await sendText({
          to: from,
          body:
            lang === "sw"
              ? "Taja *namba ya simu* na *mkoa* wa kusafirisha mzigo wako.\n\nTuanze na namba ya simu:"
              : "Provide your *phone number* and *region* for shipping.\n\nLet’s start with your phone number:",
        });
        continue;
      }

      if (textBody && expectingIs(from, "outside_phone")) {
        const normalized = textBody.replace(/[^\d+]/g, "");
        if (!/^\+?\d{9,15}$/.test(normalized)) {
          await sendText({ to: from, body: t(lang, "phone_invalid") });
          continue;
        }
        updateCheckout(from, { contactPhone: normalized.startsWith("+") ? normalized : "+255" + normalized.replace(/^0/, "") } as any);
        setExpecting(from, "outside_region");
        await sendText({
          to: from,
          body:
            lang === "sw"
              ? "Sasa taja *mkoa* wa kusafirisha mzigo wako (mf. Arusha, Mwanza, Dodoma...)."
              : "Now tell us the *region* to ship to (e.g., Arusha, Mwanza, Dodoma...).",
        });
        continue;
      }

      if (textBody && expectingIs(from, "outside_region")) {
        const region = textBody.trim();
        const s = (getSession(from).checkout ?? {}) as any;

        const fee = 10000;

        let items: OrderItem[] = [];
        if (!s.productId) {
          items = getSession(from).cart.items.map((it: any) => ({ ...it }));
        } else {
          const price = isProMaxPackageId(s.productId)
            ? PROMAX_PRICE_TZS
            : PRODUCTS.find((p) => p.id === s.productId)?.priceTZS ?? 0;
          const title = isProMaxPackageId(s.productId)
            ? `${productTitle("product_promax", lang)} — ${promaxPackageTitle(s.productId, lang)}`
            : productTitle(s.productId, lang);
          items.push({ productId: s.productId, title, qty: 1, priceTZS: price });
        }
        items.push({
          productId: "delivery_fee_outside",
          title: lang === "sw" ? "Nauli ya Usafiri (nje ya Dar)" : "Delivery Fee (outside Dar)",
          qty: 1,
          priceTZS: fee,
        });

        const order = createOrder({
          items,
          lang,
          customerPhone: from,
          customerName: s.customerName || "",
          addressStreet: "",
          addressCity: region,
          addressCountry: "OUTSIDE_DAR",
        });
        setLastOrderId(from, order.orderId);
        clearCart(from);

        const productTotal = (order.items || [])
          .filter((it) => !/^delivery_fee_/.test(it.productId))
          .reduce((sum, it) => sum + it.priceTZS * (it.qty || 1), 0);

        await sendText({
          to: from,
          body:
            (lang === "sw" ? "🧾 *Muhtasari wa Oda*" : "🧾 *Order Summary*") +
            `\n${lang === "sw" ? "Bidhaa" : "Products"}: ${plainTZS(productTotal)}` +
            `\n${lang === "sw" ? "Nauli ya usafiri" : "Delivery"}: ${plainTZS(fee)}` +
            `\n${lang === "sw" ? "Jumla" : "Total"}: ${plainTZS(order.totalTZS || 0)}` +
            `\n\n*Order ID:* ${order.orderId}\n${lang === "sw" ? "Mahali" : "Address"}: ${region}`,
        });

        await sleep(250);
        await sendInteractiveButtons({
          to: from,
          body: clampBody(t(lang, "order_next_actions")),
          buttons: [
            { id: "pay_now", title: clampTitle(t(lang, "btn_pay_now")) },
            { id: "edit_address", title: clampTitle(t(lang, "btn_edit_address")) },
            { id: "back_menu", title: clampTitle(t(lang, "btn_back_menu")) },
          ],
        });

        resetCheckout(from);
        continue;
      }

      /* ----------------------------- Pickup in Dar --------------------------- */

      if (buttonReplyId === "fulfill_pickup") {
        updateCheckout(from, { fulfillment: "pickup" } as any);
        setExpecting(from, "pickup_name");
        await sendText({ to: from, body: t(lang, "ask_full_name") });
        continue;
      }

      if (textBody && expectingIs(from, "pickup_name")) {
        updateCheckout(from, { customerName: textBody } as any);
        setExpecting(from, "pickup_phone");
        await sendText({ to: from, body: t(lang, "ask_phone") });
        continue;
      }

      if (textBody && expectingIs(from, "pickup_phone")) {
        const normalized = textBody.replace(/[^\d+]/g, "");
        if (!/^\+?\d{9,15}$/.test(normalized)) {
          await sendText({ to: from, body: t(lang, "phone_invalid") });
          continue;
        }
        updateCheckout(from, { contactPhone: normalized.startsWith("+") ? normalized : "+255" + normalized.replace(/^0/, "") } as any);

        const s = (getSession(from).checkout ?? {}) as any;
        let items: OrderItem[] = [];
        if (!s.productId) {
          items = getSession(from).cart.items.map((it: any) => ({ ...it }));
        } else {
          const price = isProMaxPackageId(s.productId)
            ? PROMAX_PRICE_TZS
            : PRODUCTS.find((p) => p.id === s.productId)?.priceTZS ?? 0;
          const title = isProMaxPackageId(s.productId)
            ? `${productTitle("product_promax", lang)} — ${promaxPackageTitle(s.productId, lang)}`
            : productTitle(s.productId, lang);
          items.push({ productId: s.productId, title, qty: 1, priceTZS: price });
        }

        const order = createOrder({
          items,
          lang,
          customerPhone: from,
          customerName: s.customerName || "",
          addressStreet: "",
          addressCity: "Keko Furniture",
          addressCountry: "Dar es Salaam",
        });
        setLastOrderId(from, order.orderId);
        clearCart(from);

        await sendText({ to: from, body: t(lang, "pickup_thanks", { customerName: order.customerName || "" }) });
        resetCheckout(from);
        continue;
      }

      /* ---------------------------- Deliver in Dar --------------------------- */

      if (buttonReplyId === "fulfill_delivery") {
        updateCheckout(from, { fulfillment: "delivery", addressCountry: "Dar es Salaam" } as any);
        setExpecting(from, "delivery_name");
        await sendText({ to: from, body: t(lang, "ask_full_name") });
        continue;
      }

      if (textBody && expectingIs(from, "delivery_name")) {
        updateCheckout(from, { customerName: textBody } as any);
        setExpecting(from, "delivery_phone_dar");
        await sendText({ to: from, body: t(lang, "ask_phone") });
        continue;
      }

      if (textBody && expectingIs(from, "delivery_phone_dar")) {
        const normalized = textBody.replace(/[^\d+]/g, "");
        if (!/^\+?\d{9,15}$/.test(normalized)) {
          await sendText({ to: from, body: t(lang, "phone_invalid") });
          continue;
        }
        updateCheckout(from, { contactPhone: normalized.startsWith("+") ? normalized : "+255" + normalized.replace(/^0/, "") } as any);

        await sendWardPickerAllDar(from, lang, 0);
        continue;
      }

      // Ward pagination & pick
      if (typeof listReplyId === "string" && listReplyId.startsWith("ward_global_next::")) {
        const next = Number(listReplyId.split("::")[1]) || 0;
        await sendWardPickerAllDar(from, lang, next);
        continue;
      }
      if (textBody && expectingIs(from, "select_ward_global") && /^(n|next)$/i.test(textBody.trim())) {
        const s = (getSession(from).checkout ?? {}) as any;
        const next = Math.max(0, Number(s.wardPageIndexGlobal) || 0) + 1;
        await sendWardPickerAllDar(from, lang, next);
        continue;
      }
      if (typeof listReplyId === "string" && listReplyId.startsWith("pick_ward_global::")) {
        const ward = listReplyId.split("::")[1];
        await sendDistrictConfirmAfterWard(from, lang, ward);
        continue;
      }
      if (textBody && expectingIs(from, "select_ward_global")) {
        await sendDistrictConfirmAfterWard(from, lang, textBody.trim());
        continue;
      }

      // District confirmation => finalize
      if (typeof listReplyId === "string" && listReplyId.startsWith("confirm_district_after_ward::")) {
        const district = listReplyId.split("::")[1];
        updateCheckout(from, { addressCity: district } as any);
        await finalizeDarDeliveryOrder(from, lang);
        continue;
      }
      if (textBody && expectingIs(from, "confirm_district_after_ward")) {
        updateCheckout(from, { addressCity: textBody.trim() } as any);
        await finalizeDarDeliveryOrder(from, lang);
        continue;
      }

      /* -------------------------- Pay / Edit address ------------------------- */

      if (buttonReplyId === "edit_address") {
        setExpecting(from, "edit_address");
        await sendText({ to: from, body: t(lang, "edit_address_prompt") });
        continue;
      }
      if (textBody && expectingIs(from, "edit_address")) {
        const updated = updateOrderAddress(getSession(from).lastCreatedOrderId || "", textBody);
        if (!updated) {
          await sendText({ to: from, body: t(lang, "not_found") });
        } else {
          await sendText({ to: from, body: t(lang, "edit_address_ok") });
        }
        setExpecting(from, "none");
        continue;
      }

      if (buttonReplyId === "pay_now") {
        setExpecting(from, "txn_message");
        await sendText({
          to: from,
          body: t(lang, "prompt_txn_message", { orderId: getSession(from).lastCreatedOrderId || "" }),
        });
        continue;
      }
      if (textBody && expectingIs(from, "txn_message")) {
        const updated = attachTxnMessage(getSession(from).lastCreatedOrderId || "", textBody);
        if (!updated) {
          await sendText({ to: from, body: t(lang, "not_found") });
        } else {
          await sendText({ to: from, body: t(lang, "txn_message_ok") });
        }
        setExpecting(from, "none");
        continue;
      }
      if (m?.type === "image" && expectingIs(from, "txn_message")) {
        const caption = (m?.image?.caption || "").trim();
        const updated = attachTxnImage(getSession(from).lastCreatedOrderId || "", m?.image?.id || "", caption);
        if (!updated) {
          await sendText({ to: from, body: t(lang, "not_found") });
        } else {
          await sendText({ to: from, body: t(lang, "txn_image_ok") });
        }
        setExpecting(from, "none");
        continue;
      }

      /* ------------------------------- Agent & Tracking ---------------------- */

      if (listReplyId === "talk_agent") {
        await sendInteractiveList({
          to: from,
          header: clampHeader(t(lang, "agent_list_title")),
          body: clampBody(t(lang, "agent_contact_question")),
          buttonText: clampTitle(t(lang, "menu_button")),
          sections: [{
            title: clampSection(t(lang, "section_help")),
            rows: [
              { id: "agent_text", title: clampTitle(t(lang, "agent_row_text")), description: "" },
              { id: "agent_wa_call", title: clampTitle(t(lang, "agent_row_wa_call")), description: "" },
              { id: "agent_normal_call", title: clampTitle(t(lang, "agent_row_normal_call")), description: "" },
            ],
          }],
        });
        continue;
      }
      if (listReplyId === "agent_text") { await sendText({ to: from, body: t(lang, "agent_text_ack") }); continue; }
      if (listReplyId === "agent_wa_call") { logger.info({ from }, "WA call requested"); await sendText({ to: from, body: t(lang, "agent_wa_call_ack") }); continue; }
      if (listReplyId === "agent_normal_call") { setExpecting(from, "agent_phone"); await sendText({ to: from, body: t(lang, "agent_prompt_phone") }); continue; }
      if (textBody && expectingIs(from, "agent_phone")) {
        const normalized = textBody.replace(/[^\d+]/g, "");
        if (!/^\+?\d{9,15}$/.test(normalized)) {
          await sendText({ to: from, body: t(lang, "agent_phone_invalid") });
        } else {
          await sendText({ to: from, body: t(lang, "agent_phone_ack", { phone: normalized }) });
        }
        setExpecting(from, "none");
        continue;
      }

      if (listReplyId === "track_order") {
        setExpecting(from, "order_id");
        await sendText({ to: from, body: t(lang, "prompt_order_id") });
        continue;
      }
      if (textBody && expectingIs(from, "order_id")) {
        const id = textBody.replace(/\s+/g, "");
        const o = getOrder(id);
        if (!o) {
          await sendText({ to: from, body: t(lang, "status_not_found") });
        } else {
          const paid = o.paidTZS ?? 0;
          const due = Math.max(0, (o.totalTZS ?? 0) - paid);
          await sendText({
            to: from,
            body:
              `*${t(lang, "order_created_title")}* ${o.orderId}\n` +
              `*Status:* ${o.status || "awaiting"}\n` +
              `*Total:* ${plainTZS(o.totalTZS || 0)}\n` +
              `*Paid:* ${plainTZS(paid)}\n` +
              `*Balance:* ${plainTZS(due)}\n`,
          });
        }
        setExpecting(from, "none");
        continue;
      }

      // Fallback: show menu
      await sendMainMenu(from, lang);
    }

    return res.sendStatus(200);
  } catch (err) {
    logger.error({ err }, "Webhook processing error");
    return res.sendStatus(200);
  }
});
