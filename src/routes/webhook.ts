// src/routes/webhook.ts
// FULL FLOW: Buy now → area (Nje/Ndani) → details per your spec.
// - Outside Dar adds TSh 10,000 delivery surcharge
// - Inside Dar: office pickup vs delivery
//   Delivery: Name → Phone → Ward (global picker) → District confirm → Street → Quote
// - Hardened against TypeErrors in list rows and body texts.

import type { Request, Response } from "express";
import { Router } from "express";
import pino from "pino";
import fs from "node:fs";
import path from "node:path";

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

/* ------------------------------ UI helpers ------------------------------ */

const MAX_ROW_TITLE = 24;
const MAX_ROW_DESC = 72;
const MAX_SECTION_TITLE = 24;
const MAX_HEADER_TEXT = 60;
const MAX_BODY_TEXT = 1024;

const clamp = (s: any, n: number) => {
  const str = (s ?? "").toString();
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
};
const clampTitle = (s: any) => clamp(toStringStrict(s), MAX_ROW_TITLE);
const clampDesc = (s: any) => clamp(toStringStrict(s), MAX_ROW_DESC);
const clampSection = (s: any) => clamp(toStringStrict(s), MAX_SECTION_TITLE);
const clampHeader = (s: any) => clamp(toStringStrict(s), MAX_HEADER_TEXT);
const clampBody = (s: any) => clamp(toStringStrict(s), MAX_BODY_TEXT);

const nap = (ms = 350) => new Promise((r) => setTimeout(r, ms));

function toStringStrict(v: any): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const cand =
    (typeof v.name === "string" && v.name) ||
    (typeof v.title === "string" && v.title) ||
    (typeof v.district === "string" && v.district) ||
    (typeof v.ward === "string" && v.ward) ||
    (typeof v.id === "string" && v.id);
  return cand ? cand : JSON.stringify(v);
}
function expectingIs(from: string, key: string): boolean {
  return (getSession(from).expecting as any) === key;
}
function plainTZS(n: number): string {
  return `TSh ${Math.max(0, Math.round(n || 0)).toLocaleString("en-US")}`;
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

/* --------------------------- Main menu (UI) --------------------------- */

async function sendMainMenu(to: string, lang: "sw" | "en") {
  const productsRows = [
    { id: "product_kiboko", title: clampTitle("Ujani Kiboko"), description: clampDesc("140,000 TSh") },
    { id: "product_furaha", title: clampTitle("Ujani Furaha"), description: clampDesc("110,000 TSh") },
    { id: "product_promax", title: clampTitle(productTitle("product_promax", lang)), description: clampDesc(promaxPackageTitle("promax_a", lang)) },
  ];
  const settingsRow = { id: "change_language", title: clampTitle(lang === "sw" ? "English 🇬🇧" : "Kiswahili 🇹🇿"), description: "" };

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
    body: clampBody(promaxPackageSummary(productId, lang) || (lang === "sw" ? "Chagua hatua hapa chini." : "Choose an option below.")),
    buttonText: clampTitle(t(lang, "menu_button")),
    sections: [{ title: clampSection(t(lang, "section_products")), rows }],
  });
}

/* ---------------------- Wards (global picker) ---------------------- */

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
    id: `pick_ward_global::${w}`,
    title: clampTitle(w),
    description: "",
  }));
  if (page < pages.length - 1) {
    rows.push({
      id: `ward_global_next::${page + 1}`,
      title: clampTitle(lang === "sw" ? "Ifuatayo →" : "Next →"),
      description: "",
    });
  }

  await sendInteractiveList({
    to,
    header: clampHeader(lang === "sw" ? "Chagua Sehemu unayoishi" : "Pick your ward"),
    body: clampBody(lang === "sw" ? "Chagua sehemu (KATA) unayoishi ndani ya Dar es Salaam." : "Choose your ward (within Dar es Salaam)."),
    buttonText: clampTitle(lang === "sw" ? "Fungua" : "Open"),
    sections: [{ title: clampSection(lang === "sw" ? "Kata (Sehemu)" : "Wards"), rows }],
  });

  const asText = list.map((w, i) => `${i + 1}) ${w}`).join("\n");
  await nap();
  await sendText({
    to,
    body:
      (lang === "sw" ? `Orodha ya Kata (Ukurasa ${page + 1}/${pages.length}):` : `Wards (Page ${page + 1}/${pages.length}):`) +
      `\n${asText}\n` +
      (page < pages.length - 1 ? (lang === "sw" ? "Tuma N kwenda ukurasa unaofuata." : "Send N for next page.") : ""),
  });

  setExpecting(to, "select_ward_global" as any);
  setCheckoutStage(to, "asked_ward_global" as any);
}

