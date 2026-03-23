"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthProvider";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  FormSectionSkeleton,
  Input,
  RefreshIndicator,
  Select,
  Tabs,
  Textarea,
} from "@/components/ui";
import { authGet, authPatchJson, authPostForm } from "@/lib/auth";

type Presence = {
  brand_name: string | null;
  menu_intro: string | null;
  menu_footer: string | null;
  catalog_button_text: string | null;
  catalog_intro?: string | null;
  catalog_wa_number?: string | null;
  catalog_thumbnail_sku?: string | null;
  about: string | null;
  description: string | null;
  address: string | null;
  email: string | null;
  websites: string[];
  vertical: string | null;
  profile_picture_handle?: string | null;
  profile_picture_url?: string | null;
};

type PresenceGet = { saved: Presence; live: any };
type PresencePatch = { ok: boolean; saved: Presence; applied: boolean; live: any };
type WABizPhotoResp = { ok: boolean; applied: boolean; handle: string; live?: any };

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function initialsFrom(text: string) {
  return (
    safeTrim(text)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "WS"
  );
}

const VERTICAL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Not set" },
  { value: "UNDEFINED", label: "Undefined" },
  { value: "OTHER", label: "Other" },
  { value: "AUTO", label: "Auto" },
  { value: "BEAUTY", label: "Beauty" },
  { value: "APPAREL", label: "Apparel" },
  { value: "EDU", label: "Education" },
  { value: "ENTERTAIN", label: "Entertainment" },
  { value: "EVENT_PLAN", label: "Event planning" },
  { value: "FINANCE", label: "Finance" },
  { value: "GROCERY", label: "Grocery" },
  { value: "GOVT", label: "Government" },
  { value: "HOTEL", label: "Hotel" },
  { value: "HEALTH", label: "Health" },
  { value: "NONPROFIT", label: "Nonprofit" },
  { value: "PROF_SERVICES", label: "Professional services" },
  { value: "RETAIL", label: "Retail" },
  { value: "TRAVEL", label: "Travel" },
  { value: "RESTAURANT", label: "Restaurant" },
  { value: "NOT_A_BIZ", label: "Not a business" },
];

