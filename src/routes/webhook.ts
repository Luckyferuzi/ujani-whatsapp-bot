// src/routes/webhook.ts
// FULL UPDATED & HARDENED: Inside-Dar delivery (district → ward → street → quote)
// - Strictly coerces any values to strings before building list rows
// - Fixes TS2345/TS2322 by ensuring rows[].id and title are strings
// - Compatible with your whatsapp/session/orders/delivery/wards/i18n/menu modules

import type { Request, Response } from "express";
import { Router } from "express";
import pino from "pino";

import {
  getSession,
  setExpecting,
  setLang,
  startCheckout,
  updateCheckout,
  setCheckoutStage,
  resetCheckout,
  setLastOrderId,
  addToCart,
  clearCart,
  cartTotal,
} from "../session.js";

import {
  createOrder,
  getOrder,
  updateOrderAddress,
  attachTxnMessage,
  attachTxnImage,
  type OrderItem,
} from "../orders.js";

import {
  listDistricts,
  listWardsByDistrict,
  getDistanceKm,
} from "../wards.js";

import { feeForDarDistance } from "../delivery.js";

import {
  sendText,
  sendInteractiveList,
  sendInteractiveButtons,
  verifyWebhookSignature,
} from "../whatsapp.js";

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
const MAX_BUTTON_TITLE = 20;
const MAX_HEADER_TEXT = 60;
const MAX_BODY_TEXT = 1024;

const clamp = (s: any, n: number) => {
  const str = (s ?? "").toString();
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
};
const clampTitle = (s: any) => clamp(toStringStrict(s), MAX_ROW_TITLE);
const clampDesc = (s: any) => clamp(toStringStrict(s), MAX_ROW_DESC);
const clampSection = (s: any) => clamp(toStringStrict(s), MAX_SECTION_TITLE);
const clampButton = (s: any) => clamp(toStringStrict(s), MAX_BUTTON_TITLE);
const clampHeader = (s: any) => clamp(toStringStrict(s), MAX_HEADER_TEXT);
const clampBody = (s: any) => clamp(toStringStrict(s), MAX_BODY_TEXT);

/* ------------------------------- Utils ---------------------------------- */

const SLEEP_MS = 450;
const nap = (ms = SLEEP_MS) => new Promise((r) => setTimeout(r, ms));

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function normalizePhone(s: string): string | null {
  const raw = (s || "").replace(/[^\d+]/g, "");
  if (!raw) return null;
  if (/^\+?\d{9,15}$/.test(raw)) {
    if (raw.startsWith("+")) return raw;
    if (raw.startsWith("0")) return "+255" + raw.slice(1);
    if (raw.startsWith("255")) return "+" + raw;
    return "+" + raw;
  }
  return null;
}

function plainTZS(n: number): string {
  return `TSh ${Math.max(0, Math.round(n || 0)).toLocaleString("en-US")}`;
}

function expectingIs(from: string, key: string): boolean {
  return (getSession(from).expecting as any) === key;
}

/** Coerce anything to a safe, short display string. */
function toStringStrict(v: any): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  // common object shapes
  const cand =
    (typeof v.name === "string" && v.name) ||
    (typeof v.title === "string" && v.title) ||
    (typeof v.district === "string" && v.district) ||
    (typeof v.ward === "string" && v.ward) ||
    (typeof v.id === "string" && v.id);
  return cand ? cand : JSON.stringify(v);
}

/* ------------------------------ Main menu ------------------------------- */

