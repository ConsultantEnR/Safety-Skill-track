// ITER8: Ajout des sections mot de passe, identifiant et logo SA indépendant
// ITER9: i18n complet + section changement d'e-mail
import React, { useEffect, useState } from "react";
import PageShell from "../../components/PageShell";
import Sidebar from "../../components/Sidebar";
import { useAuth } from "../../contexts/AuthContext";
import { useBranding } from "../../contexts/BrandingContext";
import { useI18n } from "../../contexts/I18nContext"; // ITER9
import { resolveAssetUrl } from "../../lib/runtime";
import toast from "react-hot-toast";
import { Upload, Lock, User as UserIcon, Mail } from "lucide-react"; // ITER9: Mail

export default function SuperAdminSettings() {
  const { accessToken } = useAuth();
  const branding = useBranding();
  const { t } = useI18n(); // ITER9

  // ITER8: Paramètres plateforme (existants)
  const [primaryColor, setPrimaryColor] = useState("#27295A");
  const [accentColor, setAccentColor] = useState("#FCC00E");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ITER8: Profil actuel
  const [currentUsername, setCurrentUsername] = useState("");
  const [currentEmail, setCurrentEmail] = useState("");

  // ITER8: Changement de mot de passe
  const [pwdCurrent, setPwdCurrent] = useState("");
  const [pwdNew, setPwdNew] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  // ITER8: Changement d'identifiant
  const [newUsername, setNewUsername] = useState("");
  const [usernamePwd, setUsernamePwd] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);

  // ITER11: Changement d'adresse e-mail avec vérification par token
  const [newEmail, setNewEmail] = useState("");
  const [emailPwd, setEmailPwd] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailVerificationSent, setEmailVerificationSent] = useState(false);

  // ITER8: Logo SA indépendant
  const [saLogoFile, setSaLogoFile] = useState<File | null>(null);
  const [saLogoPreview, setSaLogoPreview] = useState<string | null>(null);
  const [savingSaLogo, setSavingSaLogo] = useState(false);

  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  useEffect(() => {
    if (!accessToken) return;
    // ITER8: Chargement paramètres plateforme + profil SA en parallèle
    Promise.all([
      fetch("/api/super-admin/platform-settings", { headers: authHeaders }).then(r => r.json()),
      fetch("/api/super-admin/platform-settings/profile", { headers: authHeaders }).then(r => r.ok ? r.json() : null),
    ])
      .then(([platformData, profileData]) => {
        setPrimaryColor(platformData.primaryColor || "#27295A");
        setAccentColor(platformData.accentColor || "#FCC00E");
        setLogoPreview(resolveAssetUrl(platformData.logoUrl) || null);
        if (profileData) {
          setCurrentUsername(profileData.username || "");
          setCurrentEmail(profileData.email || "");
          setSaLogoPreview(resolveAssetUrl(profileData.logoUrl) || null);
        }
      })
      .catch(() => toast.error("Erreur de chargement"))
      .finally(() => setLoading(false));
  }, [accessToken]);

  // ITER11: Handler changement d'adresse e-mail — envoie un lien de vérification
  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    setSavingEmail(true);
    try {
      const res = await fetch("/api/super-admin/platform-settings/email", {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail, currentPassword: emailPwd }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Erreur"); }
      setEmailVerificationSent(true);
      toast.success("Lien de vérification envoyé à " + newEmail);
      setEmailPwd("");
    } catch (err: any) {
      toast.error(err.message || "Erreur lors du changement d'e-mail");
    } finally { setSavingEmail(false); }
  }

  // ITER8: Handler changement de mot de passe
  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pwdNew !== pwdConfirm) { toast.error(t("passwordsNotMatch")); return; }
    if (pwdNew.length < 6) { toast.error(t("passwordTooShort")); return; }
    setSavingPwd(true);
    try {
      const res = await fetch("/api/super-admin/platform-settings/password", {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pwdCurrent, newPassword: pwdNew }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Erreur"); }
      toast.success(t("passwordUpdatedSuccess"));
      setPwdCurrent(""); setPwdNew(""); setPwdConfirm("");
    } catch (err: any) {
      toast.error(err.message || "Erreur lors du changement de mot de passe");
    } finally { setSavingPwd(false); }
  }

  // ITER8: Handler changement d'identifiant
  async function handleChangeUsername(e: React.FormEvent) {
    e.preventDefault();
    if (!newUsername.trim()) { toast.error(t("usernameEmpty")); return; }
    setSavingUsername(true);
    try {
      const res = await fetch("/api/super-admin/platform-settings/username", {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ newUsername: newUsername.trim(), currentPassword: usernamePwd }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Erreur"); }
      toast.success(t("usernameUpdated"));
      setCurrentUsername(newUsername.trim());
      setNewUsername(""); setUsernamePwd("");
    } catch (err: any) {
      toast.error(err.message || "Erreur lors du changement d'identifiant");
    } finally { setSavingUsername(false); }
  }

  // ITER8: Handler logo SA indépendant
  function handleSaLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Logo trop lourd (max 2MB)"); return; }
    setSaLogoFile(file);
    const reader = new FileReader();
    reader.onload = ev => setSaLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleUploadSaLogo(e: React.FormEvent) {
    e.preventDefault();
    if (!saLogoFile) { toast.error(t("selectFile")); return; }
    setSavingSaLogo(true);
    try {
      const fd = new FormData();
      fd.append("logo", saLogoFile);
      const res = await fetch("/api/super-admin/platform-settings/logo", {
        method: "POST",
        headers: authHeaders,
        body: fd,
      });
      if (!res.ok) throw new Error();
      const data = await res.json().catch(() => ({}));
      const nextLogoUrl = resolveAssetUrl(data.logoUrl || null);
      if (nextLogoUrl) setSaLogoPreview(`${nextLogoUrl}?v=${Date.now()}`);
      toast.success(t("saLogoUpdated"));
      setSaLogoFile(null);
    } catch {
      toast.error("Erreur lors de l'upload du logo");
    } finally { setSavingSaLogo(false); }
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t("logoFormats"));
      return;
    }
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = ev => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("primaryColor", primaryColor);
      fd.append("accentColor", accentColor);
      if (logoFile) fd.append("logo", logoFile);

      const res = await fetch("/api/super-admin/platform-settings", {
        method: "PUT",
        headers: authHeaders,
        body: fd,
      });
      if (!res.ok) throw new Error();
      const data = await res.json().catch(() => ({}));
      const nextLogoUrl = resolveAssetUrl(data.logoUrl || null);
      if (nextLogoUrl) setLogoPreview(`${nextLogoUrl}?v=${Date.now()}`);
      // Recharge le branding pour mettre à jour le logo dans la sidebar immédiatement
      branding.reload();
      toast.success(t("settingsSaved"));
    } catch {
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-gray-400">{t("loading")}</div>
        </PageShell>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <PageShell>
        <h1 className="text-2xl font-bold mb-6" style={{ color: branding.primaryColor }}>
          {t("platformSettings")}
        </h1>

        {/* ITER8: Profil actuel */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6 max-w-2xl">
          <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <UserIcon size={18} /> {t("superAdminProfile")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">{t("username")} :</span>
              <span className="ml-2 font-medium text-gray-800">{currentUsername || "—"}</span>
            </div>
            <div>
              <span className="text-gray-500">{t("emailAddress")} :</span>
              <span className="ml-2 font-medium text-gray-800">{currentEmail || "—"}</span>
            </div>
          </div>
        </div>

        {/* ITER8: Changement de mot de passe */}
        <form onSubmit={handleChangePassword} className="bg-white rounded-xl shadow-sm p-6 mb-6 max-w-2xl space-y-4">
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <Lock size={18} /> {t("changePassword")}
          </h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("currentPassword")}</label>
            <input type="password" value={pwdCurrent} onChange={e => setPwdCurrent(e.target.value)}
              required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("newPassword")}</label>
            <input type="password" value={pwdNew} onChange={e => setPwdNew(e.target.value)}
              required minLength={6} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("confirmPassword")}</label>
            <input type="password" value={pwdConfirm} onChange={e => setPwdConfirm(e.target.value)}
              required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={savingPwd}
              className="px-5 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "#27295A" }}>
              {savingPwd ? t("saving") : t("changePassword")}
            </button>
          </div>
        </form>

        {/* ITER11: Changement d'adresse e-mail avec vérification */}
        <form onSubmit={handleChangeEmail} className="bg-white rounded-xl shadow-sm p-6 mb-6 max-w-2xl space-y-4">
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <Mail size={18} /> {t("changeEmail")}
          </h2>
          {emailVerificationSent ? (
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <Mail size={18} className="text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800">Vérification en attente</p>
                <p className="text-sm text-amber-700 mt-1">
                  Un lien de confirmation a été envoyé à <strong>{newEmail}</strong>.
                  Cliquez sur ce lien pour valider le changement d'adresse e-mail.
                </p>
                <button type="button" onClick={() => { setEmailVerificationSent(false); setNewEmail(""); }}
                  className="text-xs text-amber-600 underline mt-2">
                  Annuler / recommencer
                </button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("newEmail")}</label>
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                  required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("currentPassword")} ({t("confirmation")})</label>
                <input type="password" value={emailPwd} onChange={e => setEmailPwd(e.target.value)}
                  required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
              </div>
              <div className="flex justify-end">
                <button type="submit" disabled={savingEmail}
                  className="px-5 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: "#27295A" }}>
                  {savingEmail ? t("saving") : t("sendResetLink")}
                </button>
              </div>
            </>
          )}
        </form>

        {/* ITER8: Changement d'identifiant */}
        <form onSubmit={handleChangeUsername} className="bg-white rounded-xl shadow-sm p-6 mb-6 max-w-2xl space-y-4">
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <UserIcon size={18} /> {t("changeUsername")}
          </h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("newUsername")}</label>
            <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)}
              required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
              placeholder={currentUsername} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("confirmCurrentPassword")}</label>
            <input type="password" value={usernamePwd} onChange={e => setUsernamePwd(e.target.value)}
              required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" />
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={savingUsername}
              className="px-5 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "#27295A" }}>
              {savingUsername ? t("saving") : t("changeUsername")}
            </button>
          </div>
        </form>

        {/* ITER8: Logo Super Admin indépendant */}
        <form onSubmit={handleUploadSaLogo} className="bg-white rounded-xl shadow-sm p-6 mb-6 max-w-2xl space-y-4">
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <Upload size={18} /> {t("saLogo")}
          </h2>
          <p className="text-xs text-gray-500">{t("saLogoIndependent")}</p>
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-gray-50">
              {saLogoPreview ? (
                <img src={saLogoPreview} alt="Logo SA" className="w-full h-full object-contain p-1" />
              ) : (
                <Upload size={24} className="text-gray-400" />
              )}
            </div>
            <div>
              <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50 transition-colors">
                <Upload size={16} />
                {saLogoFile ? saLogoFile.name : t("chooseLogoFile")}
                <input type="file" accept="image/png,image/svg+xml,image/jpeg" onChange={handleSaLogoChange} className="hidden" />
              </label>
              <p className="mt-1 text-xs text-gray-500">{t("logoFormats")}</p>
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={savingSaLogo || !saLogoFile}
              className="px-5 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "#27295A" }}>
              {savingSaLogo ? t("uploadingLogo") : t("saveLogo")}
            </button>
          </div>
        </form>

        {/* Séparateur */}
        <div className="max-w-2xl mb-6">
          <hr className="border-gray-200" />
          <p className="text-xs text-gray-400 mt-2">{t("globalLogoSettings")}</p>
        </div>

        <form onSubmit={handleSave} className="max-w-2xl space-y-6">
          {/* Logo section */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">{t("platformLogo")}</h2>
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-gray-50">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-1" />
                ) : (
                  <Upload size={24} className="text-gray-400" />
                )}
              </div>
              <div>
                <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50 transition-colors">
                  <Upload size={16} />
                  {logoFile ? logoFile.name : t("chooseLogoFile")}
                  <input
                    type="file"
                    accept="image/png,image/svg+xml,image/jpeg"
                    onChange={handleLogoChange}
                    className="hidden"
                  />
                </label>
                <p className="mt-1 text-xs text-gray-500">{t("logoFormats")}</p>
              </div>
            </div>
          </div>

          {/* Colors section */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">{t("platformColors")}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t("primaryColorLabel")}</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={e => setPrimaryColor(e.target.value)}
                    className="w-12 h-12 rounded-lg cursor-pointer border-2 border-gray-200 p-0.5"
                    title={t("primaryColorLabel")}
                  />
                  <div className="flex-1">
                    <input
                      type="text"
                      value={primaryColor}
                      onChange={e => setPrimaryColor(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2"
                      placeholder="#27295A"
                      pattern="^#[0-9A-Fa-f]{6}$"
                    />
                    <p className="text-xs text-gray-400 mt-1">{t("usedForSidebar")}</p>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t("accentColorLabel")}</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={accentColor}
                    onChange={e => setAccentColor(e.target.value)}
                    className="w-12 h-12 rounded-lg cursor-pointer border-2 border-gray-200 p-0.5"
                    title={t("accentColorLabel")}
                  />
                  <div className="flex-1">
                    <input
                      type="text"
                      value={accentColor}
                      onChange={e => setAccentColor(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2"
                      placeholder="#FCC00E"
                      pattern="^#[0-9A-Fa-f]{6}$"
                    />
                    <p className="text-xs text-gray-400 mt-1">{t("usedForButtons")}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">{t("preview")}</h2>
            <div className="flex items-center gap-4 p-4 rounded-xl" style={{ backgroundColor: primaryColor }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm"
                style={{ backgroundColor: accentColor, color: primaryColor }}>
                T
              </div>
              <span className="text-white font-semibold">Safety Skill Track</span>
              <div className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ backgroundColor: accentColor, color: primaryColor }}>
                Actif
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-lg text-white font-semibold text-sm disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ backgroundColor: branding.primaryColor }}
            >
              {saving ? t("saving") : t("savePlatformSettings")}
            </button>
          </div>
        </form>
      </PageShell>
    </div>
  );
}
