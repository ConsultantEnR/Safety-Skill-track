import React, { useEffect, useState } from "react";
import PageShell from "../../components/PageShell";
import Sidebar from "../../components/Sidebar";
import { useAuth } from "../../contexts/AuthContext";
import { useBranding } from "../../contexts/BrandingContext";
import { useI18n } from "../../contexts/I18nContext";
import HelpRequestButton from "../../components/HelpRequestButton"; // ITER12
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { Users, Star, Download, ChevronDown, ChevronUp } from "lucide-react";
import toast from "react-hot-toast";

interface ScoreEntry { theme: string; themeEn?: string | null; score: number; }

interface DashboardData {
  employeeCount: number;
  radarData: ScoreEntry[];       // grand themes
  subThemeData: ScoreEntry[];    // sub-themes 1
  subSubThemeData: ScoreEntry[]; // sub-themes 2
  themes: { id: number; label: string }[];
  filters: {
    countries: string[];
    sites: string[];
    positions: string[];
    employeeList: { id: number; name: string }[];
  };
}

function StarRating({ score }: { score: number }) {
  const stars = Math.round((score / 100) * 5);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={14}
          fill={i <= stars ? "#FCC00E" : "none"}
          stroke={i <= stars ? "#FCC00E" : "#d1d5db"} />
      ))}
      <span className="ml-1 text-xs text-gray-500">{stars}/5</span>
    </div>
  );
}