async function sendMainMenu(to: string, lang: "en" | "sw") {
  const productsRows: { id: string; title: string; description: string }[] = [
    { id: "product_kiboko", title: clampTitle("Ujani Kiboko"), description: clampDesc("140,000 TSh") },
    { id: "product_furaha", title: clampTitle("Ujani Furaha"), description: clampDesc("110,000 TSh") },
    { id: "product_promax", title: clampTitle(productTitle("product_promax", lang)), description: clampDesc(promaxPackageTitle("promax_a", lang)) },
  ];

  const settingsRow = { id: "change_language", title: clampTitle(lang === "sw" ? "English 🇬🇧" : "Kiswahili 🇹🇿"), description: "" };

  await sendInteractiveList({
    to,
    header: clampHeader(t(lang, "menu_body")),
    body: clampBody(t(lang, "menu_body")),
    buttonText: clampButton(t(lang, "menu_button")),
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

/* -------------------------- Product helpers ----------------------------- */

async function showProductActionsList(to: string, lang: "en" | "sw", productId: string) {
  const rows: { id: string; title: string; description: string }[] = [
    { id: `action_buy_${productId}`, title: clampTitle(lang === "sw" ? "Nunua sasa" : "Buy now"), description: "" },
    { id: `action_info_${productId}`, title: clampTitle(lang === "sw" ? "Maelezo zaidi" : "More details"), description: "" },
    { id: `action_add_${productId}`, title: clampTitle(lang === "sw" ? "Ongeza kikapuni" : "Add to cart"), description: "" },
    { id: "view_cart", title: clampTitle(lang === "sw" ? "Angalia Kikapu" : "View Cart"), description: "" },
  ];
  await sendInteractiveList({
    to,
    header: clampHeader(productTitle(productId, lang)),
    body: clampBody(promaxPackageSummary(productId, lang)),
    buttonText: clampButton(t(lang, "menu_button")),
    sections: [{ title: clampSection(t(lang, "section_products")), rows }],
  });
}

async function pickProMaxPackage(to: string, lang: "en" | "sw") {
  const rows: { id: string; title: string; description: string }[] = PROMAX_PACKAGES.map((pkg) => {
    const pid = toStringStrict(pkg.id);
    return {
      id: pid,
      title: clampTitle(promaxPackageTitle(pid, lang)),
      description: clampDesc(promaxPackageSummary(pid, lang)),
    };
  });
  await sendInteractiveList({
    to,
    header: clampHeader(productTitle("product_promax", lang)),
    body: clampBody(t(lang, "menu_body")),
    buttonText: clampButton(t(lang, "menu_button")),
    sections: [{ title: clampSection(t(lang, "section_products")), rows }],
  });
}

async function showAgentOptions(to: string, lang: "en" | "sw") {
  const rows: { id: string; title: string; description: string }[] = [
    { id: "agent_text", title: clampTitle(t(lang, "talk_agent_title")), description: clampDesc(t(lang, "talk_agent_desc")) },
    { id: "agent_wa_call", title: clampTitle(lang === "sw" ? "Simu kupitia WhatsApp" : "Voice via WhatsApp"), description: "" },
    { id: "agent_normal_call", title: clampTitle(lang === "sw" ? "Simu ya kawaida" : "Normal phone call"), description: "" },
    { id: "track_order", title: clampTitle(t(lang, "track_order_title")), description: clampDesc(t(lang, "track_order_desc")) },
  ];
  const settingsRow = { id: "change_language", title: clampTitle(lang === "sw" ? "English 🇬🇧" : "Kiswahili 🇹🇿"), description: "" };

  await sendInteractiveList({
    to,
    header: clampHeader(t(lang, "menu_body")),
    body: clampBody(t(lang, "menu_body")),
    buttonText: clampButton(t(lang, "menu_button")),
    sections: [
      { title: clampSection(t(lang, "section_products")), rows: [{ id: "view_cart", title: clampTitle(lang === "sw" ? "Angalia Kikapu" : "View Cart"), description: "" }] },
      { title: clampSection(t(lang, "section_help")), rows },
      { title: clampSection(t(lang, "section_settings")), rows: [settingsRow] },
    ],
  });
}

/* ----------------- Inside-Dar: District/Ward pickers ------------------- */

async function sendDistrictPicker(to: string, lang: "en" | "sw") {
  const districtsAny = listDistricts(); // may be string[] in our wards.ts; but we coerce anyway
  const districts = (districtsAny || []).map((d) => toStringStrict(d));
  updateCheckout(to, { districtsCache: districts } as any);

  const rows: { id: string; title: string; description: string }[] = districts.map((d, idx) => ({
    id: `pick_district::${idx}`,
    title: clampTitle(d),
    description: "",
  }));

  await sendInteractiveList({
    to,
    header: clampHeader(lang === "sw" ? "Chagua Wilaya" : "Choose District"),
    body: clampBody(
      lang === "sw"
        ? "Chagua wilaya yako (Dar es Salaam) au jibu kwa *namba* kutoka orodhani."
        : "Pick your district (Dar es Salaam) or reply with its *number* from the list."
    ),
    buttonText: clampButton(lang === "sw" ? "Fungua" : "Open"),
    sections: [{ title: clampSection("Districts"), rows }],
  });

  const asText = districts.map((d, i) => `${i + 1}) ${d}`).join("\n");
  await nap();
  await sendText({
    to,
    body: (lang === "sw" ? `Orodha ya Wilaya:\n` : `Districts list:\n`) + asText,
  });

  setExpecting(to, "select_district" as any);
  setCheckoutStage(to, "asked_district" as any);
}

async function sendWardPage(to: string, lang: "en" | "sw", district: string, pageIndex: number) {
  const wardsAny = listWardsByDistrict(district);
  const wardsAll = (wardsAny || []).map((w) => toStringStrict(w));
  const pages = chunk(wardsAll, 9);
  const page = Math.max(0, Math.min(pageIndex, Math.max(0, pages.length - 1)));
  const wards = pages.length ? pages[page] : [];

  updateCheckout(to, { wardPageIndex: page } as any);

  const rows: { id: string; title: string; description: string }[] = wards.map((w) => ({
    id: `pick_ward::${district}::${w}`,
    title: clampTitle(w),
    description: "",
  }));

  if (page < pages.length - 1) {
    rows.push({
      id: `ward_next::${district}::${page + 1}`,
      title: clampTitle(lang === "sw" ? "Ifuatayo →" : "Next →"),
      description: "",
    });
  }

  await sendInteractiveList({
    to,
    header: clampHeader(lang === "sw" ? `Chagua Kata` : `Choose Ward`),
    body: clampBody(
      (lang === "sw" ? "Wilaya" : "District") +
        `: ${district}\n` +
        (lang === "sw" ? "Chagua kata au jibu kwa namba." : "Pick a ward or reply with its number.")
    ),
    buttonText: clampButton(lang === "sw" ? "Fungua" : "Open"),
    sections: [{ title: clampSection(lang === "sw" ? `Kata` : `Wards`), rows }],
  });

  const asText = wards.map((w, i) => `${i + 1}) ${w}`).join("\n");
  const nextHint =
    page < pages.length - 1
      ? lang === "sw"
        ? "\nTuma N au NEXT kwenda ukurasa unaofuata."
        : "\nSend N or NEXT for the next page."
      : "";
  await nap();
  await sendText({
    to,
    body: (lang === "sw" ? `Orodha ya Kata (Ukurasa ${page + 1}/${pages.length}):\n` : `Wards (Page ${page + 1}/${pages.length}):\n`) + asText + nextHint,
  });

  setExpecting(to, "select_ward" as any);
  setCheckoutStage(to, "asked_ward" as any);
}

async function handleWardChosen(to: string, lang: "en" | "sw", district: string, ward: string) {
  updateCheckout(to, { addressCity: district, addressWard: ward, addressCountry: "Dar es Salaam" } as any);

  const prompt =
    lang === "sw"
      ? `Andika jina la *mtaa* (street) wako ndani ya ${ward}. Mfano: "Msimbazi".`
      : `Type your *street* name within ${ward}. Example: "Msimbazi".`;
  setExpecting(to, "type_street" as any);
  setCheckoutStage(to, "asked_street" as any);
  await sendText({ to, body: prompt });
}

/* --------------------- Street DB + Quoting (Dar) ---------------------- */

import fs from "node:fs";
import path from "node:path";

type StreetRow = {
  REGION?: string;
  DISTRICT?: string;
  WARD?: string;
  STREET?: string;
  PLACES?: string;
  DISTANCE_FROM_KEKO_MAGURUMBASI_KM?: number;
};

let __streetDB: StreetRow[] | null = null;

function candidateStreetPaths(): string[] {
  return [
    path.resolve(process.cwd(), "src/data/dar_location.json"),
    path.resolve(process.cwd(), "data/dar_location.json"),
    path.resolve(process.cwd(), "dar_location.json"),
  ];
}

function loadStreetDB(): StreetRow[] {
  if (__streetDB) return __streetDB;
  for (const p of candidateStreetPaths()) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf8");
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          __streetDB = arr as StreetRow[];
          return __streetDB;
        }
      }
    } catch {
      // continue
    }
  }
  __streetDB = [];
  return __streetDB;
}

