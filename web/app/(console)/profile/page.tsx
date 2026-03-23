"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthProvider";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FormSectionSkeleton,
  Input,
  RefreshIndicator,
  Textarea,
} from "@/components/ui";
import { authGet, authPatchJson, authPostForm } from "@/lib/auth";

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

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function initials(name: string, email: string) {
  const source = safeTrim(name) || safeTrim(email);
  return (
    source
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "ME"
  );
}

export default function ProfilePage() {
  const { user, token, setAuth } = useAuth();
  const [loading, setLoading] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [baselineMe, setBaselineMe] = useState<MeUser | null>(null);
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [businessName, setBusinessName] = useState(user?.business_name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [showPassword, setShowPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    if (!token || !user) return;
    setLoading(true);
    void authGet<MeResponse>("/auth/me")
      .then((me) => {
        setBaselineMe(me.user);
        setFullName(me.user.full_name ?? "");
        setPhone(me.user.phone ?? "");
        setBusinessName(me.user.business_name ?? "");
        setAvatarUrl(me.user.avatar_url ?? "");
        setBio(me.user.bio ?? "");
        setEmail(me.user.email ?? "");
      })
      .catch((e: any) => {
        toast.error("Unable to load your account settings.", {
          description: e?.message ?? "Try again.",
        });
      })
      .finally(() => setLoading(false));
  }, [token, user]);

  const accountInitials = useMemo(() => initials(fullName, email), [email, fullName]);
  const roleLabel = user?.role ? user.role[0].toUpperCase() + user.role.slice(1) : "Operator";

  async function uploadAvatarFromDevice(file: File) {
    try {
      setAvatarUploading(true);
      const form = new FormData();
      form.append("file", file);
      const out = await authPostForm<{ url: string }>("/files/avatar", form);
      setAvatarUrl(out.url);
      toast.success("Avatar uploaded. Save your account to keep it.");
    } catch (e: any) {
      toast.error("Unable to upload avatar.", {
        description: e?.message ?? "Try again.",
      });
    } finally {
      setAvatarUploading(false);
    }
  }

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
        if (!currentPassword) return void toast.error("Enter your current password first.");
        if (!newPassword) return void toast.error("Enter a new password.");
        if (newPassword.length < 6) return void toast.error("New password must be at least 6 characters.");
        if (newPassword !== confirm) return void toast.error("New password entries do not match.");
        payload.password = newPassword;
        payload.current_password = currentPassword;
      }
    }

    if (!Object.keys(payload).length) {
      toast.info("No account changes to save.");
      return;
    }

    try {
      setSavingAccount(true);
      await authPatchJson("/auth/profile", payload);
      const me = await authGet<MeResponse>("/auth/me");
      setBaselineMe(me.user);
      setAuth({ user: me.user as any, token });
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      toast.success("Account saved.");
    } catch (e: any) {
      toast.error("Unable to save your account.", {
        description: e?.message ?? "Try again.",
      });
    } finally {
      setSavingAccount(false);
    }
  }

  if (!user) {
    return (
      <EmptyState
        eyebrow="My account"
        title="Sign in to view your account."
        description="Personal account settings are only available after authentication."
      />
    );
  }

  return (
    <div className="config-page config-page--narrow">
      <PageHeader
        eyebrow="My account"
        section="Personal"
        title="Operator Account"
        description="Manage your personal identity, contact details, avatar, and password without mixing them into workspace-level customer-facing configuration."
        actions={
          <div className="config-header-meta">
            <Badge tone="info">{roleLabel}</Badge>
            {savingAccount || avatarUploading ? <RefreshIndicator label="Updating account" /> : null}
          </div>
        }
      />

      {loading ? (
        <Card padding="lg">
          <FormSectionSkeleton />
        </Card>
      ) : (
        <>
          <div className="config-account-grid">
            <Card padding="lg" className="config-identity-card">
              <div className="config-identity-avatar">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="Avatar preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} referrerPolicy="no-referrer" />
                ) : (
                  accountInitials
                )}
              </div>
              <div className="config-identity-copy">
                <div className="config-identity-name">{safeTrim(fullName) || "Your profile"}</div>
                <div className="config-identity-meta">{email}</div>
                <div className="config-badge-row">
                  <Badge tone="neutral">Personal settings</Badge>
                  <Badge tone="info">Separate from workspace settings</Badge>
                </div>
              </div>
            </Card>

            <Card tone="muted" padding="lg" className="config-section-card">
              <div>
                <div className="config-section-eyebrow">Scope</div>
                <h3 className="config-section-title">Only your operator account</h3>
              </div>
              <div className="config-list">
                <div className="config-list-item">
                  <div className="config-list-item__copy">
                    <div className="config-list-title">Personal identity</div>
                    <div className="config-list-copy">Name, phone, email, avatar, and password belong here.</div>
                  </div>
                  <Badge tone="accent">Current</Badge>
                </div>
                <div className="config-list-item">
                  <div className="config-list-item__copy">
                    <div className="config-list-title">Workspace publishing</div>
                    <div className="config-list-copy">Bot menu and WhatsApp business profile settings now live under Workspace Settings.</div>
                  </div>
                  <Badge tone="info">Moved</Badge>
                </div>
              </div>
            </Card>
          </div>

          <form onSubmit={saveAccount}>
            <Card padding="lg" className="config-section-card">
              <div className="config-section-head">
                <div>
                  <div className="config-section-eyebrow">Profile details</div>
                  <h3 className="config-section-title">Identity and operator preferences</h3>
                  <p className="config-section-description">Keep your daily operator profile current without affecting workspace business configuration.</p>
                </div>
                <div className="config-actions">
                  <Button type="submit" loading={savingAccount}>Save account</Button>
                </div>
              </div>

              <div className="config-upload">
                <div className="config-upload__preview">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="Avatar preview" referrerPolicy="no-referrer" />
                  ) : (
                    accountInitials
                  )}
                </div>
                <div className="config-upload__body">
                  <div className="config-list-title">Avatar</div>
                  <div className="config-field-hint">Upload a personal avatar for the web console only.</div>
                  <div className="config-upload-actions">
                    <label className="config-upload-button" aria-disabled={avatarUploading}>
                      <input
                        className="config-hidden-input"
                        type="file"
                        accept="image/*"
                        disabled={avatarUploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadAvatarFromDevice(file);
                          e.currentTarget.value = "";
                        }}
                      />
                      {avatarUploading ? "Uploading..." : "Upload avatar"}
                    </label>
                    {avatarUrl ? <Badge tone="success">Preview ready</Badge> : <Badge tone="neutral">No image yet</Badge>}
                  </div>
                </div>
              </div>

              <div className="config-form-grid">
                <div className="config-field">
                  <label className="config-field-label" htmlFor="fullName">Full name</label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="config-field">
                  <label className="config-field-label" htmlFor="phone">Phone</label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="config-field">
                  <label className="config-field-label" htmlFor="businessName">Business or team label</label>
                  <Input id="businessName" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
                </div>
                <div className="config-field">
                  <label className="config-field-label" htmlFor="email">Email</label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="config-field" style={{ gridColumn: "1 / -1" }}>
                  <label className="config-field-label" htmlFor="bio">Bio</label>
                  <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} />
                </div>
              </div>
            </Card>
          </form>

          <Card padding="lg" className="config-security-card">
            <div className="config-section-head">
              <div>
                <div className="config-section-eyebrow">Security</div>
                <h3 className="config-section-title">Password management</h3>
                <p className="config-section-description">Expand this only when you need to change your login password.</p>
              </div>
              <div className="config-actions">
                <Button type="button" variant="secondary" onClick={() => setShowPassword((value) => !value)}>
                  {showPassword ? "Hide password fields" : "Change password"}
                </Button>
              </div>
            </div>

            {showPassword ? (
              <div className="config-form-grid">
                <div className="config-field">
                  <label className="config-field-label" htmlFor="currentPassword">Current password</label>
                  <Input id="currentPassword" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
                </div>
                <div className="config-field">
                  <label className="config-field-label" htmlFor="newPassword">New password</label>
                  <Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                </div>
                <div className="config-field" style={{ gridColumn: "1 / -1" }}>
                  <label className="config-field-label" htmlFor="confirmPassword">Confirm new password</label>
                  <Input id="confirmPassword" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                </div>
              </div>
            ) : null}
          </Card>
        </>
      )}
    </div>
  );
}
