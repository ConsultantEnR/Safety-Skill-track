import React, { useEffect, useRef, useState } from "react";
import Sidebar from "../../components/Sidebar";
import { useAuth } from "../../contexts/AuthContext";
import { useI18n } from "../../contexts/I18nContext"; // ITER9
import toast from "react-hot-toast";
import {
  Plus, Pencil, X, FileSpreadsheet, Upload, AlertTriangle, Download,
  ChevronDown, ChevronRight, Filter, Copy, Trash2,
} from "lucide-react";
import * as XLSX from "xlsx";

interface Theme { id: number; label: string; nameEn?: string | null; subThemes: SubTheme[]; }
interface SubTheme { id: number; label: string; nameEn?: string | null; themeId: number; subSubThemes: SubSubTheme[]; }
interface SubSubTheme { id: number; label: string; subThemeId: number; }
interface Question {
  id: number; text: string; type: string; level: string; subSubThemeId: number;
  options: any; expectedAnswer: string | null; customScore: number | null; // ITER10
  subSubTheme: { label: string; subTheme: { label: string; nameEn?: string | null; theme: { label: string; nameEn?: string | null } } };
}
// ITER13: Structured import question (replaces old free-form map)
interface ParsedQuestion {
  _rowIndex: number;
  _format: "A" | "B" | "V3";
  _selected: boolean;
  _alert: "NO_CORRECT" | "ALL_CORRECT" | "NO_ANSWERS" | null;
  question_text: string;
  type: string;
  level: string;
  theme: string;
  sub_theme_1: string;
  sub_theme_2: string;
  correct_answers: string[];
  distractors: string[];
}
// Keep ImportQuestion as alias for backwards compat in state typing
type ImportQuestion = ParsedQuestion;
type ImportFormat = "A" | "B" | "V3";

// ─── ITER13: Excel parser functions ───────────────────────────────────────────
function getCellValue(row: any[], index: number | undefined): string | null {
  if (index === undefined || index === null) return null;
  const val = row[index];
  if (val === undefined || val === null) return null;
  return val.toString();
}
// Normalise un en-tête pour la comparaison : minuscules + sans accents + espaces normalisés
function normalizeH(h: string): string {
  return h.toString().toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}