function norm(s: string) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function findStreetKm(district: string, ward: string, street: string): number | undefined {
  const db = loadStreetDB();
  const d = norm(district),
    w = norm(ward),
    st = norm(street);

  let row = db.find((r) => norm(r.DISTRICT || "") === d && norm(r.WARD || "") === w && norm(r.STREET || "") === st);
  if (!row) {
    row = db.find((r) => norm(r.DISTRICT || "") === d && norm(r.WARD || "") === w && norm(r.STREET || "").startsWith(st));
  }
  if (!row) {
    row = db.find((r) => norm(r.DISTRICT || "") === d && norm(r.WARD || "") === w && norm(r.STREET || "").includes(st));
  }
  const km = row?.DISTANCE_FROM_KEKO_MAGURUMBASI_KM;
  return typeof km === "number" && isFinite(km) ? km : undefined;
}

function roundMetersUp100(meters: number): number {
  if (!isFinite(meters) || meters <= 0) return 0;
  return Math.ceil(meters / 100) * 100;
}
function roundFeeTo500(fee: number): number {
  if (!isFinite(fee) || fee <= 0) return 0;
  return Math.ceil(fee / 500) * 500;
}

async function handleStreetTyped(to: string, lang: "en" | "sw", streetRaw: string) {
  const street = (streetRaw || "").trim();
  if (!street) {
    await sendText({ to, body: lang === "sw" ? "Tafadhali andika jina la mtaa." : "Please type your street name." });
    return;
  }

  const s = (getSession(to).checkout ?? {}) as any;
  const district = toStringStrict(s.addressCity);
  const ward = toStringStrict(s.addressWard);

  let km = findStreetKm(district, ward, street);
  let used = "street";
  if (typeof km !== "number") {
    km = getDistanceKm(district, ward) ?? 0;
    used = "ward";
  }

  const metersRounded = roundMetersUp100((km || 0) * 1000);
  const kmDisplay = metersRounded / 1000;

  const baseFee = feeForDarDistance(kmDisplay);
  const fee = roundFeeTo500(baseFee);

  updateCheckout(to, {
    addressStreet: street,
    deliveryKm: kmDisplay,
    deliveryFeeTZS: fee,
  } as any);

  const total = (s.totalTZS ?? cartTotal(to)) + fee;

  if (used === "ward") {
    await sendText({
      to,
      body:
        lang === "sw"
          ? "Sikuwena kupata mtaa huu kwenye orodha; nimetumia umbali wa kata husika."
          : "Couldn’t find this street in the dataset; used the ward distance instead.",
    });
    await nap();
  }

  const summary =
    (lang === "sw" ? "📦 *Muhtasari (Delivery Dar)*" : "📦 *Summary (Dar Delivery)*") +
    `\n${lang === "sw" ? "Jina" : "Name"}: ${toStringStrict(s.customerName)}` +
    `\n${lang === "sw" ? "Mahali" : "Location"}: ${street}, ${ward}, ${district}` +
    `\n${lang === "sw" ? "Umbali" : "Distance"}: ${kmDisplay.toFixed(2)} km` +
    `\n${lang === "sw" ? "Nauli" : "Delivery"}: ${plainTZS(fee)}` +
    `\n${lang === "sw" ? "Jumla" : "Total"}: ${plainTZS(total)}`;

  await sendText({ to, body: summary });
  await nap();

  setCheckoutStage(to, "asked_phone");
  setExpecting(to, "delivery_phone");
  await sendText({ to, body: t(lang, "ask_phone") });
}

