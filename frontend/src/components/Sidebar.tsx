import React, { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, HelpCircle, Building2, Settings, ClipboardList,
  ClipboardCheck, Users, ChevronLeft, ChevronRight, LogOut, MessageSquare, Bell,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useBranding } from "../contexts/BrandingContext";
import { useI18n } from "../contexts/I18nContext"; // ITER10: i18n nav labels
import toast from "react-hot-toast";
import LanguageSwitcher from "./LanguageSwitcher"; // ITER7: changement de langue

interface NavItem { to: string; icon: React.ReactNode; label: string; }

const SA_PRIMARY = "#27295A";
const SA_ACCENT  = "#FCC00E";
const AEGIDE_LOGO_WHITE = "https://www.aegide-international.com/wp-content/uploads/2023/02/Aegide-Dolfines-White-light.png";
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

export default function Sidebar() {
  const { user, logout } = useAuth();
  const branding = useBranding();
  const { t } = useI18n(); // ITER10
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebar_collapsed") === "true");
  const [unreadCount, setUnreadCount] = useState(0);
  const [responsesCount, setResponsesCount] = useState(0); // ITER8: badge réponses SA

  useEffect(() => { localStorage.setItem("sidebar_collapsed", String(collapsed)); }, [collapsed]);

  // ITER8: Compteur de réponses non analysées pour SUPER_ADMIN
  useEffect(() => {
    if (user?.role !== "SUPER_ADMIN") return;
    function fetchResponsesCount() {
      const stored = JSON.parse(localStorage.getItem("auth") || "{}");
      if (!stored?.accessToken) return;
      fetch("/api/super-admin/responses/count", { headers: { Authorization: `Bearer ${stored.accessToken}` } })
        .then(r => r.ok ? r.json() : { count: 0 })
        .then((d: { count: number }) => setResponsesCount(d.count))
        .catch(() => {});
    }
    fetchResponsesCount();
    const interval = setInterval(fetchResponsesCount, 60000); // toutes les 60s
    return () => clearInterval(interval);
  }, [user]);

  // ITER7: Load unread notification count for CLIENT_ADMIN — polling toutes les 30s
  useEffect(() => {
    if (user?.role !== "CLIENT_ADMIN") return;

    function fetchNotifications() {
      const stored = JSON.parse(localStorage.getItem("auth") || "{}");
      if (!stored?.accessToken) return;
      fetch("/api/admin/notifications", { headers: { Authorization: `Bearer ${stored.accessToken}` } })
        .then(r => r.ok ? r.json() : [])
        // ITER10: exclure TEST_COMPLETED du badge "Mes messages"
        .then((ns: any[]) => setUnreadCount(ns.filter(n => !n.isRead && n.type !== "TEST_COMPLETED").length))
        .catch(() => {});
    }

    fetchNotifications(); // appel immédiat au chargement
    const interval = setInterval(fetchNotifications, 30000); // polling toutes les 30s
    return () => clearInterval(interval);
  }, [user]);

  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  // ITER10: nav arrays inside component so labels react to language changes
  const superAdminNav: NavItem[] = [
    { to: "/super-admin/dashboard", icon: <LayoutDashboard size={20} />, label: t("dashboard") },
    { to: "/super-admin/questions", icon: <HelpCircle size={20} />,       label: t("questions") },
    { to: "/super-admin/tests",     icon: <ClipboardList size={20} />,    label: t("tests") },
    { to: "/super-admin/clients",   icon: <Building2 size={20} />,        label: t("companies") },
    { to: "/super-admin/responses", icon: <MessageSquare size={20} />,    label: t("responses") },
    { to: "/super-admin/messages",  icon: <MessageSquare size={20} />,    label: t("messages") },
    { to: "/super-admin/settings",  icon: <Settings size={20} />,         label: t("settings") },
  ];
  const adminNav: NavItem[] = [
    { to: "/admin/dashboard",  icon: <LayoutDashboard size={20} />, label: t("dashboard") },
    { to: "/admin/tests",      icon: <ClipboardCheck size={20} />,  label: t("myTests") },
    { to: "/admin/employees",  icon: <Users size={20} />,           label: t("employees") },
    { to: "/admin/messages",   icon: <MessageSquare size={20} />,   label: t("messages") },
    { to: "/admin/settings",   icon: <Settings size={20} />,        label: t("settings") },
  ];
  const nav = isSuperAdmin ? superAdminNav : adminNav;

  // Super Admin: use platform branding (primaryColor from branding context)
  // Client Admin: use client branding
  // The branding context now handles the role-aware fetch
  const primaryColor = isSuperAdmin ? SA_PRIMARY : branding.primaryColor;
  const accentColor  = isSuperAdmin ? SA_ACCENT  : branding.accentColor;
  // FIX: Show logo for both Super Admin (platform logo) and Client Admin (client logo)
  const logoUrl = branding.logoUrl;

  async function handleLogout() {
    await logout();
    toast.success("Déconnecté");
    navigate("/login");
  }

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
      {/* Logo / Titre */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="w-8 h-8 object-contain shrink-0 rounded" />
        ) : isSuperAdmin ? (
          <img src={AEGIDE_LOGO_WHITE} alt="Aegide" className={collapsed ? "h-6 object-contain shrink-0" : "h-7 object-contain shrink-0"} />
        ) : (
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{ backgroundColor: accentColor, color: primaryColor }}
          >
            S
          </div>
        )}
        {!collapsed && (
          <span className="text-white font-bold text-sm truncate">Safety Skill Track</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden">
        {nav.map(item => (
          <div key={item.to}>
            {collapsed ? (
              <NavTooltip label={item.label}>
                <NavLink
                  to={item.to}
                  aria-label={item.label}
                  className={({ isActive }) =>
                    `flex items-center justify-center py-3 mx-2 rounded-lg mb-1 transition-colors relative ` +
                    (isActive ? "text-gray-900 font-semibold" : "text-white/80 hover:text-white hover:bg-white/10")
                  }
                  style={({ isActive }) => isActive ? { backgroundColor: accentColor, color: "#1a1a1a" } : {}}
                >
                  {item.icon}
                  {item.to.includes("messages") && unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center leading-none">
                      {unreadCount}
                    </span>
                  )}
                  {/* ITER8: badge réponses SA */}
                  {item.to.includes("responses") && responsesCount > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center leading-none">
                      {responsesCount > 99 ? "99+" : responsesCount}
                    </span>
                  )}
                </NavLink>
              </NavTooltip>
            ) : (
              <NavLink
                to={item.to}
                aria-label={item.label}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 mx-2 rounded-lg mb-1 transition-colors text-sm font-medium ` +
                  (isActive ? "text-gray-900 font-semibold" : "text-white/80 hover:text-white hover:bg-white/10")
                }
                style={({ isActive }) => isActive ? { backgroundColor: accentColor, color: "#1a1a1a" } : {}}
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
                {item.to.includes("messages") && unreadCount > 0 && (
                  <span className="w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center leading-none">
                    {unreadCount}
                  </span>
                )}
                {/* ITER8: badge réponses SA (mode étendu) */}
                {item.to.includes("responses") && responsesCount > 0 && (
                  <span className="w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center leading-none">
                    {responsesCount > 99 ? "99+" : responsesCount}
                  </span>
                )}
              </NavLink>
            )}
          </div>
        ))}
      </nav>

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
        <button onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Étendre" : t("collapse")}
          className="flex items-center justify-end w-full px-3 py-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors">
          {collapsed ? <ChevronRight size={20} /> : <><span className="text-xs text-white/60 mr-1">{t("collapse")}</span><ChevronLeft size={20} /></>}
        </button>
        {/* ITER7: sélecteur de langue en bas de sidebar */}
        {collapsed ? (
          <div className="flex justify-center pt-1">
            <LanguageSwitcher dark compact />
          </div>
        ) : (
          <div className="flex justify-end pt-1 px-1">
            <LanguageSwitcher dark />
          </div>
        )}
      </div>
    </aside>
  );
}