// Détecte la colonne à partir d'un en-tête normalisé
function detectCol(kn: string): string | null {
  if (kn === "question") return "question";
  if (kn === "type" || kn.startsWith("type ") || kn === "categorie" || kn === "format") return "type";
  if (kn === "niveau" || kn === "level" || kn.startsWith("niveau ") || kn.startsWith("level ") || kn.includes("competence") || kn.includes("difficulte") || kn === "bloom") return "level";
  if (kn === "grand theme" || kn === "theme" || kn === "domaine" || kn === "main theme" || kn === "theme principal" || kn.startsWith("grand theme")) return "theme";
  if (kn === "sous-theme 1" || kn === "sous theme 1" || kn === "sub-theme 1" || kn === "sub theme 1" || kn.startsWith("sous-theme 1") || kn.startsWith("sous theme 1") || kn === "sous-domaine 1") return "sub1";
  if (kn === "sous-theme 2" || kn === "sous theme 2" || kn === "sub-theme 2" || kn === "sub theme 2" || kn.startsWith("sous-theme 2") || kn.startsWith("sous theme 2") || kn === "sous-domaine 2") return "sub2";
  if (kn === "reponse proposee" || kn === "reponse" || kn === "answer" || kn === "proposed answer" || kn.startsWith("reponse proposee") || kn === "choix") return "answer";
  if (kn === "correcte" || kn === "correct" || kn === "is correct" || kn === "bonne reponse" || kn === "valide") return "isCorrect";
  return null;
}
function normalizeBoolean(value: any): boolean | null {
  if (value === null || value === undefined) return null;
  const v = value.toString().toLowerCase().trim();
  if (["oui","yes","vrai","true","1","o","y","v"].includes(v)) return true;
  if (["non","no","faux","false","0","n","f"].includes(v)) return false;
  return null;
}
function detectImportFormat(headers: string[]): ImportFormat | "UNKNOWN" {
  const hn = headers.map(h => normalizeH(h.toString()));
  if (hn.some(h => h === "a_correct" || h === "b_correct") || hn.some(h => h === "option a")) return "V3";
  if (hn.some(h => ["correcte","correct","is correct","bonne reponse"].includes(h))) return "A";
  const hr = headers.map(h => h.toString().trim());
  if (hr.some(h => h.startsWith("✅") || h.startsWith("❌") || h.toLowerCase().startsWith("[c]"))) return "B";
  return "UNKNOWN";
}
function parseFormatA(rows: any[][], headers: string[]): ParsedQuestion[] {
  const col: Record<string, number> = {};
  headers.forEach((h, i) => {
    const key = detectCol(normalizeH(h));
    if (key) col[key] = i;
  });
  const questions: ParsedQuestion[] = [];
  let cur: ParsedQuestion | null = null;
  rows.forEach((row, ri) => {
    const qt = getCellValue(row, col.question);
    const ans = getCellValue(row, col.answer);
    const ic = getCellValue(row, col.isCorrect);
    if (qt && qt.trim()) {
      if (cur) questions.push(cur);
      cur = {
        _rowIndex: ri + 2, _format: "A", _selected: true, _alert: null,
        question_text: qt.trim(),
        type: getCellValue(row, col.type)?.trim() || "",
        level: getCellValue(row, col.level)?.trim() || "",
        theme: getCellValue(row, col.theme)?.trim() || "",
        sub_theme_1: getCellValue(row, col.sub1)?.trim() || "",
        sub_theme_2: getCellValue(row, col.sub2)?.trim() || "",
        correct_answers: [], distractors: [],
      };
    }
    if (cur && ans && ans.trim()) {
      const ok = normalizeBoolean(ic);
      if (ok === true)  cur.correct_answers.push(ans.trim());
      else if (ok === false) cur.distractors.push(ans.trim());
    }
  });
  if (cur) questions.push(cur);
  return questions;
}
function parseFormatB(rows: any[][], headers: string[]): ParsedQuestion[] {
  const col: Record<string, number> = {};
  const cCols: number[] = [], dCols: number[] = [];
  headers.forEach((h, i) => {
    const raw = h.toString().trim();
    const lo  = raw.toLowerCase();
    if (raw.startsWith("✅") || lo.startsWith("[c]") || lo.startsWith("correct:") || lo.startsWith("bonne:") || lo.startsWith("good:")) { cCols.push(i); return; }
    if (raw.startsWith("❌") || lo.startsWith("[d]") || lo.startsWith("distractor:") || lo.startsWith("mauvaise:") || lo.startsWith("wrong:") || lo.startsWith("bad:"))  { dCols.push(i); return; }
    const key = detectCol(normalizeH(h));
    if (key) col[key] = i;
  });
  return rows
    .map((row, ri) => ({
      _rowIndex: ri + 2, _format: "B" as const, _selected: true, _alert: null as null,
      question_text: getCellValue(row, col.question)?.trim() || "",
      type: getCellValue(row, col.type)?.trim() || "",
      level: getCellValue(row, col.level)?.trim() || "",
      theme: getCellValue(row, col.theme)?.trim() || "",
      sub_theme_1: getCellValue(row, col.sub1)?.trim() || "",
      sub_theme_2: getCellValue(row, col.sub2)?.trim() || "",
      correct_answers: cCols.map(i => getCellValue(row, i)).filter((v): v is string => !!v?.trim()).map(v => v.trim()),
      distractors:     dCols.map(i => getCellValue(row, i)).filter((v): v is string => !!v?.trim()).map(v => v.trim()),
    }))
    .filter(q => q.question_text !== "");
}
function parseFormatV3(rows: any[][], headers: string[]): ParsedQuestion[] {
  const col: Record<string, number> = {};
  headers.forEach((h, i) => {
    const kn = normalizeH(h.toString());
    if (kn.includes("thematique") || (kn === "theme" && col.theme === undefined)) col.theme = i;
    else if (kn === "sous-theme 1" || kn === "sous theme 1") col.sub1 = i;
    else if (kn === "sous-theme 2" || kn === "sous theme 2") col.sub2 = i;
    else if (kn.includes("niveau") || kn.includes("competence")) col.level = i;
    else if (kn.includes("type")) col.type = i;
    else if (kn === "question") col.question = i;
    else if (kn === "option a") col.oA = i;
    else if (kn === "a_correct") col.kA = i;
    else if (kn === "option b") col.oB = i;
    else if (kn === "b_correct") col.kB = i;
    else if (kn === "option c") col.oC = i;
    else if (kn === "c_correct") col.kC = i;
    else if (kn === "option d") col.oD = i;
    else if (kn === "d_correct") col.kD = i;
    else if (kn === "option e") col.oE = i;
    else if (kn === "e_correct") col.kE = i;
  });
  const pairs = [
    [col.oA, col.kA], [col.oB, col.kB], [col.oC, col.kC],
    [col.oD, col.kD], [col.oE, col.kE],
  ] as Array<[number | undefined, number | undefined]>;

  return rows.map((row, ri) => {
    const qt = col.question !== undefined ? row[col.question] : null;
    if (!qt?.toString().trim()) return null;
    const correct_answers: string[] = [];
    const distractors: string[] = [];
    for (const [oi, ki] of pairs) {
      if (oi === undefined) continue;
      const optRaw = row[oi];
      const okRaw  = ki !== undefined ? row[ki] : null;
      if (optRaw === null || optRaw === undefined || optRaw === "") continue;
      const okStr = (okRaw?.toString() || "").toLowerCase().trim();
      if (okStr.includes("personnalis") || okStr.includes("requise")) continue;
      let optStr = optRaw.toString().trim();
      if (optRaw === true  || optStr.toLowerCase() === "true")  optStr = "Vrai";
      if (optRaw === false || optStr.toLowerCase() === "false") optStr = "Faux";
      if (!optStr) continue;
      const isCorrect = okRaw === true || normalizeBoolean(okRaw) === true;
      if (isCorrect) correct_answers.push(optStr);
      else distractors.push(optStr);
    }
    return {
      _rowIndex: ri + 2, _format: "V3" as const, _selected: true, _alert: null,
      question_text: qt.toString().trim(),
      type:      (col.type  !== undefined ? row[col.type]?.toString()  : "") || "",
      level:     (col.level !== undefined ? row[col.level]?.toString() : "") || "",
      theme:     (col.theme !== undefined ? row[col.theme]?.toString() : "") || "",
      sub_theme_1: (col.sub1 !== undefined ? row[col.sub1]?.toString() : "") || "",
      sub_theme_2: (col.sub2 !== undefined ? row[col.sub2]?.toString() : "") || "",
      correct_answers, distractors,
    };
  }).filter(q => q !== null) as ParsedQuestion[];
}