/* ------------------------------- Webhook -------------------------------- */

// GET verify
router.get("/", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// POST messages
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
      if (textBody === "EN") {
        setLang(from, "en");
        await sendMainMenu(from, "en");
        continue;
      }
      if (textBody === "SW") {
        setLang(from, "sw");
        await sendMainMenu(from, "sw");
        continue;
      }
      const lang: "en" | "sw" = getSession(from).lang || "sw";

      // Menu shortcut
      if (textBody === "MENU" || buttonReplyId === "back_menu") {
        await sendMainMenu(from, lang);
        continue;
      }

      // Settings
      if (listReplyId === "change_language") {
        const next = lang === "sw" ? "en" : "sw";
        setLang(from, next);
        await sendMainMenu(from, next);
        continue;
      }

      /* --------------------------- Product flows --------------------------- */

      if (listReplyId === "product_kiboko" || listReplyId === "product_furaha") {
        await showProductActionsList(from, lang, listReplyId);
        continue;
      }
      if (listReplyId === "product_promax") {
        await pickProMaxPackage(from, lang);
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
        await nap();
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
        await nap();
        await showProductActionsList(from, lang, pid);
        continue;
      }

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
          body: clampBody(t(lang, "choose_fulfillment")),
          buttons: [
            { id: "fulfill_pickup", title: clampButton(t(lang, "btn_pickup")) },
            { id: "fulfill_delivery", title: clampButton(t(lang, "btn_delivery")) },
            { id: "back_menu", title: clampButton(t(lang, "btn_back_menu")) },
          ],
        });
        continue;
      }

      /* -------------------------------- Cart ------------------------------- */

      if (listReplyId === "view_cart") {
        const items = getSession(from).cart.items;
        if (!items.length) {
          await sendText({ to: from, body: t(lang, "cart_empty") });
          await sendMainMenu(from, lang);
          continue;
        }
        const lines = items
          .map((it) => t(lang, "cart_summary_line", { title: it.title, qty: it.qty, price: plainTZS(it.priceTZS * it.qty) }))
          .join("\n");
        await sendText({
          to: from,
          body: `*${t(lang, "cart_title")}*\n${lines}\n${t(lang, "cart_summary_total", { total: plainTZS(cartTotal(from)) })}`,
        });
        await nap();
        await sendInteractiveButtons({
          to: from,
          body: clampBody(t(lang, "cart_actions")),
          buttons: [
            { id: "cart_checkout", title: clampButton(t(lang, "btn_cart_checkout")) },
            { id: "cart_clear", title: clampButton(t(lang, "btn_cart_clear")) },
            { id: "back_menu", title: clampButton(t(lang, "btn_cart_back")) },
          ],
        });
        continue;
      }

      if (buttonReplyId === "cart_checkout") {
        const items = getSession(from).cart.items;
        if (!items.length) {
          await sendText({ to: from, body: t(lang, "cart_empty") });
          await sendMainMenu(from, lang);
          continue;
        }
        startCheckout(from);
        await sendInteractiveButtons({
          to: from,
          body: clampBody(
            lang === "sw" ? "Je, uko ndani ya Dar es Salaam au nje ya Dar es Salaam?" : "Are you within Dar es Salaam or outside Dar es Salaam?"
          ),
          buttons: [
            { id: "area_dar", title: clampButton(lang === "sw" ? "Ndani ya Dar es Salaam" : "Within Dar") },
            { id: "area_outside", title: clampButton(lang === "sw" ? "Nje ya Dar es Salaam" : "Outside Dar") },
            { id: "back_menu", title: clampButton(t(lang, "btn_back_menu")) },
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

      /* ---------------- Area & Fulfillment selection ---------------------- */

      if (buttonReplyId === "area_dar") {
        updateCheckout(from, { addressCountry: "Dar es Salaam" } as any);
        await sendInteractiveButtons({
          to: from,
          body: clampBody(t(lang, "choose_fulfillment")),
          buttons: [
            { id: "fulfill_pickup", title: clampButton(t(lang, "btn_pickup")) },
            { id: "fulfill_delivery", title: clampButton(t(lang, "btn_delivery")) },
            { id: "back_menu", title: clampButton(t(lang, "btn_back_menu")) },
          ],
        });
        continue;
      }

      if (buttonReplyId === "area_outside") {
        updateCheckout(from, { addressCountry: "OUTSIDE_DAR" } as any);
        setCheckoutStage(from, "asked_name");
        setExpecting(from, "customer_name");
        await sendText({ to: from, body: lang === "sw" ? "Tuma majina matatu kamili ya mteja." : "Send the customer's full name (three parts)." });
        continue;
      }

      if (buttonReplyId === "fulfill_pickup" || buttonReplyId === "fulfill_delivery") {
        updateCheckout(from, { fulfillment: buttonReplyId === "fulfill_pickup" ? "pickup" : "delivery" });
        setCheckoutStage(from, "asked_name");
        setExpecting(from, "customer_name");
        await sendText({ to: from, body: t(lang, "ask_full_name") });
        continue;
      }

      /* ------------------------- Agent / Track ---------------------------- */

      if (listReplyId === "talk_agent") {
        await showAgentOptions(from, lang);
        continue;
      }

      if (listReplyId === "agent_text") {
        await sendText({ to: from, body: t(lang, "agent_text_ack") });
        continue;
      }

      if (listReplyId === "agent_wa_call") {
        logger.info({ type: "wa_call_request", from }, "User requested WA call");
        await sendText({ to: from, body: t(lang, "agent_wa_call_ack") });
        continue;
      }

      if (listReplyId === "agent_normal_call") {
        setExpecting(from, "agent_phone");
        await sendText({ to: from, body: t(lang, "agent_prompt_phone") });
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
          setExpecting(from, "none");
          continue;
        }
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
        setExpecting(from, "none");
        continue;
      }

      if (textBody && expectingIs(from, "agent_phone")) {
        const normalized = normalizePhone(textBody);
        if (!normalized) {
          await sendText({ to: from, body: t(lang, "phone_invalid") });
          continue;
        }
        logger.info({ type: "normal_call_request", from, phone: normalized }, "User requested normal phone call");
        await sendText({ to: from, body: t(lang, "agent_phone_ack", { phone: normalized }) });
        setExpecting(from, "none");
        continue;
      }

      /* ---------------- Full name → address step -------------------------- */

      if (textBody && expectingIs(from, "customer_name")) {
        updateCheckout(from, { customerName: textBody });
        const s = (getSession(from).checkout ?? {}) as any;
        const outside = s.addressCountry === "OUTSIDE_DAR";
        const isPickup = s.fulfillment === "pickup";
        const isDeliveryDar = s.addressCountry === "Dar es Salaam" && s.fulfillment === "delivery";

        if (outside) {
          setCheckoutStage(from, "asked_address");
          setExpecting(from, "delivery_address");
          await sendInteractiveButtons({
            to: from,
            body: clampBody(lang === "sw" ? "Ni njia gani ya usafiri?" : "Which transport mode?"),
            buttons: [
              { id: "outside_mode_bus", title: clampButton(lang === "sw" ? "Basi" : "Bus") },
              { id: "outside_mode_boat", title: clampButton(lang === "sw" ? "Boti" : "Boat") },
              { id: "back_menu", title: clampButton(t(lang, "btn_back_menu")) },
            ],
          });
          continue;
        }
        if (isPickup) {
          setCheckoutStage(from, "asked_phone");
          setExpecting(from, "pickup_phone");
          await sendText({ to: from, body: t(lang, "ask_phone") });
          continue;
        }
        if (isDeliveryDar) {
          await sendDistrictPicker(from, lang);
          continue;
        }
        await sendMainMenu(from, lang);
        continue;
      }

      /* --------------------- District selection --------------------------- */

      if (typeof listReplyId === "string" && listReplyId.startsWith("pick_district::")) {
        const idx = Number(listReplyId.split("::")[1]);
        const cacheAny: any[] = ((getSession(from).checkout || {}) as any).districtsCache || listDistricts();
        const cache = (cacheAny || []).map((d) => toStringStrict(d));
        const picked = cache[idx];
        if (!picked) {
          await sendDistrictPicker(from, lang);
          continue;
        }
        updateCheckout(from, { addressCity: picked, addressCountry: "Dar es Salaam" } as any);
        await sendWardPage(from, lang, picked, 0);
        continue;
      }

      if (textBody && expectingIs(from, "select_district")) {
        const cacheAny: any[] = ((getSession(from).checkout || {}) as any).districtsCache || listDistricts();
        const cache = (cacheAny || []).map((d) => toStringStrict(d));
        const n = Number(textBody);
        const chosen =
          Number.isFinite(n) && n >= 1 && n <= cache.length
            ? cache[n - 1]
            : cache.find((d) => d.toLowerCase() === textBody.toLowerCase());
        if (!chosen) {
          await sendText({
            to: from,
            body:
              lang === "sw"
                ? "Sikupata wilaya hiyo. Jibu kwa namba sahihi au jina kamili."
                : "Couldn’t find that district. Reply with a valid number or exact name.",
          });
          await nap();
          if (cache.length) await sendWardPage(from, lang, cache[0], 0);
          continue;
        }
        updateCheckout(from, { addressCity: chosen, addressCountry: "Dar es Salaam" } as any);
        await sendWardPage(from, lang, chosen, 0);
        continue;
      }

      /* ------------------------ Ward selection ---------------------------- */

      if (typeof listReplyId === "string" && listReplyId.startsWith("ward_next::")) {
        const [, district, pageStr] = listReplyId.split("::");
        const next = Number(pageStr) || 0;
        await sendWardPage(from, lang, district, next);
        continue;
      }

      if (typeof listReplyId === "string" && listReplyId.startsWith("pick_ward::")) {
        const [, district, ward] = listReplyId.split("::");
        await handleWardChosen(from, lang, district, ward);
        continue;
      }

      if (textBody && expectingIs(from, "select_ward")) {
        const s = (getSession(from).checkout ?? {}) as any;
        const district = toStringStrict(s.addressCity);
        const wardsAny = listWardsByDistrict(district);
        const wardsAll = (wardsAny || []).map((w) => toStringStrict(w));
        if (!district || !wardsAll.length) {
          const typed = textBody.trim();
          await handleWardChosen(from, lang, district || "Dar es Salaam", typed);
          continue;
        }
        const page = Number.isFinite(Number(s.wardPageIndex)) ? Number(s.wardPageIndex) : 0;
        const pages = chunk(wardsAll, 9);
        const wards = pages[Math.max(0, Math.min(page, Math.max(0, pages.length - 1)))] || [];

        if (/^(n|next)$/i.test(textBody)) {
          const next = page + 1 < pages.length ? page + 1 : page;
          await sendWardPage(from, lang, district, next);
          continue;
        }

        const n = Number(textBody);
        let ward =
          Number.isFinite(n) && n >= 1 && n <= wards.length
            ? wards[n - 1]
            : wards.find((w) => w.toLowerCase() === textBody.toLowerCase());
        if (!ward) {
          await sendText({
            to: from,
            body:
              lang === "sw"
                ? "Sikupata kata hiyo. Jibu kwa *namba* iliyoonyeshwa au jina kamili."
                : "Couldn’t find that ward. Reply with the *number* shown or the exact name.",
          });
          await nap();
          await sendWardPage(from, lang, district, page);
          continue;
        }
        await handleWardChosen(from, lang, district, ward);
        continue;
      }

      /* ---------------------- Street typed (Dar) -------------------------- */

      if (textBody && expectingIs(from, "type_street")) {
        await handleStreetTyped(from, lang, textBody.trim());
        continue;
      }

      /* ------------------- Pickup phone → order --------------------------- */

      if (textBody && expectingIs(from, "pickup_phone")) {
        const normalized = normalizePhone(textBody);
        if (!normalized) {
          await sendText({ to: from, body: t(lang, "phone_invalid") });
          continue;
        }
        updateCheckout(from, { contactPhone: normalized });

        const s = (getSession(from).checkout ?? {}) as any;
        let items: OrderItem[] = [];
        if (!s.productId) {
          items = getSession(from).cart.items.map((it: any) => ({ ...it }));
        } else {
          const price = isProMaxPackageId(s.productId) ? PROMAX_PRICE_TZS : PRODUCTS.find((p) => p.id === s.productId)?.priceTZS ?? 0;
          const title = isProMaxPackageId(s.productId)
            ? `${productTitle("product_promax", lang)} — ${promaxPackageTitle(s.productId, lang)}`
            : productTitle(s.productId, lang);
          items.push({ productId: s.productId, title, qty: 1, priceTZS: price });
        }
        const fee = Math.max(0, Math.floor((s as any).deliveryFeeTZS || 0));
        if (fee > 0)
          items.push({ productId: "delivery_fee", title: lang === "sw" ? "Nauli ya Usafiri" : "Delivery Fee", qty: 1, priceTZS: fee });

        const order = createOrder({
          items,
          lang,
          customerPhone: from,
          customerName: s.customerName,
          addressStreet: s.addressStreet,
          addressCity: s.addressCity,
          addressCountry: s.addressCountry,
        });
        setLastOrderId(from, order.orderId);
        clearCart(from);
        await sendText({ to: from, body: t(lang, "pickup_thanks", { customerName: order.customerName || "" }) });
        resetCheckout(from);
        continue;
      }

      /* ----------- Outside Dar: address & phone → order ------------------- */

      if (textBody && expectingIs(from, "delivery_address")) {
        const s = (getSession(from).checkout ?? {}) as any;
        const outside = s.addressCountry === "OUTSIDE_DAR";
        if (outside) {
          const raw = (toStringStrict(s.addressRaw) ? toStringStrict(s.addressRaw) + " " : "") + textBody;
          updateCheckout(from, { addressRaw: raw });
          setCheckoutStage(from, "asked_phone");
          setExpecting(from, "delivery_phone");
          await sendText({ to: from, body: t(lang, "ask_phone") });
          continue;
        }
        setExpecting(from, "none");
        await sendMainMenu(from, lang);
        continue;
      }

      if (textBody && expectingIs(from, "delivery_phone")) {
        const normalized = normalizePhone(textBody);
        if (!normalized) {
          await sendText({ to: from, body: t(lang, "phone_invalid") });
          continue;
        }
        updateCheckout(from, { contactPhone: normalized });

        const s = (getSession(from).checkout ?? {}) as any;
        let items: OrderItem[] = [];
        if (!s.productId) {
          items = getSession(from).cart.items.map((it: any) => ({ ...it }));
        } else {
          const price = isProMaxPackageId(s.productId) ? PROMAX_PRICE_TZS : PRODUCTS.find((p) => p.id === s.productId)?.priceTZS ?? 0;
          const title = isProMaxPackageId(s.productId)
            ? `${productTitle("product_promax", lang)} — ${promaxPackageTitle(s.productId, lang)}`
            : productTitle(s.productId, lang);
          items.push({ productId: s.productId, title, qty: 1, priceTZS: price });
        }
        const fee = Math.max(0, Math.floor((s as any).deliveryFeeTZS || 0));
        if (fee > 0)
          items.push({ productId: "delivery_fee", title: lang === "sw" ? "Nauli ya Usafiri" : "Delivery Fee", qty: 1, priceTZS: fee });

        const order = createOrder({
          items,
          lang,
          customerPhone: from,
          customerName: s.customerName,
          addressStreet: s.addressStreet || s.addressRaw,
          addressCity: s.addressCity,
          addressCountry: s.addressCountry,
        });
        setLastOrderId(from, order.orderId);
        clearCart(from);

        const isMulti = order.items.length > 1;
        await sendText({
          to: from,
          body:
            `*${t(lang, "order_created_title")}*\n\n` +
            (isMulti
              ? t(lang, "order_created_body_total", {
                  total: plainTZS(order.totalTZS ?? 0),
                  orderId: order.orderId,
                  city: toStringStrict(order.addressCity),
                  country: toStringStrict(order.addressCountry),
                })
              : t(lang, "order_created_body_single", {
                  title: toStringStrict(order.title),
                  total: plainTZS(order.totalTZS ?? 0),
                  orderId: order.orderId,
                  city: toStringStrict(order.addressCity),
                  country: toStringStrict(order.addressCountry),
                })),
        });
        await nap();
        await sendInteractiveButtons({
          to: from,
          body: clampBody(t(lang, "order_next_actions")),
          buttons: [
            { id: "pay_now", title: clampButton(t(lang, "btn_pay_now")) },
            { id: "edit_address", title: clampButton(t(lang, "btn_edit_address")) },
            { id: "back_menu", title: clampButton(t(lang, "btn_back_menu")) },
          ],
        });
        await nap();
        resetCheckout(from);
        await sendText({
          to: from,
          body:
            lang === "sw"
              ? "Thibitisha malipo yako: Tuma *majina matatu kamili ya mlipaji*, *kiasi*, na *muda* ulipolipa, au tuma *screenshot*."
              : "Confirm your payment: Send the *full payer name*, *amount*, and *time* you paid, or send a *screenshot*.",
        });
        continue;
      }

      /* ---------------------------- Edit address -------------------------- */

      if (buttonReplyId === "edit_address") {
        setCheckoutStage(from, "asked_address");
        setExpecting(from, "edit_address");
        await sendText({ to: from, body: t(lang, "edit_address_prompt") });
        continue;
      }

      if (textBody && expectingIs(from, "edit_address")) {
        const updated = updateOrderAddress(getSession(from).lastCreatedOrderId || "", textBody);
        if (!updated) {
          await sendText({ to: from, body: t(lang, "not_found") });
          setExpecting(from, "none");
          continue;
        }
        await sendText({ to: from, body: t(lang, "edit_address_ok") });
        setExpecting(from, "none");
        continue;
      }

      /* ------------------------------ Pay now ----------------------------- */

      if (buttonReplyId === "pay_now") {
        setExpecting(from, "txn_message");
        await sendText({
          to: from,
          body: t(lang, "prompt_txn_message", {
            orderId: getSession(from).lastCreatedOrderId || "",
            merchant: "Ujani Herbal",
            acct: "UJANICLICK",
          }),
        });
        continue;
      }

      if (textBody && expectingIs(from, "txn_message")) {
        const updated = attachTxnMessage(getSession(from).lastCreatedOrderId || "", textBody);
        if (!updated) {
          await sendText({ to: from, body: t(lang, "not_found") });
          setExpecting(from, "none");
          continue;
        }
        await sendText({ to: from, body: t(lang, "txn_message_ok") });
        setExpecting(from, "none");
        continue;
      }

      if (m?.type === "image" && expectingIs(from, "txn_message")) {
        const caption = (m?.image?.caption || "").trim();
        const updated = attachTxnImage(getSession(from).lastCreatedOrderId || "", m?.image?.id || "", caption);
        if (!updated) {
          await sendText({ to: from, body: t(lang, "not_found") });
          setExpecting(from, "none");
          continue;
        }
        await sendText({ to: from, body: t(lang, "txn_image_ok") });
        setExpecting(from, "none");
        continue;
      }

      /* ------------------------------ Default ----------------------------- */

      await sendMainMenu(from, lang);
    }

    return res.sendStatus(200);
  } catch (err) {
    logger.error({ err }, "Webhook processing error");
    return res.sendStatus(200);
  }
});