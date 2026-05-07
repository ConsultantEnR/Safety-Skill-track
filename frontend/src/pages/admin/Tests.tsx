import React, { useEffect, useState } from "react";
import PageShell from "../../components/PageShell";
import Sidebar from "../../components/Sidebar";
import { useAuth } from "../../contexts/AuthContext";
import { useBranding } from "../../contexts/BrandingContext";
import { useI18n } from "../../contexts/I18nContext"; // ITER9
import HelpRequestButton from "../../components/HelpRequestButton"; // ITER12
import toast from "react-hot-toast";
import { X, Users, User, CalendarDays, ClipboardCheck } from "lucide-react";

// ITER9: Côté client : Sous-thème 2 = "Domaine de compétence"
interface Competence {
  id: number;
  subSubThemeId: number | null;
  subThemeId: number | null;
  questionCount: number;
  expectedLevel?: string;
}

interface Test {
  id: number;
  name: string;
  description: string | null;
  competences: Competence[];
}

interface Employee {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  position: string | null;
  department: string | null;
  site: string | null;
  country: string | null;
  assignments: { testId: number }[];
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-xl shadow-xl w-full ${wide ? "max-w-2xl" : "max-w-lg"} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

type AssignMode = "individual" | "group";

export default function AdminTests() {
  const { accessToken } = useAuth();
  const branding = useBranding();
  const { t } = useI18n(); // ITER9

  const [tests, setTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [assigningTest, setAssigningTest]       = useState<Test | null>(null);
  const [assignMode, setAssignMode]             = useState<AssignMode>("individual");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);
  const [alreadyAssignedIds, setAlreadyAssignedIds]   = useState<number[]>([]);
  const [employeeSearch, setEmployeeSearch]     = useState("");
  const [filterField, setFilterField]           = useState("position");
  const [filterValue, setFilterValue]           = useState("");
  const [deadline, setDeadline]                 = useState("");
  const [assigning, setAssigning]               = useState(false);

  const authHeaders = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    Promise.all([
      fetch("/api/admin/tests/available", { headers: authHeaders }).then(r => r.json()),
      fetch("/api/admin/employees", { headers: authHeaders }).then(r => r.json()),
    ])
      .then(([testsData, empsData]) => { setTests(testsData); setEmployees(empsData); })
      .catch(() => toast.error("Erreur de chargement"))
      .finally(() => setLoading(false));
  }, [accessToken]);

  function openAssignModal(test: Test) {
    const alreadyIds = employees.filter(e => e.assignments.some(a => a.testId === test.id)).map(e => e.id);
    setAssigningTest(test); setAssignMode("individual"); setSelectedEmployeeIds([]);
    setAlreadyAssignedIds(alreadyIds);
    setEmployeeSearch(""); setFilterField("position"); setFilterValue(""); setDeadline("");
  }

  function toggleEmployee(id: number) {
    setSelectedEmployeeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function distinctValues(field: keyof Employee) {
    const vals = employees.map(e => e[field]).filter(Boolean) as string[];
    return Array.from(new Set(vals)).sort();
  }

  const groupCount = filterValue ? employees.filter(e => (e as any)[filterField] === filterValue).length : 0;
  const filteredEmployees = employeeSearch.trim()
    ? employees.filter(e => `${e.firstName} ${e.lastName} ${e.email}`.toLowerCase().includes(employeeSearch.toLowerCase()))
    : employees;

  async function handleAssign() {
    if (!assigningTest) return;
    if (assignMode === "individual" && selectedEmployeeIds.length === 0) { toast.error(t("selectAtLeastOne")); return; }
    if (assignMode === "group" && !filterValue) { toast.error(t("selectFilterValue")); return; }
    setAssigning(true);
    try {
      const body: any = { mode: assignMode, deadline: deadline || null };
      if (assignMode === "individual") body.employeeIds = selectedEmployeeIds;
      else body.filter = { field: filterField, value: filterValue };
      const res = await fetch(`/api/admin/tests/${assigningTest.id}/assign`, { method: "POST", headers: authHeaders, body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      const result = await res.json();
      toast.success(`${result.assigned} ${t("selectedCount")} ✓`);
      setAssigningTest(null);
    } catch { toast.error(t("assignError")); }
    finally { setAssigning(false); }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <PageShell>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <ClipboardCheck size={28} style={{ color: branding.primaryColor }} />
            <div>
              <h1 className="text-2xl font-bold" style={{ color: branding.primaryColor }}>{t("myTests")}</h1>
              <p className="text-sm text-gray-500 mt-0.5">{t("availableTests")}</p>
            </div>
          </div>
        </div>

        {loading ? <div className="text-center text-gray-400 py-12">{t("loading")}</div>
          : tests.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-12 text-center">
              <ClipboardCheck size={48} className="mx-auto mb-4 text-gray-300" />
              <p className="text-gray-400">{t("noTestAvailable")}</p>
              <p className="text-sm text-gray-400 mt-1">{t("contactAdmin")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tests.map(test => (
                <div key={test.id} className="bg-white rounded-xl shadow-sm p-6 flex flex-col gap-3 border border-gray-100 hover:border-gray-200 transition-colors">
                  {(() => {
                    const uniqueComps = test.competences
                      .filter(c => c.subSubThemeId)
                      .filter((c, i, arr) => arr.findIndex(x => x.subSubThemeId === c.subSubThemeId) === i);
                    return (<>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-gray-800 text-base leading-tight">{test.name}</h3>
                        <span className="shrink-0 px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                          {uniqueComps.length} {uniqueComps.length > 1 ? t("competences") : t("competence")}
                        </span>
                      </div>
                      {test.description && <p className="text-sm text-gray-500 leading-relaxed">{test.description}</p>}
                      {uniqueComps.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {uniqueComps.slice(0, 4).map(c => (
                            <span key={c.subSubThemeId} className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">{t("competencyDomain")} #{c.subSubThemeId}</span>
                          ))}
                          {uniqueComps.length > 4 && <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">+{uniqueComps.length - 4}</span>}
                        </div>
                      )}
                    </>);
                  })()}
                  <div className="mt-auto pt-2">
                    <button onClick={() => openAssignModal(test)} className="w-full py-2 rounded-lg text-white text-sm font-semibold transition-opacity hover:opacity-90" style={{ backgroundColor: branding.primaryColor }}>
                      {t("assignToEmployees")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
      </PageShell>

      {/* Modal Assignation */}
      {assigningTest && (
        <Modal title={`Assigner – ${assigningTest.name}`} onClose={() => setAssigningTest(null)} wide>
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t("assignMode")}</label>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setAssignMode("individual")}
                  className={`flex items-center gap-2 p-3 rounded-lg border-2 text-sm font-medium transition-colors ${assignMode === "individual" ? "text-white" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                  style={assignMode === "individual" ? { backgroundColor: branding.primaryColor, borderColor: branding.primaryColor } : {}}>
                  <User size={16} /> {t("individualMode")}
                </button>
                <button type="button" onClick={() => setAssignMode("group")}
                  className={`flex items-center gap-2 p-3 rounded-lg border-2 text-sm font-medium transition-colors ${assignMode === "group" ? "text-white" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                  style={assignMode === "group" ? { backgroundColor: branding.primaryColor, borderColor: branding.primaryColor } : {}}>
                  <Users size={16} /> {t("groupMode")}
                </button>
              </div>
            </div>

            {/* Mode individuel */}
            {assignMode === "individual" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t("searchEmployees")} ({selectedEmployeeIds.length} {t("selectedCount")})
                  {alreadyAssignedIds.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-green-600">· {alreadyAssignedIds.length} {t("alreadyAssigned")}</span>
                  )}
                </label>
                <input type="text" value={employeeSearch} onChange={e => setEmployeeSearch(e.target.value)} placeholder="Nom, prénom, email..." className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none mb-2" />
                <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-lg divide-y">
                  {filteredEmployees.length === 0 && <p className="text-sm text-gray-400 text-center py-4">{t("noResults")}</p>}
                  {filteredEmployees.map(emp => {
                    const isAlreadyAssigned = alreadyAssignedIds.includes(emp.id);
                    const isSelected = selectedEmployeeIds.includes(emp.id);
                    return (
                      <label key={emp.id} className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${isAlreadyAssigned ? "bg-green-50 cursor-default" : "cursor-pointer hover:bg-gray-50"} ${isSelected ? "bg-blue-50" : ""}`}>
                        <input
                          type="checkbox"
                          checked={isAlreadyAssigned || isSelected}
                          onChange={() => { if (!isAlreadyAssigned) toggleEmployee(emp.id); }}
                          disabled={isAlreadyAssigned}
                          className="rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{emp.firstName} {emp.lastName}</p>
                          <p className="text-xs text-gray-500 truncate">{emp.email}{emp.position ? ` · ${emp.position}` : ""}</p>
                        </div>
                        {isAlreadyAssigned && (
                          <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">{t("alreadyAssigned")}</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Mode groupe */}
            {assignMode === "group" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("groupCriteria")}</label>
                  <select value={filterField} onChange={e => { setFilterField(e.target.value); setFilterValue(""); }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none">
                    <option value="position">{t("position")}</option>
                    <option value="department">{t("department")}</option>
                    <option value="site">{t("site")}</option>
                    <option value="country">{t("country")}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("groupValue")}</label>
                  <select value={filterValue} onChange={e => setFilterValue(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none">
                    <option value="">Sélectionner...</option>
                    {distinctValues(filterField as keyof Employee).map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                {filterValue && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                    {groupCount} {t("selectedCount")}
                  </div>
                )}
              </div>
            )}

            {/* Date limite */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1"><CalendarDays size={14} className="inline mr-1" />{t("deadline")}</label>
              <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setAssigningTest(null)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">{t("cancel")}</button>
              <button onClick={handleAssign} disabled={assigning} className="px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: branding.primaryColor }}>
                {assigning ? t("assigning") : t("confirmAssign")}
              </button>
            </div>
          </div>
        </Modal>
      )}
      <HelpRequestButton /> {/* ITER12 */}
    </div>
  );
}
