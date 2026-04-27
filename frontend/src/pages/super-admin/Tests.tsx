import React, { useEffect, useState } from "react";
import PageShell from "../../components/PageShell";
import Sidebar from "../../components/Sidebar";
import { useAuth } from "../../contexts/AuthContext";
import { useI18n } from "../../contexts/I18nContext"; // ITER9
import toast from "react-hot-toast";
import { Plus, Pencil, Trash2, X, ChevronDown, ChevronRight, ClipboardList, Timer, Building2 } from "lucide-react";

interface Theme { id: number; label: string; nameEn?: string | null; subThemes: SubTheme[]; }
interface SubTheme { id: number; label: string; nameEn?: string | null; themeId: number; subSubThemes: SubSubTheme[]; }
interface SubSubTheme { id: number; label: string; subThemeId: number; }
interface TestCompetence { id: number; subSubThemeId: number | null; subThemeId: number | null; questionCount: number; expectedLevel: string; }
interface Client { id: number; name: string; }
interface Test {
  id: number; name: string; description: string | null;
  timerEnabled: boolean; timerDuration: number | null;
  competences: TestCompetence[]; totalQuestions?: number; createdAt: string;
  clientTests?: { clientId: number; client: { name: string } }[];
}

const LEVELS = ["FONDAMENTAL", "BASIQUE", "INTERMEDIAIRE", "AVANCE", "COMPLET"];
const levelLabels: Record<string, string> = {
  FONDAMENTAL: "Fondamental", BASIQUE: "Basique", INTERMEDIAIRE: "Intermédiaire", AVANCE: "Avancé", COMPLET: "Complet",
};
const SA_PRIMARY = "#27295A";

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-xl shadow-xl w-full ${wide ? "max-w-3xl" : "max-w-lg"} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function SubSubThemeSelector({ themes, selected, onChange }: {
  themes: Theme[];
  selected: { subSubThemeId: number; expectedLevel: string }[];
  onChange: (sel: { subSubThemeId: number; expectedLevel: string }[]) => void;
}) {
  const { lang } = useI18n();
  const tl = (item: { label: string; nameEn?: string | null }) =>
    lang === "en" && item.nameEn ? item.nameEn : item.label;
  const [openThemes, setOpenThemes] = useState<Set<number>>(new Set());
  const [openSubThemes, setOpenSubThemes] = useState<Set<number>>(new Set());
  function toggleSet<T>(set: Set<T>, id: T, setter: React.Dispatch<React.SetStateAction<Set<T>>>) {
    const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); setter(n);
  }
  function isSelected(sstId: number) { return selected.some(s => s.subSubThemeId === sstId); }
  function toggleSST(sstId: number) {
    if (isSelected(sstId)) onChange(selected.filter(s => s.subSubThemeId !== sstId));
    else onChange([...selected, { subSubThemeId: sstId, expectedLevel: "FONDAMENTAL" }]);
  }
  function setLevel(sstId: number, level: string) {
    onChange(selected.map(s => s.subSubThemeId === sstId ? { ...s, expectedLevel: level } : s));
  }
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
      {themes.map(theme => (
        <div key={theme.id}>
          <button type="button" onClick={() => toggleSet(openThemes, theme.id, setOpenThemes)}
            className="flex items-center gap-2 w-full px-3 py-2 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-left">
            {openThemes.has(theme.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {tl(theme)}
          </button>
          {openThemes.has(theme.id) && theme.subThemes.map(st => (
            <div key={st.id}>
              <button type="button" onClick={() => toggleSet(openSubThemes, st.id, setOpenSubThemes)}
                className="flex items-center gap-2 w-full px-6 py-1.5 bg-white hover:bg-gray-50 text-sm text-left text-gray-600">
                {openSubThemes.has(st.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {tl(st)}
              </button>
              {openSubThemes.has(st.id) && st.subSubThemes.map(sst => (
                <div key={sst.id} className="flex items-center gap-2 px-10 py-1.5 bg-white hover:bg-gray-50">
                  <input type="checkbox" checked={isSelected(sst.id)} onChange={() => toggleSST(sst.id)}
                    className="rounded" id={`sst-${sst.id}`} />
                  <label htmlFor={`sst-${sst.id}`} className="text-sm text-gray-700 flex-1 cursor-pointer">{sst.label}</label>
                  {isSelected(sst.id) && (
                    <select value={selected.find(s => s.subSubThemeId === sst.id)?.expectedLevel || "FONDAMENTAL"}
                      onChange={e => setLevel(sst.id, e.target.value)}
                      className="text-xs border border-gray-200 rounded px-1 py-0.5">
                      {LEVELS.map(l => <option key={l} value={l}>{levelLabels[l]}</option>)}
                    </select>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function SuperAdminTests() {
  const { accessToken } = useAuth();
  const { t } = useI18n(); // ITER9
  const [tests, setTests] = useState<Test[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterClient, setFilterClient] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingTest, setEditingTest] = useState<Test | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [timerDuration, setTimerDuration] = useState("");
  const [selectedCompetences, setSelectedCompetences] = useState<{ subSubThemeId: number; expectedLevel: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [expandedTest, setExpandedTest] = useState<number | null>(null);

  const authHeaders = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

  async function loadData() {
    if (!accessToken) return;
    try {
      const [testsRes, themesRes, clientsRes] = await Promise.all([
        fetch("/api/super-admin/tests", { headers: authHeaders }),
        fetch("/api/super-admin/themes", { headers: authHeaders }),
        fetch("/api/super-admin/clients", { headers: authHeaders }),
      ]);
      setTests(await testsRes.json());
      setThemes(await themesRes.json());
      setClients(await clientsRes.json());
    } catch { toast.error(t("loadingError")); } // ITER9
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, [accessToken]);

  function openCreate() {
    setEditingTest(null); setName(""); setDescription(""); setTimerEnabled(false);
    setTimerDuration(""); setSelectedCompetences([]); setShowModal(true);
  }

  function openEdit(test: Test) {
    setEditingTest(test); setName(test.name); setDescription(test.description || "");
    setTimerEnabled(test.timerEnabled); setTimerDuration(test.timerDuration?.toString() || "");
    setSelectedCompetences(test.competences.filter(c => c.subSubThemeId).map(c => ({ subSubThemeId: c.subSubThemeId!, expectedLevel: c.expectedLevel })));
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        name, description,
        timerEnabled,
        timerDuration: timerEnabled && timerDuration ? Number(timerDuration) : null,
        competences: selectedCompetences,
      };
      const res = editingTest
        ? await fetch(`/api/super-admin/tests/${editingTest.id}`, { method: "PUT", headers: authHeaders, body: JSON.stringify(body) })
        : await fetch("/api/super-admin/tests", { method: "POST", headers: authHeaders, body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      toast.success(editingTest ? t("testModified") : t("testCreated")); // ITER9
      setShowModal(false);
      loadData();
    } catch { toast.error(t("loadingError")); } // ITER9
    finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    if (!confirm(t("deleteTest"))) return; // ITER9
    try {
      const res = await fetch(`/api/super-admin/tests/${id}`, { method: "DELETE", headers: authHeaders });
      if (!res.ok) throw new Error();
      toast.success(t("testDeleted")); // ITER9
      setTests(prev => prev.filter(test => test.id !== id)); // ITER9: renamed loop var from t to test
    } catch { toast.error(t("loadingError")); } // ITER9
  }

  // Group tests by client
  const clientsWithTests: { client: Client | null; tests: Test[] }[] = [];

  // Unassigned tests
  const unassigned = tests.filter(t => !t.clientTests || t.clientTests.length === 0);

  // Tests per client
  const clientMap: Record<number, { client: Client; tests: Test[] }> = {};
  for (const test of tests) {
    if (test.clientTests) {
      for (const ct of test.clientTests) {
        if (!clientMap[ct.clientId]) {
          const c = clients.find(cl => cl.id === ct.clientId);
          if (c) clientMap[ct.clientId] = { client: c, tests: [] };
        }
        if (clientMap[ct.clientId]) clientMap[ct.clientId].tests.push(test);
      }
    }
  }

  const filteredTests = filterClient
    ? (clientMap[Number(filterClient)]?.tests || [])
    : tests;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t("tests")}</h1> {/* ITER9 */}
              <p className="text-sm text-gray-500 mt-1">{tests.length} test{tests.length !== 1 ? "s" : ""}</p>
            </div>
            <button onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: SA_PRIMARY }}>
              <Plus size={16} /> {t("createTest")} {/* ITER9 */}
            </button>
          </div>

          {/* Filter by client */}
          <div className="flex items-center gap-3 mb-6">
            <Building2 size={16} className="text-gray-400" />
            <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
              <option value="">{t("allTests")}</option> {/* ITER9 */}
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {loading ? <p className="text-gray-500">{t("loading")}</p> : ( // ITER9
            <div className="space-y-3">
              {filteredTests.map(test => (
                <div key={test.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedTest(expandedTest === test.id ? null : test.id)}
                  >
                    <div className="flex items-center gap-3">
                      <ClipboardList size={18} className="text-gray-400" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{test.name}</span>
                          {test.timerEnabled && (
                            <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">
                              <Timer size={10} />{test.timerDuration}min
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                          <span>{test.competences.length} {t("competence")}{test.competences.length !== 1 ? "s" : ""}</span> {/* ITER9 */}
                          {test.clientTests && test.clientTests.length > 0 && (
                            <span className="flex items-center gap-1">
                              <Building2 size={10} />
                              {test.clientTests.map(ct => ct.client?.name).join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={e => { e.stopPropagation(); openEdit(test); }}
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
                        <Pencil size={15} />
                      </button>
                      <button onClick={e => { e.stopPropagation(); handleDelete(test.id); }}
                        className="p-2 hover:bg-red-50 rounded-lg text-red-400">
                        <Trash2 size={15} />
                      </button>
                      {expandedTest === test.id ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                    </div>
                  </div>
                  {expandedTest === test.id && (
                    <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                      {test.description && <p className="text-sm text-gray-600 mb-3">{test.description}</p>}
                      {test.timerEnabled && (
                        <p className="text-sm text-amber-600 mb-3 flex items-center gap-1">
                          <Timer size={14} /> {t("timerEnabled")} : {test.timerDuration} {t("minutes")} {/* ITER9 */}
                        </p>
                      )}
                      <div className="space-y-1">
                        {test.competences.map(c => (
                          <div key={c.id} className="flex items-center gap-2 text-sm text-gray-600">
                            <span className="w-2 h-2 rounded-full bg-gray-300" />
                            {c.questionCount} question{c.questionCount !== 1 ? "s" : ""} · {t("level")} {levelLabels[c.expectedLevel] || c.expectedLevel} {/* ITER9 */}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </PageShell>

      {showModal && (
        <Modal title={editingTest ? t("editTest") : t("createTest")} onClose={() => setShowModal(false)} wide> {/* ITER9 */}
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("testName")} *</label> {/* ITER9 */}
              <input type="text" value={name} onChange={e => setName(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("description")}</label> {/* ITER9 */}
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={timerEnabled} onChange={e => setTimerEnabled(e.target.checked)} className="rounded" />
                <Timer size={14} /> {t("enableTimer")} {/* ITER9 */}
              </label>
              {timerEnabled && (
                <div className="flex items-center gap-2">
                  <input type="number" value={timerDuration} onChange={e => setTimerDuration(e.target.value)}
                    min="1" max="180" placeholder="30"
                    className="w-20 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none" />
                  <span className="text-sm text-gray-500">{t("minutes")}</span> {/* ITER9 */}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t("competencies")}</label> {/* ITER9 */}
              {themes.length === 0 ? (
                <p className="text-sm text-gray-500">{t("noTaxonomy")}</p> // ITER9
              ) : (
                <SubSubThemeSelector themes={themes} selected={selectedCompetences} onChange={setSelectedCompetences} />
              )}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t("cancel")}</button> {/* ITER9 */}
              <button type="submit" disabled={saving}
                className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50"
                style={{ backgroundColor: SA_PRIMARY }}>
                {saving ? t("saving") : editingTest ? t("modifyTest") : t("create")} {/* ITER9 */}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
