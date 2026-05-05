import React, { useEffect, useRef, useState } from "react";
import PageShell from "../../components/PageShell";
import Sidebar from "../../components/Sidebar";
import { useAuth } from "../../contexts/AuthContext";
import { useI18n } from "../../contexts/I18nContext"; // ITER9
import { resolveAssetUrl } from "../../lib/runtime";
import toast from "react-hot-toast";
import {
  Plus, Pencil, X, Copy, Check, ClipboardList, FileSpreadsheet, Upload,
  AlertTriangle, SlidersHorizontal, ChevronDown, ChevronRight,
  Mail, RefreshCw, Eye, EyeOff, Send, Trash2,
} from "lucide-react";
import * as XLSX from "xlsx";

const SA_PRIMARY = "#27295A";
const LEVELS = ["FONDAMENTAL", "BASIQUE", "INTERMEDIAIRE", "AVANCE", "COMPLET"];

interface SubSubTheme { id: number; label: string; subThemeId: number; }
interface SubTheme { id: number; label: string; themeId: number; subSubThemes: SubSubTheme[]; }
interface Theme { id: number; label: string; subThemes: SubTheme[]; }

interface TestCompetence { id: number; subSubThemeId: number | null; subThemeId: number | null; questionCount: number; expectedLevel: string; }
interface Test { id: number; name: string; description: string | null; competences: TestCompetence[]; }
interface ClientTestLevel { id: number; subSubThemeId: number; expectedLevel: string; }
interface ClientTest { id: number; testId: number; test: Test; levels?: ClientTestLevel[]; }

interface TestStatus { testId: number; testName: string; status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED"; }
interface EmployeeWithStatus {
  id: number; lastName: string; firstName: string; email: string;
  position: string | null; site: string | null; country: string | null;
  plainPassword: string | null;
  user?: { username: string } | null;
  testStatuses: TestStatus[];
}

interface ImportRow {
  lastName: string; firstName: string; birthDate: string; position: string;
  department: string; site: string; country: string; language: string; email: string; _error?: string;
}

// ITER10: liste complète des pays du monde en français (triée alphabétiquement)
const COUNTRIES_FR = [
  "Afghanistan","Afrique du Sud","Albanie","Algérie","Allemagne","Andorre","Angola",
  "Antigua-et-Barbuda","Arabie saoudite","Argentine","Arménie","Australie","Autriche",
  "Azerbaïdjan","Bahamas","Bahreïn","Bangladesh","Barbade","Bélarus","Belgique","Belize",
  "Bénin","Bhoutan","Bolivie","Bosnie-Herzégovine","Botswana","Brésil","Brunéi",
  "Bulgarie","Burkina Faso","Burundi","Cabo Verde","Cambodge","Cameroun","Canada",
  "Centrafrique","Chili","Chine","Chypre","Colombie","Comores","Congo","Congo (RDC)",
  "Corée du Nord","Corée du Sud","Costa Rica","Côte d'Ivoire","Croatie","Cuba","Danemark",
  "Djibouti","Dominique","Égypte","Émirats arabes unis","Équateur","Érythrée","Espagne",
  "Eswatini","Estonie","États-Unis","Éthiopie","Fidji","Finlande","France","Gabon",
  "Gambie","Géorgie","Ghana","Grèce","Grenade","Guatemala","Guinée","Guinée-Bissau",
  "Guinée équatoriale","Guyana","Haïti","Honduras","Hongrie","Îles Marshall",
  "Îles Salomon","Inde","Indonésie","Irak","Iran","Irlande","Islande","Israël","Italie",
  "Jamaïque","Japon","Jordanie","Kazakhstan","Kenya","Kirghizistan","Kiribati","Koweït",
  "Laos","Lesotho","Lettonie","Liban","Libéria","Libye","Liechtenstein","Lituanie",
  "Luxembourg","Macédoine du Nord","Madagascar","Malaisie","Malawi","Maldives","Mali",
  "Malte","Maroc","Maurice","Mauritanie","Mexique","Micronésie","Moldavie","Monaco",
  "Mongolie","Monténégro","Mozambique","Myanmar","Namibie","Nauru","Népal","Nicaragua",
  "Niger","Nigéria","Norvège","Nouvelle-Zélande","Oman","Ouganda","Ouzbékistan",
  "Pakistan","Palaos","Panama","Papouasie-Nouvelle-Guinée","Paraguay","Pays-Bas","Pérou",
  "Philippines","Pologne","Portugal","Qatar","République dominicaine","République tchèque",
  "Roumanie","Royaume-Uni","Russie","Rwanda","Saint-Kitts-et-Nevis","Saint-Marin",
  "Saint-Vincent-et-les-Grenadines","Sainte-Lucie","Salvador","Samoa","São Tomé-et-Príncipe",
  "Sénégal","Serbie","Seychelles","Sierra Leone","Singapour","Slovaquie","Slovénie",
  "Somalie","Soudan","Soudan du Sud","Sri Lanka","Suède","Suisse","Suriname","Syrie",
  "Tadjikistan","Tanzanie","Tchad","Thaïlande","Timor-Leste","Togo","Tonga",
  "Trinité-et-Tobago","Tunisie","Turkménistan","Turquie","Tuvalu","Ukraine","Uruguay",
  "Vanuatu","Vatican","Venezuela","Viêt Nam","Yémen","Zambie","Zimbabwe",
];
const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
  "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
  "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
  "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire",
  "New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio",
  "Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota",
  "Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia",
  "Wisconsin","Wyoming","District of Columbia",
];

