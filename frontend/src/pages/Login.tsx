import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { resolveAssetUrl } from "../lib/runtime";
import toast from "react-hot-toast";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
import LanguageSwitcher from "../components/LanguageSwitcher";

const AEGIDE_LOGO = "https://www.aegide-international.com/wp-content/uploads/2023/02/Aegide-Dolfines-light.png";
const AEGIDE_LOGO_WHITE = "https://www.aegide-international.com/wp-content/uploads/2023/02/Aegide-Dolfines-White-light.png";
// YouTube video ID for QHSE background (test) — swap for a direct .mp4 URL when available
const BG_VIDEO_ID = "lfoTLeFooR4";
const BG_IMAGE = "https://www.aegide-international.com/wp-content/uploads/2023/02/photo-egalite-hf-sur-chantier-scaled-1-1.jpeg";

export default function Login() {
  const { login } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const [loginBranding, setLoginBranding] = useState({
    primaryColor: "#27295A",
    accentColor: "#FCC00E",
    logoUrl: null as string | null,
  });

  useEffect(() => {
    fetch("/api/branding/public")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          const resolvedLogoUrl = resolveAssetUrl(data.logoUrl);
          const logoUrl = resolvedLogoUrl ? `${resolvedLogoUrl}?v=${Date.now()}` : null;
          setLoginBranding({ ...data, logoUrl });
        }
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(username, password, false);
      toast.success(t("login") + " !");
      if (user.role === "SUPER_ADMIN") navigate("/super-admin/dashboard");
      else if (user.role === "CLIENT_ADMIN") navigate("/admin/dashboard");
      else navigate("/participant/dashboard");
    } catch (err: any) {
      toast.error(err.message || t("connectionError"));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    setForgotLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      setForgotSent(true);
    } catch {
      toast.error(t("sendError"));
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen relative">

      {/* Language switcher — top right, above everything */}
      <div className="absolute top-4 right-4 z-50">
        <LanguageSwitcher />
      </div>

      {/* Left panel — background image + blue overlay */}
      <div className="hidden md:flex flex-col w-1/2 relative overflow-hidden">

        {/* Background image */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${BG_IMAGE})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />

        {/* Blue overlay */}
        <div
          className="absolute inset-0"
          style={{ backgroundColor: loginBranding.primaryColor, opacity: 0.72, zIndex: 1 }}
        />

        {/* Content */}
        <div className="relative flex flex-col justify-between h-full p-12" style={{ zIndex: 2 }}>
          <img src={AEGIDE_LOGO_WHITE} alt="Aegide" className="w-40 object-contain" />
          <div>
            <h1 className="text-4xl font-bold text-white leading-tight mb-3">
              Safety Skill Track
            </h1>
            <p className="text-white/80 text-lg italic">{t("loginTagline")}</p>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex flex-col items-center justify-center w-full md:w-1/2 bg-white p-8">
        <div className="w-full max-w-sm">

          <div className="flex justify-center mb-8">
            <img src={AEGIDE_LOGO} alt="Aegide" className="h-12 object-contain" />
          </div>

          {!showForgot ? (
            <>
              <h2 className="text-2xl font-bold mb-1" style={{ color: loginBranding.primaryColor }}>
                {t("login")}
              </h2>
              <p className="text-gray-500 mb-6 text-sm">{t("accessYourSpace")}</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("username")}</label>
                  <input
                    type="text" value={username} onChange={e => setUsername(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 text-sm"
                    placeholder={t("yourUsername")} required autoComplete="username"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("password")}</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"} value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 focus:outline-none focus:ring-2 text-sm"
                      placeholder="••••••••" required autoComplete="current-password"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-end">
                  <button type="button" onClick={() => setShowForgot(true)}
                    className="text-sm hover:underline" style={{ color: loginBranding.primaryColor }}>
                    {t("forgotPassword")}
                  </button>
                </div>

                <button type="submit" disabled={loading}
                  className="w-full py-2.5 rounded-lg font-semibold text-white text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: loginBranding.primaryColor }}>
                  {loading ? t("loading") : t("login")}
                </button>
              </form>
            </>
          ) : (
            <>
              <button onClick={() => { setShowForgot(false); setForgotSent(false); }}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
                <ArrowLeft size={16} /> {t("backToLogin")}
              </button>

              <h2 className="text-2xl font-bold mb-1" style={{ color: loginBranding.primaryColor }}>
                {t("forgotPasswordTitle")}
              </h2>

              {forgotSent ? (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                  {t("resetLinkSent")}
                </div>
              ) : (
                <>
                  <p className="text-gray-500 mb-6 text-sm">{t("forgotPasswordDesc")}</p>
                  <form onSubmit={handleForgotSubmit} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t("emailAddress")}</label>
                      <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 text-sm"
                        placeholder="votre@email.com" required />
                    </div>
                    <button type="submit" disabled={forgotLoading}
                      className="w-full py-2.5 rounded-lg font-semibold text-white text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: loginBranding.primaryColor }}>
                      {forgotLoading ? t("sending") : t("sendResetLink")}
                    </button>
                  </form>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
