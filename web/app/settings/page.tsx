"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthProvider";
import { authGet, authPatchJson, authPostForm } from "@/lib/auth";

/**
 * NOTES (clear meaning):
 * - Bot Menu fields affect the "List message" content the bot sends in WhatsApp chat.
 * - WhatsApp Business Profile fields affect the "Business info" screen + profile icon (for all customers).
 * - WhatsApp profile icon is updated via profile_picture_handle (Resumable Upload -> handle -> Update Business Profile). :contentReference[oaicite:3]{index=3}
 */

type Presence = {
  // Bot Menu (customers see inside the bot menu message)
  brand_name: string | null;
  menu_intro: string | null;
  menu_footer: string | null;
  catalog_button_text: string | null;

  // WhatsApp Business Profile (customers see in Business Info)
  about: string | null;
  description: string | null;
  address: string | null;
  email: string | null;
  websites: string[];
  vertical: string | null;

  // We store handle (recommended by Meta docs). :contentReference[oaicite:4]{index=4}
  profile_picture_handle?: string | null;

  // Backward-compat if your backend previously stored a URL; we won’t rely on it for syncing.
  profile_picture_url?: string | null;
};

type PresenceGet = { saved: Presence; live: any };
type PresencePatch = { ok: boolean; saved: Presence; applied: boolean; live: any };

type MeUser = {
  id: number;
  email: string;
  role: "admin" | "staff" | "supervisor";
  full_name?: string | null;
  phone?: string | null;
  business_name?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
};

type MeResponse = { user: MeUser };

// Backend endpoint response for WhatsApp profile photo upload + sync
type WABizPhotoResp = {
  ok: boolean;
  applied: boolean;
  handle: string;
  live?: any;
};

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

const VERTICAL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "— Not set —" },
  { value: "UNDEFINED", label: "UNDEFINED" },
  { value: "OTHER", label: "OTHER" },
  { value: "AUTO", label: "AUTO" },
  { value: "BEAUTY", label: "BEAUTY" },
  { value: "APPAREL", label: "APPAREL" },
  { value: "EDU", label: "EDU" },
  { value: "ENTERTAIN", label: "ENTERTAIN" },
  { value: "EVENT_PLAN", label: "EVENT_PLAN" },
  { value: "FINANCE", label: "FINANCE" },
  { value: "GROCERY", label: "GROCERY" },
  { value: "GOVT", label: "GOVT" },
  { value: "HOTEL", label: "HOTEL" },
  { value: "HEALTH", label: "HEALTH" },
  { value: "NONPROFIT", label: "NONPROFIT" },
  { value: "PROF_SERVICES", label: "PROF_SERVICES" },
  { value: "RETAIL", label: "RETAIL" },
  { value: "TRAVEL", label: "TRAVEL" },
  { value: "RESTAURANT", label: "RESTAURANT" },
  { value: "NOT_A_BIZ", label: "NOT_A_BIZ" },
];
// Vertical accepted values are documented by Meta. :contentReference[oaicite:5]{index=5}

