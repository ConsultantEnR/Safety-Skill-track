// ITER8: Page "Réponses à analyser" Super Admin — liste et correction des réponses OPEN/SCENARIO
// ITER9: Ajout filtres hiérarchiques thème/sous-thème, filtre salarié, i18n complet
import React, { useEffect, useState } from "react";
import PageShell from "../../components/PageShell";
import Sidebar from "../../components/Sidebar";
import { useAuth } from "../../contexts/AuthContext";
import { useI18n } from "../../contexts/I18nContext"; // ITER9
import { useLocation } from "react-router-dom"; // ITER9
import toast from "react-hot-toast";
import { Eye, CheckCircle, Filter, X } from "lucide-react";

// ITER8: Interface pour une réponse ouverte (OPEN ou SCENARIO)
interface OpenResponse {
  id: number;
  questionType: string;
  responseText: string;
  reviewerFeedback: string | null;
  score: number | null;
  isReviewed: boolean;
  reviewedAt: string | null;
  createdAt: string;
  employee: {
    id: number;
    firstName: string;
    lastName: string;
    client: { id: number; name: string };
  };
  question: {
    id: number;
    text: string;
    level: string;
    subSubTheme: {
      label: string;
      subTheme: { label: string; nameEn?: string | null; theme: { label: string; nameEn?: string | null } };
    };
  };
  session: { id: number; testId: number };
}

// ITER8: Interface pour un client (entreprise)
interface Client { id: number; name: string; }

// ITER9: Interfaces pour les thèmes
interface SubSubTheme { id: number; label: string; subThemeId: number; }
interface SubTheme { id: number; label: string; nameEn?: string | null; themeId: number; subSubThemes: SubSubTheme[]; }
interface Theme { id: number; label: string; nameEn?: string | null; subThemes: SubTheme[]; }

// ITER9: Interface pour un salarié filtré
interface EmployeeOption { id: number; firstName: string; lastName: string; }

const SA_PRIMARY = "#27295A";