async function sendDistrictConfirmAfterWard(to: string, lang: "sw" | "en", ward: string) {
  const idx = buildWardIndex();
  const hit = idx.find((r) => r.ward.toLowerCase() === ward.toLowerCase());
  const district = hit?.district || "";
  updateCheckout(to, { addressWard: ward, addressCity: district, addressCountry: "Dar es Salaam" } as any);

  // We present district as a "choice" (often a single option, per your flow).
  const rows = [{ id: `confirm_district_after_ward::${district}`, title: clampTitle(district), description: "" }];
  await sendInteractiveList({
    to,
    header: clampHeader(lang === "sw" ? "Chagua Wilaya uliopo" : "Choose your district"),
    body: clampBody(lang === "sw" ? `Sehemu: ${ward}` : `Ward: ${ward}`),
    buttonText: clampTitle(lang === "sw" ? "Chagua" : "Choose"),
    sections: [{ title: clampSection(lang === "sw" ? "Wilaya" : "District"), rows }],
  });

  setExpecting(to, "confirm_district_after_ward" as any);
  setCheckoutStage(to, "asked_district_after_ward" as any);
}

/* -------------------- Street DB + quoting (Dar) -------------------- */

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
      // keep searching
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
  if (!row) row = db.find((r) => norm(r.DISTRICT || "") === d && norm(r.WARD || "") === w && norm(r.STREET || "").startsWith(st));
  if (!row) row = db.find((r) => norm(r.DISTRICT || "") === d && norm(r.WARD || "") === w && norm(r.STREET || "").includes(st));
  const km = row?.DISTANCE_FROM_KEKO_MAGURUMBASI_KM;
  return typeof km === "number" && isFinite(km) ? km : undefined;
}
function roundMetersUp100(m: number): number {
  if (!isFinite(m) || m <= 0) return 0;
  return Math.ceil(m / 100) * 100;
}
function roundFeeTo500(n: number): number {
  if (!isFinite(n) || n <= 0) return 0;
  return Math.ceil(n / 500) * 500;
}

/* -------------------------- Flow pieces (UI) -------------------------- */

async function askArea(to: string, lang: "sw" | "en") {
  await sendInteractiveButtons({
    to,
    body: clampBody(lang === "sw" ? "Unapatikana wapi?" : "Where are you located?"),
    buttons: [
      { id: "area_outside", title: clampTitle(lang === "sw" ? "Nje ya Dar" : "Outside Dar") },
      { id: "area_dar", title: clampTitle(lang === "sw" ? "Ndani ya Dar" : "Within Dar") },
    ],
  });
}

async function askPickupOrDelivery(to: string, lang: "sw" | "en") {
  await sendInteractiveButtons({
    to,
    body: clampBody(lang === "sw" ? "Unakuja ofisini au kuletewa?" : "Pick up at office or get it delivered?"),
    buttons: [
      { id: "fulfill_pickup", title: clampTitle(lang === "sw" ? "Kuja ofisini" : "Pick up") },
      { id: "fulfill_delivery", title: clampTitle(lang === "sw" ? "Kuletewa" : "Deliver") },
    ],
  });
}

async function askStreet(to: string, lang: "sw" | "en", district: string, ward: string) {
  const prompt =
    lang === "sw"
      ? `Andika *jina la mtaa* ndani ya ${ward}, ${district}. Mfano: "Msimbazi".`
      : `Type your *street* within ${ward}, ${district}. Example: "Msimbazi".`;
  setExpecting(to, "type_street" as any);
  setCheckoutStage(to, "asked_street" as any);
  await sendText({ to, body: prompt });
}

