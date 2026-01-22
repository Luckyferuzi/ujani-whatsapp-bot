"use client";

import { useEffect, useMemo, useState } from "react";
import { authGet } from "@/lib/auth";
import { useAuth } from "@/components/AuthProvider";

type Presence = {
  brand_name: string | null;
  menu_intro: string | null;
  menu_footer: string | null;
  catalog_button_text: string | null;

  about: string | null;
  description: string | null;
  address: string | null;
  email: string | null;
  websites: string[];
  profile_picture_url: string | null;
  vertical: string | null;
};

type PresenceGet = { saved: Presence; live: any };

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<Presence | null>(null);
  const [live, setLive] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await authGet<PresenceGet>("/settings/whatsapp-presence");
        setSaved(p.saved);
        setLive(p.live);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const brand = useMemo(() => safeTrim(saved?.brand_name) || "Business", [saved?.brand_name]);

  return (
    <div className="pr-page">
      <div className="pr-hero">
        <div className="pr-hero-left">
          <div className="pr-titlewrap">
            <div className="pr-title">Profile (Customer-facing)</div>
            <div className="pr-subtitle">
              Hii ni preview ya kile wateja wanaona WhatsApp. Mabadiliko fanya kwenye Settings.
            </div>
          </div>
        </div>
        <div className="pr-badges">
          <span className="pr-pill pr-pill--role">{user?.role ?? "user"}</span>
        </div>
      </div>

      {loading ? (
        <div className="pr-card">
          <div className="pr-card-body">
            <div className="pr-hint">Inapakia…</div>
          </div>
        </div>
      ) : (
        <div className="pr-grid">
          <div className="pr-card">
            <div className="pr-card-head">
              <div>
                <div className="pr-card-title">Saved Presence</div>
                <div className="pr-card-desc">Hiki ndicho “source of truth” ya bot + profile fields.</div>
              </div>
            </div>
            <div className="pr-card-body">
              <div className="pr-note">
                <div style={{ fontWeight: 900, marginBottom: 8 }}>{brand}</div>
                <div style={{ marginBottom: 6 }}>{safeTrim(saved?.about) || "About haijawekwa."}</div>
                <div style={{ marginBottom: 6 }}>{safeTrim(saved?.menu_intro) || "Menu intro haijawekwa."}</div>
                <div style={{ fontSize: 12, opacity: 0.85 }}>
                  Button: {safeTrim(saved?.catalog_button_text) || "(default)"}
                </div>
              </div>

              <div className="pr-hint">
                Websites: {(saved?.websites ?? []).filter(Boolean).join(" , ") || "-"}
              </div>
            </div>
          </div>

          <div className="pr-card">
            <div className="pr-card-head">
              <div>
                <div className="pr-card-title">Live WhatsApp Profile</div>
                <div className="pr-card-desc">Kilichopo WhatsApp sasa hivi (best-effort fetch).</div>
              </div>
            </div>
            <div className="pr-card-body">
              {live?.error ? (
                <div className="pr-note">Live profile haijapatikana: {live.error}</div>
              ) : (
                <div className="pr-note">
                  <div><b>about</b>: {live?.about ?? "-"}</div>
                  <div><b>description</b>: {live?.description ?? "-"}</div>
                  <div><b>address</b>: {live?.address ?? "-"}</div>
                  <div><b>email</b>: {live?.email ?? "-"}</div>
                  <div><b>websites</b>: {(live?.websites ?? []).join(" , ") || "-"}</div>
                  <div><b>vertical</b>: {live?.vertical ?? "-"}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
