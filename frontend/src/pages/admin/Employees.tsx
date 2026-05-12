import React, { useEffect, useState, useRef } from "react";
import PageShell from "../../components/PageShell";
import Sidebar from "../../components/Sidebar";
import { useAuth } from "../../contexts/AuthContext";
import { useBranding } from "../../contexts/BrandingContext";
import { useI18n } from "../../contexts/I18nContext"; // ITER9
import HelpRequestButton from "../../components/HelpRequestButton"; // ITER12
import toast from "react-hot-toast";
import {
  Plus, Pencil, UserX, UserCheck, Upload, X, AlertTriangle,
  FileSpreadsheet, ChevronDown, ChevronRight, KeyRound, Eye, EyeOff,
  Mail, Download, BarChart2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import * as XLSX from "xlsx";

interface Employee {
  id: number;
  lastName: string;
  firstName: string;
  birthDate: string | null;
  position: string | null;
  department: string | null;
  site: string | null;
  country: string | null;
  language: string | null;
  email: string;
  isActive: boolean;
  plainPassword?: string | null;
}

interface CredentialEntry { firstName: string; lastName: string; email: string; username: string; plainPassword: string | null; }

interface EmployeeResults {
  employeeId: number;
  firstName: string;
  lastName: string;
  sessions: {
    id: number;
    testName: string;
    status: string;
    completedAt: string | null;
    progress: {
      subSubThemeId: number;
      subSubThemeName: string;
      questionsAsked: number;
      correctCount: number;
      passed: boolean;
      currentLevel: string;
      levelReached?: string | null;
    }[];
  }[];
}

interface ImportRow {
  lastName: string; firstName: string; birthDate: string;
  position: string; department: string; site: string;
  country: string; language: string; email: string; _error?: string;
}

interface EmployeeFormData {
  lastName: string; firstName: string; birthDate: string;
  position: string; department: string; site: string;
  country: string; language: string; email: string;
}

const emptyForm: EmployeeFormData = {
  lastName: "", firstName: "", birthDate: "", position: "",
  department: "", site: "", country: "", language: "", email: "",
};

type GroupBy = "none" | "site" | "position" | "country";
const LEVEL_LABELS: Record<string, string> = {
  FONDAMENTAL: "Fondamental",
  BASIQUE: "Basique",
  INTERMEDIAIRE: "Intermédiaire",
  AVANCE: "Avancé",
  COMPLET: "Complet",
};

function getEffectiveLevel(progress: EmployeeResults["sessions"][number]["progress"][number]) {
  return progress.levelReached || (progress.correctCount > 0 ? progress.currentLevel : null);
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-xl shadow-xl w-full ${wide ? "max-w-4xl" : "max-w-lg"} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function EmployeeForm({
  data, onChange, onSubmit, onCancel, saving, submitLabel, branding,
}: {
  data: EmployeeFormData; onChange: (d: EmployeeFormData) => void;
  onSubmit: (e: React.FormEvent) => void; onCancel: () => void;
  saving: boolean; submitLabel: string; branding: any;
}) {
  const { t } = useI18n(); // ITER11
  function set(field: keyof EmployeeFormData, value: string) {
    onChange({ ...data, [field]: value });
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("lastName")} *</label>
          <input type="text" value={data.lastName} onChange={e => set("lastName", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("firstName")} *</label>
          <input type="text" value={data.firstName} onChange={e => set("firstName", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("birthDate")}</label>
          <input type="date" value={data.birthDate} onChange={e => set("birthDate", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("email")} *</label>
          <input type="email" value={data.email} onChange={e => set("email", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("position")}</label>
          <input type="text" value={data.position} onChange={e => set("position", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("department")}</label>
          <input type="text" value={data.department} onChange={e => set("department", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("site")}</label>
          <input type="text" value={data.site} onChange={e => set("site", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("country")}</label>
          <input type="text" value={data.country} onChange={e => set("country", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("language")}</label>
          <input type="text" value={data.language} onChange={e => set("language", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="fr, en..." />
        </div>
      </div>
      <p className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
        {t("autoCredentials")}
      </p>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">
          {t("cancel")}
        </button>
        <button type="submit" disabled={saving}
          className="px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50"
          style={{ backgroundColor: branding.primaryColor }}>
          {saving ? t("saving") : submitLabel}
        </button>
      </div>
    </form>
  );
}

function EmployeeRow({ emp, onEdit, onToggleActive, onShowCredentials, onShowResults }: {
  emp: Employee; onEdit: (e: Employee) => void;
  onToggleActive: (e: Employee) => void; onShowCredentials: (e: Employee) => void;
  onShowResults: (e: Employee) => void;
}) {
  const { t } = useI18n(); // ITER11
  return (
    <tr className={`border-b hover:bg-gray-50 transition-colors ${!emp.isActive ? "opacity-50" : ""}`}>
      <td className="px-4 py-3 font-medium text-gray-800">{emp.lastName}</td>
      <td className="px-4 py-3 text-gray-700">{emp.firstName}</td>
      <td className="px-4 py-3 text-gray-600">{emp.position || "—"}</td>
      <td className="px-4 py-3 text-gray-600">{emp.department || "—"}</td>
      <td className="px-4 py-3 text-gray-600">{emp.site || "—"}</td>
      <td className="px-4 py-3 text-gray-600">{emp.country || "—"}</td>
      <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate">{emp.email}</td>
      <td className="px-4 py-3">
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${emp.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
          {emp.isActive ? t("active") : t("inactive")}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <button onClick={() => onShowResults(emp)} className="p-1.5 rounded-lg hover:bg-purple-50 text-purple-400 hover:text-purple-600" title={t("resultsTitle")}>
            <BarChart2 size={14} />
          </button>
          <button onClick={() => onShowCredentials(emp)} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-400 hover:text-blue-600" title={t("credentials")}>
            <KeyRound size={14} />
          </button>
          <button onClick={() => onEdit(emp)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700" title={t("edit")}>
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onToggleActive(emp)}
            className={`p-1.5 rounded-lg transition-colors ${emp.isActive ? "hover:bg-red-50 text-red-400 hover:text-red-600" : "hover:bg-green-50 text-green-400 hover:text-green-600"}`}
            title={emp.isActive ? t("deactivate") : t("reactivate")}
          >
            {emp.isActive ? <UserX size={14} /> : <UserCheck size={14} />}
          </button>
        </div>
      </td>
    </tr>
  );
}

function TableHeaders() {
  const { t } = useI18n(); // ITER11
  return (
    <tr className="border-b bg-gray-50">
      <th className="text-left px-4 py-3 font-semibold text-gray-600">{t("lastName")}</th>
      <th className="text-left px-4 py-3 font-semibold text-gray-600">{t("firstName")}</th>
      <th className="text-left px-4 py-3 font-semibold text-gray-600">{t("position")}</th>
      <th className="text-left px-4 py-3 font-semibold text-gray-600">{t("department")}</th>
      <th className="text-left px-4 py-3 font-semibold text-gray-600">{t("site")}</th>
      <th className="text-left px-4 py-3 font-semibold text-gray-600">{t("country")}</th>
      <th className="text-left px-4 py-3 font-semibold text-gray-600">{t("email")}</th>
      <th className="text-left px-4 py-3 font-semibold text-gray-600">{t("status")}</th>
      <th className="text-left px-4 py-3 font-semibold text-gray-600">{t("actions")}</th>
    </tr>
  );
}

// Génère un CSV des identifiants et déclenche le téléchargement
function downloadCredentialsCSV(creds: CredentialEntry[]) {
  const header = "Nom,Prénom,Email,Identifiant,Mot de passe\n";
  const rows = creds.map(c =>
    `"${c.lastName}","${c.firstName}","${c.email}","${c.username}","${c.plainPassword || ""}"`
  ).join("\n");
  const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "identifiants_salaries.csv"; a.click();
  URL.revokeObjectURL(url);
}

export default function AdminEmployees() {
  const { accessToken } = useAuth();
  const branding = useBranding();
  const { t } = useI18n(); // ITER9

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<EmployeeFormData>(emptyForm);
  const [addSaving, setAddSaving] = useState(false);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState<EmployeeFormData>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Import modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importSaving, setImportSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Credentials modal
  const [showCredModal, setShowCredModal] = useState(false);
  const [credList, setCredList] = useState<CredentialEntry[]>([]);
  const [credVisible, setCredVisible] = useState<Record<number, boolean>>({});
  const [sendingEmail, setSendingEmail] = useState<number | null>(null);

  // Results modal
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [employeeResults, setEmployeeResults] = useState<EmployeeResults | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [selectedTestIdx, setSelectedTestIdx] = useState(0);

  // Grouping
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [selectedInGroup, setSelectedInGroup] = useState<Set<number>>(new Set());

  const authHeaders = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

  async function loadEmployees() {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/employees", { headers: authHeaders });
      setEmployees(await res.json());
    } catch { toast.error(t("loadingError")); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadEmployees(); }, [accessToken]);

  async function handleAddEmployee(e: React.FormEvent) {
    e.preventDefault();
    setAddSaving(true);
    try {
      const res = await fetch("/api/admin/employees", {
        method: "POST", headers: authHeaders, body: JSON.stringify(addForm),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Erreur"); }
      const data = await res.json();
      toast.success(t("employeeAdded"));
      setShowAddModal(false);
      setAddForm(emptyForm);
      loadEmployees();
      // Affiche les identifiants générés
      if (data.plainPassword) {
        setCredList([{ firstName: data.firstName, lastName: data.lastName, email: data.email, username: data.email, plainPassword: data.plainPassword }]);
        setCredVisible({});
        setShowCredModal(true);
      }
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de l'ajout");
    } finally { setAddSaving(false); }
  }

  function openEditModal(emp: Employee) {
    setEditingId(emp.id);
    setEditForm({
      lastName: emp.lastName, firstName: emp.firstName,
      birthDate: emp.birthDate ? emp.birthDate.split("T")[0] : "",
      position: emp.position || "", department: emp.department || "",
      site: emp.site || "", country: emp.country || "",
      language: emp.language || "", email: emp.email,
    });
    setShowEditModal(true);
  }

  async function handleEditEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/admin/employees/${editingId}`, {
        method: "PUT", headers: authHeaders, body: JSON.stringify(editForm),
      });
      if (!res.ok) throw new Error();
      toast.success(t("employeeUpdated"));
      setShowEditModal(false); setEditingId(null); loadEmployees();
    } catch { toast.error("Erreur lors de la mise à jour"); }
    finally { setEditSaving(false); }
  }

  async function toggleActive(emp: Employee) {
    try {
      const res = await fetch(`/api/admin/employees/${emp.id}`, {
        method: "PUT", headers: authHeaders,
        body: JSON.stringify({ ...emp, isActive: !emp.isActive }),
      });
      if (!res.ok) throw new Error();
      toast.success(emp.isActive ? t("employeeDeactivated") : t("employeeReactivated"));
      loadEmployees();
    } catch { toast.error("Erreur"); }
  }

  async function handleShowResults(emp: Employee) {
    setResultsLoading(true);
    setEmployeeResults(null);
    setSelectedTestIdx(0);
    setShowResultsModal(true);
    try {
      const res = await fetch(`/api/admin/employees/${emp.id}/results`, { headers: authHeaders });
      if (!res.ok) { toast.error("Impossible de charger les résultats"); return; }
      setEmployeeResults(await res.json());
    } catch { toast.error("Erreur lors du chargement"); }
    finally { setResultsLoading(false); }
  }

  // Ouvre le modal credentials pour un salarié (charge depuis l'API)
  async function handleShowCredentials(emp: Employee) {
    try {
      const res = await fetch(`/api/admin/employees/${emp.id}/credentials`, { headers: authHeaders });
      if (!res.ok) { toast.error("Impossible de charger les identifiants"); return; }
      const data = await res.json();
      setCredList([{ firstName: emp.firstName, lastName: emp.lastName, email: emp.email, username: data.username, plainPassword: data.plainPassword }]);
      setCredVisible({});
      setShowCredModal(true);
    } catch { toast.error("Erreur"); }
  }

  // Envoie les identifiants par email
  async function handleSendEmail(idx: number, cred: CredentialEntry) {
    setSendingEmail(idx);
    try {
      const emp = employees.find(e => e.email === cred.email);
      if (!emp) return;
      const res = await fetch(`/api/admin/employees/${emp.id}/send-credentials`, {
        method: "POST", headers: authHeaders,
      });
      if (!res.ok) throw new Error();
      toast.success(`${t("credentialsSentTo")} ${cred.email}`);
    } catch { toast.error("Erreur lors de l'envoi"); }
    finally { setSendingEmail(null); }
  }

  function parseExcelFile(file: File) {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const raw: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        if (raw.length < 2) { toast.error("Le fichier est vide ou mal formaté"); return; }

        const fileHeaders = (raw[0] as string[]).map(h =>
          String(h || "").toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        );
        const synonyms: Record<string, string[]> = {
          nom: ["nom", "last name", "lastname", "name", "famille", "nom de famille"],
          prenom: ["prenom", "first name", "firstname", "prenom", "given name"],
          date_naissance: ["date_naissance", "date naissance", "naissance", "birth date", "birthdate", "dob"],
          poste: ["poste", "position", "job", "titre", "fonction", "role"],
          service: ["service", "department", "departement", "dept", "equipe", "team"],
          site: ["site", "location", "lieu"],
          pays: ["pays", "country", "nation"],
          langue: ["langue", "language", "lang"],
          email: ["email", "e-mail", "mail", "courriel", "adresse email", "adresse mail", "adresse e-mail"],
        };
        const findCol = (field: string): number => {
          for (const syn of synonyms[field] || [field]) {
            const idx = fileHeaders.findIndex(h => h === syn || h.includes(syn));
            if (idx !== -1) return idx;
          }
          return -1;
        };
        const colMap: Record<string, number> = {
          nom: findCol("nom"), prenom: findCol("prenom"),
          date_naissance: findCol("date_naissance"), poste: findCol("poste"),
          service: findCol("service"), site: findCol("site"),
          pays: findCol("pays"), langue: findCol("langue"), email: findCol("email"),
        };
        const positionalOrder = ["nom", "prenom", "date_naissance", "poste", "service", "site", "pays", "langue", "email"];
        if (colMap.email === -1 && fileHeaders.length >= 9) {
          positionalOrder.forEach((field, idx) => { if (colMap[field] === -1) colMap[field] = idx; });
        }
        const rows: ImportRow[] = [];
        for (let i = 1; i < raw.length; i++) {
          const row = raw[i] as any[];
          if (!row || row.every(c => !c)) continue;
          const getValue = (field: string) => {
            const idx = colMap[field];
            if (idx === -1) return "";
            const val = row[idx];
            return val != null ? String(val).trim() : "";
          };
          const email = getValue("email");
          const firstName = getValue("prenom");
          const lastName = getValue("nom");
          let error = "";
          if (!email) error = "Email manquant";
          else if (!email.includes("@")) error = "Email invalide";
          else if (!firstName) error = "Prénom manquant";
          else if (!lastName) error = "Nom manquant";
          rows.push({
            lastName, firstName, birthDate: getValue("date_naissance"),
            position: getValue("poste"), department: getValue("service"),
            site: getValue("site"), country: getValue("pays"),
            language: getValue("langue"), email, _error: error || undefined,
          });
        }
        setImportRows(rows);
        setShowImportModal(true);
      } catch { toast.error("Erreur lors de la lecture du fichier"); }
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleImportConfirm() {
    const validRows = importRows.filter(r => !r._error);
    if (validRows.length === 0) { toast.error("Aucune ligne valide à importer"); return; }
    setImportSaving(true);
    try {
      const res = await fetch("/api/admin/employees/import", {
        method: "POST", headers: authHeaders,
        body: JSON.stringify({
          employees: validRows.map(r => ({
            lastName: r.lastName, firstName: r.firstName,
            birthDate: r.birthDate || null, position: r.position || null,
            department: r.department || null, site: r.site || null,
            country: r.country || null, language: r.language || null, email: r.email,
          })),
        }),
      });
      if (!res.ok) throw new Error();
      const result = await res.json();
      toast.success(`${result.imported} salarié(s) importé(s) !`);
      setShowImportModal(false);
      setImportRows([]);
      loadEmployees();
      // Affiche les identifiants générés après import
      const creds: CredentialEntry[] = result.employees.map((e: any) => ({
        firstName: e.firstName, lastName: e.lastName,
        email: e.email, username: e.email, plainPassword: e.plainPassword,
      }));
      if (creds.length > 0) {
        setCredList(creds); setCredVisible({}); setShowCredModal(true);
      }
    } catch { toast.error("Erreur lors de l'import"); }
    finally { setImportSaving(false); }
  }

  function getGroupValue(emp: Employee): string {
    if (groupBy === "none") return "";
    return (emp[groupBy as keyof Employee] as string) || "(non renseigné)";
  }
  function getGroups(): { key: string; emps: Employee[] }[] {
    if (groupBy === "none") return [{ key: "__all__", emps: employees }];
    const map = new Map<string, Employee[]>();
    for (const emp of employees) {
      const key = getGroupValue(emp);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(emp);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([key, emps]) => ({ key, emps }));
  }
  function toggleGroup(key: string) {
    setCollapsedGroups(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }
  function toggleSelectGroup(emps: Employee[]) {
    const ids = emps.map(e => e.id);
    const allSelected = ids.every(id => selectedInGroup.has(id));
    setSelectedInGroup(prev => { const n = new Set(prev); if (allSelected) ids.forEach(id => n.delete(id)); else ids.forEach(id => n.add(id)); return n; });
  }

  const validImportCount = importRows.filter(r => !r._error).length;
  const errorImportCount = importRows.filter(r => r._error).length;
  const groups = getGroups();

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <PageShell>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold" style={{ color: branding.primaryColor }}>{t("employees")}</h1> {/* ITER9 */}
          <div className="flex gap-2 items-center flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 whitespace-nowrap">Grouper par :</label>
              <select value={groupBy} onChange={e => setGroupBy(e.target.value as GroupBy)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white">
                <option value="none">Aucun</option>
                <option value="site">Site</option>
                <option value="position">Poste</option>
                <option value="country">Pays</option>
              </select>
            </div>
            <label className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 bg-white hover:bg-gray-50 cursor-pointer">
              <FileSpreadsheet size={16} /> Importer Excel
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => { const file = e.target.files?.[0]; if (file) parseExcelFile(file); e.target.value = ""; }} />
            </label>
            <button onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold"
              style={{ backgroundColor: branding.primaryColor }}>
              <Plus size={16} /> {t("addEmployee")}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400">{t("loading")}</div> // ITER9
          ) : employees.length === 0 ? (
            <div className="p-8 text-center text-gray-400">Aucun salarié pour l'instant</div>
          ) : groupBy === "none" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><TableHeaders /></thead>
                <tbody>
                  {employees.map(emp => (
                    <EmployeeRow key={emp.id} emp={emp} onEdit={openEditModal}
                      onToggleActive={toggleActive} onShowCredentials={handleShowCredentials} onShowResults={handleShowResults} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="divide-y">
              {groups.map(group => {
                const isCollapsed = collapsedGroups.has(group.key);
                const groupIds = group.emps.map(e => e.id);
                const allSelected = groupIds.every(id => selectedInGroup.has(id));
                return (
                  <div key={group.key}>
                    <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 cursor-pointer select-none"
                      onClick={() => toggleGroup(group.key)}>
                      <input type="checkbox" checked={allSelected}
                        onChange={e => { e.stopPropagation(); toggleSelectGroup(group.emps); }}
                        onClick={e => e.stopPropagation()} className="rounded" />
                      <span className="text-sm font-semibold text-gray-700 flex-1">{group.key}</span>
                      <span className="text-xs text-gray-500">{group.emps.length} salarié(s)</span>
                      {isCollapsed ? <ChevronRight size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                    </div>
                    {!isCollapsed && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><TableHeaders /></thead>
                          <tbody>
                            {group.emps.map(emp => (
                              <EmployeeRow key={emp.id} emp={emp} onEdit={openEditModal}
                                onToggleActive={toggleActive} onShowCredentials={handleShowCredentials} onShowResults={handleShowResults} />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PageShell>

      {/* Add Modal */}
      {showAddModal && (
        <Modal title={t("addEmployee")} onClose={() => setShowAddModal(false)}>
          <EmployeeForm data={addForm} onChange={setAddForm} onSubmit={handleAddEmployee}
            onCancel={() => setShowAddModal(false)} saving={addSaving}
            submitLabel={t("add")} branding={branding} />
        </Modal>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <Modal title={t("editEmployee")} onClose={() => setShowEditModal(false)}>
          <EmployeeForm data={editForm} onChange={setEditForm} onSubmit={handleEditEmployee}
            onCancel={() => setShowEditModal(false)} saving={editSaving}
            submitLabel={t("save")} branding={branding} />
        </Modal>
      )}

      {/* Import Preview Modal */}
      {showImportModal && (
        <Modal title="Import Excel – Aperçu" onClose={() => setShowImportModal(false)} wide>
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-1 bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-700">{validImportCount}</p>
                <p className="text-xs text-green-600">ligne(s) valide(s)</p>
              </div>
              {errorImportCount > 0 && (
                <div className="flex-1 bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-red-700">{errorImportCount}</p>
                  <p className="text-xs text-red-600">ligne(s) en erreur</p>
                </div>
              )}
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
              <strong>Colonnes attendues :</strong> nom, prénom, date_naissance, poste, service, site, pays, langue, email
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">#</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Nom</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Prénom</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Email</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Poste</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Pays</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((row, idx) => (
                    <tr key={idx} className={`border-t ${row._error ? "bg-red-50" : "hover:bg-gray-50"}`}>
                      <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                      <td className="px-3 py-2">{row.lastName || "—"}</td>
                      <td className="px-3 py-2">{row.firstName || "—"}</td>
                      <td className="px-3 py-2">{row.email || "—"}</td>
                      <td className="px-3 py-2">{row.position || "—"}</td>
                      <td className="px-3 py-2">{row.country || "—"}</td>
                      <td className="px-3 py-2">
                        {row._error ? (
                          <div className="flex items-center gap-1 text-red-600"><AlertTriangle size={12} /><span>{row._error}</span></div>
                        ) : <span className="text-green-600 font-medium">OK</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowImportModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">Annuler</button>
              <button onClick={handleImportConfirm} disabled={importSaving || validImportCount === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: branding.primaryColor }}>
                <Upload size={15} />
                {importSaving ? "Import en cours..." : `Importer ${validImportCount} salarié(s)`}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Results Modal */}
      {showResultsModal && (
        <Modal
          title={employeeResults ? `${t("resultsTitle")} — ${employeeResults.firstName} ${employeeResults.lastName}` : t("resultsTitle")}
          onClose={() => setShowResultsModal(false)}
          wide
        >
          {resultsLoading ? (
            <div className="py-12 text-center text-gray-400">{t("loading")}</div> // ITER9
          ) : !employeeResults || employeeResults.sessions.length === 0 ? (
            <div className="py-12 text-center text-gray-400">Aucun résultat disponible pour ce salarié.</div>
          ) : (
            <div className="space-y-4">
              {/* Sélecteur de test */}
              {employeeResults.sessions.length > 1 && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Test</label>
                  <select
                    value={selectedTestIdx}
                    onChange={e => setSelectedTestIdx(Number(e.target.value))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white w-full"
                  >
                    {employeeResults.sessions.map((s, i) => (
                      <option key={s.id} value={i}>
                        {s.testName} {s.completedAt ? `— terminé le ${new Date(s.completedAt).toLocaleDateString("fr-FR")}` : "(en cours)"}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {(() => {
                const session = employeeResults.sessions[selectedTestIdx];
                if (!session) return null;
                const chartData = session.progress.map(p => ({
                  name: p.subSubThemeName.length > 18 ? p.subSubThemeName.slice(0, 18) + "…" : p.subSubThemeName,
                  fullName: p.subSubThemeName,
                  score: p.questionsAsked > 0 ? Math.round((p.correctCount / p.questionsAsked) * 100) : 0,
                  level: getEffectiveLevel(p),
                  validated: Boolean(getEffectiveLevel(p)),
                }));
                const total = session.progress.length;
                const validated = session.progress.filter(p => Boolean(getEffectiveLevel(p))).length;
                const globalScore = total > 0
                  ? Math.round(session.progress.reduce((sum, p) => (
                      sum + (p.questionsAsked > 0 ? Math.round((p.correctCount / p.questionsAsked) * 100) : 0)
                    ), 0) / total)
                  : 0;
                return (
                  <div className="space-y-4">
                    {/* Score summary */}
                    <div className="flex gap-3">
                      <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold" style={{ color: branding.primaryColor }}>
                          {globalScore}%
                        </p>
                        <p className="text-xs text-gray-500">Score global</p>
                      </div>
                      <div className="flex-1 bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-green-600">{validated}</p>
                        <p className="text-xs text-green-600">Validées</p>
                      </div>
                      <div className="flex-1 bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-red-500">{total - validated}</p>
                        <p className="text-xs text-red-500">À retravailler</p>
                      </div>
                    </div>
                    {/* Bar chart */}
                    {chartData.length > 0 && (
                      <div className="bg-white border border-gray-100 rounded-xl p-4">
                        {/* ITER9: "Score par Domaine de compétence" */}
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">{t("scoreBySkillArea")} (%)</h3>
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 60 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#6b7280" }} angle={-35} textAnchor="end" interval={0} />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#9ca3af" }} />
                            <Tooltip
                              formatter={(value: any, _: any, props: any) => {
                                const level = props.payload.level ? LEVEL_LABELS[props.payload.level] || props.payload.level : "À retravailler";
                                return [`${value}% · ${level}`, props.payload.fullName];
                              }}
                              contentStyle={{ fontSize: 12, borderRadius: 8 }}
                            />
                            <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                              {chartData.map((entry, i) => (
                                <Cell key={i} fill={entry.validated ? "#10b981" : "#f87171"} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 justify-center">
                          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> Validée</span>
                          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-400 inline-block" /> Non validée</span>
                        </div>
                      </div>
                    )}
                    <div className="space-y-2">
                      {session.progress.map((p) => {
                        const effectiveLevel = getEffectiveLevel(p);
                        const score = p.questionsAsked > 0 ? Math.round((p.correctCount / p.questionsAsked) * 100) : 0;
                        const validatedLabel = effectiveLevel ? "Validée" : "À retravailler";
                        return (
                          <div key={p.subSubThemeId} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-800">{p.subSubThemeName}</p>
                              <p className="text-xs text-gray-500">{p.correctCount}/{p.questionsAsked} correct</p>
                            </div>
                            <div className="ml-4 flex items-center gap-3 shrink-0">
                              <span className="text-sm font-semibold text-gray-700">{score}%</span>
                              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${effectiveLevel ? "bg-indigo-50 text-indigo-700" : "bg-gray-100 text-gray-500"}`}>
                                {effectiveLevel ? (LEVEL_LABELS[effectiveLevel] || effectiveLevel) : validatedLabel}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </Modal>
      )}

      {/* Credentials Modal */}
      {showCredModal && (
        <Modal title={credList.length === 1 ? t("credentials") : `${t("credentials")} (${credList.length})`} onClose={() => setShowCredModal(false)} wide={credList.length > 1}>
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
              Ces identifiants ne sont affichés qu'une seule fois. Téléchargez le CSV ou envoyez les e-mails avant de fermer.
            </div>
            <div className="space-y-3">
              {credList.map((cred, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-4 space-y-2">
                  <p className="font-semibold text-gray-800">{cred.firstName} {cred.lastName}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-xs text-gray-500 block">Identifiant</span>
                      <span className="font-mono text-gray-800">{cred.username}</span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 block">Mot de passe</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-gray-800">
                          {credVisible[idx] ? cred.plainPassword : "••••••••••••"}
                        </span>
                        <button onClick={() => setCredVisible(prev => ({ ...prev, [idx]: !prev[idx] }))}
                          className="text-gray-400 hover:text-gray-600">
                          {credVisible[idx] ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleSendEmail(idx, cred)}
                    disabled={sendingEmail === idx}
                    className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                  >
                    <Mail size={12} />
                    {sendingEmail === idx ? "Envoi..." : "Envoyer par e-mail"}
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => downloadCredentialsCSV(credList)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50"
              >
                <Download size={14} /> Télécharger CSV
              </button>
              <button onClick={() => setShowCredModal(false)}
                className="px-4 py-2 rounded-lg text-white text-sm font-semibold"
                style={{ backgroundColor: branding.primaryColor }}>
                Fermer
              </button>
            </div>
          </div>
        </Modal>
      )}
      <HelpRequestButton /> {/* ITER12 */}
    </div>
  );
}