async function handleStreetTyped(to: string, lang: "sw" | "en", streetRaw: string) {
  const street = (streetRaw || "").trim();
  if (!street) {
    await sendText({ to, body: lang === "sw" ? "Tafadhali andika jina la mtaa." : "Please type your street name." });
    return;
  }

  const s = (getSession(to).checkout ?? {}) as any;
  const district = toStringStrict(s.addressCity);
  const ward = toStringStrict(s.addressWard);

  let km = findStreetKm(district, ward, street);
  if (typeof km !== "number") km = getDistanceKm(district, ward) ?? 0;

  const metersRounded = roundMetersUp100((km || 0) * 1000);
  const kmDisplay = metersRounded / 1000;

  const baseFee = feeForDarDistance(kmDisplay);
  const fee = roundFeeTo500(baseFee);

  updateCheckout(to, { addressStreet: street, deliveryKm: kmDisplay, deliveryFeeTZS: fee } as any);

  const total = (s.totalTZS ?? cartTotal(to)) + fee;

  const summary =
    (lang === "sw" ? "📦 *Muhtasari (Delivery Dar)*" : "📦 *Summary (Dar Delivery)*") +
    `\n${lang === "sw" ? "Mahali" : "Location"}: ${street}, ${ward}, ${district}` +
    `\n${lang === "sw" ? "Umbali" : "Distance"}: ${kmDisplay.toFixed(2)} km` +
    `\n${lang === "sw" ? "Nauli" : "Delivery"}: ${plainTZS(fee)}` +
    `\n${lang === "sw" ? "Jumla" : "Total"}: ${plainTZS(total)}`;

  await sendText({ to, body: summary });
  setCheckoutStage(to, "asked_phone");
  setExpecting(to, "delivery_phone_dar");
  await sendText({ to, body: t(lang, "ask_phone") });
}

