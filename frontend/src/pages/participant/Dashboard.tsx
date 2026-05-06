import React, { useEffect, useState } from "react";
import PageShell from "../../components/PageShell";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useI18n } from "../../contexts/I18nContext"; // ITER9
import ParticipantSidebar from "./Sidebar";
import { resolveAssetUrl } from "../../lib/runtime";
import toast from "react-hot-toast";
import { ClipboardList, Play, RotateCcw, CheckCircle, HelpCircle, X } from "lucide-react";

interface SessionProgress {
  subSubThemeId: number;
  questionsAsked: number;
  correctCount: number;
  completed: boolean;
  passed: boolean;
  currentLevel: string;
  levelReached?: string;      // ITER10
  pointsEarned?: number;      // ITER10
  maxPoints?: number;         // ITER10
  subSubThemeLabel?: string;  // ITER12: enriched by backend
}

interface Session {
  id: number;
  status: string;
  timeRemaining: number | null;
  progress: SessionProgress[];
}

interface TestAssignment {
  id: number;
  testId: number;
  status: string;
  deadline: string | null;
  test: { id: number; name: string; description: string | null; competences: any[]; };
  session: Session | null;
}

interface Profile {
  firstName: string;
  lastName: string;
  client: { name: string; primaryColor: string; accentColor: string; logoUrl: string | null; };
}

// Graphique radar SVG simple
function RadarChart({ labels, values, maxValue, primaryColor, accentColor }: {
  labels: string[]; values: number[]; maxValue: number;
  primaryColor: string; accentColor: string;
}) {
  const n = labels.length;
  if (n < 3) return null;
  const cx = 160, cy = 160, r = 120;
  const angleStep = (2 * Math.PI) / n;
  const getPoint = (idx: number, radius: number) => {
    const angle = idx * angleStep - Math.PI / 2;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  };
  const gridLevels = [0.25, 0.5, 0.75, 1.0];
  return (
    <svg viewBox="0 0 320 320" className="w-full max-w-xs mx-auto">
      {/* Grille */}
      {gridLevels.map(lvl => {
        const pts = Array.from({ length: n }, (_, i) => getPoint(i, r * lvl));
        return <polygon key={lvl} points={pts.map(p => `${p.x},${p.y}`).join(" ")}
          fill="none" stroke="#e5e7eb" strokeWidth="1" />;
      })}
      {/* Axes */}
      {Array.from({ length: n }, (_, i) => {
        const outer = getPoint(i, r);
        return <line key={i} x1={cx} y1={cy} x2={outer.x} y2={outer.y} stroke="#e5e7eb" strokeWidth="1" />;
      })}
      {/* Zone des valeurs */}
      {(() => {
        const pts = values.map((v, i) => getPoint(i, r * Math.min(1, (v / maxValue))));
        return <polygon points={pts.map(p => `${p.x},${p.y}`).join(" ")}
          fill={accentColor + "55"} stroke={accentColor} strokeWidth="2" />;
      })()}
      {/* Points */}
      {values.map((v, i) => {
        const pt = getPoint(i, r * Math.min(1, (v / maxValue)));
        return <circle key={i} cx={pt.x} cy={pt.y} r="4" fill={primaryColor} />;
      })}
      {/* Labels */}
      {labels.map((label, i) => {
        const pt = getPoint(i, r + 20);
        return <text key={i} x={pt.x} y={pt.y} textAnchor="middle" dominantBaseline="middle"
          fontSize="9" fill="#374151" className="font-sans">
          {label.length > 12 ? label.substring(0, 12) + "…" : label}
        </text>;
      })}
    </svg>
  );
}

const LEVEL_SCORE: Record<string, number> = {
  FONDAMENTAL: 1, BASIQUE: 2, INTERMEDIAIRE: 3, AVANCE: 4, COMPLET: 5,
};

