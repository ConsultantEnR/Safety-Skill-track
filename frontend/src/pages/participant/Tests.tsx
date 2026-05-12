import React, { useEffect, useState, useRef, useCallback } from "react";
import PageShell from "../../components/PageShell";
import { useAuth } from "../../contexts/AuthContext";
import { useI18n } from "../../contexts/I18nContext";
import ParticipantSidebar from "./Sidebar";
import { resolveAssetUrl } from "../../lib/runtime";
import toast from "react-hot-toast";
import { Play, RotateCcw, Eye, CheckCircle, Clock, Timer, ChevronDown, ChevronRight, X } from "lucide-react";

interface SessionProgress {
  id: number;
  subSubThemeId: number;
  subSubThemeLabel?: string | null;
  questionsAsked: number;
  correctCount: number;
  completed: boolean;
  passed: boolean;
  currentLevel: string;
  levelReached?: string;
  pointsEarned?: number;
  maxPoints?: number;
}

interface Session {
  id: number;
  status: string;
  timeRemaining: number | null;
  startedAt: string;
  completedAt: string | null;
  progress: SessionProgress[];
}

interface TestAssignment {
  id: number;
  testId: number;
  status: string;
  deadline: string | null;
  assignedAt: string;
  test: {
    id: number;
    name: string;
    description: string | null;
    timerEnabled: boolean;
    timerDuration: number | null;
    competences: any[];
    sessions?: Session[];
  };
  session: Session | null;
  retakeRequest: { id: number; status: string } | null;
}

interface Profile {
  firstName: string;
  lastName: string;
  client: {
    name: string;
    primaryColor: string;
    accentColor: string;
    logoUrl: string | null;
  };
}

interface QuestionData {
  done: boolean;
  question?: {
    id: number;
    text: string;
    type: string;
    options?: { choices: string[]; correctIndex: number; correctIndexes?: number[] };
    expectedAnswer?: string;
  };
  subSubThemeId?: number;
  progressItem?: { questionsAsked: number; currentLevel: string };
}

function getEffectiveLevel(progress: SessionProgress) {
  return progress.levelReached || (progress.correctCount > 0 ? progress.currentLevel : null);
}

function formatTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function TestRunner({
  assignment,
  session,
  onComplete,
  primaryColor,
  accentColor,
  accessToken,
}: {
  assignment: TestAssignment;
  session: Session;
  onComplete: () => void;
  primaryColor: string;
  accentColor: string;
  accessToken: string;
}) {
  const { t } = useI18n();
  const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | number | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([]);
  const [answered, setAnswered] = useState(false);
  const [loadingQ, setLoadingQ] = useState(true);
  const [fillAnswer, setFillAnswer] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [questionCount, setQuestionCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(session.timeRemaining ?? null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [completedProgressIds, setCompletedProgressIds] = useState<Set<number>>(
    new Set((session.progress || []).filter(p => p.completed).map(p => p.id))
  );

  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t === null || t <= 1) {
          clearInterval(timerRef.current!);
          onComplete();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const fetchNextQuestion = useCallback(async () => {
    setLoadingQ(true);
    setSelectedAnswer(null);
    setSelectedAnswers([]);
    setFillAnswer("");
    setAnswered(false);
    setFeedback(null);
    try {
      const res = await fetch(`/api/participant/sessions/${session.id}/next-question`, { headers: authHeaders });
      if (!res.ok) throw new Error("Erreur lors du chargement de la question");
      const data: QuestionData = await res.json();
      setCurrentQuestion(data);
      if (data.done) {
        onComplete();
      } else {
        setQuestionCount(c => c + 1);
      }
    } catch (err: any) {
      toast.error(err.message || "Impossible de charger la question");
    } finally {
      setLoadingQ(false);
    }
  }, [session.id, accessToken]);

  useEffect(() => { fetchNextQuestion(); }, []);

  async function handleSubmit() {
    if (!currentQuestion?.question || !currentQuestion.subSubThemeId) return;
    const q = currentQuestion.question;

    let userAnswer: string | number | string[] = "";
    let correct: boolean | null = null;

    if (q.type === "QCM") {
      const isMultiAnswer = (q.options?.correctIndexes?.length ?? 0) > 1;
      const choices = getChoices(q.options!);
      if (isMultiAnswer) {
        userAnswer = selectedAnswers.map(idx => choices[idx]);
        correct = null;
      } else {
        // Envoyer le texte de la réponse (pas l'index) — le backend compare les textes
        userAnswer = choices[selectedAnswer as number];
        correct = selectedAnswer === q.options?.correctIndex;
      }
    } else if (q.type === "TRUE_FALSE") {
      userAnswer = selectedAnswer as string;
      correct = q.expectedAnswer
        ? String(selectedAnswer).toLowerCase() === String(q.expectedAnswer).toLowerCase()
        : null;
    } else {
      userAnswer = fillAnswer.trim();
      correct = null;
    }

    setAnswered(true);
    if (correct !== null) setFeedback(correct ? "correct" : "incorrect");

    let answerData: any = {};
    try {
      const answerRes = await fetch(`/api/participant/sessions/${session.id}/answer`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          subSubThemeId: currentQuestion.subSubThemeId,
          questionId: q.id,
          userAnswer,
          correct,
          timeRemaining: timeLeft,
        }),
      });
      answerData = await answerRes.json().catch(() => ({}));
    } catch {
      toast.error("Erreur lors de l'enregistrement de la réponse");
    }

    // Override feedback with backend ground truth (handles correctIndex-undefined edge cases)
    if (answerData.isCorrect !== undefined && correct !== null) {
      setFeedback(answerData.isCorrect ? "correct" : "incorrect");
    }

    // Update progress bar when a sub-theme is completed
    if (answerData.progressItem?.completed && answerData.progressItem?.id) {
      setCompletedProgressIds((prev: Set<number>) => new Set([...prev, answerData.progressItem.id]));
    }

    if (answerData.allDone) {
      const delay = correct !== null ? 1500 : 0;
      setTimeout(() => onComplete(), delay);
      return;
    }

    const delay = correct !== null ? 1500 : 0;
    setTimeout(() => fetchNextQuestion(), delay);
  }

  const totalComps = (session.progress || []).length;
  const doneComps = completedProgressIds.size;
  const progressPct = totalComps > 0 ? Math.round((doneComps / totalComps) * 100) : 0;

  if (loadingQ) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3">
        <div className="w-8 h-8 border-2 border-gray-200 rounded-full animate-spin"
          style={{ borderTopColor: primaryColor }} />
        <p className="text-sm text-gray-400">{t("loadingQuestion")}</p>
      </div>
    );
  }

  if (!currentQuestion || currentQuestion.done) {
    return (
      <div className="text-center py-8">
        <CheckCircle size={48} className="mx-auto mb-4 text-green-400" />
        <p className="text-lg font-semibold text-gray-800 mb-2">{t("testCompleted")}</p>
        <button
          onClick={onComplete}
          className="px-4 py-2 rounded-lg text-white text-sm font-semibold"
          style={{ backgroundColor: primaryColor }}
        >
          {t("viewResults")}
        </button>
      </div>
    );
  }

  const q = currentQuestion.question!;

  const getChoices = (opts: any): string[] => {
    if (!opts) return [];
    const raw = opts.choices;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string" && raw.length > 0) {
      try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) return parsed; } catch {}
      if (raw.includes(" / ")) return raw.split(" / ").map((s: string) => s.trim()).filter(Boolean);
      if (raw.includes("/")) return raw.split("/").map((s: string) => s.trim()).filter(Boolean);
      if (raw.includes(";")) return raw.split(";").map((s: string) => s.trim()).filter(Boolean);
      if (raw.includes(",")) return raw.split(",").map((s: string) => s.trim()).filter(Boolean);
      return [raw];
    }
    return [];
  };

  const typeBadge: Record<string, { label: string; color: string }> = {
    QCM: { label: "QCM", color: "#6366f1" },
    TRUE_FALSE: { label: t("typeTrueFalse"), color: "#0ea5e9" },
    OPEN: { label: t("openQuestion"), color: "#f59e0b" },
    SCENARIO: { label: t("scenario"), color: "#8b5cf6" },
    RANKING: { label: t("typeRanking"), color: "#10b981" },
  };
  const badge = typeBadge[q.type] || { label: q.type, color: "#6b7280" };
  const isMultiAnswerQCM = q.type === "QCM" && (q.options?.correctIndexes?.length ?? 0) > 1;
  const canSubmit =
    !answered &&
    (q.type === "QCM"
      ? isMultiAnswerQCM ? selectedAnswers.length > 0 : selectedAnswer !== null
      : q.type === "TRUE_FALSE"
      ? selectedAnswer !== null
      : fillAnswer.trim().length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{t("progression")}</span>
            <span>{doneComps}/{totalComps} {t("domains")}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%`, backgroundColor: accentColor }} />
          </div>
        </div>
        {timeLeft !== null && (
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-mono font-semibold ${
            timeLeft < 60 ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"
          }`}>
            <Timer size={14} />
            {formatTime(timeLeft)}
          </div>
        )}
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 space-y-3">
        <div className="flex items-center justify-between">
          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold text-white"
            style={{ backgroundColor: badge.color }}>
            {badge.label}
          </span>
          {currentQuestion.progressItem && (
            <span className="text-xs text-gray-400">
              {t("levelLabel")} : {currentQuestion.progressItem.currentLevel}
            </span>
          )}
        </div>
        <p className="text-base font-semibold text-gray-800 leading-snug">{q.text}</p>
      </div>

      {q.type === "QCM" && q.options && (
        <div className="space-y-2">
          <p className="text-xs text-indigo-600 font-medium mb-1">
            {isMultiAnswerQCM
              ? t("qcmSelectN").replace("{{n}}", String(q.options?.correctIndexes?.length ?? 2))
              : t("qcmSelectOne")}
          </p>
          {getChoices(q.options).map((choice, idx) => {
            if (isMultiAnswerQCM) {
              const isChecked = selectedAnswers.includes(idx);
              const isCorrectChoice = answered && (q.options?.correctIndexes ?? []).includes(idx);
              const isWrongChoice = answered && isChecked && !(q.options?.correctIndexes ?? []).includes(idx);
              return (
                <label key={idx}
                  className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl border-2 transition-all ${
                    answered ? "cursor-default" : "cursor-pointer"
                  } ${
                    isCorrectChoice ? "border-green-400 bg-green-50 text-green-800"
                      : isWrongChoice ? "border-red-400 bg-red-50 text-red-800"
                      : isChecked ? "text-white"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                  style={isChecked && !answered ? { borderColor: primaryColor, backgroundColor: primaryColor } : {}}>
                  <input type="checkbox" checked={isChecked} disabled={answered}
                    onChange={() => {
                      if (answered) return;
                      setSelectedAnswers(prev => prev.includes(idx) ? prev.filter(x => x !== idx) : [...prev, idx]);
                    }}
                    className="rounded" />
                  {choice}
                </label>
              );
            }
            const isSelected = selectedAnswer === idx;
            const showCorrect = feedback !== null && idx === q.options!.correctIndex;
            const showWrong = feedback !== null && isSelected && idx !== q.options!.correctIndex;
            return (
              <button key={idx} onClick={() => !answered && setSelectedAnswer(idx)} disabled={answered}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  showCorrect ? "border-green-400 bg-green-50 text-green-800"
                    : showWrong ? "border-red-400 bg-red-50 text-red-800"
                    : isSelected ? "border-opacity-100 text-white"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                }`}
                style={isSelected && !feedback ? { borderColor: primaryColor, backgroundColor: primaryColor } : {}}>
                {choice}
              </button>
            );
          })}
        </div>
      )}

      {q.type === "TRUE_FALSE" && (
        <div className="grid grid-cols-2 gap-3">
          {(["true", "false"] as const).map(val => {
            const label = val === "true" ? t("trueLabel") : t("falseLabel");
            const isSelected = selectedAnswer === val;
            const expected = q.expectedAnswer?.toLowerCase();
            const showCorrect = feedback !== null && val === expected;
            const showWrong = feedback !== null && isSelected && val !== expected;
            return (
              <button key={val} onClick={() => !answered && setSelectedAnswer(val)} disabled={answered}
                className={`py-4 rounded-xl border-2 text-sm font-semibold transition-all ${
                  showCorrect ? "border-green-400 bg-green-50 text-green-800"
                    : showWrong ? "border-red-400 bg-red-50 text-red-800"
                    : isSelected ? "text-white"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                }`}
                style={isSelected && !feedback ? { borderColor: primaryColor, backgroundColor: primaryColor } : {}}>
                {label}
              </button>
            );
          })}
        </div>
      )}

      {(q.type === "OPEN" || q.type === "SCENARIO") && (
        <div className="space-y-2">
          <label className="block text-xs text-gray-500 font-medium">{t("yourAnswer")}</label>
          <textarea rows={5} disabled={answered} value={fillAnswer}
            onChange={e => setFillAnswer(e.target.value)}
            placeholder={t("answerPlaceholder")}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-800 bg-white resize-none focus:outline-none focus:ring-2"
            style={{ "--tw-ring-color": primaryColor } as React.CSSProperties} />
          <p className="text-xs text-amber-600 flex items-center gap-1">
            ℹ️ {t("answerReviewedNote")}
          </p>
        </div>
      )}

      {q.type === "RANKING" && (
        <div className="space-y-2">
          <label className="block text-xs text-gray-500 font-medium">
            {t("rankItemsLabel")}
          </label>
          {q.options && getChoices(q.options).length > 0 && (
            <ol className="mb-2 space-y-1">
              {getChoices(q.options).map((c, i) => (
                <li key={i} className="text-sm text-gray-700">
                  <span className="font-semibold mr-1">{i + 1}.</span> {c}
                </li>
              ))}
            </ol>
          )}
          <textarea rows={3} disabled={answered} value={fillAnswer}
            onChange={e => setFillAnswer(e.target.value)}
            placeholder={t("rankItemsPlaceholder")}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-800 bg-white resize-none focus:outline-none focus:ring-2" />
        </div>
      )}

      {feedback && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold ${
          feedback === "correct"
            ? "bg-green-50 text-green-700 border border-green-200"
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {feedback === "correct" ? t("correctFeedback") : t("incorrectFeedback")}
        </div>
      )}

      <button onClick={handleSubmit} disabled={!canSubmit}
        className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ backgroundColor: primaryColor }}>
        {t("validate")}
      </button>
    </div>
  );
}

function SessionResults({
  session,
  primaryColor,
  accentColor,
}: {
  session: Session;
  primaryColor: string;
  accentColor: string;
}) {
  const { t } = useI18n();
  const total = (session?.progress || []).length;
  const validated = (session?.progress || []).filter(p => Boolean(getEffectiveLevel(p))).length;
  const score = total > 0
    ? Math.round((session.progress || []).reduce((sum, p) => (
        sum + (p.questionsAsked > 0 ? Math.round((p.correctCount / p.questionsAsked) * 100) : 0)
      ), 0) / total)
    : 0;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-4 p-4 bg-gray-50 rounded-xl">
        <div className="text-center">
          <p className="text-3xl font-bold" style={{ color: primaryColor }}>{score}%</p>
          <p className="text-xs text-gray-500">{t("globalScore")}</p>
        </div>
        <div className="h-12 w-px bg-gray-200" />
        <div className="text-center">
          <p className="text-3xl font-bold text-green-500">{validated}</p>
          <p className="text-xs text-gray-500">{t("competences")} {t("validatedLabel")}</p>
        </div>
        <div className="h-12 w-px bg-gray-200" />
        <div className="text-center">
          <p className="text-3xl font-bold text-red-400">{total - validated}</p>
          <p className="text-xs text-gray-500">{t("toImprove")}</p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <h4 className="text-sm font-semibold text-gray-700">{t("scoreBySkillArea")}</h4>
        {(session?.progress || []).map(prog => {
          const scoreP = prog.questionsAsked > 0
            ? Math.round((prog.correctCount / prog.questionsAsked) * 100)
            : 0;
          return (
            <div key={prog.id} className="flex items-center gap-3 text-sm">
              <span className="flex-1 text-gray-600 text-xs">
                {prog.subSubThemeLabel || `${t("competencyDomain")} ${prog.subSubThemeId}`}
                {getEffectiveLevel(prog) && (
                  <span className="ml-1 text-gray-400">
                    ({String(getEffectiveLevel(prog)).charAt(0) + String(getEffectiveLevel(prog)).slice(1).toLowerCase()})
                  </span>
                )}
              </span>
              <div className="w-24 bg-gray-100 rounded-full h-2">
                <div className="h-2 rounded-full"
                  style={{ width: `${scoreP}%`, backgroundColor: scoreP >= 70 ? "#22c55e" : "#f59e0b" }} />
              </div>
              <span className="text-xs text-gray-500 w-10 text-right">{scoreP}%</span>
              {(prog.maxPoints ?? 0) > 0 && (
                <span className="text-xs text-gray-400">
                  ({prog.pointsEarned ?? 0}/{prog.maxPoints} pts)
                </span>
              )}
              <span className={`text-xs font-semibold ${getEffectiveLevel(prog) ? "text-green-600" : "text-red-500"}`}>
                {getEffectiveLevel(prog) ? t("passed") : t("failed")}
              </span>
              {getEffectiveLevel(prog) && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                  {String(getEffectiveLevel(prog)).charAt(0) + String(getEffectiveLevel(prog)).slice(1).toLowerCase()}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="divide-y border border-gray-200 rounded-xl overflow-hidden">
        {session.progress.map((p) => (
          <div key={p.id} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-700">
              {p.subSubThemeLabel || `${t("competencyDomain")} ${p.subSubThemeId}`}
              {getEffectiveLevel(p) && (
                <span className="ml-1 text-xs text-gray-400">
                  · {String(getEffectiveLevel(p)).charAt(0) + String(getEffectiveLevel(p)).slice(1).toLowerCase()}
                </span>
              )}
            </span>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-gray-500">{p.correctCount}/{p.questionsAsked} {t("correctAnswersLabel")}</span>
              <span className={`px-2 py-0.5 rounded-full font-medium ${
                getEffectiveLevel(p) ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
              }`}>
                {getEffectiveLevel(p) ? t("passed") : t("failed")}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ParticipantTests() {
  const { accessToken } = useAuth();
  const { t } = useI18n();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [assignments, setAssignments] = useState<TestAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTest, setActiveTest] = useState<{ assignment: TestAssignment; session: Session } | null>(null);
  const [viewingResult, setViewingResult] = useState<{ assignment: TestAssignment; session: Session } | null>(null);
  // Pop-up "Passer le test" — sélection depuis "Tests à réaliser"
  const [confirmingTest, setConfirmingTest] = useState<TestAssignment | null>(null);
  const [sections, setSections] = useState({ todo: true, inProgress: true, done: true });

  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  async function loadData(): Promise<TestAssignment[]> {
    if (!accessToken) return [];
    setLoading(true);
    try {
      const [prof, tests] = await Promise.all([
        fetch("/api/participant/profile", { headers: authHeaders }).then(r => r.json()),
        fetch("/api/participant/tests", { headers: authHeaders }).then(r => r.json()),
      ]);
      setProfile(prof);
      const mapped = (Array.isArray(tests) ? tests : []).map((a: any) => ({
        ...a,
        session: a.test?.sessions?.[0] || a.session || null,
      }));
      setAssignments(mapped);
      return mapped;
    } catch {
      toast.error(t("loadingError"));
      return [];
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [accessToken]);

  const primaryColor = profile?.client?.primaryColor || "#27295A";
  const accentColor  = profile?.client?.accentColor  || "#FCC00E";
  const logoUrl      = resolveAssetUrl(profile?.client?.logoUrl) || null;
  const companyName  = profile?.client?.name         || "";

  const todo       = assignments.filter(a => a.status === "PENDING");
  const inProgress = assignments.filter(
    a => a.status === "IN_PROGRESS" ||
      (a.session && a.session.status === "IN_PROGRESS" && a.status !== "COMPLETED")
  );
  const done = assignments.filter(a => a.status === "COMPLETED");

  // "Passer le test" — active ET démarre directement la session
  async function handleActivate(a: TestAssignment) {
    try {
      await fetch(`/api/participant/tests/${a.testId}/activate`, {
        method: "POST",
        headers: authHeaders,
      });
      // Démarrer immédiatement la session sans étape intermédiaire
      const startRes = await fetch(`/api/participant/tests/${a.testId}/start`, {
        method: "POST",
        headers: authHeaders,
      });
      if (!startRes.ok) throw new Error((await startRes.json()).error || "Erreur");
      const sessionData = await startRes.json();
      setConfirmingTest(null);
      setActiveTest({ assignment: { ...a, status: "IN_PROGRESS" }, session: sessionData });
    } catch (err: any) {
      toast.error(err.message || "Impossible de démarrer le test");
    }
  }

  // "Demander à repasser" — envoie une demande d'autorisation au client admin
  async function handleRetakeRequest(a: TestAssignment) {
    try {
      const res = await fetch(`/api/participant/tests/${a.testId}/retake-request`, {
        method: "POST",
        headers: authHeaders,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erreur");
      }
      toast.success(t("retakeRequestSent"));
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Impossible d'envoyer la demande");
    }
  }

  // "Commencer" / "Reprendre" — crée ou reprend la session et ouvre le questionnaire
  async function handleStart(a: TestAssignment) {
    try {
      const res = await fetch(`/api/participant/tests/${a.testId}/start`, {
        method: "POST",
        headers: authHeaders,
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erreur");
      const data = await res.json();
      setActiveTest({ assignment: a, session: data });
    } catch (err: any) {
      toast.error(err.message || "Impossible de démarrer le test");
    }
  }

  // Fin de test — marque complété puis affiche automatiquement les résultats
  async function handleComplete() {
    if (!activeTest) return;
    const testId = activeTest.assignment.testId;
    try {
      await fetch(`/api/participant/sessions/${activeTest.session.id}/complete`, {
        method: "POST",
        headers: authHeaders,
      });
    } catch {}
    setActiveTest(null);
    const fresh = await loadData();
    const completed = fresh.find(a => a.testId === testId && a.status === "COMPLETED");
    if (completed?.session) {
      setViewingResult({ assignment: completed, session: completed.session });
    }
  }

  function toggleSection(key: keyof typeof sections) {
    setSections(s => ({ ...s, [key]: !s[key] }));
  }

  function SectionHeader({ title, count, sectionKey, color }: {
    title: string; count: number; sectionKey: keyof typeof sections; color: string;
  }) {
    return (
      <button onClick={() => toggleSection(sectionKey)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
          <span className="font-semibold text-gray-700 text-sm">{title}</span>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600">{count}</span>
        </div>
        {sections[sectionKey] ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
      </button>
    );
  }

  // Vue questionnaire actif
  if (activeTest) {
    return (
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <ParticipantSidebar primaryColor={primaryColor} accentColor={accentColor} logoUrl={logoUrl} companyName={companyName} firstName={profile?.firstName} lastName={profile?.lastName} />
        <PageShell>
          <div className="mb-6">
            <button onClick={() => setActiveTest(null)} className="text-sm text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-1">
              {t("backNav")}
            </button>
            <h1 className="text-xl font-bold text-gray-800">{activeTest.assignment.test.name}</h1>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6">
            <TestRunner
              assignment={activeTest.assignment}
              session={activeTest.session}
              onComplete={handleComplete}
              primaryColor={primaryColor}
              accentColor={accentColor}
              accessToken={accessToken!}
            />
          </div>
        </PageShell>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50">
        <div className="flex-1 flex items-center justify-center text-gray-400">{t("loading")}</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <ParticipantSidebar primaryColor={primaryColor} accentColor={accentColor} logoUrl={logoUrl} companyName={companyName} />
      <PageShell>
        <h1 className="text-2xl font-bold text-gray-800 mb-6">{t("myTests")}</h1>

        {/* Pop-up confirmation "Passer le test" */}
        {confirmingTest && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-800">{confirmingTest.test.name}</h2>
                  {confirmingTest.test.description && (
                    <p className="text-sm text-gray-500 mt-1">{confirmingTest.test.description}</p>
                  )}
                </div>
                <button onClick={() => setConfirmingTest(null)} className="text-gray-400 hover:text-gray-600 ml-4 shrink-0">
                  <X size={20} />
                </button>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 mb-6 space-y-2 text-sm text-gray-600">
                <p className="flex items-center gap-2">
                  <span className="font-medium">{t("assessedSkills")} :</span>
                  <span>{new Set((confirmingTest.test.competences || []).map((c: any) => c.subSubThemeId).filter(Boolean)).size}</span>
                </p>
                {confirmingTest.test.timerEnabled && confirmingTest.test.timerDuration && (
                  <p className="flex items-center gap-2">
                    <Timer size={14} className="text-amber-500" />
                    <span>{t("limitedDuration")} : {confirmingTest.test.timerDuration} {t("minutes")}</span>
                  </p>
                )}
                {confirmingTest.deadline && (
                  <p className="flex items-center gap-2 text-orange-600">
                    <Clock size={14} />
                    <span>{t("deadlineLabel")} : {new Date(confirmingTest.deadline).toLocaleDateString("fr-FR")}</span>
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmingTest(null)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors"
                >
                  {t("cancel")}
                </button>
                <button
                  onClick={() => handleActivate(confirmingTest)}
                  className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity"
                  style={{ backgroundColor: primaryColor }}
                >
                  {t("takeTest")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal résultats */}
        {viewingResult && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-5 border-b">
                <h2 className="text-lg font-semibold">{viewingResult.assignment.test.name} — {t("resultsTitle")}</h2>
                <button onClick={() => setViewingResult(null)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                <SessionResults
                  session={viewingResult.session}
                  primaryColor={primaryColor}
                  accentColor={accentColor}
                />
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">

          {/* Section 1 : Tests à réaliser */}
          <div>
            <SectionHeader title={t("testsToComplete")} count={todo.length} sectionKey="todo" color="#6366f1" />
            {sections.todo && (
              <div className="mt-2 space-y-3">
                {todo.length === 0 ? (
                  <p className="text-sm text-gray-400 italic px-2">{t("noTestsToComplete")}</p>
                ) : (
                  todo.map(a => (
                    <div
                      key={a.id}
                      onClick={() => setConfirmingTest(a)}
                      className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all"
                    >
                      <div>
                        <p className="font-medium text-gray-800">{a.test.name}</p>
                        {a.test.description && (
                          <p className="text-xs text-gray-500 mt-0.5">{a.test.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                          <span>{new Set((a.test.competences || []).map((c: any) => c.subSubThemeId).filter(Boolean)).size} {t("competences").toLowerCase()}</span>
                          {a.test.timerEnabled && (
                            <span className="flex items-center gap-1">
                              <Timer size={10} /> {a.test.timerDuration} min
                            </span>
                          )}
                          {a.deadline && (
                            <span className="text-orange-500">
                              {t("deadlineLabel")} : {new Date(a.deadline).toLocaleDateString("fr-FR")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 ml-3">
                        <div
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-white text-xs font-semibold"
                          style={{ backgroundColor: "#6366f1" }}
                        >
                          <Play size={12} /> {t("selectTest")}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Section 2 : Tests en cours */}
          <div>
            <SectionHeader title={t("testsInProgress")} count={inProgress.length} sectionKey="inProgress" color="#f59e0b" />
            {sections.inProgress && (
              <div className="mt-2 space-y-3">
                {inProgress.length === 0 ? (
                  <p className="text-sm text-gray-400 italic px-2">{t("noTestsInProgress")}</p>
                ) : (
                  inProgress.map(a => {
                    const hasSession = a.session && a.session.status === "IN_PROGRESS";
                    const totalComps = a.session?.progress?.length || 0;
                    const doneComps = a.session?.progress?.filter(p => p.completed).length || 0;
                    return (
                      <div key={a.id} className="bg-white border border-amber-200 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <p className="font-medium text-gray-800">{a.test.name}</p>
                            {hasSession && totalComps > 0 && (
                              <div className="mt-2">
                                <div className="flex justify-between text-xs text-gray-500 mb-1">
                                  <span>{t("progression")}</span>
                                  <span>{doneComps}/{totalComps} {t("competences").toLowerCase()}</span>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full transition-all"
                                    style={{ width: `${(doneComps / totalComps) * 100}%`, backgroundColor: accentColor }} />
                                </div>
                              </div>
                            )}
                            {a.session?.timeRemaining !== null && a.session?.timeRemaining !== undefined && (
                              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                                <Clock size={10} /> {t("timeRemainingSaved")}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => handleStart(a)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-white text-xs font-semibold shrink-0"
                            style={{ backgroundColor: "#f59e0b" }}
                          >
                            {hasSession
                              ? <><RotateCcw size={12} /> {t("resumeTest")}</>
                              : <><Play size={12} /> {t("startTest")}</>
                            }
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Section 3 : Tests réalisés */}
          <div>
            <SectionHeader title={t("testsDone")} count={done.length} sectionKey="done" color="#10b981" />
            {sections.done && (
              <div className="mt-2 space-y-3">
                {done.length === 0 ? (
                  <p className="text-sm text-gray-400 italic px-2">{t("noTestsDone")}</p>
                ) : (
                  done.map(a => {
                    const totalComps = a.session?.progress?.length || 0;
                    const passedComps = a.session?.progress?.filter(p => p.passed).length || 0;
                    const score = totalComps > 0 ? Math.round((passedComps / totalComps) * 100) : 0;
                    return (
                      <div key={a.id} className="bg-white border border-green-100 rounded-xl p-4 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-800">{a.test.name}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {t("scoreDisplay")} : <span className="font-semibold text-green-600">{score}%</span>{" "}
                            — {passedComps}/{totalComps} {t("competences").toLowerCase()} {t("validatedLabel")}
                          </p>
                          {(a.session as any)?.attemptNumber > 1 && (
                            <span className="text-xs text-gray-400">{t("attempt")} {(a.session as any).attemptNumber}</span>
                          )}
                          {a.session?.completedAt && (
                            <p className="text-xs text-gray-400">
                              {t("completedOn")} {new Date(a.session.completedAt).toLocaleDateString("fr-FR")}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 shrink-0">
                          <button
                            onClick={() => a.session && setViewingResult({ assignment: a, session: a.session })}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-gray-700 text-xs font-semibold hover:bg-gray-50"
                          >
                            <Eye size={12} /> {t("resultsTitle")}
                          </button>
                          {a.retakeRequest?.status === "PENDING" ? (
                            <span className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                              <Clock size={12} /> {t("retakeRequestPending")}
                            </span>
                          ) : (
                            <button
                              onClick={() => handleRetakeRequest(a)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                              <RotateCcw size={14} /> {t("requestRetake")}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

        </div>
      </PageShell>
    </div>
  );
}