interface Client {
  id: number; name: string; address: string | null;
  postalCode: string | null; city: string | null; country: string | null; state?: string | null; // ITER7+ITER10
  siret?: string | null; sector?: string | null; // ITER9: champs fiche détail
  contactName?: string | null; contactEmail?: string | null; phone?: string | null; website?: string | null; // ITER9
  primaryColor: string; accentColor: string; logoUrl: string | null;
  adminPassword?: string | null; // ITER11: mot de passe admin visible SA
  updatedByAdmin: boolean;
  _count?: { employees: number };
  users?: { id: number; email: string; username: string }[];
  clientTests?: { id: number; test: { name: string } }[]; // ITER9
}

function Modal({ title, onClose, children, wide, extraWide }: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; extraWide?: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-xl shadow-xl w-full ${extraWide ? "max-w-5xl" : wide ? "max-w-2xl" : "max-w-lg"} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

const statusColors: Record<string, string> = {
  NOT_STARTED: "bg-red-100 text-red-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-green-100 text-green-700",
};
const statusDot: Record<string, string> = {
  NOT_STARTED: "🔴",
  IN_PROGRESS: "🟡",
  COMPLETED: "🟢",
};

export default function SuperAdminClients() {
  const { accessToken } = useAuth();
  const { t } = useI18n(); // ITER9
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedClient, setExpandedClient] = useState<number | null>(null);
  const [employeesMap, setEmployeesMap] = useState<Record<number, EmployeeWithStatus[]>>({});
  const [loadingEmployees, setLoadingEmployees] = useState<Record<number, boolean>>({});
  const [showPwMap, setShowPwMap] = useState<Record<number, boolean>>({});
  const [showAdminPw, setShowAdminPw] = useState(false); // ITER11: toggle mot de passe admin
  const [resettingAdminPw, setResettingAdminPw] = useState(false); // ITER11

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createAddress, setCreateAddress] = useState("");
  const [createPostalCode, setCreatePostalCode] = useState(""); // ITER7: code postal
  const [createCity, setCreateCity] = useState(""); // ITER7: ville
  const [createCountry, setCreateCountry] = useState(""); // ITER7: pays
  const [createState, setCreateState] = useState(""); // ITER10: état US
  const [createAdminEmail, setCreateAdminEmail] = useState("");
  const [createPrimaryColor, setCreatePrimaryColor] = useState("#27295A");
  const [createAccentColor, setCreateAccentColor] = useState("#FCC00E");
  const [saving, setSaving] = useState(false);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [copiedPassword, setCopiedPassword] = useState(false);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editPostalCode, setEditPostalCode] = useState(""); // ITER7: code postal
  const [editCity, setEditCity] = useState(""); // ITER7: ville
  const [editCountry, setEditCountry] = useState(""); // ITER7: pays
  const [editState, setEditState] = useState(""); // ITER10: état US
  const [editPrimaryColor, setEditPrimaryColor] = useState("#27295A");
  const [editAccentColor, setEditAccentColor] = useState("#FCC00E");

  // Tests modal
  const [showTestsModal, setShowTestsModal] = useState(false);
  const [testsClient, setTestsClient] = useState<Client | null>(null);
  const [availableTests, setAvailableTests] = useState<Test[]>([]);
  const [clientTests, setClientTests] = useState<ClientTest[]>([]);

  // Levels modal
  const [showLevelsModal, setShowLevelsModal] = useState(false);
  const [levelsClientTest, setLevelsClientTest] = useState<ClientTest | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [levelsForm, setLevelsForm] = useState<Record<number, string>>({});

  // ITER9: Detail modal
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailClient, setDetailClient] = useState<Client | null>(null);

  // Import modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importClient, setImportClient] = useState<Client | null>(null);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importSaving, setImportSaving] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const authHeaders = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

  async function loadClients() {
    if (!accessToken) return;
    try {
      const res = await fetch("/api/super-admin/clients", { headers: authHeaders });
      if (!res.ok) throw new Error("API error");
      setClients(await res.json());
    } catch { toast.error(t("loadingError")); }
    finally { setLoading(false); }
  }

  async function loadEmployees(clientId: number) {
    if (employeesMap[clientId]) return; // already loaded
    setLoadingEmployees(prev => ({ ...prev, [clientId]: true }));
    try {
      const res = await fetch(`/api/super-admin/clients/${clientId}/employees`, { headers: authHeaders });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setEmployeesMap(prev => ({ ...prev, [clientId]: data }));
    } catch { toast.error(t("loadEmployeesError")); }
    finally { setLoadingEmployees(prev => ({ ...prev, [clientId]: false })); }
  }

  useEffect(() => {
    loadClients();
    fetch("/api/super-admin/themes", { headers: authHeaders })
      .then(r => r.json()).then(setThemes).catch(() => {});
    fetch("/api/super-admin/tests", { headers: authHeaders })
      .then(r => r.json()).then(setAvailableTests).catch(() => {});
  }, [accessToken]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/super-admin/clients", {
        method: "POST", headers: authHeaders,
        body: JSON.stringify({ name: createName, address: createAddress, postalCode: createPostalCode, city: createCity, country: createCountry, state: createState, adminEmail: createAdminEmail, primaryColor: createPrimaryColor, accentColor: createAccentColor }), // ITER7+ITER10
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setGeneratedPassword(data.generatedPassword);
      setShowCreateModal(false);
      setShowPasswordModal(true);
      loadClients();
    } catch { toast.error(t("loadingError")); }
    finally { setSaving(false); }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingClient) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/super-admin/clients/${editingClient.id}`, {
        method: "PUT", headers: authHeaders,
        body: JSON.stringify({ name: editName, address: editAddress, postalCode: editPostalCode, city: editCity, country: editCountry, state: editState, primaryColor: editPrimaryColor, accentColor: editAccentColor }), // ITER7+ITER10
      });
      if (!res.ok) throw new Error();
      toast.success(t("clientModified"));
      setShowEditModal(false);
      loadClients();
    } catch { toast.error(t("loadingError")); }
    finally { setSaving(false); }
  }

  function openEditModal(c: Client) {
    setEditingClient(c); setEditName(c.name); setEditAddress(c.address || "");
    // ITER7: pré-remplissage des nouveaux champs adresse
    setEditPostalCode(c.postalCode || ""); setEditCity(c.city || ""); setEditCountry(c.country || ""); setEditState(c.state || ""); // ITER10
    setEditPrimaryColor(c.primaryColor); setEditAccentColor(c.accentColor);
    setShowEditModal(true);
  }

  async function openTestsModal(c: Client) {
    setTestsClient(c);
    const res = await fetch(`/api/super-admin/clients/${c.id}/tests`, { headers: authHeaders });
    setClientTests(await res.json());
    setShowTestsModal(true);
  }

  async function handleAssignTest(testId: number) {
    if (!testsClient) return;
    const res = await fetch(`/api/super-admin/clients/${testsClient.id}/assign-test`, {
      method: "POST", headers: authHeaders, body: JSON.stringify({ testId }),
    });
    if (res.ok) {
      const updated = await res.json();
      setClientTests(prev => [...prev.filter(ct => ct.testId !== testId), updated]);
    }
  }

  async function handleUnassignTest(testId: number) {
    if (!testsClient) return;
    const res = await fetch(`/api/super-admin/clients/${testsClient.id}/assign-test/${testId}`, {
      method: "DELETE", headers: authHeaders,
    });
    if (res.ok) setClientTests(prev => prev.filter(ct => ct.testId !== testId));
  }

  function openLevelsModal(ct: ClientTest) {
    setLevelsClientTest(ct);
    const form: Record<number, string> = {};
    ct.test.competences.filter(c => c.subSubThemeId).forEach(c => {
      const existing = ct.levels?.find(l => l.subSubThemeId === c.subSubThemeId!);
      form[c.subSubThemeId!] = existing?.expectedLevel || c.expectedLevel || "FONDAMENTAL";
    });
    setLevelsForm(form);
    setShowLevelsModal(true);
  }

  async function handleSaveLevels() {
    if (!testsClient || !levelsClientTest) return;
    const levels = Object.entries(levelsForm).map(([subSubThemeId, expectedLevel]) => ({ subSubThemeId: Number(subSubThemeId), expectedLevel }));
    const res = await fetch(`/api/super-admin/clients/${testsClient.id}/test-levels/${levelsClientTest.id}`, {
      method: "PUT", headers: authHeaders, body: JSON.stringify({ levels }),
    });
    if (res.ok) { toast.success(t("saveLabel") + " OK"); setShowLevelsModal(false); }
  }

  function openImportModal(c: Client) {
    setImportClient(c); setImportRows([]); setShowImportModal(true);
    setTimeout(() => importFileRef.current?.click(), 100);
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const wb = XLSX.read(ev.target?.result, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" });
      if (raw.length < 2) return;
      const headerRow = (raw[0] as string[]).map(String);
      const dataRows = raw.slice(1) as string[][];

      const norm = (s: string) => String(s).toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, " ").trim();
      const headerNorm = headerRow.map(norm);
      const usedCols = new Set<number>();
      const findCol = (...names: string[]) => {
        for (const name of names) {
          const idx = headerNorm.findIndex((h, i) => !usedCols.has(i) && h === norm(name));
          if (idx >= 0) { usedCols.add(idx); return idx; }
        }
        for (const name of names) {
          const n = norm(name);
          const idx = headerNorm.findIndex((h, i) => !usedCols.has(i) && h.includes(n));
          if (idx >= 0) { usedCols.add(idx); return idx; }
        }
        return -1;
      };

      const colNom     = findCol("Nom", "lastName", "last name", "nom de famille");
      const colPrenom  = findCol("Prénom", "Prenom", "firstName", "first name", "prenom");
      const colEmail   = findCol("Email", "E-mail", "Adresse e-mail", "Adresse email", "Courriel", "mail");
      const colPoste   = findCol("Poste", "position", "Fonction", "fonction");
      const colService = findCol("Service", "department", "Département", "departement");
      const colSite    = findCol("Site", "site");
      const colPays    = findCol("Pays", "country", "pays");
      const colLangue  = findCol("Langue", "language", "lang");
      const colNaiss   = findCol("Date de naissance", "birthDate", "naissance");

      const get = (row: string[], col: number) => String(col >= 0 ? row[col] ?? "" : "").trim();

      setImportRows(dataRows
        .filter(row => row.some(v => v !== ""))
        .map(row => {
          const email = get(row, colEmail);
          return {
            lastName:  get(row, colNom),
            firstName: get(row, colPrenom),
            birthDate: get(row, colNaiss),
            position:  get(row, colPoste),
            department: get(row, colService),
            site:      get(row, colSite),
            country:   get(row, colPays),
            language:  get(row, colLangue) || "fr",
            email,
            _error: !email ? "Email manquant" : undefined,
          };
        })
      );
    };
    reader.readAsBinaryString(file);
  }

  async function handleImportConfirm() {
    if (!importClient) return;
    const valid = importRows.filter(r => r.email && !r._error);
    if (!valid.length) return;
    setImportSaving(true);
    try {
      const res = await fetch(`/api/super-admin/clients/${importClient.id}/employees/import`, {
        method: "POST", headers: authHeaders, body: JSON.stringify({ employees: valid }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(`${data.imported} ${t("savedEmployees")}`);
      setShowImportModal(false);
      setEmployeesMap(prev => ({ ...prev, [importClient.id]: undefined as any }));
      loadClients();
    } catch { toast.error(t("importError")); }
    finally { setImportSaving(false); }
  }

  async function handleResetPassword(clientId: number, empId: number) {
    try {
      const res = await fetch(`/api/super-admin/clients/${clientId}/employees/${empId}/reset-password`, {
        method: "POST", headers: authHeaders,
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(`${t("newPasswordLabel")} : ${data.plainPassword}`);
      // Refresh employees
      setEmployeesMap(prev => ({ ...prev, [clientId]: undefined as any }));
      loadEmployees(clientId);
    } catch { toast.error(t("loadingError")); }
  }

  async function handleSendCredentials(clientId: number, empId: number) {
    try {
      const res = await fetch(`/api/super-admin/clients/${clientId}/employees/${empId}/send-credentials`, {
        method: "POST", headers: authHeaders,
      });
      if (!res.ok) throw new Error();
      toast.success(t("credentialsSent"));
    } catch { toast.error(t("loadingError")); }
  }

  async function handleSendAllCredentials(clientId: number) {
    try {
      const res = await fetch(`/api/super-admin/clients/${clientId}/send-all-credentials`, {
        method: "POST", headers: authHeaders,
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(`${data.sent} e-mails envoyés`); // count + generic message
    } catch { toast.error(t("loadingError")); }
  }

  async function handleDeleteClient(client: Client) {
    const confirmed = window.confirm(
      `Supprimer l'entreprise "${client.name}" ?\n\nCette action est irréversible et supprimera tous les employés, utilisateurs et données associés.`
    );
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/super-admin/clients/${client.id}`, {
        method: "DELETE", headers: authHeaders,
      });
      if (!res.ok) throw new Error();
      toast.success(`Entreprise "${client.name}" supprimée`);
      setClients(prev => prev.filter(c => c.id !== client.id));
    } catch { toast.error(t("loadingError")); }
  }

  // ITER11: réinitialiser le mot de passe de l'admin client
  async function handleResetAdminPassword(clientId: number) {
    if (!window.confirm(t("resetPasswordAction") + " ?")) return;
    setResettingAdminPw(true);
    try {
      const res = await fetch(`/api/super-admin/clients/${clientId}/reset-admin-password`, {
        method: "POST", headers: authHeaders,
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      // Mettre à jour le client affiché avec le nouveau mot de passe
      setDetailClient(prev => prev ? { ...prev, adminPassword: data.adminPassword } : prev);
      setClients(prev => prev.map(c => c.id === clientId ? { ...c, adminPassword: data.adminPassword } : c));
      setShowAdminPw(true);
      toast.success(t("passwordUpdated"));
    } catch { toast.error(t("loadingError")); }
    finally { setResettingAdminPw(false); }
  }

  function toggleExpand(clientId: number) {
    if (expandedClient === clientId) {
      setExpandedClient(null);
    } else {
      setExpandedClient(clientId);
      loadEmployees(clientId);
    }
  }

  // Get subsubtheme label helper
  function getSST(sstId: number | null): string {
    for (const t of themes) for (const st of t.subThemes) for (const sst of st.subSubThemes) if (sst.id === sstId) return sst.label;
    return String(sstId);
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <PageShell>
        <div className="p-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-900">{t("companies")}</h1>
            <button onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: SA_PRIMARY }}>
              <Plus size={16} /> {t("newCompany")}
            </button>
          </div>

          {loading ? <p className="text-gray-500">{t("loading")}</p> : (
            <div className="space-y-3">
              {clients.map(client => (
                <div key={client.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Client header row */}
                  <div className="flex items-center gap-4 p-4">
                    {/* Expand toggle */}
                    <button onClick={() => toggleExpand(client.id)}
                      className="p-1 hover:bg-gray-100 rounded text-gray-500">
                      {expandedClient === client.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>

                    {/* Color dot + name */}
                    <div className="w-8 h-8 rounded-lg shrink-0" style={{ backgroundColor: client.primaryColor }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{client.name}</span>
                        {client.updatedByAdmin && (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">
                            ✏️ {t("modifiedByAdmin")}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {client._count?.employees || 0} salarié{(client._count?.employees || 0) !== 1 ? "s" : ""}
                        {client.users?.[0] && <span> · Admin : {client.users[0].email}</span>}

                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                      {/* ITER9: Bouton "Voir la fiche" */}
                      <button onClick={() => { setDetailClient(client); setShowDetailModal(true); }}
                        title={t("viewProfile")}
                        className="flex items-center gap-1 px-2 py-1.5 text-xs bg-purple-50 text-purple-600 hover:bg-purple-100 rounded-lg">
                        <Eye size={12} /> {t("viewProfile")}
                      </button>
                      <button onClick={() => handleSendAllCredentials(client.id)}
                        title={t("sendAllCredentials")}
                        className="flex items-center gap-1 px-2 py-1.5 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg">
                        <Send size={12} /> {t("sendAllBtn")}
                      </button>
                      <button onClick={() => openImportModal(client)}
                        title={t("importEmployees")}
                        className="flex items-center gap-1 px-2 py-1.5 text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg">
                        <Upload size={12} /> {t("importBtn")}
                      </button>
                      <button onClick={() => openTestsModal(client)}
                        title={t("testsBtn")}
                        className="flex items-center gap-1 px-2 py-1.5 text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg">
                        <ClipboardList size={12} /> {t("testsBtn")}
                      </button>
                      <button onClick={() => openEditModal(client)}
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDeleteClient(client)}
                        title="Supprimer l'entreprise"
                        className="p-1.5 hover:bg-red-50 rounded-lg text-red-400 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Employee accordion */}
                  {expandedClient === client.id && (
                    <div className="border-t border-gray-100 bg-gray-50">
                      {loadingEmployees[client.id] ? (
                        <p className="p-4 text-sm text-gray-500">{t("loading")}</p>
                      ) : !employeesMap[client.id] || employeesMap[client.id].length === 0 ? (
                        <p className="p-4 text-sm text-gray-500">{t("noEmployee")}</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-200 bg-gray-100">
                                <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">{t("lastName")}</th>
                                <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">{t("firstName")}</th>
                                <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">{t("email")}</th>
                                <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">{t("position")}</th>
                                <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">{t("site")}</th>
                                <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">{t("identifier")}</th>
                                <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">{t("passwordField")}</th>
                                <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">{t("testsList")}</th>
                                <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">{t("actions")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {employeesMap[client.id].map(emp => (
                                <tr key={emp.id} className="border-b border-gray-100 hover:bg-white">
                                  <td className="px-4 py-2 font-medium">{emp.lastName}</td>
                                  <td className="px-4 py-2">{emp.firstName}</td>
                                  <td className="px-4 py-2 text-gray-600 text-xs">{emp.email}</td>
                                  <td className="px-4 py-2 text-gray-600 text-xs">{emp.position || "—"}</td>
                                  <td className="px-4 py-2 text-gray-600 text-xs">{emp.site || "—"}</td>
                                  <td className="px-4 py-2 text-xs font-mono">{emp.user?.username || emp.email}</td>
                                  <td className="px-4 py-2 text-xs">
                                    <div className="flex items-center gap-1">
                                      <span className="font-mono">
                                        {showPwMap[emp.id] ? (emp.plainPassword || "—") : "••••••••"}
                                      </span>
                                      <button onClick={() => setShowPwMap(prev => ({ ...prev, [emp.id]: !prev[emp.id] }))}
                                        className="text-gray-400 hover:text-gray-600">
                                        {showPwMap[emp.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                                      </button>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2">
                                    <div className="flex flex-wrap gap-1">
                                      {emp.testStatuses.map(ts => (
                                        <span key={ts.testId} title={ts.testName}
                                          className={`px-1.5 py-0.5 rounded text-xs ${statusColors[ts.status]}`}>
                                          {statusDot[ts.status]} {ts.testName.slice(0, 15)}{ts.testName.length > 15 ? "…" : ""}
                                        </span>
                                      ))}
                                      {emp.testStatuses.length === 0 && <span className="text-gray-400 text-xs">{t("noTest")}</span>}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2">
                                    <div className="flex items-center gap-1">
                                      <button onClick={() => handleSendCredentials(client.id, emp.id)}
                                        title="Envoyer identifiants" className="p-1 hover:bg-blue-50 rounded text-blue-500">
                                        <Mail size={13} />
                                      </button>
                                      <button onClick={() => handleResetPassword(client.id, emp.id)}
                                        title="Réinitialiser mot de passe" className="p-1 hover:bg-amber-50 rounded text-amber-500">
                                        <RefreshCw size={13} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="px-4 py-2 text-xs text-gray-500 flex items-center justify-between">
                            <span>{employeesMap[client.id].length} salarié{employeesMap[client.id].length !== 1 ? "s" : ""}</span>
                            <div className="flex items-center gap-3">
                              {["NOT_STARTED","IN_PROGRESS","COMPLETED"].map(s => {
                                const count = employeesMap[client.id].reduce((acc, e) => acc + e.testStatuses.filter(t => t.status === s).length, 0);
                                const label = s === "NOT_STARTED" ? t("notStarted") : s === "IN_PROGRESS" ? t("inProgress") : t("completed"); // ITER9
                              return count > 0 ? <span key={s}>{statusDot[s]} {label} : {count}</span> : null;
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </PageShell>

      {/* Create modal */}
      {showCreateModal && (
        <Modal title={t("newCompany")} onClose={() => setShowCreateModal(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">{t("lastName").replace("Nom", "Nom")} *</label>
              <input type="text" value={createName} onChange={e => setCreateName(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">{t("address")}</label>
              <input type="text" value={createAddress} onChange={e => setCreateAddress(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
            {/* ITER7: champs code postal, ville, pays */}
            <div className="flex gap-3">
              <div className="flex-1"><label className="block text-sm font-medium text-gray-700 mb-1">{t("postalCode")}</label>
                <input type="text" value={createPostalCode} onChange={e => setCreatePostalCode(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
              <div className="flex-1"><label className="block text-sm font-medium text-gray-700 mb-1">{t("city")}</label>
                <input type="text" value={createCity} onChange={e => setCreateCity(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
            </div>
            {/* ITER10: Pays dropdown + état US conditionnel */}
            <div><label className="block text-sm font-medium text-gray-700 mb-1">{t("country")}</label>
              <select value={createCountry} onChange={e => { setCreateCountry(e.target.value); setCreateState(""); }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">{t("selectCountry")}</option>
                {COUNTRIES_FR.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {createCountry === "États-Unis" && (
              <div><label className="block text-sm font-medium text-gray-700 mb-1">{t("state")}</label>
                <select value={createState} onChange={e => setCreateState(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">{t("selectState")}</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
            <div><label className="block text-sm font-medium text-gray-700 mb-1">{t("adminEmail")} *</label>
              <input type="email" value={createAdminEmail} onChange={e => setCreateAdminEmail(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
            {/* ITER7: color picker + hex synchronisés */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("primaryColor")}</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={createPrimaryColor} onChange={e => setCreatePrimaryColor(e.target.value)}
                    className="w-10 h-10 border border-gray-300 rounded-lg cursor-pointer shrink-0" />
                  <input type="text" value={createPrimaryColor} onChange={e => setCreatePrimaryColor(e.target.value)}
                    maxLength={7} className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-sm font-mono" placeholder="#27295A" />
                </div>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("accentColor")}</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={createAccentColor} onChange={e => setCreateAccentColor(e.target.value)}
                    className="w-10 h-10 border border-gray-300 rounded-lg cursor-pointer shrink-0" />
                  <input type="text" value={createAccentColor} onChange={e => setCreateAccentColor(e.target.value)}
                    maxLength={7} className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-sm font-mono" placeholder="#FCC00E" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t("cancel")}</button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50"
                style={{ backgroundColor: SA_PRIMARY }}>
                {saving ? t("creating") : t("create")}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Password modal */}
      {showPasswordModal && (
        <Modal title={t("adminCredentials")} onClose={() => setShowPasswordModal(false)}>
          <p className="text-sm text-gray-600 mb-4">{t("notePassword")}</p>
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-3 mb-4">
            <code className="flex-1 text-sm font-mono">{generatedPassword}</code>
            <button onClick={() => { navigator.clipboard.writeText(generatedPassword); setCopiedPassword(true); setTimeout(() => setCopiedPassword(false), 2000); }}
              className="p-1.5 hover:bg-gray-200 rounded">
              {copiedPassword ? <Check size={16} className="text-green-500" /> : <Copy size={16} className="text-gray-500" />}
            </button>
          </div>
          <button onClick={() => setShowPasswordModal(false)}
            className="w-full py-2 text-sm text-white rounded-lg"
            style={{ backgroundColor: SA_PRIMARY }}>{t("close")}</button>
        </Modal>
      )}

      {/* Edit modal */}
      {showEditModal && editingClient && (
        <Modal title={t("modifyCompany")} onClose={() => setShowEditModal(false)}>
          <form onSubmit={handleEdit} className="space-y-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
              <input type="text" value={editName} onChange={e => setEditName(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">{t("address")}</label>
              <input type="text" value={editAddress} onChange={e => setEditAddress(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
            {/* ITER7: champs code postal, ville, pays */}
            <div className="flex gap-3">
              <div className="flex-1"><label className="block text-sm font-medium text-gray-700 mb-1">{t("postalCode")}</label>
                <input type="text" value={editPostalCode} onChange={e => setEditPostalCode(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
              <div className="flex-1"><label className="block text-sm font-medium text-gray-700 mb-1">{t("city")}</label>
                <input type="text" value={editCity} onChange={e => setEditCity(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
            </div>
            {/* ITER10: Pays dropdown + état US conditionnel */}
            <div><label className="block text-sm font-medium text-gray-700 mb-1">{t("country")}</label>
              <select value={editCountry} onChange={e => { setEditCountry(e.target.value); setEditState(""); }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">{t("selectCountry")}</option>
                {COUNTRIES_FR.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {editCountry === "États-Unis" && (
              <div><label className="block text-sm font-medium text-gray-700 mb-1">{t("state")}</label>
                <select value={editState} onChange={e => setEditState(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">{t("selectState")}</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
            {/* ITER7: color picker + hex synchronisés */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("primaryColor")}</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={editPrimaryColor} onChange={e => setEditPrimaryColor(e.target.value)}
                    className="w-10 h-10 border border-gray-300 rounded-lg cursor-pointer shrink-0" />
                  <input type="text" value={editPrimaryColor} onChange={e => setEditPrimaryColor(e.target.value)}
                    maxLength={7} className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-sm font-mono" placeholder="#27295A" />
                </div>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("accentColor")}</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={editAccentColor} onChange={e => setEditAccentColor(e.target.value)}
                    className="w-10 h-10 border border-gray-300 rounded-lg cursor-pointer shrink-0" />
                  <input type="text" value={editAccentColor} onChange={e => setEditAccentColor(e.target.value)}
                    maxLength={7} className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-sm font-mono" placeholder="#FCC00E" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowEditModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t("cancel")}</button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50"
                style={{ backgroundColor: SA_PRIMARY }}>
                {saving ? t("register") : t("saveLabel")}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Tests modal */}
      {showTestsModal && testsClient && (
        <Modal title={`Tests – ${testsClient.name}`} onClose={() => setShowTestsModal(false)} wide>
          <div className="space-y-3">
            {availableTests.map(test => {
              const assigned = clientTests.find(ct => ct.testId === test.id);
              return (
                <div key={test.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <span className="text-sm text-gray-900">{test.name}</span>
                  <div className="flex items-center gap-2">
                    {assigned && (
                      <button onClick={() => openLevelsModal(assigned)}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-50 text-indigo-600 rounded-lg">
                        <SlidersHorizontal size={11} /> Niveaux
                      </button>
                    )}
                    <button
                      onClick={() => assigned ? handleUnassignTest(test.id) : handleAssignTest(test.id)}
                      className={`px-3 py-1 text-xs rounded-lg font-medium ${assigned ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-green-50 text-green-600 hover:bg-green-100"}`}>
                      {assigned ? t("unassignTest") : t("assignTest")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      {/* Levels modal */}
      {showLevelsModal && levelsClientTest && (
        <Modal title={`Niveaux attendus – ${levelsClientTest.test.name}`} onClose={() => setShowLevelsModal(false)} wide>
          <div className="space-y-3">
            {levelsClientTest.test.competences
              .filter(c => c.subSubThemeId)
              .filter((c, idx, arr) => arr.findIndex(x => x.subSubThemeId === c.subSubThemeId) === idx)
              .map(c => (
              <div key={c.subSubThemeId} className="flex items-center justify-between gap-4">
                <span className="text-sm text-gray-700 flex-1">{getSST(c.subSubThemeId)}</span>
                <div className="flex flex-col items-end gap-1">
                  <label className="text-xs text-gray-500 font-medium">{t("expectedLevel")}</label>
                  <select value={levelsForm[c.subSubThemeId!] || "FONDAMENTAL"}
                    onChange={e => setLevelsForm(prev => ({ ...prev, [c.subSubThemeId!]: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none">
                    {LEVELS.map(l => <option key={l} value={l}>{l.charAt(0) + l.slice(1).toLowerCase()}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setShowLevelsModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t("cancel")}</button>
            <button onClick={handleSaveLevels} className="px-4 py-2 text-sm text-white rounded-lg" style={{ backgroundColor: SA_PRIMARY }}>{t("saveLabel")}</button>
          </div>
        </Modal>
      )}

      {/* ITER9: Detail modal — fiche client */}
      {showDetailModal && detailClient && (
        <Modal title={t("clientProfile")} onClose={() => setShowDetailModal(false)} wide>
          <div className="space-y-4 text-sm">
            {/* Logo */}
            {detailClient.logoUrl && (
              <div className="flex justify-center mb-2">
                <img src={resolveAssetUrl(detailClient.logoUrl) || detailClient.logoUrl} alt="Logo" className="h-16 object-contain rounded" />
              </div>
            )}
            {/* Nom + badge modifié */}
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-gray-900">{detailClient.name}</span>
              {detailClient.updatedByAdmin && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">
                  ✏️ {t("modifiedByAdmin")}
                </span>
              )}
            </div>
            {/* Adresse */}
            <div className="grid grid-cols-2 gap-3">
              {detailClient.address && (
                <div><span className="text-gray-500">{t("address")} :</span> <span className="font-medium">{detailClient.address}</span></div>
              )}
              {detailClient.postalCode && (
                <div><span className="text-gray-500">{t("postalCode")} :</span> <span className="font-medium">{detailClient.postalCode}</span></div>
              )}
              {detailClient.city && (
                <div><span className="text-gray-500">{t("city")} :</span> <span className="font-medium">{detailClient.city}</span></div>
              )}
              {detailClient.country && (
                <div><span className="text-gray-500">{t("country")} :</span> <span className="font-medium">{detailClient.country}</span></div>
              )}
              {detailClient.siret && (
                <div><span className="text-gray-500">{t("siret")} :</span> <span className="font-medium">{detailClient.siret}</span></div>
              )}
              {detailClient.sector && (
                <div><span className="text-gray-500">{t("sector")} :</span> <span className="font-medium">{detailClient.sector}</span></div>
              )}
              {detailClient.contactName && (
                <div><span className="text-gray-500">{t("contactName")} :</span> <span className="font-medium">{detailClient.contactName}</span></div>
              )}
              {detailClient.contactEmail && (
                <div><span className="text-gray-500">{t("contactEmail")} :</span> <span className="font-medium">{detailClient.contactEmail}</span></div>
              )}
              {detailClient.phone && (
                <div><span className="text-gray-500">{t("phone")} :</span> <span className="font-medium">{detailClient.phone}</span></div>
              )}
              {detailClient.website && (
                <div><span className="text-gray-500">{t("website")} :</span> <a href={detailClient.website} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline">{detailClient.website}</a></div>
              )}
              <div><span className="text-gray-500">{t("employeeCount")} :</span> <span className="font-medium">{detailClient._count?.employees ?? 0}</span></div>
            </div>
            {/* Couleurs */}
            <div>
              <p className="text-gray-500 mb-2">{t("colorSwatches")} :</p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg border border-gray-200" style={{ backgroundColor: detailClient.primaryColor }} />
                  <span className="text-xs font-mono text-gray-600">{detailClient.primaryColor}</span>
                  <span className="text-xs text-gray-400">{t("primaryColor")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg border border-gray-200" style={{ backgroundColor: detailClient.accentColor }} />
                  <span className="text-xs font-mono text-gray-600">{detailClient.accentColor}</span>
                  <span className="text-xs text-gray-400">{t("accentColor")}</span>
                </div>
              </div>
            </div>
            {/* ITER11: Mot de passe admin */}
            <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
              <p className="text-gray-500 text-xs font-medium mb-2 uppercase tracking-wide">{t("adminCredentials")}</p>
              <div className="flex items-center gap-2">
                <span className="text-gray-600 text-xs">{t("identifier")} :</span>
                <span className="font-mono text-xs text-gray-800">{detailClient.users?.[0]?.username || "—"}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-gray-600 text-xs">{t("passwordField")} :</span>
                <span className="font-mono text-xs text-gray-800">
                  {detailClient.adminPassword
                    ? (showAdminPw ? detailClient.adminPassword : "••••••••")
                    : <span className="text-gray-400 italic">{t("notStarted")}</span>}
                </span>
                {detailClient.adminPassword && (
                  <button onClick={() => setShowAdminPw(v => !v)}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded" title={showAdminPw ? t("hidePassword") : t("showPassword")}>
                    {showAdminPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                )}
                <button onClick={() => handleResetAdminPassword(detailClient.id)}
                  disabled={resettingAdminPw}
                  className="ml-auto flex items-center gap-1 px-2 py-1 text-xs text-white rounded"
                  style={{ backgroundColor: SA_PRIMARY }}>
                  <RefreshCw size={12} className={resettingAdminPw ? "animate-spin" : ""} />
                  {t("resetPasswordAction")}
                </button>
              </div>
            </div>
            {/* Tests assignés */}
            {detailClient.clientTests && detailClient.clientTests.length > 0 && (
              <div>
                <p className="text-gray-500 mb-1">{t("assignedTestsList")} :</p>
                <ul className="space-y-1">
                  {detailClient.clientTests.map(ct => (
                    <li key={ct.id} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded">{ct.test.name}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Import modal */}
      {showImportModal && importClient && (
        <Modal title={`Importer des salariés – ${importClient.name}`} onClose={() => setShowImportModal(false)} extraWide>
          <input ref={importFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportFile} />
          {importRows.length === 0 ? (
            <div className="text-center py-8">
              <FileSpreadsheet size={48} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 mb-4">{t("importFile")}</p>
              <button onClick={() => importFileRef.current?.click()}
                className="px-4 py-2 text-sm text-white rounded-lg" style={{ backgroundColor: SA_PRIMARY }}>
                {t("chooseFile")}
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-600">{importRows.filter(r => !r._error).length} {t("validLines")} / {importRows.length} {t("total")}</span>
                <button onClick={() => importFileRef.current?.click()} className="text-xs text-blue-600 hover:underline">{t("changeFile")}</button>
              </div>
              <div className="overflow-x-auto max-h-64 border rounded-lg mb-4">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>{[t("lastName"),t("firstName"),t("email"),t("position"),t("site"),t("country")].map(h => <th key={h} className="px-2 py-1.5 text-left text-gray-600 font-medium">{h}</th>)}<th className="px-2 py-1.5"></th></tr>
                  </thead>
                  <tbody>
                    {importRows.map((r, i) => (
                      <tr key={i} className={`border-t border-gray-100 ${r._error ? "bg-red-50" : ""}`}>
                        <td className="px-2 py-1.5">{r.lastName}</td>
                        <td className="px-2 py-1.5">{r.firstName}</td>
                        <td className="px-2 py-1.5">{r.email}</td>
                        <td className="px-2 py-1.5">{r.position}</td>
                        <td className="px-2 py-1.5">{r.site}</td>
                        <td className="px-2 py-1.5">{r.country}</td>
                        <td className="px-2 py-1.5">{r._error && <span className="flex items-center gap-1 text-red-500"><AlertTriangle size={10}/>{r._error}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowImportModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t("cancel")}</button>
                <button onClick={handleImportConfirm} disabled={importSaving}
                  className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50"
                  style={{ backgroundColor: SA_PRIMARY }}>
                  {importSaving ? t("importing") : t("confirmImport")}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
