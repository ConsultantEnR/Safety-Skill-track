import React, { useEffect, useState } from "react";
import Sidebar from "../../components/Sidebar";
import PageShell from "../../components/PageShell";
import { useAuth } from "../../contexts/AuthContext";
import { useBranding } from "../../contexts/BrandingContext";
import { useI18n } from "../../contexts/I18nContext"; // ITER9
import { useNavigate } from "react-router-dom"; // ITER9
import { Building2, Users, ClipboardList, Clock, CheckCircle, AlertCircle } from "lucide-react"; // ITER9

// ITER9: Extended stats interface
interface Stats {
  clientCount: number;
  employeeCount: number;
  assignedCount: number; // ITER9
  inProgressCount: number; // ITER9
  completedCount: number; // ITER9
  openResponsesCount: number; // ITER9
  scenarioResponsesCount: number; // ITER9
}

// ITER9: Client for filter dropdown
interface Client { id: number; name: string; }

function StatCard({
  title,
  value,
  icon,
  iconBg,
  iconColor,
  onClick,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  onClick?: () => void;
}) {
  const clickable = Boolean(onClick);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`bg-white rounded-xl shadow-sm p-6 flex items-center gap-4 transition-all duration-200 hover:shadow-lg hover:-translate-y-1 text-left w-full ${
        clickable ? "cursor-pointer" : "cursor-default"
      }`}
    >
      <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ backgroundColor: iconBg }}>
        <div style={{ color: iconColor }}>{icon}</div>
      </div>
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-3xl font-bold" style={{ color: iconColor }}>{value}</p>
      </div>
    </button>
  );
}

export default function SuperAdminDashboard() {
  const { accessToken } = useAuth();
  const branding = useBranding();
  const { t } = useI18n(); // ITER9
  const navigate = useNavigate(); // ITER9

  // ITER9: Extended stats state
  const [stats, setStats] = useState<Stats>({
    clientCount: 0, employeeCount: 0,
    assignedCount: 0, inProgressCount: 0, completedCount: 0,
    openResponsesCount: 0, scenarioResponsesCount: 0,
  });

  // ITER9: Client filter state
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");

  // ITER9: Fetch client list for filter
  useEffect(() => {
    if (!accessToken) return;
    fetch("/api/super-admin/clients?lite=1", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(r => r.ok ? r.json() : [])
      .then((data: any[]) => setClients(data.map((c: any) => ({ id: c.id, name: c.name }))))
      .catch(() => {});
  }, [accessToken]);

  // ITER9: Fetch stats — re-fetch when clientId changes
  useEffect(() => {
    if (!accessToken) return;
    const params = new URLSearchParams();
    if (selectedClientId) params.set("clientId", selectedClientId); // ITER9
    fetch(`/api/super-admin/stats?${params.toString()}`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(r => r.json())
      .then(data => setStats(data))
      .catch(() => {});
  }, [accessToken, selectedClientId]); // ITER9: dependency on selectedClientId

  // ITER9: Combined responses count
  const totalResponses = stats.openResponsesCount + stats.scenarioResponsesCount; // ITER9

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <PageShell>

        <h1 className="text-2xl font-bold mb-4" style={{ color: branding.primaryColor }}>
          {t("dashboard")}
        </h1>

        {/* ITER9: Client filter dropdown */}
        <div className="mb-6">
          <select
            value={selectedClientId}
            onChange={e => setSelectedClientId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
            style={{ minWidth: 220 }}
          >
            <option value="">{t("allClients")}</option>
            {clients.map(c => (
              <option key={c.id} value={String(c.id)}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* ITER9: 6-card grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

          {/* Card 1 — Entreprises clientes */}
          <StatCard
            title={t("clientCompanies")}
            value={stats.clientCount}
            icon={<Building2 size={28} />}
            iconBg={`${branding.primaryColor}15`}
            iconColor={branding.primaryColor}
            onClick={() => navigate("/super-admin/clients")}
          />

          {/* Card 2 — Salariés inscrits */}
          <StatCard
            title={t("registeredEmployees")}
            value={stats.employeeCount}
            icon={<Users size={28} />}
            iconBg={`${branding.accentColor}30`}
            iconColor={branding.primaryColor}
            onClick={() => navigate("/super-admin/clients")}
          />

          {/* ITER9: Card 3 — Tests assignés */}
          <StatCard
            title={t("assignedTests")}
            value={stats.assignedCount}
            icon={<ClipboardList size={28} />}
            iconBg={`${branding.primaryColor}15`}
            iconColor={branding.primaryColor}
            onClick={() => navigate("/super-admin/tests")}
          />

          {/* ITER9: Card 4 — Tests en cours */}
          <StatCard
            title={t("testsInProgress")}
            value={stats.inProgressCount}
            icon={<Clock size={28} />}
            iconBg={`${branding.accentColor}35`}
            iconColor={branding.primaryColor}
            onClick={() => navigate("/super-admin/tests")}
          />

          {/* ITER9: Card 5 — Tests terminés */}
          <StatCard
            title={t("testsCompleted")}
            value={stats.completedCount}
            icon={<CheckCircle size={28} />}
            iconBg={`${branding.primaryColor}15`}
            iconColor={branding.primaryColor}
            onClick={() => navigate("/super-admin/tests")}
          />

          {/* ITER9: Card 6 — Réponses à analyser (clickable) */}
          <div
            className="bg-white rounded-xl shadow-sm p-6 flex flex-col gap-3 cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-1 border-2 border-transparent"
            style={{ ["--tw-border-opacity" as any]: 1 }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = `${branding.accentColor}80`)}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "transparent")}
            onClick={() => navigate("/super-admin/responses")}
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${branding.accentColor}35` }}>
                <AlertCircle size={28} style={{ color: branding.accentColor }} />
              </div>
              <div>
                <p className="text-sm text-gray-500">{t("openResponsesToReview")}</p>
                <p className="text-3xl font-bold" style={{ color: branding.primaryColor }}>{totalResponses}</p>
              </div>
            </div>
            {/* ITER9: Sub-cards breakdown */}
            <div className="flex gap-2 pt-1 border-t border-gray-100">
              <button
                className="flex-1 text-xs text-center py-1.5 px-2 rounded-lg transition-colors"
                style={{ backgroundColor: `${branding.primaryColor}12`, color: branding.primaryColor }}
                onClick={e => { e.stopPropagation(); navigate("/super-admin/responses", { state: { tab: "OPEN" } }); }}
              >
                {t("openQuestionsCount")}: {stats.openResponsesCount}
              </button>
              <button
                className="flex-1 text-xs text-center py-1.5 px-2 rounded-lg transition-colors"
                style={{ backgroundColor: `${branding.accentColor}25`, color: branding.primaryColor }}
                onClick={e => { e.stopPropagation(); navigate("/super-admin/responses", { state: { tab: "SCENARIO" } }); }}
              >
                {t("scenariosToReview")}: {stats.scenarioResponsesCount}
              </button>
            </div>
          </div>

        </div>
      </PageShell>
    </div>
  );
}