export default function SuperAdminResponses() {
  const { accessToken } = useAuth();
  const { t, lang } = useI18n(); // ITER9
  const tl = (item: { label: string; nameEn?: string | null }) =>
    lang === "en" && item.nameEn ? item.nameEn : item.label;
  const location = useLocation(); // ITER9: pour lire le state tab depuis le dashboard

  // ITER9: Initialiser l'onglet depuis le state de navigation si disponible
  // ITER11: ajout onglet HISTORIQUE
  const [activeTab, setActiveTab] = useState<"SCENARIO" | "OPEN" | "HISTORIQUE">(() => {
    const navState = (location.state as any)?.tab;
    return navState === "OPEN" ? "OPEN" : navState === "HISTORIQUE" ? "HISTORIQUE" : "SCENARIO";
  });
  const [viewOnly, setViewOnly] = useState(false);

  // ITER8: Filtres existants
  const [clientId, setClientId] = useState<string>("");
  const [reviewedFilter, setReviewedFilter] = useState<string>("");

  // ITER9: Nouveaux filtres hiérarchiques
  const [themeId, setThemeId] = useState<string>("");
  const [subThemeId, setSubThemeId] = useState<string>("");
  const [subSubThemeId, setSubSubThemeId] = useState<string>("");
  const [employeeId, setEmployeeId] = useState<string>("");

  // ITER8: Données
  const [responses, setResponses] = useState<OpenResponse[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);

  // ITER9: Données pour les filtres hiérarchiques
  const [themes, setThemes] = useState<Theme[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  // ITER8: Modal d'analyse
  const [selected, setSelected] = useState<OpenResponse | null>(null);
  const [feedback, setFeedback] = useState("");
  const [score, setScore] = useState<number | "">(0);
  const [submitting, setSubmitting] = useState(false);

  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  // ITER8: Chargement de la liste des entreprises
  useEffect(() => {
    if (!accessToken) return;
    fetch("/api/super-admin/clients", { headers: authHeaders })
      .then(r => r.ok ? r.json() : [])
      .then((data: any[]) => setClients(data.map(c => ({ id: c.id, name: c.name }))))
      .catch(() => {});
  }, [accessToken]);

  // ITER9: Chargement des thèmes pour les filtres hiérarchiques
  useEffect(() => {
    if (!accessToken) return;
    fetch("/api/super-admin/themes", { headers: authHeaders })
      .then(r => r.ok ? r.json() : [])
      .then((data: Theme[]) => setThemes(data))
      .catch(() => {});
  }, [accessToken]);

  // ITER9: Chargement des salariés quand clientId change
  useEffect(() => {
    if (!accessToken || !clientId) { setEmployees([]); setEmployeeId(""); return; }
    fetch(`/api/super-admin/clients/${clientId}/employees`, { headers: authHeaders })
      .then(r => r.ok ? r.json() : [])
      .then((data: any[]) => setEmployees(data.map((e: any) => ({ id: e.id, firstName: e.firstName, lastName: e.lastName }))))
      .catch(() => {});
  }, [accessToken, clientId]);

  // ITER9: Calcul des listes dérivées pour les filtres hiérarchiques
  const filteredSubThemes: SubTheme[] = themeId
    ? (themes.find(t => t.id === Number(themeId))?.subThemes || [])
    : [];
  const filteredSubSubThemes: SubSubTheme[] = subThemeId
    ? (filteredSubThemes.find(st => st.id === Number(subThemeId))?.subSubThemes || [])
    : [];

  // ITER8: Chargement des réponses selon les filtres
  function fetchResponses() {
    if (!accessToken) return;
    setLoading(true);
    const params = new URLSearchParams();
    // ITER11: HISTORIQUE = toutes les réponses analysées (pas de filtre type)
    if (activeTab !== "HISTORIQUE") {
      params.set("type", activeTab);
      if (reviewedFilter !== "") params.set("reviewed", reviewedFilter);
    } else {
      params.set("reviewed", "true");
    }
    if (clientId) params.set("clientId", clientId);
    if (subSubThemeId) params.set("subSubThemeId", subSubThemeId); // ITER9
    if (subThemeId && !subSubThemeId) params.set("subThemeId", subThemeId); // ITER9
    if (employeeId) params.set("employeeId", employeeId); // ITER9

    fetch(`/api/super-admin/responses?${params.toString()}`, { headers: authHeaders })
      .then(r => r.ok ? r.json() : [])
      .then((data: OpenResponse[]) => setResponses(data))
      .catch(() => toast.error(t("loadingError")))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchResponses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, activeTab, clientId, reviewedFilter, subSubThemeId, subThemeId, employeeId]); // ITER9

  // ITER8: Ouverture du modal
  function openModal(resp: OpenResponse) {
    setSelected(resp);
    setFeedback(resp.reviewerFeedback || "");
    setScore(resp.score ?? 0);
    setViewOnly(false);
  }

  // ITER11: Ouverture en lecture seule (onglet Historique)
  function openViewModal(resp: OpenResponse) {
    setSelected(resp);
    setFeedback(resp.reviewerFeedback || "");
    setScore(resp.score ?? 0);
    setViewOnly(true);
  }

  function closeModal() {
    setSelected(null);
    setFeedback("");
    setScore(0);
    setViewOnly(false);
  }

  // ITER8: Soumission du feedback
  async function handleValidate(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/super-admin/responses/${selected.id}/review`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ reviewerFeedback: feedback, score: Number(score) }),
      });
      if (!res.ok) throw new Error();
      toast.success(t("responseAnalyzed"));
      closeModal();
      fetchResponses();
    } catch {
      toast.error(t("validationError"));
    } finally {
      setSubmitting(false);
    }
  }

  function truncate(text: string, max = 80) {
    return text.length > max ? text.slice(0, max) + "…" : text;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <PageShell>
        {/* En-tête */}
        <h1 className="text-2xl font-bold mb-6" style={{ color: SA_PRIMARY }}>
          {t("responsesToReview")}
        </h1>

        {/* ITER9: Onglets i18n — ITER11: ajout onglet Historique */}
        <div className="flex gap-2 mb-6">
          {(["SCENARIO", "OPEN", "HISTORIQUE"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === tab
                  ? "text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
              style={activeTab === tab ? { backgroundColor: SA_PRIMARY } : {}}
            >
              {tab === "SCENARIO" ? t("scenario") : tab === "OPEN" ? t("openQuestion") : t("historique")}
            </button>
          ))}
        </div>

        {/* ITER9: Filtres hiérarchiques thèmes */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-center">
          <Filter size={16} className="text-gray-400" />
          {/* Filtre Grand thème */}
          <select
            value={themeId}
            onChange={e => { setThemeId(e.target.value); setSubThemeId(""); setSubSubThemeId(""); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
            style={{ minWidth: 160 }}
          >
            <option value="">{t("allThemes")}</option>
            {themes.map(th => (
              <option key={th.id} value={String(th.id)}>{tl(th)}</option>
            ))}
          </select>

          {/* Filtre Sous-thème 1 */}
          <select
            value={subThemeId}
            onChange={e => { setSubThemeId(e.target.value); setSubSubThemeId(""); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
            style={{ minWidth: 160 }}
            disabled={!themeId}
          >
            <option value="">{t("allSubThemes")}</option>
            {filteredSubThemes.map(st => (
              <option key={st.id} value={String(st.id)}>{tl(st)}</option>
            ))}
          </select>

          {/* Filtre Sous-thème 2 / Domaine de compétence */}
          <select
            value={subSubThemeId}
            onChange={e => setSubSubThemeId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
            style={{ minWidth: 180 }}
            disabled={!subThemeId}
          >
            <option value="">{t("allSubSubThemes")}</option>
            {filteredSubSubThemes.map(sst => (
              <option key={sst.id} value={String(sst.id)}>{sst.label}</option>
            ))}
          </select>
        </div>

        {/* ITER8+ITER9: Filtres entreprise, salarié et statut */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex flex-wrap gap-4 items-center">
          <Filter size={18} className="text-gray-400" />

          {/* Filtre entreprise */}
          <select
            value={clientId}
            onChange={e => { setClientId(e.target.value); setEmployeeId(""); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
            style={{ minWidth: 180 }}
          >
            <option value="">{t("allCompanies")}</option>
            {clients.map(c => (
              <option key={c.id} value={String(c.id)}>{c.name}</option>
            ))}
          </select>

          {/* ITER9: Filtre salarié (visible seulement si un client est sélectionné) */}
          {clientId && (
            <select
              value={employeeId}
              onChange={e => setEmployeeId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
              style={{ minWidth: 180 }}
            >
              <option value="">{t("allEmployees")}</option>
              {employees.map(emp => (
                <option key={emp.id} value={String(emp.id)}>{emp.firstName} {emp.lastName}</option>
              ))}
            </select>
          )}

          {/* Filtre statut d'analyse */}
          <select
            value={reviewedFilter}
            onChange={e => setReviewedFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
            style={{ minWidth: 160 }}
          >
            <option value="">{t("allStatuses")}</option>
            <option value="false">{t("toAnalyze")}</option>
            <option value="true">{t("analyzed")}</option>
          </select>

          <span className="ml-auto text-sm text-gray-500">
            {responses.length} {t("responsesToReview").toLowerCase().replace("réponses à analyser", "réponse").replace("responses to review", "response")}{responses.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* ITER8: Tableau des réponses */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-400">{t("loading")}</div>
          ) : responses.length === 0 ? (
            <div className="p-12 text-center text-gray-400">{t("noResponseFound")}</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">{t("employee")}</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">{t("company")}</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">{t("theme")}</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">{t("question")}</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">{t("date")}</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">{t("status")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {responses.map(resp => (
                  <tr key={resp.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {resp.employee.firstName} {resp.employee.lastName}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{resp.employee.client.name}</td>
                    <td className="px-4 py-3 text-gray-600">
                      <span className="text-xs text-gray-400">
                        {tl(resp.question.subSubTheme.subTheme.theme)}
                        {" › "}
                        {tl(resp.question.subSubTheme.subTheme)}
                        {" › "}
                        {resp.question.subSubTheme.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs">
                      {truncate(resp.question.text)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(resp.createdAt).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="px-4 py-3">
                      {resp.isReviewed ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                          <CheckCircle size={12} />
                          {t("reviewed")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">
                          {t("toReview")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => activeTab === "HISTORIQUE" ? openViewModal(resp) : openModal(resp)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-80"
                        style={{ backgroundColor: SA_PRIMARY }}
                        title={activeTab === "HISTORIQUE" ? t("viewResponse") : t("analyze")}
                      >
                        <Eye size={14} />
                        {activeTab === "HISTORIQUE" ? t("viewResponse") : t("analyze")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </PageShell>

      {/* ITER8+ITER9: Modal d'analyse — ITER11: read-only si viewOnly */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Header modal */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold" style={{ color: SA_PRIMARY }}>
                {viewOnly ? t("analyzedResponses") : t("analyzeResponse")}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-700 transition-colors">
                <X size={22} />
              </button>
            </div>

            <form onSubmit={handleValidate} className="px-6 py-5 space-y-5">
              {/* Infos contextuelles */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="text-gray-500 w-32 shrink-0">{t("employee")} :</span>
                  <span className="font-medium text-gray-800">
                    {selected.employee.firstName} {selected.employee.lastName}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 w-32 shrink-0">{t("company")} :</span>
                  <span className="text-gray-700">{selected.employee.client.name}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 w-32 shrink-0">{t("theme")} :</span>
                  <span className="text-gray-700">
                    {tl(selected.question.subSubTheme.subTheme.theme)}
                    {" › "}
                    {tl(selected.question.subSubTheme.subTheme)}
                    {" › "}
                    {selected.question.subSubTheme.label}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 w-32 shrink-0">{t("level")} :</span>
                  <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700">
                    {selected.question.level}
                  </span>
                </div>
                {/* ITER9: Niveau attendu du domaine de compétence */}
                <div className="flex gap-2">
                  <span className="text-gray-500 w-32 shrink-0">{t("expectedLevelLabel")} :</span>
                  <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-indigo-100 text-indigo-700">
                    {selected.question.level}
                  </span>
                </div>
              </div>

              {/* Texte complet de la question */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {t("question")}
                </label>
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-gray-800">
                  {selected.question.text}
                </div>
              </div>

              {/* Réponse du salarié */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {t("employeeResponse")}
                </label>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-wrap min-h-[80px]">
                  {selected.responseText || <span className="text-gray-400 italic">{t("noResponse")}</span>}
                </div>
              </div>

              {/* Feedback correcteur */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {t("reviewerFeedback")}
                </label>
                {viewOnly ? (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-wrap min-h-[80px]">
                    {feedback || <span className="text-gray-400 italic">{t("noResponse")}</span>}
                  </div>
                ) : (
                  <textarea
                    value={feedback}
                    onChange={e => setFeedback(e.target.value)}
                    rows={4}
                    placeholder={t("feedbackPlaceholder")}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none"
                    style={{ focusRingColor: SA_PRIMARY } as React.CSSProperties}
                  />
                )}
              </div>

              {/* ITER10: Note basée sur le niveau (1-5 pts) */}
              <div>
                {(() => {
                  const levelMax: Record<string, number> = { FONDAMENTAL: 1, BASIQUE: 2, INTERMEDIAIRE: 3, AVANCE: 4, COMPLET: 5 };
                  const maxScore = levelMax[selected?.question?.level ?? ""] ?? 5;
                  return (
                    <>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        {t("score")} /{maxScore}
                      </label>
                      {viewOnly ? (
                        <span className="inline-block px-3 py-1.5 rounded-lg text-sm font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          {score ?? "—"} / {maxScore}
                        </span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          max={maxScore}
                          step={1}
                          value={score}
                          onChange={e => setScore(e.target.value === "" ? "" : Number(e.target.value))}
                          className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                        />
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Boutons */}
              <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {viewOnly ? t("close") : t("cancel")}
                </button>
                {!viewOnly && (
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
                    style={{ backgroundColor: SA_PRIMARY }}
                  >
                    {submitting ? t("saving") : t("validate")}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
