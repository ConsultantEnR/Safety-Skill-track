import React, { useEffect, useState } from "react";
import PageShell from "../../components/PageShell";
import Sidebar from "../../components/Sidebar";
import { useAuth } from "../../contexts/AuthContext";
import { useBranding } from "../../contexts/BrandingContext";
import { useI18n } from "../../contexts/I18nContext"; // ITER12
import { resolveAssetUrl } from "../../lib/runtime";
import toast from "react-hot-toast";
import { Upload, Building2, Lock } from "lucide-react";
import HelpRequestButton from "../../components/HelpRequestButton"; // ITER12

// ITER7: Ajout fiche entreprise (adresse, SIRET, secteur, CP, ville, pays) + changement de mot de passe
export default function AdminSettings() {
  const { accessToken, user } = useAuth();
  const branding = useBranding();
  const { t } = useI18n(); // ITER12

  // Couleurs & logo
  const [primaryColor, setPrimaryColor] = useState("#27295A");
  const [accentColor, setAccentColor] = useState("#FCC00E");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // ITER7: Fiche entreprise
  const [companyName, setCompanyName] = useState(""); // lecture seule
  const [address, setAddress]         = useState("");
  const [siret, setSiret]             = useState("");
  const [sector, setSector]           = useState("");
  const [postalCode, setPostalCode]   = useState("");
  const [city, setCity]               = useState("");
  const [country, setCountry]         = useState("");

  // ITER7: Changement de mot de passe
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);

  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  useEffect(() => {
    if (!accessToken) return;
    fetch(`/api/admin/settings`, { headers: authHeaders })
      .then(r => r.json())
      .then(data => {
        setPrimaryColor(data.primaryColor || "#27295A");
        setAccentColor(data.accentColor || "#FCC00E");
        setLogoPreview(resolveAssetUrl(data.logoUrl) || null);
        // ITER7: champs fiche entreprise
        setCompanyName(data.name || "");
        setAddress(data.address || "");
        setSiret(data.siret || "");
        setSector(data.sector || "");
        setPostalCode(data.postalCode || "");
        setCity(data.city || "");
        setCountry(data.country || "");
      })
      .catch(() => toast.error(t("loadingError")))
      .finally(() => setLoading(false));
  }, [accessToken]);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t("logoTooBig"));
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
      // 1. Mise à jour des infos entreprise (JSON)
      const infoRes = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ address, siret, sector, postalCode, city, country }),
      });
      if (!infoRes.ok) throw new Error((await infoRes.json().catch(() => ({}))).error || t("settingsSaveError"));

      // 2. Mise à jour couleurs + logo (FormData)
      const fd = new FormData();
      fd.append("primaryColor", primaryColor);
      fd.append("accentColor", accentColor);
      if (logoFile) fd.append("logo", logoFile);
      const logoRes = await fetch("/api/admin/settings/logo", {
        method: "POST",
        headers: authHeaders,
        body: fd,
      });
      if (!logoRes.ok) throw new Error(t("uploadError"));
      const logoData = await logoRes.json().catch(() => ({}));

      const nextLogoUrl = resolveAssetUrl(logoData.logoUrl || null);
      if (nextLogoUrl) setLogoPreview(`${nextLogoUrl}?v=${Date.now()}`);
      branding.reload();
      toast.success(t("settingsSaved"));
    } catch (err: any) {
      toast.error(err.message || t("settingsSaveError"));
    } finally {
      setSaving(false);
    }
  }

  // ITER7: Changement de mot de passe
  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error(t("passwordsNotMatch"));
      return;
    }
    if (newPassword.length < 8) {
      toast.error(t("passwordTooShortMsg"));
      return;
    }
    setChangingPwd(true);
    try {
      const res = await fetch("/api/admin/settings/password", {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: oldPassword, newPassword }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erreur");
      }
      toast.success(t("passwordChangedSuccess"));
      setOldPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (err: any) {
      toast.error(err.message || t("messageError"));
    } finally {
      setChangingPwd(false);
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
          {t("companySettings")}
        </h1>

        {/* ITER7: Fiche entreprise */}
        <form onSubmit={handleSave} className="max-w-2xl space-y-6 mb-10">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <Building2 size={18} className="text-gray-500" />
              <h2 className="text-base font-semibold text-gray-800">{t("clientProfile")}</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Nom en lecture seule */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("companyName")} <span className="text-xs text-gray-400">{t("readOnly")}</span>
                </label>
                <input
                  type="text"
                  value={companyName}
                  readOnly
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("address")}</label>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  placeholder="Ex : 12 rue de la Paix"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("postalCode")}</label>
                <input
                  type="text"
                  value={postalCode}
                  onChange={e => setPostalCode(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  placeholder="Ex : 75001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("city")}</label>
                <input
                  type="text"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  placeholder="Ex : Paris"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("country")}</label>
                <input
                  type="text"
                  value={country}
                  onChange={e => setCountry(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  placeholder="Ex : France"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("siret")}</label>
                <input
                  type="text"
                  value={siret}
                  onChange={e => setSiret(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  placeholder="Ex : 12345678901234"
                  maxLength={14}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("sectorLabel")}</label>
                <input
                  type="text"
                  value={sector}
                  onChange={e => setSector(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  placeholder="Ex : BTP, Industrie, Logistique..."
                />
              </div>
            </div>
          </div>

          {/* Logo */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">{t("logoSection")}</h2>
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

          {/* Couleurs */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">{t("colorsSection")}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t("primaryColorLabel")}</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={e => setPrimaryColor(e.target.value)}
                    className="w-12 h-12 rounded-lg cursor-pointer border-2 border-gray-200 p-0.5"
                    title="Choisir la couleur primaire"
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
                    title="Choisir la couleur accent"
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

          {/* Aperçu */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">{t("preview")}</h2>
            <div className="flex items-center gap-4 p-4 rounded-xl" style={{ backgroundColor: primaryColor }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm overflow-hidden"
                style={{ backgroundColor: accentColor, color: primaryColor }}>
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className="w-full h-full object-contain rounded-full" />
                ) : (companyName?.[0]?.toUpperCase() || "E")}
              </div>
              <span className="text-white font-semibold">{companyName || "Safety Skill Track"}</span>
              <div className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ backgroundColor: accentColor, color: primaryColor }}>
                {t("active")}
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
              {saving ? t("saving") : t("saveSettings")}
            </button>
          </div>
        </form>

        {/* ITER7: Changement de mot de passe */}
        <form onSubmit={handleChangePassword} className="max-w-2xl">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <Lock size={18} className="text-gray-500" />
              <h2 className="text-base font-semibold text-gray-800">{t("changePassword")}</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("currentPassword")}</label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={e => setOldPassword(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  placeholder={t("currentPassword")}
                  autoComplete="current-password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("newPassword")}</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  placeholder={t("newPassword")}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("confirmNewPassword")}</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                    confirmPassword && confirmPassword !== newPassword ? "border-red-400" : "border-gray-300"
                  }`}
                  placeholder={t("confirmNewPassword")}
                  autoComplete="new-password"
                />
                {confirmPassword && confirmPassword !== newPassword && (
                  <p className="text-xs text-red-500 mt-1">{t("passwordsNotMatch")}</p>
                )}
              </div>
            </div>
            <div className="flex justify-end mt-5">
              <button
                type="submit"
                disabled={changingPwd || (confirmPassword !== newPassword && confirmPassword.length > 0)}
                className="px-6 py-2.5 rounded-lg text-white font-semibold text-sm disabled:opacity-50 transition-opacity hover:opacity-90"
                style={{ backgroundColor: branding.primaryColor }}
              >
                {changingPwd ? t("changingPwd") : t("changePassword")}
              </button>
            </div>
          </div>
        </form>
      </PageShell>
      <HelpRequestButton /> {/* ITER12 */}
    </div>
  );
}