export default function SettingsPage() {
  const { user, token } = useAuth();
  const isAdmin = user?.role === "admin";

  const [section, setSection] = useState<"menu" | "presence">("menu");
  const [loading, setLoading] = useState(true);
  const [savingMenu, setSavingMenu] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [waPhotoUploading, setWaPhotoUploading] = useState(false);
  const [live, setLive] = useState<any>(null);

  const [brandName, setBrandName] = useState("");
  const [menuIntro, setMenuIntro] = useState("");
  const [menuFooter, setMenuFooter] = useState("");
  const [catalogButtonText, setCatalogButtonText] = useState("");
  const [catalogIntro, setCatalogIntro] = useState("");
  const [catalogWaNumber, setCatalogWaNumber] = useState("");
  const [catalogThumbnailSku, setCatalogThumbnailSku] = useState("");

  const [about, setAbout] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [website1, setWebsite1] = useState("");
  const [website2, setWebsite2] = useState("");
  const [vertical, setVertical] = useState("");
  const [waPhotoHandle, setWaPhotoHandle] = useState("");
  const [waPhotoPreview, setWaPhotoPreview] = useState("");
  const [lastSyncedLabel, setLastSyncedLabel] = useState<string | null>(null);

  const waPreviewUrlRef = useRef("");

  useEffect(() => {
    if (!token) return;

    (async () => {
      try {
        const p = await authGet<PresenceGet>("/settings/whatsapp-presence");
        setLive(p.live);
        setBrandName(p.saved.brand_name ?? "");
        setMenuIntro(p.saved.menu_intro ?? "");
        setMenuFooter(p.saved.menu_footer ?? "");
        setCatalogButtonText(p.saved.catalog_button_text ?? "");
        setCatalogIntro(p.saved.catalog_intro ?? "");
        setCatalogWaNumber(p.saved.catalog_wa_number ?? "");
        setCatalogThumbnailSku(p.saved.catalog_thumbnail_sku ?? "");
        setAbout(p.saved.about ?? "");
        setDescription(p.saved.description ?? "");
        setAddress(p.saved.address ?? "");
        setContactEmail(p.saved.email ?? "");
        setWebsite1(p.saved.websites?.[0] ?? "");
        setWebsite2(p.saved.websites?.[1] ?? "");
        setVertical(p.saved.vertical ?? "");
        setWaPhotoHandle(p.saved.profile_picture_handle ?? "");

        const legacyUrl = p.saved.profile_picture_url ?? "";
        if (legacyUrl) {
          setWaPhotoPreview(legacyUrl);
          waPreviewUrlRef.current = legacyUrl;
        }
      } catch (e: any) {
        toast.error("Unable to load workspace settings.", {
          description: e?.message ?? "Try again.",
        });
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      const url = waPreviewUrlRef.current;
      if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
    };
  }, [token]);

  const liveStatus = useMemo(() => {
    if (!live) return { label: "Checking", tone: "warning" as const, description: "Connection details are still loading." };
    if (live?.error) {
      return {
        label: "Needs attention",
        tone: "danger" as const,
        description: typeof live.error === "string" ? live.error : "Workspace is not connected to WhatsApp right now.",
      };
    }
    return {
      label: "Connected",
      tone: "success" as const,
      description: "Workspace presence can be published to WhatsApp.",
    };
  }, [live]);

  const previewBrand = useMemo(() => safeTrim(brandName) || "Workspace", [brandName]);
  const customerFacingCompleteness = useMemo(() => {
    const checks = [safeTrim(brandName), safeTrim(menuIntro), safeTrim(catalogButtonText), safeTrim(about), safeTrim(address)];
    return checks.filter(Boolean).length;
  }, [about, address, brandName, catalogButtonText, menuIntro]);

  async function patchPresence(payload: Record<string, any>, applyToWhatsApp: boolean) {
    const res = await authPatchJson<PresencePatch>("/settings/whatsapp-presence", {
      ...payload,
      apply_to_whatsapp: applyToWhatsApp,
    });
    setLive(res.live);
    setLastSyncedLabel(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    return res;
  }

  async function saveMenu(e: FormEvent) {
    e.preventDefault();
    if (!isAdmin) {
      toast.error("Only administrators can update customer-facing menu settings.");
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
          catalog_intro: catalogIntro,
          catalog_wa_number: catalogWaNumber,
          catalog_thumbnail_sku: catalogThumbnailSku,
        },
        false
      );
      toast.success("Customer-facing menu settings saved.");
    } catch (e: any) {
      toast.error("Unable to save customer-facing menu settings.", {
        description: e?.message ?? "Try again.",
      });
    } finally {
      setSavingMenu(false);
    }
  }

  async function saveBusinessProfile(applyToWhatsApp: boolean) {
    if (!isAdmin) {
      toast.error("Only administrators can update the WhatsApp business profile.");
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
          profile_picture_handle: waPhotoHandle || undefined,
        },
        applyToWhatsApp
      );

      toast.success(
        applyToWhatsApp
          ? res.applied
            ? "Business profile saved and synced to WhatsApp."
            : "Business profile saved locally, but sync did not complete."
          : "Business profile saved locally."
      );
    } catch (e: any) {
      toast.error("Unable to save the business profile.", {
        description: e?.message ?? "Try again.",
      });
    } finally {
      setSavingProfile(false);
    }
  }

  async function uploadAndSyncWhatsAppPhoto(file: File) {
    if (!isAdmin) {
      toast.error("Only administrators can update the WhatsApp profile photo.");
      return;
    }

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
      const out = await authPostForm<WABizPhotoResp>("/settings/whatsapp-profile-photo", form);
      setWaPhotoHandle(out.handle || "");
      setLive(out.live ?? live);
      setLastSyncedLabel(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      toast.success(out.applied ? "WhatsApp profile photo synced successfully." : "Photo uploaded, but sync did not complete.");
    } catch (e: any) {
      toast.error("Unable to update the WhatsApp profile photo.", {
        description: e?.message ?? "Try again.",
      });
    } finally {
      setWaPhotoUploading(false);
    }
  }

  if (!user) {
    return (
      <EmptyState
        eyebrow="Workspace settings"
        title="Sign in to manage workspace configuration."
        description="Workspace-level customer-facing settings are only available inside the console."
      />
    );
  }

  return (
    <div className="config-page config-page--narrow">
      <PageHeader
        eyebrow="Workspace settings"
        section="Configuration"
        title="Workspace Settings"
        description="Manage customer-facing workspace identity, menu copy, and the WhatsApp business profile separately from personal operator account settings."
        actions={
          <div className="config-header-meta">
            <Badge tone={liveStatus.tone}>{liveStatus.label}</Badge>
            {!loading && lastSyncedLabel ? <Badge tone="neutral">Updated {lastSyncedLabel}</Badge> : null}
          </div>
        }
      />
      {loading ? (
        <div className="config-card-stack">
          <Card padding="lg">
            <FormSectionSkeleton />
          </Card>
          <Card padding="lg">
            <FormSectionSkeleton />
          </Card>
        </div>
      ) : (
        <>
          <div className="config-overview-grid">
            <Card padding="lg" className="config-section-card">
              <div className="config-section-head">
                <div className="config-card-stack">
                  <span className="config-kicker">Workspace-level controls</span>
                  <h2 className="config-hero-title">A cleaner surface for customer-facing workspace configuration.</h2>
                  <p className="config-lead">
                    Settings here affect how the workspace appears to customers in WhatsApp and how the business
                    profile is published. Personal operator details now live under My Account.
                  </p>
                </div>
                <div className="config-badge-row">
                  {savingMenu || savingProfile || waPhotoUploading ? <RefreshIndicator label="Applying changes" /> : null}
                </div>
              </div>

              <div className="config-stat-grid">
                <div className="config-stat-card">
                  <span className="config-stat-label">Workspace status</span>
                  <div className="config-stat-value">{liveStatus.label}</div>
                  <div className="config-stat-meta">{liveStatus.description}</div>
                </div>
                <div className="config-stat-card">
                  <span className="config-stat-label">Configuration coverage</span>
                  <div className="config-stat-value">{customerFacingCompleteness}/5</div>
                  <div className="config-stat-meta">Core customer-facing fields currently filled in.</div>
                </div>
                <div className="config-stat-card">
                  <span className="config-stat-label">Access level</span>
                  <div className="config-stat-value">{isAdmin ? "Admin" : "View only"}</div>
                  <div className="config-stat-meta">
                    {isAdmin ? "You can save and sync changes." : "Only administrators can publish updates."}
                  </div>
                </div>
              </div>
            </Card>

            <Card tone="muted" padding="lg" className="config-section-card">
              <div className="config-section-head">
                <div>
                  <div className="config-section-eyebrow">Configuration map</div>
                  <h3 className="config-section-title">Separated by responsibility</h3>
                </div>
              </div>

              <div className="config-nav">
                <a className="config-nav__item" href="#customer-menu">
                  <div>
                    <div className="config-nav__label">Customer menu</div>
                    <div className="config-nav__meta">Bot menu copy, CTA text, and catalog guidance.</div>
                  </div>
                  <Badge tone="neutral">Local</Badge>
                </a>
                <a className="config-nav__item" href="#business-profile">
                  <div>
                    <div className="config-nav__label">Business profile</div>
                    <div className="config-nav__meta">WhatsApp business info, websites, category, and icon.</div>
                  </div>
                  <Badge tone={liveStatus.tone}>{liveStatus.label}</Badge>
                </a>
                <a className="config-nav__item" href="/profile">
                  <div>
                    <div className="config-nav__label">My Account</div>
                    <div className="config-nav__meta">Identity, password, and operator-level preferences.</div>
                  </div>
                  <Badge tone="info">Personal</Badge>
                </a>
              </div>
            </Card>
          </div>

          {!isAdmin ? (
            <Alert
              tone="warning"
              title="View-only access"
              description="You can review customer-facing configuration, but an administrator account is required to make changes."
            />
          ) : null}

          <Tabs
            value={section}
            onValueChange={(next) => setSection(next as "menu" | "presence")}
            ariaLabel="Workspace settings sections"
            items={[
              { value: "menu", label: "Customer menu", meta: "Bot copy" },
              { value: "presence", label: "Business profile", meta: "WhatsApp sync" },
            ]}
          />

          {section === "menu" ? (
            <div className="config-spotlight-grid" id="customer-menu">
              <form onSubmit={saveMenu}>
                <Card padding="lg" className="config-section-card">
                  <div className="config-section-head">
                    <div>
                      <div className="config-section-eyebrow">Customer-facing</div>
                      <h3 className="config-section-title">Bot menu and catalog entry point</h3>
                      <p className="config-section-description">
                        These fields shape the structured message customers see inside WhatsApp chat before they open
                        the catalog or browse the menu.
                      </p>
                    </div>
                    <div className="config-actions">
                      <Button type="submit" loading={savingMenu} disabled={!isAdmin}>
                        Save customer menu
                      </Button>
                    </div>
                  </div>

                  <div className="config-form-grid">
                    <div className="config-field">
                      <label className="config-field-label" htmlFor="brandName">Brand name</label>
                      <Input id="brandName" value={brandName} onChange={(e) => setBrandName(e.target.value)} disabled={!isAdmin} />
                      <div className="config-field-hint">Shown as the header customers see at the top of the menu message.</div>
                    </div>
                    <div className="config-field">
                      <label className="config-field-label" htmlFor="catalogButtonText">Primary button label</label>
                      <Input
                        id="catalogButtonText"
                        value={catalogButtonText}
                        onChange={(e) => setCatalogButtonText(e.target.value)}
                        disabled={!isAdmin}
                      />
                      <div className="config-field-hint">Keep the CTA short and unmistakable.</div>
                    </div>
                    <div className="config-field">
                      <label className="config-field-label" htmlFor="menuIntro">Menu intro</label>
                      <Textarea id="menuIntro" value={menuIntro} onChange={(e) => setMenuIntro(e.target.value)} disabled={!isAdmin} />
                      <div className="config-field-hint">Short guidance before the customer taps into the menu.</div>
                    </div>
                    <div className="config-field">
                      <label className="config-field-label" htmlFor="menuFooter">Menu footer</label>
                      <Textarea id="menuFooter" value={menuFooter} onChange={(e) => setMenuFooter(e.target.value)} disabled={!isAdmin} />
                      <div className="config-field-hint">Optional supporting line for delivery, service, or timing context.</div>
                    </div>
                    <div className="config-field">
                      <label className="config-field-label" htmlFor="catalogIntro">Catalog intro</label>
                      <Input
                        id="catalogIntro"
                        value={catalogIntro}
                        onChange={(e) => setCatalogIntro(e.target.value)}
                        disabled={!isAdmin}
                      />
                      <div className="config-field-hint">Helpful line shown before the catalog invitation.</div>
                    </div>
                    <div className="config-field">
                      <label className="config-field-label" htmlFor="catalogWaNumber">Catalog WhatsApp number</label>
                      <Input
                        id="catalogWaNumber"
                        placeholder="255696946717"
                        value={catalogWaNumber}
                        onChange={(e) => setCatalogWaNumber(e.target.value)}
                        disabled={!isAdmin}
                      />
                      <div className="config-field-hint">Digits only. Used for the fallback `wa.me/c/...` catalog link.</div>
                    </div>
                    <div className="config-field" style={{ gridColumn: "1 / -1" }}>
                      <label className="config-field-label" htmlFor="catalogThumbnailSku">Catalog thumbnail SKU</label>
                      <Input
                        id="catalogThumbnailSku"
                        placeholder="UJANI-KIBOKO"
                        value={catalogThumbnailSku}
                        onChange={(e) => setCatalogThumbnailSku(e.target.value)}
                        disabled={!isAdmin}
                      />
                      <div className="config-field-hint">Optional retailer ID / SKU to prioritize as the message thumbnail.</div>
                    </div>
                  </div>
                </Card>
              </form>

              <div className="config-aside-stack">
                <Card tone="muted" padding="lg" className="config-section-card">
                  <div>
                    <div className="config-section-eyebrow">Preview</div>
                    <h3 className="config-section-title">Customer message structure</h3>
                  </div>
                  <div className="config-preview-phone">
                    <Badge tone="accent">WhatsApp preview</Badge>
                    <div className="config-preview-bubble">
                      <div className="config-preview-brand">{previewBrand}</div>
                      <div>{safeTrim(menuIntro) || "Your menu intro will appear here."}</div>
                      <div className="config-preview-meta">
                        CTA: {safeTrim(catalogButtonText) || "Open catalog"}
                        <br />
                        Footer: {safeTrim(menuFooter) || "No footer added yet."}
                      </div>
                    </div>
                  </div>
                </Card>

                <Card tone="muted" padding="lg" className="config-section-card">
                  <div>
                    <div className="config-section-eyebrow">Publishing notes</div>
                    <h3 className="config-section-title">What stays local here</h3>
                  </div>
                  <div className="config-list">
                    <div className="config-list-item">
                      <div className="config-list-item__copy">
                        <div className="config-list-title">Menu copy</div>
                        <div className="config-list-copy">Saved locally for the bot-controlled menu experience.</div>
                      </div>
                      <Badge tone="neutral">Local only</Badge>
                    </div>
                    <div className="config-list-item">
                      <div className="config-list-item__copy">
                        <div className="config-list-title">Catalog entry settings</div>
                        <div className="config-list-copy">Guide customers toward the right catalog action without affecting account settings.</div>
                      </div>
                      <Badge tone="info">Scoped</Badge>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          ) : (
            <div className="config-spotlight-grid" id="business-profile">
              <Card padding="lg" className="config-section-card">
                <div className="config-section-head">
                  <div>
                    <div className="config-section-eyebrow">Workspace presence</div>
                    <h3 className="config-section-title">WhatsApp Business Profile</h3>
                    <p className="config-section-description">
                      These fields represent the official WhatsApp business profile customers can inspect from chat.
                    </p>
                  </div>
                  <div className="config-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      loading={savingProfile}
                      disabled={!isAdmin}
                      onClick={() => void saveBusinessProfile(false)}
                    >
                      Save locally
                    </Button>
                    <Button
                      type="button"
                      loading={savingProfile}
                      disabled={!isAdmin}
                      onClick={() => void saveBusinessProfile(true)}
                    >
                      Save and sync
                    </Button>
                  </div>
                </div>

                <div className="config-upload">
                  <div className="config-upload__preview">
                    {waPhotoPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={waPhotoPreview} alt="WhatsApp profile preview" referrerPolicy="no-referrer" />
                    ) : (
                      initialsFrom(previewBrand)
                    )}
                  </div>
                  <div className="config-upload__body">
                    <div className="config-list-title">Profile photo</div>
                    <div className="config-field-hint">
                      Uploading here sends the image through the existing WhatsApp profile photo flow and keeps a local preview in place.
                    </div>
                    <div className="config-upload-actions">
                      <label className="config-upload-button" aria-disabled={!isAdmin || waPhotoUploading}>
                        <input
                          className="config-hidden-input"
                          type="file"
                          accept="image/*"
                          disabled={!isAdmin || waPhotoUploading}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void uploadAndSyncWhatsAppPhoto(file);
                            e.currentTarget.value = "";
                          }}
                        />
                        {waPhotoUploading ? "Uploading..." : "Upload and sync photo"}
                      </label>
                      {waPhotoHandle ? <Badge tone="neutral">Handle ready</Badge> : <Badge tone="warning">No handle yet</Badge>}
                    </div>
                  </div>
                </div>

                <div className="config-form-grid">
                  <div className="config-field">
                    <label className="config-field-label" htmlFor="about">About</label>
                    <Input id="about" value={about} onChange={(e) => setAbout(e.target.value)} disabled={!isAdmin} />
                  </div>
                  <div className="config-field">
                    <label className="config-field-label" htmlFor="vertical">Business category</label>
                    <Select id="vertical" value={vertical} onChange={(e) => setVertical(e.target.value)} disabled={!isAdmin}>
                      {VERTICAL_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="config-field">
                    <label className="config-field-label" htmlFor="description">Description</label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="config-field">
                    <label className="config-field-label" htmlFor="address">Address</label>
                    <Textarea id="address" value={address} onChange={(e) => setAddress(e.target.value)} disabled={!isAdmin} />
                  </div>
                  <div className="config-field">
                    <label className="config-field-label" htmlFor="contactEmail">Contact email</label>
                    <Input
                      id="contactEmail"
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="config-field">
                    <label className="config-field-label" htmlFor="website1">Primary website</label>
                    <Input id="website1" value={website1} onChange={(e) => setWebsite1(e.target.value)} disabled={!isAdmin} />
                  </div>
                  <div className="config-field" style={{ gridColumn: "1 / -1" }}>
                    <label className="config-field-label" htmlFor="website2">Secondary website</label>
                    <Input id="website2" value={website2} onChange={(e) => setWebsite2(e.target.value)} disabled={!isAdmin} />
                  </div>
                </div>
              </Card>

              <div className="config-aside-stack">
                <Card tone="muted" padding="lg" className="config-section-card">
                  <div>
                    <div className="config-section-eyebrow">Connection health</div>
                    <h3 className="config-section-title">Publishing readiness</h3>
                  </div>
                  <Alert tone={liveStatus.tone} title={liveStatus.label} description={liveStatus.description} />
                  <div className="config-list">
                    <div className="config-list-item">
                      <div className="config-list-item__copy">
                        <div className="config-list-title">Last sync marker</div>
                        <div className="config-list-copy">{lastSyncedLabel ? `Updated at ${lastSyncedLabel}` : "No sync performed in this session."}</div>
                      </div>
                      <Badge tone="neutral">Session</Badge>
                    </div>
                    <div className="config-list-item">
                      <div className="config-list-item__copy">
                        <div className="config-list-title">Profile photo</div>
                        <div className="config-list-copy">{waPhotoHandle ? "Meta handle is stored and ready to publish." : "Upload to create a sync-ready handle."}</div>
                      </div>
                      <Badge tone={waPhotoHandle ? "success" : "warning"}>{waPhotoHandle ? "Ready" : "Pending"}</Badge>
                    </div>
                  </div>
                </Card>

                <Card tone="muted" padding="lg" className="config-section-card">
                  <div>
                    <div className="config-section-eyebrow">Separation of concerns</div>
                    <h3 className="config-section-title">What no longer belongs here</h3>
                  </div>
                  <div className="config-list">
                    <div className="config-list-item">
                      <div className="config-list-item__copy">
                        <div className="config-list-title">Personal account details</div>
                        <div className="config-list-copy">Avatar, email, phone, and password now live under My Account.</div>
                      </div>
                      <Badge tone="info">Moved</Badge>
                    </div>
                    <div className="config-list-item">
                      <div className="config-list-item__copy">
                        <div className="config-list-title">Workspace identity</div>
                        <div className="config-list-copy">Only customer-facing business and WhatsApp publishing fields remain in this workspace page.</div>
                      </div>
                      <Badge tone="accent">Current</Badge>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