function computeAlert(q: ParsedQuestion): "NO_CORRECT" | "ALL_CORRECT" | "NO_ANSWERS" | null {
  const t = q.type.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  // Explicit open/scenario keywords → no answer requirements
  const isOpen = ["ouvert","open","scenario","scenar","trou","libre"].some(k => t.includes(k));
  if (isOpen) return null;
  // Empty or unrecognised type + no answers → assume open question, don't block
  if (!t && q.correct_answers.length === 0 && q.distractors.length === 0) return null;
  if (q.correct_answers.length === 0 && q.distractors.length === 0) return "NO_ANSWERS";
  if (q.correct_answers.length === 0) return "NO_CORRECT";
  if (q.distractors.length === 0) return "ALL_CORRECT";
  return null;
}

const QUESTION_TYPES = ["QCM", "TRUE_FALSE", "OPEN", "SCENARIO", "RANKING"];
const LEVELS = ["FONDAMENTAL", "BASIQUE", "INTERMEDIAIRE", "AVANCE", "COMPLET"];
const typeLabels: Record<string, string> = {
  QCM: "QCM", TRUE_FALSE: "Vrai / Faux", OPEN: "Question ouverte", SCENARIO: "Scénario", RANKING: "Classement",
};
const levelLabels: Record<string, string> = {
  FONDAMENTAL: "Fondamental", BASIQUE: "Basique", INTERMEDIAIRE: "Intermédiaire", AVANCE: "Avancé", COMPLET: "Complet",
};
const levelColors: Record<string, string> = {
  FONDAMENTAL: "bg-blue-100 text-blue-700",
  BASIQUE: "bg-green-100 text-green-700",
  INTERMEDIAIRE: "bg-yellow-100 text-yellow-700",
  AVANCE: "bg-orange-100 text-orange-700",
  COMPLET: "bg-red-100 text-red-700",
};
const SA_PRIMARY = "#27295A";

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