export default function SettingsPage() {
  const { user, token, setAuth } = useAuth();
  const isAdmin = user?.role === "admin";

  const [tab, setTab] = useState<"customer" | "account">("customer");

  const [loading, setLoading] = useState(true);

  // Save / upload states
  const [savingMenu, setSavingMenu] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [waPhotoUploading, setWaPhotoUploading] = useState(false);

  // WhatsApp connection status from backend
  const [live, setLive] = useState<any>(null);

  const [showAdvanced, setShowAdvanced] = useState(false);

  // Bot Menu (controlled strings)
  const [brandName, setBrandName] = useState<string>("");
  const [menuIntro, setMenuIntro] = useState<string>("");
  const [menuFooter, setMenuFooter] = useState<string>("");
  const [catalogButtonText, setCatalogButtonText] = useState<string>("");

  // WhatsApp Business Profile (controlled strings)
  const [about, setAbout] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [address, setAddress] = useState<string>("");
  const [contactEmail, setContactEmail] = useState<string>("");
  const [website1, setWebsite1] = useState<string>("");
  const [website2, setWebsite2] = useState<string>("");
  const [vertical, setVertical] = useState<string>("");

  // WhatsApp profile photo (handle is what actually syncs; preview is what UI shows)
  const [waPhotoHandle, setWaPhotoHandle] = useState<string>("");
  const [waPhotoPreview, setWaPhotoPreview] = useState<string>("");

  const waPreviewUrlRef = useRef<string>("");

  // Account baseline
  const [baselineMe, setBaselineMe] = useState<MeUser | null>(null);

  // Account fields
  const [fullName, setFullName] = useState<string>(user?.full_name ?? "");
  const [phone, setPhone] = useState<string>(user?.phone ?? "");
  const [businessName, setBusinessName] = useState<string>(user?.business_name ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string>(user?.avatar_url ?? "");
  const [bio, setBio] = useState<string>(user?.bio ?? "");
  const [email, setEmail] = useState<string>(user?.email ?? "");

  // Password fields (collapsed)
  const [showPassword, setShowPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [confirm, setConfirm] = useState<string>("");

  useEffect(() => {
    if (!token) return;

    (async () => {
      try {
        const p = await authGet<PresenceGet>("/settings/whatsapp-presence");
        setLive(p.live);

        // Menu
        setBrandName(p.saved.brand_name ?? "");
        setMenuIntro(p.saved.menu_intro ?? "");
        setMenuFooter(String(p.saved.menu_footer ?? ""));
        setCatalogButtonText(p.saved.catalog_button_text ?? "");

        // WA Business Profile fields
        setAbout(p.saved.about ?? "");
        setDescription(p.saved.description ?? "");
        setAddress(p.saved.address ?? "");
        setContactEmail(p.saved.email ?? "");
        setWebsite1(p.saved.websites?.[0] ?? "");
        setWebsite2(p.saved.websites?.[1] ?? "");
        setVertical(p.saved.vertical ?? "");

        // Photo: prefer handle (real sync), fallback for legacy URL storage
        const existingHandle =
          (p.saved.profile_picture_handle ?? "") ||
          ((p.saved as any).profile_picture_handle ?? "") ||
          "";
        setWaPhotoHandle(existingHandle);

        // For preview: if backend previously stored a URL, show it (optional)
        const legacyUrl = (p.saved.profile_picture_url ?? "") || ((p.saved as any).profile_picture_url ?? "");
        if (legacyUrl) {
          setWaPhotoPreview(legacyUrl);
          waPreviewUrlRef.current = legacyUrl;
        }

        // Load account
        const me = await authGet<MeResponse>("/auth/me");
        setBaselineMe(me.user);

        setFullName(me.user.full_name ?? "");
        setPhone(me.user.phone ?? "");
        setBusinessName(me.user.business_name ?? "");
        setAvatarUrl(me.user.avatar_url ?? "");
        setBio(me.user.bio ?? "");
        setEmail(me.user.email ?? "");
      } catch (e: any) {
        toast.error("Imeshindikana kupakia Settings.", {
          description: e?.message ?? "Jaribu tena.",
        });
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      // cleanup preview object URL if we created it
      const u = waPreviewUrlRef.current;
      if (u && u.startsWith("blob:")) URL.revokeObjectURL(u);
    };
  }, [token]);

  const previewBrand = useMemo(() => safeTrim(brandName) || "Business", [brandName]);

  const liveStatus = useMemo(() => {
    if (!live) return { label: "Unknown", ok: false };
    if (live?.error) return { label: "Not connected", ok: false };
    return { label: "Connected", ok: true };
  }, [live]);

  async function patchPresence(payload: Record<string, any>, applyToWhatsApp: boolean) {
    const res = await authPatchJson<PresencePatch>("/settings/whatsapp-presence", {
      ...payload,
      apply_to_whatsapp: applyToWhatsApp,
    });
    setLive(res.live);
    return res;
  }

  // ========== BOT MENU SAVE ==========
  async function saveMenu(e: FormEvent) {
    e.preventDefault();

    if (!isAdmin) {
      toast.error("Ni Admin pekee anaweza kubadili Bot Menu.");
      return;
    }

    try {
      setSavingMenu(true);

      await patchPresence(
        {
          brand_name: brandName,
          menu_intro: menuIntro,
          menu_footer: menuFooter,
          catalog_button_text: catalogButtonText,
        },
        false
      );

      toast.success("Bot Menu imehifadhiwa (itaonekana kwa wateja kwenye menu message).");
    } catch (e: any) {
      toast.error("Imeshindikana kuhifadhi Bot Menu.", {
        description: e?.message ?? "Jaribu tena.",
      });
    } finally {
      setSavingMenu(false);
    }
  }

  // ========== WHATSAPP BUSINESS PROFILE SAVE ==========
  async function saveBusinessProfile(applyToWhatsApp: boolean) {
    if (!isAdmin) {
      toast.error("Ni Admin pekee anaweza kubadili WhatsApp Business Profile.");
      return;
    }

    try {
      setSavingProfile(true);

      const res = await patchPresence(
        {
          about,
          description,
          address,
          email: contactEmail,
          website1,
          website2,
          vertical,
          // This is the correct Meta field for syncing profile photo (handle). :contentReference[oaicite:6]{index=6}
          profile_picture_handle: waPhotoHandle || undefined,
        },
        applyToWhatsApp
      );

      if (applyToWhatsApp) {
        toast.success(
          res.applied
            ? "Imehifadhiwa na kusync WhatsApp Business Profile."
            : "Imehifadhiwa, lakini sync haikufanyika (check connection/permissions)."
        );
      } else {
        toast.success("Imehifadhiwa (bado haijatumwa WhatsApp).");
      }
    } catch (e: any) {
      toast.error("Imeshindikana kuhifadhi WhatsApp Business Profile.", {
        description: e?.message ?? "Jaribu tena.",
      });
    } finally {
      setSavingProfile(false);
    }
  }

  // ========== AVATAR (ACCOUNT) UPLOAD ==========
  async function uploadAvatarFromDevice(file: File) {
    try {
      setAvatarUploading(true);

      const form = new FormData();
      form.append("file", file);

      const out = await authPostForm<{ url: string }>("/files/avatar", form);
      setAvatarUrl(out.url);

      toast.success("Avatar imepakiwa. Bonyeza Save Account kuihifadhi.");
    } catch (e: any) {
      toast.error("Imeshindikana kupakia avatar.", {
        description: e?.message ?? "Jaribu tena.",
      });
    } finally {
      setAvatarUploading(false);
    }
  }

  // ========== WHATSAPP PROFILE ICON UPLOAD + SYNC ==========
  async function uploadAndSyncWhatsAppPhoto(file: File) {
    if (!isAdmin) {
      toast.error("Ni Admin pekee anaweza kubadili WhatsApp profile photo.");
      return;
    }

    // Local preview immediately
    if (waPreviewUrlRef.current && waPreviewUrlRef.current.startsWith("blob:")) {
      URL.revokeObjectURL(waPreviewUrlRef.current);
    }
    const previewUrl = URL.createObjectURL(file);
    waPreviewUrlRef.current = previewUrl;
    setWaPhotoPreview(previewUrl);

    try {
      setWaPhotoUploading(true);

      const form = new FormData();
      form.append("file", file);

      /**
       * Backend MUST:
       * 1) Create upload session: POST /{version}/app/uploads?file_length=&file_type=&file_name=  :contentReference[oaicite:7]{index=7}
       * 2) Upload binary: POST /{version}/{Upload-ID} with file_offset:0 header  :contentReference[oaicite:8]{index=8}
       * 3) Update business profile with profile_picture_handle  :contentReference[oaicite:9]{index=9}
       */
      const out = await authPostForm<WABizPhotoResp>("/settings/whatsapp-profile-photo", form);

      setWaPhotoHandle(out.handle || "");
      setLive(out.live ?? live);

      toast.success(
        out.applied
          ? "WhatsApp profile photo imebadilika (itaonekana kwa wateja)."
          : "Photo imepakiwa, lakini sync haikufanyika (check token/permissions)."
      );
    } catch (e: any) {
      toast.error("Imeshindikana kubadili WhatsApp profile photo.", {
        description: e?.message ?? "Jaribu tena.",
      });
    } finally {
      setWaPhotoUploading(false);
    }
  }

  // ========== ACCOUNT SAVE ==========
  async function saveAccount(e: FormEvent) {
    e.preventDefault();
    if (!token || !user) return;

    const base = baselineMe ?? user;
    const payload: Record<string, string> = {};
    const norm = (v: unknown) => safeTrim(v);

    if (norm(fullName) !== norm(base.full_name)) payload.full_name = norm(fullName);
    if (norm(phone) !== norm(base.phone)) payload.phone = norm(phone);
    if (norm(businessName) !== norm(base.business_name)) payload.business_name = norm(businessName);
    if (norm(avatarUrl) !== norm(base.avatar_url)) payload.avatar_url = norm(avatarUrl);
    if (norm(bio) !== norm(base.bio)) payload.bio = norm(bio);

    const nextEmail = norm(email).toLowerCase();
    const baseEmail = norm(base.email).toLowerCase();
    if (nextEmail && nextEmail !== baseEmail) payload.email = nextEmail;

    if (showPassword) {
      const wantsPassword = newPassword || confirm || currentPassword;
      if (wantsPassword) {
        if (!currentPassword) return toast.error("Weka nenosiri la sasa kwanza.");
        if (!newPassword) return toast.error("Weka nenosiri jipya.");
        if (newPassword.length < 6) return toast.error("Nenosiri jipya liwe angalau herufi 6.");
        if (newPassword !== confirm) return toast.error("Manenosiri mapya hayafanani.");

        payload.password = newPassword;
        payload.current_password = currentPassword;
      }
    }

    if (!Object.keys(payload).length) return toast.info("Hakuna mabadiliko ya kuhifadhi.");

    try {
      setSavingAccount(true);

      await authPatchJson("/auth/profile", payload);

      const me = await authGet<MeResponse>("/auth/me");
      setBaselineMe(me.user);
      setAuth({ user: me.user as any, token });

      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");

      toast.success("Account imehifadhiwa.");
    } catch (e: any) {
      toast.error("Imeshindikana kuhifadhi account.", {
        description: e?.message ?? "Jaribu tena.",
      });
    } finally {
      setSavingAccount(false);
    }
  }

  if (!user) return <div className="center-muted">Tafadhali ingia kwanza.</div>;

  return (
    <div className="pr-page">
      <div className="pr-hero">
        <div className="pr-hero-left">
          <div className="pr-titlewrap">
            <div className="pr-title">Settings</div>
            <div className="pr-subtitle">
              Tunatenganisha: (1) Bot Menu (customers see in chat), (2) WhatsApp Business Profile (Business info + icon), (3) Account yako.
            </div>
          </div>
        </div>

        <div className="pr-badges">
          <span className="pr-pill pr-pill--role">{isAdmin ? "Admin" : "Staff"}</span>
          <span className="pr-pill">WA: {liveStatus.label}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="pr-tabs">
        <button
          type="button"
          className={`pr-tab-btn ${tab === "customer" ? "pr-tab-btn--active" : ""}`}
          onClick={() => setTab("customer")}
        >
          Customer-facing
        </button>
        <button
          type="button"
          className={`pr-tab-btn ${tab === "account" ? "pr-tab-btn--active" : ""}`}
          onClick={() => setTab("account")}
        >
          My Account
        </button>
      </div>

      {loading ? (
        <div className="pr-card">
          <div className="pr-card-body">
            <div className="pr-hint">Inapakia…</div>
          </div>
        </div>
      ) : tab === "customer" ? (
        <div className="pr-grid pr-grid--single">
          <div className="pr-stack">
            {/* BOT MENU */}
            <form onSubmit={saveMenu}>
              <div className="pr-card">
                <div className="pr-card-head">
                  <div>
                    <div className="pr-card-title">Bot Menu (customers see inside the chat)</div>
                    <div className="pr-card-desc">
                      Hivi vinaathiri message ya menu inayotumwa na bot kwenye WhatsApp chat.
                    </div>
                  </div>
                </div>

                <div className="pr-card-body">
                  {!isAdmin ? (
                    <div className="pr-note">
                      Hapa ni view tu. Admin pekee anaweza kubadili Bot Menu.
                    </div>
                  ) : null}

                  <div className="pr-field">
                    <div className="pr-label">Brand name (Menu header)</div>
                    <div className="pr-hint">Inaonekana juu ya menu message (header/title).</div>
                    <input
                      className="pr-input"
                      value={brandName}
                      onChange={(e) => setBrandName(e.target.value)}
                      disabled={!isAdmin}
                    />
                  </div>

                  <div className="pr-field">
                    <div className="pr-label">Menu intro (Main line)</div>
                    <div className="pr-hint">Ujumbe mfupi unaoelezea menu (body text).</div>
                    <input
                      className="pr-input"
                      value={menuIntro}
                      onChange={(e) => setMenuIntro(e.target.value)}
                      disabled={!isAdmin}
                    />
                  </div>

                  <div className="pr-field">
                    <div className="pr-label">Menu footer (Optional small text)</div>
                    <div className="pr-hint">Mistari midogo chini ya menu (footer).</div>
<input
  className="pr-input"
  value={menuFooter}
  onChange={(e) => setMenuFooter(e.target.value)}
  disabled={!isAdmin}
/>

                  </div>

                  <div className="pr-field">
                    <div className="pr-label">Button text (Optional)</div>
                    <div className="pr-hint">Maandishi ya button ambayo mteja atabonyeza kufungua list.</div>
                    <input
                      className="pr-input"
                      value={catalogButtonText}
                      onChange={(e) => setCatalogButtonText(e.target.value)}
                      disabled={!isAdmin}
                    />
                  </div>

                  {isAdmin ? (
                    <div className="pr-actions">
                      <button className="pr-btn pr-btn--primary" type="submit" disabled={savingMenu}>
                        {savingMenu ? "Inahifadhi..." : "Save Bot Menu"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </form>

            {/* PREVIEW */}
            <div className="pr-card">
              <div className="pr-card-head">
                <div>
                  <div className="pr-card-title">Preview (menu message)</div>
                  <div className="pr-card-desc">Muonekano wa menu message kwenye WhatsApp chat.</div>
                </div>
              </div>
              <div className="pr-card-body">
                <div className="pr-note">
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>{previewBrand}</div>
                  <div style={{ marginBottom: 6 }}>{safeTrim(menuIntro) || "Menu intro haijawekwa."}</div>
                  <div style={{ fontSize: 12, opacity: 0.85 }}>
                    Footer: {safeTrim(menuFooter) || "(none)"} <br />
                    Button: {safeTrim(catalogButtonText) || "(default)"}
                  </div>
                </div>
                <div className="pr-hint">
                  WhatsApp connection: {liveStatus.ok ? "Connected" : "Not connected / not configured"}.
                </div>
              </div>
            </div>

            {/* ADVANCED: WA BUSINESS PROFILE */}
            <div className="pr-card">
              <div className="pr-card-head">
                <div>
                  <div className="pr-card-title">WhatsApp Business Profile (Advanced)</div>
                  <div className="pr-card-desc">
                    Hivi vinaonekana kwenye “Business info” na profile icon (kwa wateja wote).
                  </div>
                </div>
                <button
                  type="button"
                  className="pr-collapse-btn"
                  onClick={() => setShowAdvanced((v) => !v)}
                >
                  {showAdvanced ? "Hide" : "Show"}
                </button>
              </div>

              {showAdvanced ? (
                <div className="pr-card-body">
                  {!isAdmin ? (
                    <div className="pr-note">
                      Hapa ni view tu. Admin pekee anaweza kubadili WhatsApp Business Profile.
                    </div>
                  ) : (
                    <div className="pr-note">
                      “Save + Sync to WhatsApp” hutuma haya mabadiliko kwenda WhatsApp. Profile photo ina “Upload & Sync” yake (inaonekana kwa wateja wote).
                    </div>
                  )}

                  {/* WhatsApp Profile Photo (device -> backend -> Meta upload -> sync) */}
                  <div className="pr-field">
                    <div className="pr-label">WhatsApp Profile Photo (icon customers see)</div>
                    <div className="pr-hint">
                      Chagua picha kutoka device, kisha mfumo uta-upload na kuisync kwenda WhatsApp (profile_picture_handle).
                    </div>

                    <input
                      className="pr-input"
                      type="file"
                      accept="image/*"
                      disabled={!isAdmin || waPhotoUploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadAndSyncWhatsAppPhoto(f);
                        e.currentTarget.value = "";
                      }}
                    />

                    {waPhotoUploading ? <div className="pr-hint">Inapakia & kusync WhatsApp photo...</div> : null}

                    {waPhotoPreview ? (
                      <div className="pr-note" style={{ marginTop: 10 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={waPhotoPreview}
                          alt="WhatsApp profile preview"
                          style={{ width: 72, height: 72, borderRadius: 14, objectFit: "cover", display: "block" }}
                          referrerPolicy="no-referrer"
                        />
                        <div className="pr-hint" style={{ marginTop: 6 }}>
                          Handle: {waPhotoHandle ? waPhotoHandle : "(not set yet)"}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="pr-field">
                    <div className="pr-label">About</div>
                    <div className="pr-hint">Inaonekana kwenye Business info → About.</div>
                    <input className="pr-input" value={about} onChange={(e) => setAbout(e.target.value)} disabled={!isAdmin} />
                  </div>

                  <div className="pr-field">
                    <div className="pr-label">Description</div>
                    <div className="pr-hint">Maelezo mafupi ya biashara (Business info).</div>
                    <input className="pr-input" value={description} onChange={(e) => setDescription(e.target.value)} disabled={!isAdmin} />
                  </div>

                  <div className="pr-field">
                    <div className="pr-label">Address</div>
                    <div className="pr-hint">Anuani ya biashara (Business info).</div>
                    <input className="pr-input" value={address} onChange={(e) => setAddress(e.target.value)} disabled={!isAdmin} />
                  </div>

                  <div className="pr-field">
                    <div className="pr-label">Contact email</div>
                    <div className="pr-hint">Email ya kuwasiliana (Business info).</div>
                    <input className="pr-input" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} disabled={!isAdmin} />
                  </div>

                  <div className="pr-field">
                    <div className="pr-label">Website 1</div>
                    <div className="pr-hint">Link (max 2). Anza na https://</div>
                    <input className="pr-input" value={website1} onChange={(e) => setWebsite1(e.target.value)} disabled={!isAdmin} />
                  </div>

                  <div className="pr-field">
                    <div className="pr-label">Website 2</div>
                    <div className="pr-hint">Link ya pili (optional).</div>
                    <input className="pr-input" value={website2} onChange={(e) => setWebsite2(e.target.value)} disabled={!isAdmin} />
                  </div>

                  <div className="pr-field">
                    <div className="pr-label">Business category (Vertical)</div>
                    <div className="pr-hint">Aina ya biashara (industry category) inayotambulika na WhatsApp.</div>
                    <select
                      className="pr-input"
                      value={vertical}
                      onChange={(e) => setVertical(e.target.value)}
                      disabled={!isAdmin}
                    >
                      {VERTICAL_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {isAdmin ? (
                    <div className="pr-actions">
                      <button
                        type="button"
                        className="pr-btn"
                        disabled={savingProfile}
                        onClick={() => void saveBusinessProfile(false)}
                      >
                        {savingProfile ? "Inahifadhi..." : "Save (local only)"}
                      </button>

                      <button
                        type="button"
                        className="pr-btn pr-btn--primary"
                        disabled={savingProfile}
                        onClick={() => void saveBusinessProfile(true)}
                      >
                        {savingProfile ? "Inasync..." : "Save + Sync to WhatsApp"}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        // ACCOUNT TAB
        <div className="pr-grid pr-grid--single">
          <div className="pr-stack">
            <form onSubmit={saveAccount}>
              <div className="pr-card">
                <div className="pr-card-head">
                  <div>
                    <div className="pr-card-title">My Account (system login)</div>
                    <div className="pr-card-desc">Hizi ni za mfumo wako (si WhatsApp Business Profile).</div>
                  </div>
                </div>

                <div className="pr-card-body">
                  <div className="pr-field">
                    <div className="pr-label">Full name</div>
                    <input className="pr-input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                  </div>

                  <div className="pr-field">
                    <div className="pr-label">Phone</div>
                    <input className="pr-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>

                  <div className="pr-field">
                    <div className="pr-label">Business / Team (internal)</div>
                    <input className="pr-input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
                  </div>

                  {/* Avatar uploader (device) */}
                  <div className="pr-field">
                    <div className="pr-label">Avatar (device upload)</div>
                    <div className="pr-hint">Hii ni avatar ya account yako kwenye web app.</div>

                    <input
                      className="pr-input"
                      type="file"
                      accept="image/*"
                      disabled={avatarUploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadAvatarFromDevice(f);
                        e.currentTarget.value = "";
                      }}
                    />

                    {avatarUploading ? <div className="pr-hint">Inapakia avatar...</div> : null}

                    {avatarUrl ? (
                      <div className="pr-note" style={{ marginTop: 10 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={avatarUrl}
                          alt="Avatar preview"
                          style={{ width: 72, height: 72, borderRadius: 14, objectFit: "cover", display: "block" }}
                          referrerPolicy="no-referrer"
                        />
                        <div className="pr-hint" style={{ marginTop: 6 }}>
                          URL: {avatarUrl}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="pr-field">
                    <div className="pr-label">Bio</div>
                    <textarea
                      className="pr-input pr-textarea"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      rows={4}
                    />
                  </div>

                  <div className="pr-divider" />

                  <div className="pr-field">
                    <div className="pr-label">Email (username)</div>
                    <input className="pr-input" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>

                  {/* Password (collapsed) */}
                  <div className="pr-collapse">
                    <div className="pr-collapse-head">
                      <div>
                        <div className="pr-card-title" style={{ fontSize: 13 }}>Security</div>
                        <div className="pr-card-desc">Badili nenosiri (optional).</div>
                      </div>
                      <button
                        type="button"
                        className="pr-collapse-btn"
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        {showPassword ? "Hide" : "Change password"}
                      </button>
                    </div>

                    {showPassword ? (
                      <div className="pr-collapse-body">
                        <div className="pr-field">
                          <div className="pr-label">Current password</div>
                          <input className="pr-input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
                        </div>

                        <div className="pr-field">
                          <div className="pr-label">New password</div>
                          <input className="pr-input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                        </div>

                        <div className="pr-field">
                          <div className="pr-label">Confirm new password</div>
                          <input className="pr-input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="pr-actions">
                    <button className="pr-btn pr-btn--primary" type="submit" disabled={savingAccount}>
                      {savingAccount ? "Inahifadhi..." : "Save Account"}
                    </button>
                  </div>
                </div>
              </div>
            </form>

            <div className="pr-note">
              Note: WhatsApp “Display Name” (sender name for unsaved contacts) is managed in WhatsApp Manager (display name approval flow).
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
