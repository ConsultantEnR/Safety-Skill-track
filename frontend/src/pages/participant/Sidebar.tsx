import React, { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, ClipboardList, UserCircle, ChevronLeft, ChevronRight, LogOut, MessageSquare } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import toast from "react-hot-toast";
import LanguageSwitcher from "../../components/LanguageSwitcher";
import { useI18n } from "../../contexts/I18nContext";

interface NavItem { to: string; icon: React.ReactNode; label: string; }


const SIDEBAR_BG_IMAGE = "https://www.aegide-international.com/wp-content/uploads/2023/02/photo-egalite-hf-sur-chantier-scaled-1-1.jpeg";


function NavTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
      {children}
      {visible && (
        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 px-2 py-1 bg-gray-900 text-white text-xs rounded-md whitespace-nowrap shadow-lg pointer-events-none">
          {label}
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
        </div>
      )}
    </div>
  );
}

interface ParticipantSidebarProps {
  primaryColor: string;
  accentColor: string;
  logoUrl?: string | null;
  companyName?: string;
  firstName?: string;
  lastName?: string;
}

export default function ParticipantSidebar({
  primaryColor, accentColor, logoUrl, companyName, firstName, lastName,
}: ParticipantSidebarProps) {
  const { logout, user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const participantNav: NavItem[] = [
    { to: "/participant/dashboard", icon: <LayoutDashboard size={20} />, label: t("dashboard") },
    { to: "/participant/tests",     icon: <ClipboardList size={20} />,   label: t("myTests") },
    { to: "/participant/messages",  icon: <MessageSquare size={20} />,   label: t("messages") },
    { to: "/participant/profile",   icon: <UserCircle size={20} />,      label: t("myInfo") },
  ];
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("participant_sidebar_collapsed") === "true");

  useEffect(() => {
    localStorage.setItem("participant_sidebar_collapsed", String(collapsed));
  }, [collapsed]);

  async function handleLogout() {
    await logout();
    toast.success("Déconnecté");
    navigate("/login");
  }

  // Fallback chain: firstName+lastName → username → email
  const fullName =
    [firstName, lastName].filter(Boolean).join(" ") ||
    user?.username ||
    user?.email ||
    "";
  const initials =
    (`${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`).toUpperCase() ||
    (user?.username?.[0] ?? user?.email?.[0] ?? "").toUpperCase() ||
    "?";

  return (
    <aside
      className="flex flex-col h-screen transition-all duration-300 shrink-0"
      style={{
        width: collapsed ? 64 : 240,
        backgroundImage: `linear-gradient(rgba(39,41,90,0.72), rgba(39,41,90,0.72)), url(${SIDEBAR_BG_IMAGE})`,
        backgroundSize: "cover",
        backgroundPosition: "30% center",
        backgroundColor: "#27295a",
      }}
    >
      {/* Logo / Nom entreprise */}
      <div className={`flex items-center border-b border-white/10 ${collapsed ? "justify-center px-2 py-4" : "gap-3 px-4 py-5"}`}>
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="Logo"
            className={`object-contain rounded shrink-0 ${collapsed ? "w-9 h-9" : "w-12 h-12"}`}
          />
        ) : (
          <div
            className={`rounded-full flex items-center justify-center font-bold shrink-0 ${collapsed ? "w-9 h-9 text-sm" : "w-12 h-12 text-base"}`}
            style={{ backgroundColor: accentColor, color: primaryColor }}
          >
            {companyName?.[0]?.toUpperCase() || "P"}
          </div>
        )}
        {!collapsed && (
          <span className="text-white font-bold text-sm truncate">{companyName || "Mon espace"}</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden">
        {participantNav.map(item => (
          <div key={item.to}>
            {collapsed ? (
              <NavTooltip label={item.label}>
                <NavLink to={item.to} aria-label={item.label}
                  className={({ isActive }) =>
                    `flex items-center justify-center py-3 mx-2 rounded-lg mb-1 transition-colors ` +
                    (isActive ? "text-gray-900 font-semibold" : "text-white/80 hover:text-white hover:bg-white/10")
                  }
                  style={({ isActive }) => isActive ? { backgroundColor: accentColor, color: "#1a1a1a" } : {}}>
                  {item.icon}
                </NavLink>
              </NavTooltip>
            ) : (
              <NavLink to={item.to} aria-label={item.label}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 mx-2 rounded-lg mb-1 transition-colors text-sm font-medium ` +
                  (isActive ? "text-gray-900 font-semibold" : "text-white/80 hover:text-white hover:bg-white/10")
                }
                style={({ isActive }) => isActive ? { backgroundColor: accentColor, color: "#1a1a1a" } : {}}>
                {item.icon}
                <span>{item.label}</span>
              </NavLink>
            )}
          </div>
        ))}
      </nav>

      {/* Utilisateur connecté */}
      <div className="border-t border-white/10 px-2 py-3">
        {collapsed ? (
          <NavTooltip label={fullName || "Profil"}>
            <div className="flex justify-center">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ backgroundColor: accentColor, color: primaryColor }}
              >
                {initials}
              </div>
            </div>
          </NavTooltip>
        ) : (
          <div className="flex items-center gap-3 px-2">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
              style={{ backgroundColor: accentColor, color: primaryColor }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold truncate leading-tight">{fullName || "—"}</p>
              <p className="text-white/50 text-xs truncate">{t("participantRole")}</p>
            </div>
          </div>
        )}
      </div>

      {/* Bas : déconnexion + toggle */}
      <div className="border-t border-white/10 p-2 space-y-1">
        {collapsed ? (
          <NavTooltip label={t("logout")}>
            <button onClick={handleLogout} aria-label={t("logout")}
              className="flex items-center justify-center w-full py-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors">
              <LogOut size={20} />
            </button>
          </NavTooltip>
        ) : (
          <button onClick={handleLogout} aria-label={t("logout")}
            className="flex items-center gap-3 w-full px-4 py-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors">
            <LogOut size={20} />
            <span className="text-sm">{t("logout")}</span>
          </button>
        )}
        <button onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Étendre la sidebar" : "Réduire la sidebar"}
          className="flex items-center justify-center w-full py-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors">
          {collapsed ? <ChevronRight size={20} /> : <><ChevronLeft size={20} /><span className="ml-2 text-xs text-white/60">{t("collapse")}</span></>}
        </button>
        {!collapsed && (
          <div className="flex justify-center pt-1">
            <LanguageSwitcher className="text-white/70" />
          </div>
        )}
      </div>
    </aside>
  );
}
