import React, { useEffect, useState } from "react";
import PageShell from "../../components/PageShell";
import { useAuth } from "../../contexts/AuthContext";
import { useI18n } from "../../contexts/I18nContext"; // ITER9
import ParticipantSidebar from "./Sidebar";
import { resolveAssetUrl } from "../../lib/runtime";
import { loadParticipantBundle } from "../../lib/participantData";
import toast from "react-hot-toast";
import { User, Lock, Eye, EyeOff, Save, HelpCircle, X } from "lucide-react";

interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  client: { name: string; primaryColor: string; accentColor: string; logoUrl: string | null; };
}

export default function ParticipantProfile() {
  const { accessToken } = useAuth();
  const { t } = useI18n(); // ITER9

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [showHelpModal, setShowHelpModal] = useState(false);
  const [helpSubject, setHelpSubject] = useState("");
  const [helpSubTheme, setHelpSubTheme] = useState("");
  const [helpBody, setHelpBody] = useState("");
  const [sendingHelp, setSendingHelp] = useState(false);

  const authHeaders = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

  useEffect(() => {
    if (!accessToken) return;
    loadParticipantBundle(accessToken)
      .then(({ profile: data }) => setProfile(data))
      .catch(() => toast.error(t("loadingError")))
      .finally(() => setLoading(false));
  }, [accessToken]);

  const primaryColor = profile?.client?.primaryColor || "#27295A";
  const accentColor  = profile?.client?.accentColor  || "#FCC00E";
  const logoUrl      = resolveAssetUrl(profile?.client?.logoUrl) || null;
  const companyName  = profile?.client?.name         || "";

  async function handleSendHelp(e: React.FormEvent) {
    e.preventDefault();
    setSendingHelp(true);
    try {
      const res = await fetch("/api/participant/messages", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          subject: helpSubject,
          subSubThemeName: helpSubTheme || undefined,
          body: helpBody,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(t("helpMessageSent"));
      setShowHelpModal(false);
      setHelpSubject(""); setHelpSubTheme(""); setHelpBody("");
    } catch {
      toast.error(t("messageError"));
    } finally {
      setSendingHelp(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error(t("passwordsNoMatch"));
      return;
    }
    if (newPassword.length < 8) {
      toast.error(t("passwordTooShortMsg"));
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch("/api/participant/profile/password", {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur");
      }
      toast.success(t("passwordChangedSuccess"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err.message || "Impossible de modifier le mot de passe");
    } finally {
      setSavingPassword(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen">
        <div className="flex-1 flex items-center justify-center text-gray-400">{t("loading")}</div> {/* ITER9 */}
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <ParticipantSidebar primaryColor={primaryColor} accentColor={accentColor} logoUrl={logoUrl} companyName={companyName} firstName={profile?.firstName} lastName={profile?.lastName} />
      <PageShell>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">{t("myInfo")}</h1> {/* ITER9 */}
          <p className="text-gray-500 mt-1">{t("profileSubtitle")}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl">
          {/* Profil (lecture seule) */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <User size={18} className="text-gray-400" />
              <h2 className="text-base font-semibold text-gray-800">{t("personalInfo")}</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t("firstName")}</label>
                <div className="px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-800 border border-gray-200">
                  {profile?.firstName || "—"}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t("lastName")}</label>
                <div className="px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-800 border border-gray-200">
                  {profile?.lastName || "—"}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t("email")}</label>
                <div className="px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-800 border border-gray-200">
                  {profile?.email || "—"}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t("company")}</label>
                <div className="px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-800 border border-gray-200">
                  {companyName || "—"}
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-4">{t("contactAdminForInfo")}</p>
            <button
              type="button"
              onClick={() => setShowHelpModal(true)}
              className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border-2 hover:opacity-90 transition-opacity"
              style={{ borderColor: primaryColor, color: primaryColor }}
            >
              <HelpCircle size={15} /> {t("helpButton")}
            </button>
          </div>

          {/* Changement de mot de passe */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <Lock size={18} className="text-gray-400" />
              <h2 className="text-base font-semibold text-gray-800">{t("changePassword")}</h2> {/* ITER9 */}
            </div>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t("currentPassword")}</label>
                <div className="relative">
                  <input
                    type={showCurrent ? "text" : "password"}
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    required
                    className="w-full px-3 py-2 pr-9 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": primaryColor + "40" } as any}
                    placeholder="••••••••"
                  />
                  <button type="button" onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t("newPassword")}</label>
                <div className="relative">
                  <input
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    className="w-full px-3 py-2 pr-9 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2"
                    placeholder={t("minPasswordChars")}
                  />
                  <button type="button" onClick={() => setShowNew(!showNew)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t("confirmNewPassword")}</label>
                <div className="relative">
                  <input
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                    className="w-full px-3 py-2 pr-9 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2"
                    placeholder="••••••••"
                  />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-red-500">{t("passwordsNoMatch")}</p>
              )}
              <button
                type="submit"
                disabled={savingPassword}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 mt-2"
                style={{ backgroundColor: primaryColor }}>
                <Save size={14} />
                {savingPassword ? t("saving") : t("save")}
              </button>
            </form>
          </div>
        </div>
      </PageShell>

      {/* Modal Besoin d'aide */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold text-gray-800">{t("helpButton")}</h2>
              <button onClick={() => setShowHelpModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSendHelp} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("messageSubject")} *</label>
                <input
                  type="text"
                  value={helpSubject}
                  onChange={e => setHelpSubject(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  placeholder={t("helpSubjectPlaceholder")}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("skillSubtheme")}</label>
                <input
                  type="text"
                  value={helpSubTheme}
                  onChange={e => setHelpSubTheme(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  placeholder={t("helpSkillPlaceholder")}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("messageBody")} *</label>
                <textarea
                  value={helpBody}
                  onChange={e => setHelpBody(e.target.value)}
                  required
                  rows={4}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
                  placeholder={t("helpBodyPlaceholder")}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowHelpModal(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">
                  {t("cancel")}
                </button>
                <button type="submit" disabled={sendingHelp}
                  className="px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50"
                  style={{ backgroundColor: primaryColor }}>
                  {sendingHelp ? t("sending") : t("send")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
