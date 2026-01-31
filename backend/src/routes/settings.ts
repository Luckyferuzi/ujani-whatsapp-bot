import express from "express";
import { z } from "zod";
import { requireAdmin, requireSession } from "../middleware/sessionAuth.js";
import { getJsonSetting, setJsonSetting } from "../db/settings.js";
import { getBusinessProfile, updateBusinessProfile } from "../whatsapp.js";

export const settingsRoutes = express.Router();

type Presence = {
  brand_name: string | null;
  menu_intro: string | null;
  menu_footer: string | null;
  catalog_button_text: string | null;
    catalog_intro: string | null;
  catalog_wa_number: string | null;        // digits only (e.g. 255696946717)
  catalog_thumbnail_sku: string | null;    // optional manual thumbnail SKU


  about: string | null;
  description: string | null;
  address: string | null;
  email: string | null;
  websites: string[];
  profile_picture_url: string | null;
  vertical: string | null;
};

const DEFAULT_PRESENCE: Presence = {
  brand_name: null,
  menu_intro: null,
  menu_footer: null,
  catalog_button_text: null,
    catalog_intro: null,
  catalog_wa_number: null,
  catalog_thumbnail_sku: null,
  about: null,
  description: null,
  address: null,
  email: null,
  websites: [],
  profile_picture_url: null,
  vertical: null,
};

function norm(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function normDigits(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = v.replace(/[^\d]/g, "").trim();
  return d.length ? d : null;
}

settingsRoutes.get("/whatsapp-presence", requireSession, async (_req, res) => {
  const saved = await getJsonSetting<Presence>("whatsapp_presence", DEFAULT_PRESENCE);

  // Fetch live profile from WhatsApp (best-effort)
  let live: any = null;
  try {
    live = await getBusinessProfile();
  } catch (e) {
    live = { error: "failed_to_fetch_live_profile" };
  }

  return res.json({ saved, live });
});

settingsRoutes.patch("/whatsapp-presence", requireSession, requireAdmin, async (req, res) => {
  const schema = z.object({
    // bot/menu branding (customer-visible in chat messages)
    brand_name: z.string().optional(),
    menu_intro: z.string().optional(),
    menu_footer: z.string().optional(),
    catalog_button_text: z.string().optional(),
      catalog_intro: z.string().optional(),
  catalog_wa_number: z.string().optional(),
  catalog_thumbnail_sku: z.string().optional(),
    // WhatsApp Business Profile fields
    about: z.string().optional(),
    description: z.string().optional(),
    address: z.string().optional(),
    email: z.string().email().optional(),
    website1: z.string().optional(),
    website2: z.string().optional(),
    profile_picture_url: z.string().optional(),
    vertical: z.string().optional(),

    // behavior
    apply_to_whatsapp: z.boolean().optional(), // default true
  });

  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "invalid_payload" });

  const current = await getJsonSetting<Presence>("whatsapp_presence", DEFAULT_PRESENCE);

  const next: Presence = {
    ...current,
    brand_name: "brand_name" in parsed.data ? norm(parsed.data.brand_name) : current.brand_name,
    menu_intro: "menu_intro" in parsed.data ? norm(parsed.data.menu_intro) : current.menu_intro,
    menu_footer: "menu_footer" in parsed.data ? norm(parsed.data.menu_footer) : current.menu_footer,
    catalog_button_text:
      "catalog_button_text" in parsed.data ? norm(parsed.data.catalog_button_text) : current.catalog_button_text,

    catalog_intro:
  "catalog_intro" in parsed.data ? norm(parsed.data.catalog_intro) : (current as any).catalog_intro ?? null,

catalog_wa_number:
  "catalog_wa_number" in parsed.data ? normDigits(parsed.data.catalog_wa_number) : (current as any).catalog_wa_number ?? null,

catalog_thumbnail_sku:
  "catalog_thumbnail_sku" in parsed.data ? norm(parsed.data.catalog_thumbnail_sku) : (current as any).catalog_thumbnail_sku ?? null,
    about: "about" in parsed.data ? norm(parsed.data.about) : current.about,
    description: "description" in parsed.data ? norm(parsed.data.description) : current.description,
    address: "address" in parsed.data ? norm(parsed.data.address) : current.address,
    email: "email" in parsed.data ? norm(parsed.data.email) : current.email,
    profile_picture_url:
      "profile_picture_url" in parsed.data ? norm(parsed.data.profile_picture_url) : current.profile_picture_url,
    vertical: "vertical" in parsed.data ? norm(parsed.data.vertical) : current.vertical,

    websites: [
      norm(parsed.data.website1) ?? "",
      norm(parsed.data.website2) ?? "",
    ].filter(Boolean),
  };

  await setJsonSetting("whatsapp_presence", next);

  const apply = parsed.data.apply_to_whatsapp ?? true;
  let applied = false;

  if (apply) {
    try {
      await updateBusinessProfile({
        about: next.about,
        description: next.description,
        address: next.address,
        email: next.email,
        profile_picture_url: next.profile_picture_url,
        websites: next.websites,
        vertical: next.vertical,
      });
      applied = true;
    } catch (e) {
      return res.status(502).json({ error: "failed_to_apply_to_whatsapp", saved: next });
    }
  }

  let live: any = null;
  try {
    live = await getBusinessProfile();
  } catch {
    live = { error: "failed_to_fetch_live_profile" };
  }

  return res.json({ ok: true, saved: next, applied, live });
});