function ScoreBar({ data, color, title, accentColor }: {
  data: ScoreEntry[]; color: string; title: string; accentColor: string;
}) {
  const { lang } = useI18n();
  const tlEntry = (item: ScoreEntry) => lang === "en" && item.themeEn ? item.themeEn : item.theme;
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
        <button onClick={() => setCollapsed(v => !v)} className="text-gray-400 hover:text-gray-600">
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>
      {!collapsed && (
        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {data.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
              <p className="text-sm text-gray-700 truncate flex-1 mr-3" title={tlEntry(item)}>{tlEntry(item)}</p>
              <div className="flex items-center gap-2 shrink-0">
                <StarRating score={item.score} />
                <div className="w-16 bg-gray-100 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${item.score}%`, backgroundColor: accentColor }} />
                </div>
                <span className="text-xs text-gray-500 w-10 text-right">{item.score}%</span>
              </div>
            </div>
          ))}
          {data.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">Aucune donnée</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const { accessToken } = useAuth();
  const branding = useBranding();
  const { t, lang } = useI18n();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterCountry, setFilterCountry]   = useState("");
  const [filterSite, setFilterSite]         = useState("");
  const [filterPosition, setFilterPosition] = useState("");
  const [filterEmployee, setFilterEmployee] = useState("");

  // Export-specific extra filters
  const [filterTheme, setFilterTheme]         = useState("");
  const [filterSubTheme, setFilterSubTheme]   = useState("");
  const [filterSubSubTheme, setFilterSubSubTheme] = useState("");
  const [showExportFilters, setShowExportFilters] = useState(false);
  const [showExportMenu, setShowExportMenu]       = useState(false); // ITER12

  const [exporting, setExporting] = useState(false);
  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  async function loadDashboard(params?: Record<string, string>) {
    if (!accessToken) return;
    setLoading(true);
    try {
      const p = new URLSearchParams();
      const filters = params || { country: filterCountry, site: filterSite, position: filterPosition, employeeId: filterEmployee };
      Object.entries(filters).forEach(([k, v]) => { if (v) p.set(k, v); });
      const res = await fetch(`/api/admin/dashboard${p.toString() ? "?" + p.toString() : ""}`, { headers: authHeaders });
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      toast.error("Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadDashboard(); }, [accessToken]);

  function applyFilters() {
    loadDashboard({ country: filterCountry, site: filterSite, position: filterPosition, employeeId: filterEmployee });
  }

  // ITER12: format = "excel" | "pdf"
  async function handleExport(format: "excel" | "pdf" = "excel") {
    setExporting(true);
    setShowExportMenu(false);
    try {
      const p = new URLSearchParams();
      if (filterCountry)    p.set("country",     filterCountry);
      if (filterSite)       p.set("site",        filterSite);
      if (filterPosition)   p.set("position",    filterPosition);
      if (filterEmployee)   p.set("employeeId",  filterEmployee);
      if (filterTheme)      p.set("theme",       filterTheme);
      if (filterSubTheme)   p.set("subTheme",    filterSubTheme);
      if (filterSubSubTheme) p.set("subSubTheme", filterSubSubTheme);
      if (format === "pdf") p.set("format", "pdf");
      const url = `/api/admin/dashboard/export${p.toString() ? "?" + p.toString() : ""}`;
      if (format === "pdf") {
        // Open in new tab → triggers browser print dialog
        const win = window.open("about:blank", "_blank");
        const res = await fetch(url, { headers: authHeaders });
        if (!res.ok) throw new Error();
        const html = await res.text();
        win?.document.write(html);
        win?.document.close();
      } else {
        const res = await fetch(url, { headers: authHeaders });
        if (!res.ok) throw new Error();
        const blob = await res.blob();
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `resultats_${new Date().toISOString().split("T")[0]}.xlsx`;
        link.click();
        URL.revokeObjectURL(link.href);
      }
    } catch {
      toast.error("Erreur lors de l'export");
    } finally {
      setExporting(false);
    }
  }

  const radarDataForChart = (data?.radarData || []).map(r => {
    const label = lang === "en" && r.themeEn ? r.themeEn : r.theme;
    return { subject: label.length > 18 ? label.slice(0, 18) + "…" : label, fullLabel: label, score: r.score };
  });

  const barDataSub1 = (data?.subThemeData || []).map(r => {
    const label = lang === "en" && r.themeEn ? r.themeEn : r.theme;
    return { name: label.length > 22 ? label.slice(0, 22) + "…" : label, score: r.score };
  });

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <PageShell>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold" style={{ color: branding.primaryColor }}>
            {t("dashboard")}
          </h1>
          {/* ITER12: Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(v => !v)}
              disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Download size={15} />
              {exporting ? t("exporting") : t("exportResults")}
              <ChevronDown size={14} />
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl shadow-lg border border-gray-100 z-10 overflow-hidden">
                <button
                  onClick={() => handleExport("excel")}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Download size={14} /> {t("exportExcel")}
                </button>
                <button
                  onClick={() => handleExport("pdf")}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Download size={14} /> {t("exportPdf")}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Main filters */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t("country")}</label>
              <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">Tous</option>
                {(data?.filters.countries || []).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t("site")}</label>
              <select value={filterSite} onChange={e => setFilterSite(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">Tous</option>
                {(data?.filters.sites || []).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t("position")}</label>
              <select value={filterPosition} onChange={e => setFilterPosition(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">Tous</option>
                {(data?.filters.positions || []).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t("employee")}</label>
              <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">Tous</option>
                {(data?.filters.employeeList || []).map(e => <option key={e.id} value={String(e.id)}>{e.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between mt-3">
            <button type="button" onClick={() => setShowExportFilters(v => !v)}
              className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
              {showExportFilters ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              Filtres export supplémentaires (thèmes)
            </button>
            <button onClick={applyFilters}
              className="px-4 py-2 text-sm text-white rounded-lg font-medium"
              style={{ backgroundColor: branding.primaryColor }}>
              {t("filter")}
            </button>
          </div>
          {showExportFilters && (
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-gray-100">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t("grandTheme")}</label>
                <select value={filterTheme} onChange={e => setFilterTheme(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">Tous</option>
                  {(data?.radarData || []).map(r => <option key={r.theme} value={r.theme}>{r.theme}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t("subTheme1")}</label>
                <select value={filterSubTheme} onChange={e => setFilterSubTheme(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">Tous</option>
                  {(data?.subThemeData || []).map(r => <option key={r.theme} value={r.theme}>{r.theme}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t("subTheme2")}</label>
                <select value={filterSubSubTheme} onChange={e => setFilterSubSubTheme(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">Tous</option>
                  {(data?.subSubThemeData || []).map(r => <option key={r.theme} value={r.theme}>{r.theme}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Stat card */}
        {data && (
          <div className="bg-white rounded-xl shadow-sm p-5 flex items-center gap-4 mb-5 max-w-xs">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${branding.primaryColor}20` }}>
              <Users size={24} style={{ color: branding.primaryColor }} />
            </div>
            <div>
              <p className="text-sm text-gray-500">{t("activeEmployees")}</p>
              <p className="text-3xl font-bold" style={{ color: branding.primaryColor }}>{data.employeeCount}</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center text-gray-400 py-12">{t("loading")}</div>
        ) : data && (
          <div className="space-y-6">
            {/* Row 1: Radar + Grand theme detail */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-base font-semibold text-gray-800 mb-4">{t("scoresByTheme")}</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={radarDataForChart}>
                    <PolarGrid stroke="#e5e7eb" />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "#6b7280" }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10, fill: "#9ca3af" }} />
                    <Radar name="Score" dataKey="score"
                      stroke={branding.primaryColor} fill={branding.primaryColor} fillOpacity={0.3} strokeWidth={2} />
                    <Tooltip formatter={(v: any, _n: any, p: any) => [`${v}%`, p.payload.fullLabel || "Score"]}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <ScoreBar data={data.radarData} color={branding.primaryColor}
                title={t("themeDetails")} accentColor={branding.accentColor} />
            </div>

            {/* Row 2: Sub-theme 1 bar chart */}
            {data.subThemeData.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-base font-semibold text-gray-800 mb-4">{t("subTheme1")} — scores moyens</h2>
                <ResponsiveContainer width="100%" height={Math.max(200, barDataSub1.length * 40)}>
                  <BarChart data={barDataSub1} layout="vertical" margin={{ left: 8, right: 24, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
                    <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11, fill: "#6b7280" }} />
                    <Tooltip formatter={(v: any) => [`${v}%`, "Score"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="score" fill={branding.primaryColor} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Row 3: Sub-theme 2 detail */}
            {data.subSubThemeData.length > 0 && (
              <ScoreBar data={data.subSubThemeData} color={branding.primaryColor}
                title={`${t("subTheme2")} — ${t("scoresByTheme")}`} accentColor={branding.accentColor} />
            )}
          </div>
        )}
      </PageShell>
      <HelpRequestButton /> {/* ITER12 */}
    </div>
  );
}