export default function SuperAdminQuestions() {
  const { accessToken } = useAuth();
  const { t, lang } = useI18n(); // ITER9
  // ITER11: helper pour afficher nameEn si langue = EN
  const tl = (item: { label: string; nameEn?: string | null }) =>
    lang === "en" && item.nameEn ? item.nameEn : item.label;
  const [themes, setThemes] = useState<Theme[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  const [openThemes, setOpenThemes]       = useState<Set<number>>(new Set());
  const [openSubThemes, setOpenSubThemes] = useState<Set<number>>(new Set());
  const [openSubs, setOpenSubs]           = useState<Set<number>>(new Set());

  // Per-SST filters
  const [filterLevel, setFilterLevel]   = useState<Record<number, string>>({});
  const [filterType, setFilterType]     = useState<Record<number, string>>({});

  const [showThemeModal, setShowThemeModal]             = useState(false);
  const [showSubThemeModal, setShowSubThemeModal]       = useState(false);
  const [showSubSubThemeModal, setShowSubSubThemeModal] = useState(false);
  const [showQuestionModal, setShowQuestionModal]       = useState(false);
  const [editingQuestion, setEditingQuestion]           = useState<Question | null>(null);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importRows, setImportRows]           = useState<ParsedQuestion[]>([]);
  const [importSaving, setImportSaving]       = useState(false);
  const [importFormat, setImportFormat]       = useState<ImportFormat | null>(null); // ITER13
  const [importParseError, setImportParseError] = useState<string | null>(null); // ITER13
  const importFileRef = useRef<HTMLInputElement>(null);

  const [themeLabel, setThemeLabel] = useState("");
  const [subThemeLabel, setSubThemeLabel] = useState("");
  const [subThemeThemeId, setSubThemeThemeId] = useState("");
  const [subSubThemeLabel, setSubSubThemeLabel] = useState("");
  const [subSubThemeSubThemeId, setSubSubThemeSubThemeId] = useState("");

  const [qText, setQText]     = useState("");
  const [qType, setQType]     = useState("QCM");
  const [qLevel, setQLevel]   = useState("FONDAMENTAL");
  const [qThemeId, setQThemeId] = useState("");
  const [qSubThemeId, setQSubThemeId] = useState("");
  const [qSubSubThemeId, setQSubSubThemeId] = useState("");
  const [qCorrect, setQCorrect] = useState("");
  const [qDistractors, setQDistractors] = useState(["", "", ""]);
  const [qCustomScore, setQCustomScore] = useState<number | null>(null); // ITER10
  const [savingQ, setSavingQ] = useState(false);

  // ITER10: sélection multiple
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const authHeaders = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

  async function loadData() {
    if (!accessToken) return;
    try {
      const [themesRes, questionsRes] = await Promise.all([
        fetch("/api/super-admin/themes", { headers: authHeaders }),
        fetch("/api/super-admin/questions", { headers: authHeaders }),
      ]);
      setThemes(await themesRes.json());
      setQuestions(await questionsRes.json());
    } catch { toast.error(t("loadingError")); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, [accessToken]);

  function toggleSet<T>(set: Set<T>, id: T, setter: React.Dispatch<React.SetStateAction<Set<T>>>) {
    const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); setter(n);
  }

  function getQuestionsForSST(sstId: number, lvlFilter?: string, typeFilter?: string) {
    return questions.filter(q => {
      if (q.subSubThemeId !== sstId) return false;
      if (lvlFilter && q.level !== lvlFilter) return false;
      if (typeFilter && q.type !== typeFilter) return false;
      return true;
    });
  }

  async function handleAddTheme(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/super-admin/themes", { method: "POST", headers: authHeaders, body: JSON.stringify({ label: themeLabel }) });
      if (!res.ok) throw new Error();
      toast.success(t("grandThemeCreated"));
      setShowThemeModal(false); setThemeLabel(""); loadData();
    } catch { toast.error(t("loadingError")); }
  }

  async function handleAddSubTheme(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/super-admin/sub-themes", { method: "POST", headers: authHeaders, body: JSON.stringify({ label: subThemeLabel, themeId: Number(subThemeThemeId) }) });
      if (!res.ok) throw new Error();
      toast.success(t("subThemeCreated"));
      setShowSubThemeModal(false); setSubThemeLabel(""); loadData();
    } catch { toast.error(t("loadingError")); }
  }

  async function handleAddSubSubTheme(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/super-admin/sub-sub-themes", { method: "POST", headers: authHeaders, body: JSON.stringify({ label: subSubThemeLabel, subThemeId: Number(subSubThemeSubThemeId) }) });
      if (!res.ok) throw new Error();
      toast.success(t("subTheme2Created"));
      setShowSubSubThemeModal(false); setSubSubThemeLabel(""); loadData();
    } catch { toast.error(t("loadingError")); }
  }

  function openCreateQuestion(sstId?: number) {
    setEditingQuestion(null); setQText(""); setQType("QCM"); setQLevel("FONDAMENTAL");
    setQCorrect(""); setQDistractors(["","",""]); setQSubSubThemeId(sstId ? String(sstId) : "");
    setQCustomScore(null); // ITER10
    setShowQuestionModal(true);
  }

  function openEditQuestion(q: Question) {
    setEditingQuestion(q); setQText(q.text); setQType(q.type); setQLevel(q.level);
    setQSubSubThemeId(String(q.subSubThemeId));
    setQCorrect(q.options?.choices?.[0] || q.expectedAnswer || "");
    setQDistractors([q.options?.choices?.[1]||"", q.options?.choices?.[2]||"", q.options?.choices?.[3]||""]);
    setQCustomScore(q.customScore ?? null); // ITER10
    setShowQuestionModal(true);
  }

  async function handleSaveQuestion(e: React.FormEvent) {
    e.preventDefault();
    setSavingQ(true);
    try {
      const options = (qType === "QCM" || qType === "TRUE_FALSE") && qCorrect ? {
        choices: [qCorrect, ...qDistractors].filter(Boolean),
        correctIndex: 0
      } : null;
      const body = { text: qText, type: qType, level: qLevel, subSubThemeId: Number(qSubSubThemeId), options, expectedAnswer: qCorrect || null, customScore: qCustomScore }; // ITER10
      const res = editingQuestion
        ? await fetch(`/api/super-admin/questions/${editingQuestion.id}`, { method: "PUT", headers: authHeaders, body: JSON.stringify(body) })
        : await fetch("/api/super-admin/questions", { method: "POST", headers: authHeaders, body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      toast.success(editingQuestion ? t("questionModified") : t("questionCreated"));
      setShowQuestionModal(false); loadData();
    } catch { toast.error(t("loadingError")); }
    finally { setSavingQ(false); }
  }

  async function handleDeleteQuestion(id: number) {
    if (!confirm(t("deleteQuestion"))) return;
    try {
      const res = await fetch(`/api/super-admin/questions/${id}`, { method: "DELETE", headers: authHeaders });
      if (!res.ok) throw new Error();
      setQuestions(prev => prev.filter(q => q.id !== id));
      toast.success(t("questionDeleted"));
    } catch { toast.error(t("loadingError")); }
  }

  // ITER10: sélection multiple
  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Supprimer ${selectedIds.size} question${selectedIds.size > 1 ? "s" : ""} ?`)) return;
    setBulkLoading(true);
    try {
      await Promise.all([...selectedIds].map(id =>
        fetch(`/api/super-admin/questions/${id}`, { method: "DELETE", headers: authHeaders })
      ));
      setQuestions(prev => prev.filter(q => !selectedIds.has(q.id)));
      setSelectedIds(new Set());
      toast.success(`${selectedIds.size} question${selectedIds.size > 1 ? "s" : ""} supprimée${selectedIds.size > 1 ? "s" : ""}`);
    } catch { toast.error(t("loadingError")); }
    finally { setBulkLoading(false); }
  }

  async function handleBulkDuplicate() {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const toDuplicate = questions.filter(q => selectedIds.has(q.id));
      await Promise.all(toDuplicate.map(q =>
        fetch("/api/super-admin/questions", {
          method: "POST", headers: authHeaders,
          body: JSON.stringify({
            text: `${q.text} (copie)`, type: q.type, level: q.level,
            subSubThemeId: q.subSubThemeId, options: q.options,
            expectedAnswer: q.expectedAnswer, customScore: q.customScore,
          }),
        })
      ));
      toast.success(`${selectedIds.size} question${selectedIds.size > 1 ? "s" : ""} dupliquée${selectedIds.size > 1 ? "s" : ""}`);
      setSelectedIds(new Set());
      loadData();
    } catch { toast.error(t("loadingError")); }
    finally { setBulkLoading(false); }
  }

  // ITER13: nouveau parser — détection automatique du format
  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so re-selecting the same file triggers onChange again
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" }) as any[][];
        if (raw.length < 2) { setImportParseError("Fichier vide ou sans données."); return; }
        const headers = (raw[0] as any[]).map(String);
        const rows = raw.slice(1);
        // Try V3 first (primary format), then A, then B
        let fmt = detectImportFormat(headers);
        let parsed: ParsedQuestion[] = [];
        if (fmt === "V3" || fmt === "UNKNOWN") {
          parsed = parseFormatV3(rows, headers);
          if (parsed.length > 0) { fmt = "V3"; }
        }
        if (parsed.length === 0) {
          const fmtA = parseFormatA(rows, headers);
          if (fmtA.length > 0) { parsed = fmtA; fmt = "A"; }
        }
        if (parsed.length === 0) {
          const fmtB = parseFormatB(rows, headers);
          if (fmtB.length > 0) { parsed = fmtB; fmt = "B"; }
        }
        if (parsed.length === 0) {
          setImportParseError("Aucune question trouvée dans le fichier. Vérifiez que les colonnes correspondent au template (Option A / A_Correct).");
          setImportRows([]);
          return;
        }
        setImportParseError(null);
        setImportFormat((fmt === "UNKNOWN" ? "V3" : fmt) as ImportFormat);
        parsed = parsed.map(q => ({ ...q, _alert: computeAlert(q) }));
        setImportRows(parsed);
      } catch (err: any) {
        setImportParseError(err.message || "Erreur lors de la lecture du fichier.");
        setImportRows([]);
      }
    };
    reader.readAsBinaryString(file);
  }

  async function handleImportConfirm() {
    const selected = importRows.filter(q => q._selected);
    if (!selected.length) return;
    setImportSaving(true);
    try {
      const res = await fetch("/api/super-admin/questions/import", {
        method: "POST", headers: authHeaders,
        body: JSON.stringify({ questions: selected }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.errors?.length) data.errors.slice(0, 3).forEach((e: string) => toast.error(e));
      toast.success(`${data.imported} ${t("importedQuestions")}${data.skipped ? `, ${data.skipped} ${t("skipped")}` : ""}`);
      setShowImportModal(false); setImportRows([]); loadData();
    } catch { toast.error(t("importError")); }
    finally { setImportSaving(false); }
  }

  async function downloadTemplate() {
    try {
      const res = await fetch("/api/super-admin/questions/template", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "template_questions.xlsx";
      link.click();
      URL.revokeObjectURL(link.href);
    } catch { toast.error(t("importError")); }
  }

  function toggleImportRow(idx: number) {
    setImportRows(prev => prev.map((q, i) => i === idx ? { ...q, _selected: !q._selected } : q));
  }

  // Determine subSubThemes for question form
  const filteredSubThemes = themes.find(t => t.id === Number(qThemeId))?.subThemes || [];
  const filteredSSTs = filteredSubThemes.find(st => st.id === Number(qSubThemeId))?.subSubThemes || [];

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t("questionBank")}</h1>
              <p className="text-sm text-gray-500 mt-1">{questions.length} question{questions.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => setShowThemeModal(true)}
                className="px-3 py-2 text-xs rounded-lg text-white" style={{ backgroundColor: SA_PRIMARY }}>
                {t("addGrandTheme")}
              </button>
              <button onClick={() => setShowSubThemeModal(true)}
                className="px-3 py-2 text-xs rounded-lg bg-indigo-100 text-indigo-700 hover:bg-indigo-200">
                {t("addSubTheme1")}
              </button>
              <button onClick={() => setShowSubSubThemeModal(true)}
                className="px-3 py-2 text-xs rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200">
                {t("addSubTheme2")}
              </button>
              <button onClick={() => openCreateQuestion()}
                className="flex items-center gap-1 px-3 py-2 text-xs rounded-lg bg-green-100 text-green-700 hover:bg-green-200">
                <Plus size={12} /> {t("question")}
              </button>
              <button onClick={downloadTemplate}
                className="flex items-center gap-1 px-3 py-2 text-xs rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">
                <Download size={12} /> {t("downloadTemplate")}
              </button>
              <button onClick={() => { setImportRows([]); setShowImportModal(true); setTimeout(() => importFileRef.current?.click(), 100); }}
                className="flex items-center gap-1 px-3 py-2 text-xs rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200">
                <Upload size={12} /> {t("import")}
              </button>
            </div>
          </div>

          {/* ITER10: barre d'actions bulk */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 mb-4 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-xl">
              <span className="text-sm font-medium text-indigo-700">{selectedIds.size} sélectionnée{selectedIds.size > 1 ? "s" : ""}</span>
              <button onClick={handleBulkDuplicate} disabled={bulkLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-50 disabled:opacity-50">
                <Copy size={12} /> Dupliquer
              </button>
              <button onClick={handleBulkDelete} disabled={bulkLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50">
                <Trash2 size={12} /> Supprimer
              </button>
              <button onClick={() => setSelectedIds(new Set())}
                className="ml-auto text-xs text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            </div>
          )}

          {loading ? <p className="text-gray-500">{t("loading")}</p> : themes.length === 0 ? (
            <p className="text-center text-gray-500 py-12">{t("noThemes")}</p>
          ) : (
            <div className="space-y-2">
              {themes.map(theme => (
                <div key={theme.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <button className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-gray-50"
                    onClick={() => toggleSet(openThemes, theme.id, setOpenThemes)}>
                    {openThemes.has(theme.id) ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                    <span className="font-semibold text-gray-900">{tl(theme)}</span>
                    <span className="ml-auto text-xs text-gray-400">
                      {questions.filter(q => theme.subThemes.some(st => st.subSubThemes.some(sst => sst.id === q.subSubThemeId))).length} question{questions.filter(q => theme.subThemes.some(st => st.subSubThemes.some(sst => sst.id === q.subSubThemeId))).length !== 1 ? "s" : ""}
                    </span>
                  </button>

                  {openThemes.has(theme.id) && theme.subThemes.map(st => (
                    <div key={st.id} className="border-t border-gray-100">
                      <button className="flex items-center gap-2 w-full px-8 py-2.5 text-left bg-gray-50 hover:bg-gray-100"
                        onClick={() => toggleSet(openSubThemes, st.id, setOpenSubThemes)}>
                        {openSubThemes.has(st.id) ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                        <span className="text-sm font-medium text-gray-700">{tl(st)}</span>
                        <span className="ml-auto text-xs text-gray-400">
                          {questions.filter(q => st.subSubThemes.some(sst => sst.id === q.subSubThemeId)).length}
                        </span>
                      </button>

                      {openSubThemes.has(st.id) && st.subSubThemes.map(sst => {
                        const sstQCount = questions.filter(q => q.subSubThemeId === sst.id).length;
                        const lvlF = filterLevel[sst.id] || "";
                        const typeF = filterType[sst.id] || "";
                        const sstQuestions = getQuestionsForSST(sst.id, lvlF || undefined, typeF || undefined);

                        // Group by level
                        const byLevel: Record<string, Question[]> = {};
                        for (const q of sstQuestions) {
                          if (!byLevel[q.level]) byLevel[q.level] = [];
                          byLevel[q.level].push(q);
                        }

                        return (
                          <div key={sst.id} className="border-t border-gray-100">
                            <button className="flex items-center gap-2 w-full px-12 py-2 text-left hover:bg-gray-50"
                              onClick={() => toggleSet(openSubs, sst.id, setOpenSubs)}>
                              {openSubs.has(sst.id) ? <ChevronDown size={12} className="text-gray-300" /> : <ChevronRight size={12} className="text-gray-300" />}
                              <span className="text-sm text-gray-600">{sst.label}</span>
                              <span className="ml-2 text-xs text-gray-400">{sstQCount}</span>
                              <div className="ml-auto flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                <button onClick={() => openCreateQuestion(sst.id)}
                                  className="p-1 hover:bg-green-50 rounded text-green-500">
                                  <Plus size={12} />
                                </button>
                              </div>
                            </button>

                            {openSubs.has(sst.id) && (
                              <div className="px-14 py-2 bg-gray-50/50">
                                {/* Filters for this SST */}
                                <div className="flex items-center gap-2 mb-3">
                                  <Filter size={12} className="text-gray-400" />
                                  <select value={lvlF} onChange={e => setFilterLevel(prev => ({ ...prev, [sst.id]: e.target.value }))}
                                    className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none bg-white">
                                    <option value="">{t("allLevels")}</option>
                                    {LEVELS.map(l => <option key={l} value={l}>{levelLabels[l]}</option>)}
                                  </select>
                                  <select value={typeF} onChange={e => setFilterType(prev => ({ ...prev, [sst.id]: e.target.value }))}
                                    className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none bg-white">
                                    <option value="">{t("allTypes")}</option>
                                    {QUESTION_TYPES.map(qt => <option key={qt} value={qt}>{typeLabels[qt]}</option>)}
                                  </select>
                                  <span className="text-xs text-gray-400">{sstQuestions.length} {t("results")}{sstQuestions.length !== 1 ? "s" : ""}</span>
                                </div>

                                {/* Questions grouped by level */}
                                {sstQuestions.length === 0 ? (
                                  <p className="text-xs text-gray-400 py-2">{t("noQuestions")}{(lvlF || typeF) ? ` ${t("activeFilters")}` : ""}</p>
                                ) : (
                                  LEVELS.filter(l => byLevel[l]?.length > 0).map(level => (
                                    <div key={level} className="mb-3">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${levelColors[level]}`}>
                                          {levelLabels[level]}
                                        </span>
                                        <span className="text-xs text-gray-400">{byLevel[level].length} question{byLevel[level].length !== 1 ? "s" : ""}</span>
                                      </div>
                                      <div className="space-y-1 pl-2">
                                        {byLevel[level].map(q => (
                                          <div key={q.id} className={`flex items-start gap-2 p-2 bg-white rounded border hover:border-gray-200 group transition-colors ${selectedIds.has(q.id) ? "border-indigo-300 bg-indigo-50/30" : "border-gray-100"}`}>
                                            {/* ITER10: checkbox sélection */}
                                            <input type="checkbox" checked={selectedIds.has(q.id)}
                                              onChange={() => toggleSelect(q.id)}
                                              className="mt-0.5 shrink-0 accent-indigo-600 cursor-pointer"
                                              onClick={e => e.stopPropagation()} />
                                            <div className="flex-1 min-w-0">
                                              <p className="text-xs text-gray-800 leading-snug">{q.text}</p>
                                              <div className="flex items-center gap-1 mt-0.5">
                                                <span className="text-xs text-gray-400">{typeLabels[q.type]}</span>
                                                {/* ITER10: badge score custom */}
                                                {q.customScore != null && (
                                                  <span className="px-1 py-0 rounded text-xs font-medium bg-purple-100 text-purple-700">
                                                    {q.customScore}pt
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 shrink-0">
                                              <button onClick={() => openEditQuestion(q)}
                                                className="p-1 hover:bg-gray-100 rounded text-gray-400">
                                                <Pencil size={11} />
                                              </button>
                                              <button onClick={() => handleDeleteQuestion(q.id)}
                                                className="p-1 hover:bg-red-50 rounded text-red-400">
                                                <X size={11} />
                                              </button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Theme modal */}
      {showThemeModal && (
        <Modal title={t("newGrandTheme")} onClose={() => setShowThemeModal(false)}>
          <form onSubmit={handleAddTheme} className="space-y-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Label *</label>
              <input type="text" value={themeLabel} onChange={e => setThemeLabel(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
            <div className="flex justify-end gap-3"><button type="button" onClick={() => setShowThemeModal(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t("cancel")}</button>
              <button type="submit" className="px-4 py-2 text-sm text-white rounded-lg" style={{ backgroundColor: SA_PRIMARY }}>{t("create")}</button></div>
          </form>
        </Modal>
      )}

      {/* SubTheme modal */}
      {showSubThemeModal && (
        <Modal title={t("newSubTheme1")} onClose={() => setShowSubThemeModal(false)}>
          <form onSubmit={handleAddSubTheme} className="space-y-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">{t("grandTheme")} *</label>
              <select value={subThemeThemeId} onChange={e => setSubThemeThemeId(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">{t("selectLabel")}</option>
                {themes.map(th => <option key={th.id} value={th.id}>{tl(th)}</option>)}
              </select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Label *</label>
              <input type="text" value={subThemeLabel} onChange={e => setSubThemeLabel(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
            <div className="flex justify-end gap-3"><button type="button" onClick={() => setShowSubThemeModal(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t("cancel")}</button>
              <button type="submit" className="px-4 py-2 text-sm text-white rounded-lg" style={{ backgroundColor: SA_PRIMARY }}>{t("create")}</button></div>
          </form>
        </Modal>
      )}

      {/* SubSubTheme modal */}
      {showSubSubThemeModal && (
        <Modal title={t("newSubTheme2")} onClose={() => setShowSubSubThemeModal(false)}>
          <form onSubmit={handleAddSubSubTheme} className="space-y-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">{t("grandTheme")} *</label>
              <select value={qThemeId} onChange={e => { setQThemeId(e.target.value); setSubSubThemeSubThemeId(""); }} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">{t("selectLabel")}</option>
                {themes.map(th => <option key={th.id} value={th.id}>{tl(th)}</option>)}
              </select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">{t("subTheme1")} *</label>
              <select value={subSubThemeSubThemeId} onChange={e => setSubSubThemeSubThemeId(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">{t("selectLabel")}</option>
                {(themes.find(th => th.id === Number(qThemeId))?.subThemes || []).map(st => <option key={st.id} value={st.id}>{tl(st)}</option>)}
              </select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Label *</label>
              <input type="text" value={subSubThemeLabel} onChange={e => setSubSubThemeLabel(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
            <div className="flex justify-end gap-3"><button type="button" onClick={() => setShowSubSubThemeModal(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t("cancel")}</button>
              <button type="submit" className="px-4 py-2 text-sm text-white rounded-lg" style={{ backgroundColor: SA_PRIMARY }}>{t("create")}</button></div>
          </form>
        </Modal>
      )}

      {/* Question modal */}
      {showQuestionModal && (
        <Modal title={editingQuestion ? t("editQuestion") : t("newQuestion")} onClose={() => setShowQuestionModal(false)} wide>
          <form onSubmit={handleSaveQuestion} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">{t("grandTheme")} *</label>
                <select value={qThemeId} onChange={e => { setQThemeId(e.target.value); setQSubThemeId(""); setQSubSubThemeId(""); }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">{t("selectLabel")}</option>
                  {themes.map(th => <option key={th.id} value={th.id}>{tl(th)}</option>)}
                </select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">{t("subTheme1")} *</label>
                <select value={qSubThemeId} onChange={e => { setQSubThemeId(e.target.value); setQSubSubThemeId(""); }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">{t("selectLabel")}</option>
                  {filteredSubThemes.map(st => <option key={st.id} value={st.id}>{tl(st)}</option>)}
                </select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">{t("subTheme2")} *</label>
                <select value={qSubSubThemeId} onChange={e => setQSubSubThemeId(e.target.value)} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">{t("selectLabel")}</option>
                  {filteredSSTs.map(sst => <option key={sst.id} value={sst.id}>{sst.label}</option>)}
                </select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">{t("level")} *</label>
                <select value={qLevel} onChange={e => setQLevel(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {LEVELS.map(l => <option key={l} value={l}>{levelLabels[l]}</option>)}
                </select></div>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">{t("type")} *</label>
              <select value={qType} onChange={e => setQType(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {QUESTION_TYPES.map(qt => <option key={qt} value={qt}>{typeLabels[qt]}</option>)}
              </select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">{t("questionText")} *</label>
              <textarea value={qText} onChange={e => setQText(e.target.value)} rows={3} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" /></div>
            {(qType === "QCM" || qType === "TRUE_FALSE") && (
              <div className="space-y-2">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">{t("correctAnswer")}</label>
                  <input type="text" value={qCorrect} onChange={e => setQCorrect(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
                {qType === "QCM" && qDistractors.map((d, i) => (
                  <div key={i}><label className="block text-sm font-medium text-gray-700 mb-1">{t("distractor")} {i+1}</label>
                    <input type="text" value={d} onChange={e => { const n=[...qDistractors]; n[i]=e.target.value; setQDistractors(n); }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
                ))}
              </div>
            )}
            {/* ITER10: Score personnalisé (null = auto par niveau) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("questionScore")}</label>
              <div className="flex items-center gap-3">
                <input
                  type="number" min={1} max={10} step={1}
                  value={qCustomScore ?? ""}
                  onChange={e => setQCustomScore(e.target.value === "" ? null : Number(e.target.value))}
                  placeholder={t("scoreAuto")}
                  className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
                />
                {qCustomScore !== null && (
                  <button type="button" onClick={() => setQCustomScore(null)}
                    className="text-xs text-gray-400 hover:text-gray-600 underline">
                    {t("scoreAuto")}
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {t("scoreAuto")} : FOND=1, BAS=2, INT=3, AV=4, COMP=5
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowQuestionModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t("cancel")}</button>
              <button type="submit" disabled={savingQ}
                className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50"
                style={{ backgroundColor: SA_PRIMARY }}>
                {savingQ ? t("saving") : editingQuestion ? t("edit") : t("create")}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ITER13: Import modal — nouveau parser avec aperçu et alertes */}
      <input ref={importFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportFile} />
      {showImportModal && (
        <Modal title={t("importQuestions")} onClose={() => { setShowImportModal(false); setImportRows([]); setImportParseError(null); setImportFormat(null); }} wide>
          {/* Barre d'outils */}
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              {importFormat && (
                <span className={`px-2 py-1 rounded text-xs font-semibold ${importFormat === "A" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                  Format {importFormat} détecté
                </span>
              )}
              {importRows.length > 0 && (
                <span className="text-sm text-gray-600">
                  {importRows.filter(q => q._selected).length}/{importRows.length} questions sélectionnées
                  {importRows.filter(q => q._alert === "NO_CORRECT").length > 0 && (
                    <span className="ml-2 text-red-600 font-medium">
                      — {importRows.filter(q => q._alert === "NO_CORRECT").length} erreur(s)
                    </span>
                  )}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={downloadTemplate} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
                <Download size={12} /> {t("downloadTemplate")}
              </button>
              <button onClick={() => importFileRef.current?.click()}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100">
                <Upload size={12} /> {importRows.length ? t("changeFile") : t("chooseFile")}
              </button>
            </div>
          </div>

          {/* Erreur de parsing */}
          {importParseError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-700">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>{importParseError}</span>
            </div>
          )}

          {importRows.length === 0 && !importParseError ? (
            <div className="text-center py-10">
              <FileSpreadsheet size={48} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 mb-1">Sélectionnez un fichier Excel (.xlsx)</p>
              <p className="text-xs text-gray-400 mb-4">Format A (colonne "Correcte") ou Format B (préfixes ✅/❌)</p>
              <button onClick={() => importFileRef.current?.click()}
                className="px-5 py-2 text-sm text-white rounded-lg" style={{ backgroundColor: SA_PRIMARY }}>
                {t("chooseFile")}
              </button>
            </div>
          ) : importRows.length > 0 ? (
            <>
              <div className="overflow-x-auto max-h-80 border border-gray-200 rounded-lg mb-4">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 w-8"><input type="checkbox"
                        checked={importRows.every(q => q._selected)}
                        onChange={e => setImportRows(prev => prev.map(q => ({ ...q, _selected: e.target.checked })))} /></th>
                      <th className="px-2 py-2 text-left text-gray-600 font-medium">#</th>
                      <th className="px-2 py-2 text-left text-gray-600 font-medium">Question</th>
                      <th className="px-2 py-2 text-left text-gray-600 font-medium">Type</th>
                      <th className="px-2 py-2 text-left text-gray-600 font-medium">Niveau</th>
                      <th className="px-2 py-2 text-left text-gray-600 font-medium">Thème</th>
                      <th className="px-2 py-2 text-center text-gray-600 font-medium">✅</th>
                      <th className="px-2 py-2 text-center text-gray-600 font-medium">❌</th>
                      <th className="px-2 py-2 text-left text-gray-600 font-medium">Alerte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((q, i) => (
                      <tr key={i} className={`border-t border-gray-100 ${!q._selected ? "opacity-40" : ""}`}>
                        <td className="px-2 py-1.5 text-center">
                          <input type="checkbox" checked={q._selected} onChange={() => toggleImportRow(i)} />
                        </td>
                        <td className="px-2 py-1.5 text-gray-400">{q._rowIndex}</td>
                        <td className="px-2 py-1.5 max-w-[180px] truncate" title={q.question_text}>
                          {q.question_text || <span className="text-red-400">—</span>}
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{q.type}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{q.level}</td>
                        <td className="px-2 py-1.5 max-w-[120px] truncate text-gray-500" title={`${q.theme} › ${q.sub_theme_1} › ${q.sub_theme_2}`}>
                          {q.sub_theme_2 || q.sub_theme_1 || q.theme}
                        </td>
                        <td className="px-2 py-1.5 text-center font-medium text-green-700">{q.correct_answers.length}</td>
                        <td className="px-2 py-1.5 text-center font-medium text-red-500">{q.distractors.length}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          {q._alert === "NO_CORRECT"  && <span className="text-red-600 font-semibold">🔴 Aucune bonne réponse</span>}
                          {q._alert === "NO_ANSWERS"  && <span className="text-red-600 font-semibold">🔴 Aucune réponse</span>}
                          {q._alert === "ALL_CORRECT" && <span className="text-amber-600">⚠️ Tout correct</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  {importRows.filter(q => q._selected && (q._alert === "NO_CORRECT" || q._alert === "NO_ANSWERS")).length > 0
                    ? "🔴 Des erreurs bloquent l'import — décochez ces lignes ou corrigez le fichier"
                    : "✅ Prêt à importer"}
                </span>
                <div className="flex gap-3">
                  <button onClick={() => { setShowImportModal(false); setImportRows([]); setImportParseError(null); setImportFormat(null); }}
                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t("cancel")}</button>
                  <button
                    onClick={handleImportConfirm}
                    disabled={
                      importSaving ||
                      importRows.filter(q => q._selected).length === 0 ||
                      importRows.filter(q => q._selected && (q._alert === "NO_CORRECT" || q._alert === "NO_ANSWERS")).length > 0
                    }
                    className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-40"
                    style={{ backgroundColor: SA_PRIMARY }}>
                    {importSaving
                      ? t("importing")
                      : `${t("import")} ${importRows.filter(q => q._selected).length} question${importRows.filter(q => q._selected).length !== 1 ? "s" : ""}`}
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </Modal>
      )}
    </div>
  );
}