export default function ParticipantDashboard() {
  const { accessToken, user } = useAuth();
  const { t } = useI18n(); // ITER9
  const navigate = useNavigate();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [assignments, setAssignments] = useState<TestAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  // Besoin d'aide modal
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [helpSubject, setHelpSubject] = useState("");
  const [helpTestName, setHelpTestName] = useState("");
  const [helpSubTheme, setHelpSubTheme] = useState("");
  const [helpBody, setHelpBody] = useState("");
  const [sendingHelp, setSendingHelp] = useState(false);

  const authHeaders = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([
      fetch("/api/participant/profile", { headers: authHeaders }).then(r => r.json()),
      fetch("/api/participant/tests", { headers: authHeaders }).then(r => r.json()),
    ]).then(([prof, tests]) => {
      setProfile(prof);
      const mapped = (Array.isArray(tests) ? tests : []).map((a: any) => ({
        ...a,
        session: a.test?.sessions?.[0] || a.session || null,
      }));
      setAssignments(mapped);
    }).catch(() => toast.error("Erreur de chargement"))
      .finally(() => setLoading(false));
  }, [accessToken]);

  const primaryColor  = profile?.client?.primaryColor  || "#27295A";
  const accentColor   = profile?.client?.accentColor   || "#FCC00E";
  const logoUrl       = resolveAssetUrl(profile?.client?.logoUrl) || null;
  const companyName   = profile?.client?.name          || "";

  // Tests en attente ou en cours (accès rapide)
  const activeTests = assignments.filter(a => a.status !== "COMPLETED");
  const completedTests = assignments.filter(a => a.status === "COMPLETED");

  // ITER12: Données radar avec noms réels des sous-thèmes 2
  const radarData: { label: string; score: number }[] = [];
  for (const a of completedTests) {
    if (a.session?.progress) {
      for (const p of a.session.progress) {
        radarData.push({
          label: p.subSubThemeLabel || `${t("competencyDomain")} ${p.subSubThemeId}`,
          score: LEVEL_SCORE[p.levelReached || p.currentLevel] || 1,
        });
      }
    }
  }

  async function handleSendHelp(e: React.FormEvent) {
    e.preventDefault();
    setSendingHelp(true);
    try {
      const res = await fetch("/api/participant/messages", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          subject: helpSubject,
          testName: helpTestName || undefined,
          subSubThemeName: helpSubTheme || undefined,
          body: helpBody,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Message envoyé à votre administrateur !");
      setShowHelpModal(false);
      setHelpSubject(""); setHelpTestName(""); setHelpSubTheme(""); setHelpBody("");
    } catch {
      toast.error("Erreur lors de l'envoi du message");
    } finally {
      setSendingHelp(false);
    }
  }

  async function startOrResumeTest(a: TestAssignment) {
    try {
      const res = await fetch(`/api/participant/tests/${a.testId}/start`, {
        method: "POST", headers: authHeaders,
      });
      if (!res.ok) throw new Error();
      navigate("/participant/tests");
    } catch { toast.error("Impossible de démarrer le test"); }
  }

  if (loading) {
    return (
      <div className="flex h-screen" style={{ backgroundColor: primaryColor + "10" }}>
        <div className="flex-1 flex items-center justify-center text-gray-400">{t("loading")}</div> {/* ITER9 */}
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <ParticipantSidebar primaryColor={primaryColor} accentColor={accentColor} logoUrl={logoUrl} companyName={companyName} firstName={profile?.firstName} lastName={profile?.lastName} />
      <PageShell>
        {/* Salutation */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">
            Bonjour, {profile?.firstName} 👋
          </h1>
          {/* ITER9: "compétences" → "domaines de compétence" */}
          <p className="text-gray-500 mt-1">Voici votre tableau de bord de {t("competences").toLowerCase()} sécurité.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Radar chart */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            {/* ITER9: "Mes compétences" → "Mes domaines de compétence" */}
            <h2 className="text-base font-semibold text-gray-800 mb-4">Mes {t("competences").toLowerCase()}</h2>
            {radarData.length >= 3 ? (
              <RadarChart
                labels={radarData.map(d => d.label)}
                values={radarData.map(d => d.score)}
                maxValue={5}
                primaryColor={primaryColor}
                accentColor={accentColor}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ClipboardList size={40} className="text-gray-300 mb-3" />
                <p className="text-gray-400 text-sm">Aucun test terminé pour le moment.</p>
                {/* ITER9: "compétences" → "domaines de compétence" */}
                <p className="text-gray-300 text-xs mt-1">Complétez vos tests pour voir votre radar de {t("competences").toLowerCase()}.</p>
              </div>
            )}
          </div>

          {/* Accès rapide aux tests actifs */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Tests à réaliser</h2>
            {activeTests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle size={40} className="text-green-300 mb-3" />
                <p className="text-gray-400 text-sm">Tous vos tests sont terminés !</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeTests.map(a => {
                  const isInProgress = a.status === "IN_PROGRESS" || (a.session && a.session.status === "IN_PROGRESS");
                  const totalComp = new Set((a.test.competences || []).map((c: any) => c.subSubThemeId).filter(Boolean)).size || 0;
                  const doneComp = a.session?.progress?.filter(p => p.completed).length || 0;
                  return (
                    <div key={a.id} className="border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 truncate">{a.test.name}</p>
                          {a.test.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{a.test.description}</p>}
                          {/* ITER9: "Domaines de compétence" */}
                          <p className="text-xs text-gray-400 mt-1">{totalComp} {t("competences").toLowerCase()}</p>
                          {isInProgress && totalComp > 0 && (
                            <div className="mt-2">
                              <div className="flex justify-between text-xs text-gray-500 mb-1">
                                <span>Progression</span>
                                <span>{doneComp}/{totalComp}</span>
                              </div>
                              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all"
                                  style={{ width: `${(doneComp / totalComp) * 100}%`, backgroundColor: accentColor }} />
                              </div>
                            </div>
                          )}
                          {a.deadline && (
                            <p className="text-xs text-orange-500 mt-1">
                              Échéance : {new Date(a.deadline).toLocaleDateString("fr-FR")}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => startOrResumeTest(a)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-white text-xs font-semibold shrink-0"
                          style={{ backgroundColor: primaryColor }}>
                          {isInProgress ? <><RotateCcw size={12} /> Reprendre</> : <><Play size={12} /> Commencer</>}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Stats rapides */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="bg-white rounded-xl shadow-sm p-4 text-center">
            <p className="text-2xl font-bold" style={{ color: primaryColor }}>{assignments.length}</p>
            <p className="text-xs text-gray-500 mt-1">Tests assignés</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-amber-500">{activeTests.length}</p>
            <p className="text-xs text-gray-500 mt-1">En cours / à faire</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-green-500">{completedTests.length}</p>
            <p className="text-xs text-gray-500 mt-1">Terminés</p>
          </div>
        </div>

        {/* ITER12: Résultats par domaine de compétence */}
        {completedTests.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6 mt-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">{t("scoreBySkillArea")}</h2>
            <div className="space-y-6">
              {completedTests.map(a => (
                <div key={a.id}>
                  <p className="text-sm font-semibold text-gray-700 mb-3" style={{ color: primaryColor }}>
                    {a.test.name}
                  </p>
                  <div className="space-y-2">
                    {(a.session?.progress || []).map(p => {
                      const levelLabel: Record<string, string> = {
                        FONDAMENTAL: "Fondamental", BASIQUE: "Basique", INTERMEDIAIRE: "Intermédiaire",
                        AVANCE: "Avancé", COMPLET: "Complet",
                      };
                      const displayLevel = levelLabel[p.levelReached || p.currentLevel] || p.levelReached || p.currentLevel;
                      const domainName = p.subSubThemeLabel || `${t("competencyDomain")} ${p.subSubThemeId}`;
                      return (
                        <div key={p.subSubThemeId}
                          className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 text-sm">
                          <span className="font-medium text-gray-700 flex-1">{domainName}</span>
                          <span className="mx-4 text-xs text-gray-500">
                            {t("levelReached")} : <strong>{displayLevel}</strong>
                          </span>
                          {(p.maxPoints ?? 0) > 0 && (
                            <span className="mx-2 text-xs text-gray-500">
                              {p.pointsEarned ?? 0}/{p.maxPoints} pts
                            </span>
                          )}
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.passed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                            {p.passed ? t("passed") : t("failed")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </PageShell>

      {/* FAB Besoin d'aide */}
      <button
        onClick={() => setShowHelpModal(true)}
        className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 rounded-full text-white text-sm font-semibold shadow-lg hover:opacity-90 transition-opacity z-40"
        style={{ backgroundColor: primaryColor }}
      >
        <HelpCircle size={18} /> Besoin d'aide
      </button>

      {/* Modal Besoin d'aide */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold text-gray-800">Besoin d'aide</h2>
              <button onClick={() => setShowHelpModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSendHelp} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sujet *</label>
                <input
                  type="text"
                  value={helpSubject}
                  onChange={e => setHelpSubject(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  placeholder="Ex : Problème avec un test"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Test concerné</label>
                <select
                  value={helpTestName}
                  onChange={e => setHelpTestName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"
                >
                  <option value="">— Sélectionner un test (optionnel)</option>
                  {assignments.map(a => (
                    <option key={a.id} value={a.test.name}>{a.test.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Compétence / sous-thème</label>
                <input
                  type="text"
                  value={helpSubTheme}
                  onChange={e => setHelpSubTheme(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  placeholder="Ex : Sécurité incendie (optionnel)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message *</label>
                <textarea
                  value={helpBody}
                  onChange={e => setHelpBody(e.target.value)}
                  required
                  rows={4}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
                  placeholder="Décrivez votre problème ou question..."
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowHelpModal(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">
                  Annuler
                </button>
                <button type="submit" disabled={sendingHelp}
                  className="px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50"
                  style={{ backgroundColor: primaryColor }}>
                  {sendingHelp ? "Envoi..." : "Envoyer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