/* ----------------------------- Webhook --------------------------------- */

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
      const listReplyRaw =
        type === "interactive" && m?.interactive?.type === "list_reply" ? m?.interactive?.list_reply : undefined;
      const listReplyId: string | undefined = listReplyRaw ? (listReplyRaw as any).id : undefined;
      const buttonReplyRaw =
        type === "interactive" && m?.interactive?.type === "button_reply" ? m?.interactive?.button_reply : undefined;
      const buttonReplyId: string | undefined = buttonReplyRaw ? (buttonReplyRaw as any).id : undefined;

      // LANG quick toggles
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
      const lang: "sw" | "en" = getSession(from).lang || "sw";

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

      /* ------------------------- Product flows ------------------------- */

      if (listReplyId === "product_kiboko" || listReplyId === "product_furaha") {
        if (listReplyId) {
          await showProductActionsList(from, lang, listReplyId);
        }
        continue;
      }
      if (listReplyId === "product_promax") {
        const rows = PROMAX_PACKAGES.map((pkg: any) => {
          const pid = pkg.id as string;
          return {
            id: pid,
            title: clampTitle(promaxPackageTitle(pid, lang)),
            description: clampDesc(promaxPackageSummary(pid, lang)),
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

      // >>>> NUNUA SASA flow (your spec)
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
        await askArea(from, lang); // 1) Unapatikana wapi? Nje / Ndani
        continue;
      }

      /* ---------------- CART helpers (kept) ---------------- */

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
            { id: "cart_checkout", title: clampTitle(t(lang, "btn_cart_checkout")) },
            { id: "cart_clear", title: clampTitle(t(lang, "btn_cart_clear")) },
            { id: "back_menu", title: clampTitle(t(lang, "btn_cart_back")) },
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
        await askArea(from, lang);
        continue;
      }

      if (buttonReplyId === "cart_clear") {
        clearCart(from);
        await sendText({ to: from, body: t(lang, "cart_cleared") });
        await sendMainMenu(from, lang);
        continue;
      }

      /* ---------------- Area choice (your spec step 1) ---------------- */

      if (buttonReplyId === "area_outside") {
        // Outside Dar → ask for shipping names
        updateCheckout(from, { addressCountry: "OUTSIDE_DAR" } as any);
        setExpecting(from, "outside_names");
        setCheckoutStage(from, "asked_outside_names");
        await sendText({
          to: from,
          body: lang === "sw" ? "Andika *majina yatakayotumika kusafirishia mzigo wako*." : "Type the full name for shipping.",
        });
        continue;
      }

      if (buttonReplyId === "area_dar") {
        // Inside Dar → ask pickup or delivery
        updateCheckout(from, { addressCountry: "Dar es Salaam" } as any);
        await askPickupOrDelivery(from, lang);
        continue;
      }

      /* ---- Outside Dar detailed flow (your spec step 2, +10k) ---- */

      if (textBody && expectingIs(from, "outside_names")) {
        updateCheckout(from, { customerName: textBody } as any);
        setExpecting(from, "outside_phone");
        setCheckoutStage(from, "asked_outside_phone");
        await sendText({
          to: from,
          body: lang === "sw" ? "Taja *namba ya simu* na *mkoa* wa kusafirisha mzigo wako.\n\nTuanze na namba ya simu:" : "Provide your *phone number* and *region* for shipping.\n\nLet’s start with your phone number:",
        });
        continue;
      }

      if (textBody && expectingIs(from, "outside_phone")) {
        const normalized = normalizePhone(textBody);
        if (!normalized) {
          await sendText({ to: from, body: t(lang, "phone_invalid") });
          continue;
        }
        updateCheckout(from, { contactPhone: normalized } as any);
        setExpecting(from, "outside_region");
        setCheckoutStage(from, "asked_outside_region");
        await sendText({
          to: from,
          body: lang === "sw" ? "Sasa taja *mkoa* wa kusafirisha mzigo wako (mf. Arusha, Mwanza, Dodoma...)." : "Now tell us the *region* to ship to (e.g., Arusha, Mwanza, Dodoma...).",
        });
        continue;
      }

      if (textBody && expectingIs(from, "outside_region")) {
        const region = textBody.trim();
        const s = (getSession(from).checkout ?? {}) as any;

        // add outside surcharge +10,000
        const surcharge = 10000;
        const fee = surcharge;

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
        if (fee > 0) {
          items.push({
            productId: "delivery_fee_outside",
            title: lang === "sw" ? "Nauli ya Usafiri (nje ya Dar)" : "Delivery Fee (outside Dar)",
            qty: 1,
            priceTZS: fee,
          });
        }

        const order = createOrder({
          items,
          lang,
          customerPhone: from,
          customerName: s.customerName,
          addressStreet: "",
          addressCity: region,
          addressCountry: "OUTSIDE_DAR",
        });
        setLastOrderId(from, order.orderId);
        clearCart(from);

        await sendText({
          to: from,
          body:
            `*${t(lang, "order_created_title")}*\n\n` +
            t(lang, "order_created_body_total", {
              total: plainTZS(order.totalTZS ?? 0),
              orderId: order.orderId,
              city: region,
              country: "OUTSIDE_DAR",
            }),
        });

        await nap();
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
        await nap();
        await sendText({
          to: from,
          body:
            lang === "sw"
              ? "Thibitisha malipo yako: Tuma *majina matatu ya mlipaji*, *kiasi*, na *muda* uliolipa, au tuma *screenshot*."
              : "Confirm your payment: Send the *full payer name*, *amount*, and *time* you paid, or send a *screenshot*.",
        });
        continue;
      }

      /* ------------- Inside Dar: pickup vs delivered (step 3/4) ------------- */

      if (buttonReplyId === "fulfill_pickup") {
        updateCheckout(from, { fulfillment: "pickup" } as any);
        setExpecting(from, "pickup_name");
        setCheckoutStage(from, "asked_pickup_name");
        await sendText({ to: from, body: t(lang, "ask_full_name") });
        continue;
      }

      if (textBody && expectingIs(from, "pickup_name")) {
        updateCheckout(from, { customerName: textBody } as any);
        setExpecting(from, "pickup_phone");
        setCheckoutStage(from, "asked_pickup_phone");
        await sendText({ to: from, body: t(lang, "ask_phone") });
        continue;
      }

      if (textBody && expectingIs(from, "pickup_phone")) {
        const normalized = normalizePhone(textBody);
        if (!normalized) {
          await sendText({ to: from, body: t(lang, "phone_invalid") });
          continue;
        }
        updateCheckout(from, { contactPhone: normalized } as any);

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

        const order = createOrder({
          items,
          lang,
          customerPhone: from,
          customerName: s.customerName,
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

      if (buttonReplyId === "fulfill_delivery") {
        updateCheckout(from, { fulfillment: "delivery", addressCountry: "Dar es Salaam" } as any);
        setExpecting(from, "delivery_name");
        setCheckoutStage(from, "asked_delivery_name");
        await sendText({ to: from, body: t(lang, "ask_full_name") });
        continue;
      }

      if (textBody && expectingIs(from, "delivery_name")) {
        updateCheckout(from, { customerName: textBody } as any);
        setExpecting(from, "delivery_phone_dar");
        setCheckoutStage(from, "asked_delivery_phone");
        await sendText({ to: from, body: t(lang, "ask_phone") });
        continue;
      }

      if (textBody && expectingIs(from, "delivery_phone_dar")) {
        const normalized = normalizePhone(textBody);
        if (!normalized) {
          await sendText({ to: from, body: t(lang, "phone_invalid") });
          continue;
        }
        updateCheckout(from, { contactPhone: normalized } as any);
        // Now your spec: ward first (Sehemu), then district confirm
        await sendWardPickerAllDar(from, lang, 0);
        continue;
      }

      // Ward global pagination
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

      // Ward global pick
      if (typeof listReplyId === "string" && listReplyId.startsWith("pick_ward_global::")) {
        const ward = listReplyId.split("::")[1];
        await sendDistrictConfirmAfterWard(from, lang, ward);
        continue;
      }
      if (textBody && expectingIs(from, "select_ward_global")) {
        // allow typing the ward name directly
        await sendDistrictConfirmAfterWard(from, lang, textBody.trim());
        continue;
      }

      // District confirmation after ward
      if (typeof listReplyId === "string" && listReplyId.startsWith("confirm_district_after_ward::")) {
        const district = listReplyId.split("::")[1];
        updateCheckout(from, { addressCity: district } as any);
        const s = (getSession(from).checkout ?? {}) as any;
        await askStreet(from, lang, toStringStrict(district), toStringStrict(s.addressWard));
        continue;
      }
      if (textBody && expectingIs(from, "confirm_district_after_ward")) {
        // If user typed another district name manually
        updateCheckout(from, { addressCity: textBody.trim() } as any);
        const s = (getSession(from).checkout ?? {}) as any;
        await askStreet(from, lang, toStringStrict(s.addressCity), toStringStrict(s.addressWard));
        continue;
      }

      // Street entry (Dar delivery)
      if (textBody && expectingIs(from, "type_street")) {
        await handleStreetTyped(from, lang, textBody.trim());
        continue;
      }

      /* ---------------------- Pay & Edit address ---------------------- */

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

      if (buttonReplyId === "pay_now") {
        setExpecting(from, "txn_message");
        await sendText({
          to: from,
          body: t(lang, "prompt_txn_message", {
            orderId: getSession(from).lastCreatedOrderId || "",
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

      /* ------------------------ Agent & Tracking ----------------------- */

      if (listReplyId === "talk_agent") {
        await sendInteractiveList({
          to: from,
          header: clampHeader(t(lang, "agent_list_title")),
          body: clampBody(t(lang, "agent_contact_question")),
          buttonText: clampTitle(t(lang, "menu_button")),
          sections: [
            {
              title: clampSection(t(lang, "section_help")),
              rows: [
                { id: "agent_text", title: clampTitle(t(lang, "agent_row_text")), description: "" },
                { id: "agent_wa_call", title: clampTitle(t(lang, "agent_row_wa_call")), description: "" },
                { id: "agent_normal_call", title: clampTitle(t(lang, "agent_row_normal_call")), description: "" },
              ],
            },
          ],
        });
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

      /* ------------------------------ Default ----------------------------- */

      await sendMainMenu(from, lang);
    }

    return res.sendStatus(200);
  } catch (err) {
    logger.error({ err }, "Webhook processing error");
    return res.sendStatus(200);
  }
});