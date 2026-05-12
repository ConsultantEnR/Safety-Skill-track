import { Router } from "express";
import prisma from "../../lib/prisma";
import { authenticate, requireRole } from "../../middleware/auth";
import bcrypt from "bcryptjs";
import { sendTestCompletionNotification } from "../../services/email";

const router = Router();

// ITER10/11: logique de progression par niveau
const LEVEL_ORDER = ["FONDAMENTAL","BASIQUE","INTERMEDIAIRE","AVANCE","COMPLET"];
function nextLevel(current: string): string | null {
  const idx = LEVEL_ORDER.indexOf(current);
  return idx >= 0 && idx < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[idx + 1] : null;
}
function levelPoints(level: string): number {
  return ({ FONDAMENTAL:1, BASIQUE:2, INTERMEDIAIRE:3, AVANCE:4, COMPLET:5 } as Record<string,number>)[level] || 1;
}

// Mélanger un tableau
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const AUTO_QUESTION_TYPES = ["QCM", "TRUE_FALSE", "RANKING"] as const;
const OPEN_QUESTION_TYPES = ["OPEN", "SCENARIO"] as const;
const LEVEL_RANK: Record<string, number> = {
  FONDAMENTAL: 1,
  BASIQUE: 2,
  INTERMEDIAIRE: 3,
  AVANCE: 4,
  COMPLET: 5,
};
const QUESTION_SELECT = {
  id: true,
  text: true,
  type: true,
  options: true,
  expectedAnswer: true,
  correctAnswers: true,
  level: true,
  customScore: true,
} as const;

function getMaxLevelForSST(
  competences: Array<{ subSubThemeId: number | null; expectedLevel: string }>,
  subSubThemeId: number
): string {
  return competences
    .filter((c) => c.subSubThemeId === subSubThemeId)
    .reduce((max, c) => (
      LEVEL_ORDER.indexOf(c.expectedLevel) > LEVEL_ORDER.indexOf(max) ? c.expectedLevel : max
    ), "FONDAMENTAL");
}

function getBestAttainedLevel(previousLevel: string | undefined, currentLevel: string, correctCountAtCurrentLevel: number): string | null {
  if (correctCountAtCurrentLevel > 0) return currentLevel;
  return previousLevel || null;
}

function buildQuestionPayload(question: any) {
  if (question.type === "OPEN" || question.type === "SCENARIO") {
    return {
      id: question.id,
      text: question.text,
      type: question.type,
      options: null,
      expectedAnswer: null,
      correctAnswers: [],
      level: question.level,
      customScore: null,
    };
  }

  const options = question.options as any;
  let shuffledOptions = options;
  if (options?.choices && Array.isArray(options.choices)) {
    const indices = options.choices.map((_: any, i: number) => i);
    const shuffledIndices = shuffle(indices);
    const shuffledChoices = shuffledIndices.map((i: number) => options.choices[i]);
    const newCorrectIndex = options.correctIndex !== undefined
      ? shuffledIndices.indexOf(options.correctIndex)
      : undefined;
    const newCorrectIndexes = Array.isArray(options.correctIndexes)
      ? options.correctIndexes.map((ci: number) => shuffledIndices.indexOf(ci))
      : undefined;
    shuffledOptions = {
      ...options,
      choices: shuffledChoices,
      ...(newCorrectIndex !== undefined ? { correctIndex: newCorrectIndex } : {}),
      ...(newCorrectIndexes ? { correctIndexes: newCorrectIndexes } : {}),
    };
  }

  return {
    id: question.id,
    text: question.text,
    type: question.type,
    options: shuffledOptions,
    expectedAnswer: question.expectedAnswer,
    correctAnswers: question.correctAnswers ?? [],
    level: question.level,
    customScore: question.customScore ?? null,
  };
}

// GET profile
router.get("/profile", authenticate, requireRole("EMPLOYEE"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const employee = await prisma.employee.findFirst({
      where: { userId: user.id },
      include: { client: { select: { id: true, name: true, primaryColor: true, accentColor: true, logoUrl: true } } },
    });
    if (!employee) return res.status(404).json({ error: "Profil non trouvé" });
    res.json({ ...employee, clientBranding: employee.client });
  } catch (err) { next(err); }
});

// PUT change password
router.put("/profile/password", authenticate, requireRole("EMPLOYEE"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const { currentPassword, newPassword } = req.body;
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser || !(await bcrypt.compare(currentPassword, dbUser.password))) {
      return res.status(400).json({ error: "Mot de passe actuel incorrect" });
    }
    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
    // Synchroniser plainPassword sur l'employé pour que l'admin voie le mot de passe à jour
    await prisma.employee.updateMany({ where: { userId: user.id }, data: { plainPassword: newPassword } });
    res.json({ message: "Mot de passe mis à jour" });
  } catch (err) { next(err); }
});

// GET public client branding by clientId
router.get("/branding/:clientId", async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({ where: { id: Number(req.params.clientId) } });
    if (!client) return res.status(404).json({ error: "Client non trouvé" });
    res.json({ primaryColor: client.primaryColor, accentColor: client.accentColor, logoUrl: client.logoUrl, companyName: client.name });
  } catch (err) { next(err); }
});

// GET all assigned tests
router.get("/tests", authenticate, requireRole("EMPLOYEE"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const employee = await prisma.employee.findFirst({ where: { userId: user.id } });
    if (!employee) return res.status(404).json({ error: "Employé non trouvé" });

    const assignments = await prisma.testAssignment.findMany({
      where: { employeeId: employee.id },
      include: {
        test: {
          include: {
            competences: true,
            sessions: {
              where: { employeeId: employee.id },
              include: { progress: true },
              orderBy: { startedAt: "desc" },
            },
          },
        },
      },
    });

    // ITER12: Enrich progress with subSubTheme labels
    const allSstIds = new Set<number>();
    for (const a of assignments) {
      for (const s of a.test.sessions) {
        for (const p of s.progress) allSstIds.add(p.subSubThemeId);
      }
    }
    const subSubThemes = await prisma.subSubTheme.findMany({
      where: { id: { in: Array.from(allSstIds) } },
      select: { id: true, label: true },
    });
    const sstMap: Record<number, string> = {};
    for (const sst of subSubThemes) sstMap[sst.id] = sst.label;

    // Include pending retake request for COMPLETED assignments
    const completedTestIds = assignments.filter(a => a.status === "COMPLETED").map(a => a.testId);
    const pendingRequests = completedTestIds.length > 0
      ? await prisma.retakeRequest.findMany({
          where: { employeeId: employee.id, testId: { in: completedTestIds }, status: "PENDING" },
        })
      : [];
    const pendingByTestId: Record<number, number> = {};
    for (const r of pendingRequests) pendingByTestId[r.testId] = r.id;

    const enriched = assignments.map(a => ({
      ...a,
      retakeRequest: a.status === "COMPLETED" && pendingByTestId[a.testId]
        ? { id: pendingByTestId[a.testId], status: "PENDING" }
        : null,
      test: {
        ...a.test,
        sessions: a.test.sessions.map(s => ({
          ...s,
          progress: s.progress.map(p => ({
            ...p,
            subSubThemeLabel: sstMap[p.subSubThemeId] || null,
          })),
        })),
      },
    }));
    res.json(enriched);
  } catch (err) { next(err); }
});

// POST activate test — bascule l'assignation en IN_PROGRESS sans créer de session
router.post("/tests/:testId/activate", authenticate, requireRole("EMPLOYEE"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const testId = Number(req.params.testId);
    const employee = await prisma.employee.findFirst({ where: { userId: user.id } });
    if (!employee) return res.status(404).json({ error: "Employé non trouvé" });
    const updated = await prisma.testAssignment.updateMany({
      where: { testId, employeeId: employee.id, status: "PENDING" },
      data: { status: "IN_PROGRESS" },
    });
    if (updated.count === 0) return res.status(400).json({ error: "Test non trouvé ou déjà activé" });
    res.json({ message: "Test activé" });
  } catch (err) { next(err); }
});

// POST start/resume test session
router.post("/tests/:testId/start", authenticate, requireRole("EMPLOYEE"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const testId = Number(req.params.testId);
    const employee = await prisma.employee.findFirst({ where: { userId: user.id } });
    if (!employee) return res.status(404).json({ error: "Employé non trouvé" });

    const test = await prisma.test.findUnique({ where: { id: testId }, include: { competences: true } });
    if (!test) return res.status(404).json({ error: "Test non trouvé" });

    let session = await prisma.testSession.findFirst({
      where: { testId, employeeId: employee.id, status: "IN_PROGRESS" },
      include: { progress: true },
    });

    if (!session) {
      const timeRemaining = test.timerEnabled && test.timerDuration ? test.timerDuration * 60 : null;
      const previousSessions = await prisma.testSession.count({ where: { testId, employeeId: employee.id } });
      // Un seul enregistrement progress par subSubTheme unique (le modèle TestCompetence stocke N records par SST, un par niveau)
      const uniqueCompetences = test.competences
        .filter(c => c.subSubThemeId)
        .filter((c, i, arr) => arr.findIndex(x => x.subSubThemeId === c.subSubThemeId) === i);
      session = await prisma.testSession.create({
        data: {
          testId,
          employeeId: employee.id,
          timeRemaining,
          attemptNumber: previousSessions + 1,
          askedQuestionIds: [], // ITER11
          progress: {
            create: uniqueCompetences.map(c => ({
              subSubThemeId: c.subSubThemeId!,
              currentLevel: "FONDAMENTAL",
            })),
          },
        },
        include: { progress: true },
      });
      await prisma.testAssignment.updateMany({
        where: { testId, employeeId: employee.id },
        data: { status: "IN_PROGRESS" },
      });
    }
    res.json(session);
  } catch (err) { next(err); }
});

// GET session state
router.get("/sessions/:sessionId", authenticate, requireRole("EMPLOYEE"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const employee = await prisma.employee.findFirst({ where: { userId: user.id } });
    if (!employee) return res.status(404).json({ error: "Employé non trouvé" });

    const session = await prisma.testSession.findFirst({
      where: { id: Number(req.params.sessionId), employeeId: employee.id },
      include: {
        progress: true,
        test: { include: { competences: true } },
      },
    });
    if (!session) return res.status(404).json({ error: "Session non trouvée" });
    res.json(session);
  } catch (err) { next(err); }
});

// ITER11: GET next question — logique anti-boucle + max 2 auto + 1 open par niveau
router.get("/sessions/:sessionId/next-question", authenticate, requireRole("EMPLOYEE"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const employee = await prisma.employee.findFirst({ where: { userId: user.id } });
    if (!employee) return res.status(404).json({ error: "Employé non trouvé" });

    const session = await prisma.testSession.findFirst({
      where: { id: Number(req.params.sessionId), employeeId: employee.id, status: "IN_PROGRESS" },
      select: {
        id: true,
        askedQuestionIds: true,
        progress: true,
        test: {
          select: {
            competences: {
              select: {
                subSubThemeId: true,
                expectedLevel: true,
              },
            },
          },
        },
      },
    });
    if (!session) return res.status(404).json({ error: "Session non trouvée ou terminée" });

    const pendingProgress = session.progress.find(p => !p.completed);
    if (!pendingProgress) return res.json({ done: true });

    const { subSubThemeId } = pendingProgress;
    let currentLevel = pendingProgress.currentLevel as string;

    // ITER11: questions déjà posées dans toute la session
    const alreadyAsked: Set<number> = new Set(session.askedQuestionIds);

    // Boucle sur les niveaux jusqu'à trouver des questions disponibles
    while (true) {
      const questionBaseWhere = {
        subSubThemeId,
        level: currentLevel as any,
        ...(alreadyAsked.size > 0 ? { id: { notIn: Array.from(alreadyAsked) } } : {}),
      };
      const [autoQ, openQ] = await Promise.all([
        prisma.question.findMany({
          where: {
            ...questionBaseWhere,
            type: { in: [...AUTO_QUESTION_TYPES] as any },
          },
          select: QUESTION_SELECT,
          take: 12,
        }),
        prisma.question.findMany({
          where: {
            ...questionBaseWhere,
            type: { in: [...OPEN_QUESTION_TYPES] as any },
          },
          select: QUESTION_SELECT,
          take: 6,
        }),
      ]);

      // Vérifier si on peut encore poser des questions à ce niveau
      const levelAutoAsked = pendingProgress.levelQuestionsAsked;
      const levelOpenAsked = (pendingProgress as any).levelOpenAsked ?? 0;
      const needsMoreAuto = levelAutoAsked < 2;
      const canAskOpen = levelOpenAsked < 1 && openQ.length > 0;

      // Si on a besoin d'une question auto et qu'il y en a de disponibles
      if (needsMoreAuto && autoQ.length > 0) {
        const question = shuffle(autoQ)[0];
        await prisma.testSession.update({
          where: { id: session.id },
          data: { askedQuestionIds: { push: question.id } },
        });
        alreadyAsked.add(question.id);
        return res.json({
          question: buildQuestionPayload(question),
          subSubThemeId,
          progressItem: pendingProgress,
          levelQuestionsAsked: pendingProgress.levelQuestionsAsked,
        });
      }

      // Si on a posé 2 questions auto au niveau actuel et qu'on peut encore poser une open
      if (!needsMoreAuto && canAskOpen) {
        const question = shuffle(openQ)[0];
        await prisma.testSession.update({
          where: { id: session.id },
          data: { askedQuestionIds: { push: question.id } },
        });
        alreadyAsked.add(question.id);
        return res.json({
          question: buildQuestionPayload(question),
          subSubThemeId,
          progressItem: pendingProgress,
          levelQuestionsAsked: pendingProgress.levelQuestionsAsked,
        });
      }

      // Plus de questions à poser à ce niveau
      // → vérifier si on doit avancer (2 bonnes réponses) ou arrêter le SST
      // L'avancement de niveau est géré dans /answer — ici on arrive ici si:
      // 1. Plus de questions auto disponibles (stock épuisé avant 2 posées)
      // 2. Les 2 questions auto et l'open ont été posées → le SST sera arrêté après l'answer

      // Niveau maximum = le plus élevé parmi toutes les TestCompetences pour ce SST dans ce test
      const maxLevelForSST = getMaxLevelForSST(session.test.competences, pendingProgress.subSubThemeId);
      if (autoQ.length === 0 && levelAutoAsked < 3) {
        const next = nextLevel(currentLevel);
        const nextExceedsMaxBank = next ? LEVEL_ORDER.indexOf(next) > LEVEL_ORDER.indexOf(maxLevelForSST) : false;
        if (!next || nextExceedsMaxBank) {
          // Aucun niveau suivant et banque vide → finir le SST sans valider
          await prisma.testSessionProgress.update({
            where: { id: pendingProgress.id },
            data: { completed: true, passed: false, levelReached: currentLevel as any },
          });
          const remainingIncomplete = await prisma.testSessionProgress.count({
            where: { sessionId: session.id, completed: false, NOT: { id: pendingProgress.id } },
          });
          if (remainingIncomplete === 0) {
            await completeSession(session.id, employee);
            return res.json({ done: true });
          }
          return res.json({ done: true, reason: "no_questions_at_any_level" });
        }
        currentLevel = next;
        await prisma.testSessionProgress.update({
          where: { id: pendingProgress.id },
          data: { currentLevel: currentLevel as any, levelQuestionsAsked: 0, levelCorrectCount: 0, levelOpenAsked: 0 },
        });
        // Mettre à jour pendingProgress local pour la prochaine itération
        (pendingProgress as any).levelQuestionsAsked = 0;
        (pendingProgress as any).levelCorrectCount = 0;
        (pendingProgress as any).levelOpenAsked = 0;
        continue;
      }

      // Cas où les 2 auto + 1 open ont été posés — le client doit soumettre une réponse d'abord
      // → retourner done: false, signalant qu'il faut attendre la réponse
      // (normalement on ne devrait pas arriver ici car next-question est appelé après chaque réponse)
      return res.json({ done: false, waiting: true });
    }
  } catch (err) { next(err); }
});

// ITER11: POST answer question — anti-boucle + logique complète
router.post("/sessions/:sessionId/answer", authenticate, requireRole("EMPLOYEE"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const employee = await prisma.employee.findFirst({ where: { userId: user.id } });
    if (!employee) return res.status(404).json({ error: "Employé non trouvé" });

    const session = await prisma.testSession.findFirst({
      where: { id: Number(req.params.sessionId), employeeId: employee.id, status: "IN_PROGRESS" },
      select: {
        id: true,
        testId: true,
        askedQuestionIds: true,
        progress: true,
        test: {
          select: {
            name: true,
            competences: {
              select: {
                subSubThemeId: true,
                expectedLevel: true,
              },
            },
          },
        },
      },
    });
    if (!session) return res.status(404).json({ error: "Session non trouvée ou terminée" });

    const { subSubThemeId, isCorrect: isCorrectRaw, timeRemaining, questionId, userAnswer } = req.body;

    // Avec le modèle multi-niveaux, plusieurs tracks peuvent avoir le même subSubThemeId.
    // On cible le premier track NON complété pour ce subSubThemeId.
    const progressItem = session.progress.find(p => p.subSubThemeId === subSubThemeId && !p.completed);
    if (!progressItem) return res.status(400).json({ error: "Sous-thème non trouvé dans la session" });

    // Calculer isCorrect côté backend
    let isCorrect = isCorrectRaw;
    let question: any = null;
    if (questionId !== undefined && userAnswer !== undefined) {
      question = await prisma.question.findUnique({ where: { id: Number(questionId) } });
      if (question) {
        if (question.type === "OPEN" || question.type === "SCENARIO") {
          // Sauvegarder pour correction humaine
          const alreadySaved = await prisma.openResponse.findFirst({
            where: { questionId: Number(questionId), sessionId: session.id }
          });
          if (!alreadySaved) {
            await prisma.openResponse.create({
              data: {
                employeeId: employee.id,
                sessionId: session.id,
                questionId: Number(questionId),
                questionType: question.type,
                responseText: String(userAnswer || ""),
              }
            });
            // Notifier le Super Admin
            const superAdmins = await prisma.user.findMany({ where: { role: "SUPER_ADMIN" } });
            if (superAdmins.length > 0) {
              await prisma.notification.createMany({
                data: superAdmins.map((sa) => ({
                  userId: sa.id,
                  title: "Nouvelle réponse à analyser",
                  message: `Un salarié a soumis une réponse (${question.type}) à analyser.`,
                  type: "RESPONSE_TO_REVIEW",
                  isRead: false,
                })),
              });
            }
          }
          isCorrect = false; // sera recalculé après correction humaine
        } else {
          const options = question.options as any;
          const correctAnswers: string[] = (question.correctAnswers as string[]) || [];

          if (correctAnswers.length > 1) {
            // ITER11: QCM multi-réponses — comparaison exacte des deux sets
            const userSet = (Array.isArray(userAnswer) ? userAnswer : [userAnswer])
              .map((s: string) => String(s).trim().toLowerCase()).sort();
            const expectedSet = correctAnswers.map(s => s.trim().toLowerCase()).sort();
            isCorrect = JSON.stringify(userSet) === JSON.stringify(expectedSet);
          } else if (question.type === "QCM" && options?.choices && options?.correctIndex !== undefined) {
            // ITER12: text comparison only — no index fallback (choices are shuffled client-side)
            const correctAnswer = options.choices[options.correctIndex];
            isCorrect = String(userAnswer).trim().toLowerCase() === String(correctAnswer).trim().toLowerCase();
          } else if (correctAnswers.length === 1) {
            isCorrect = String(userAnswer).trim().toLowerCase() === correctAnswers[0].trim().toLowerCase();
          } else if (question.type === "TRUE_FALSE") {
            const expected = (question.expectedAnswer || "").toLowerCase().trim();
            isCorrect = String(userAnswer).toLowerCase().trim() === expected;
          } else if (question.expectedAnswer) {
            isCorrect = String(userAnswer).toLowerCase().trim() === question.expectedAnswer.toLowerCase().trim();
          } else {
            isCorrect = Boolean(isCorrectRaw);
          }
        }
      }
    }

    const isOpenOrScenario = question?.type === "OPEN" || question?.type === "SCENARIO";

    // ITER11: enregistrer questionId dans askedQuestionIds si pas déjà fait
    if (questionId !== undefined) {
      const alreadyTracked = session.askedQuestionIds.includes(Number(questionId));
      if (!alreadyTracked) {
        await prisma.testSession.update({
          where: { id: session.id },
          data: { askedQuestionIds: { push: Number(questionId) } },
        });
      }
    }

    // ITER10/11: calcul points + progression par niveau
    const pts = question?.customScore ?? levelPoints(progressItem.currentLevel as string);
    const newLevelQuestionsAsked = progressItem.levelQuestionsAsked + (isOpenOrScenario ? 0 : 1);
    const newLevelOpenAsked = ((progressItem as any).levelOpenAsked ?? 0) + (isOpenOrScenario ? 1 : 0);
    const newLevelCorrectCount = progressItem.levelCorrectCount + (isCorrect && !isOpenOrScenario ? 1 : 0);
    const newPointsEarned = progressItem.pointsEarned + (isCorrect && !isOpenOrScenario ? pts : 0);
    const newMaxPoints = progressItem.maxPoints + (!isOpenOrScenario ? pts : 0);
    const newQuestionsAsked = progressItem.questionsAsked + 1;
    const newCorrectCount = progressItem.correctCount + (isCorrect ? 1 : 0);

    let completed = progressItem.completed;
    let passed = progressItem.passed;
    let newCurrentLevel = progressItem.currentLevel as string;
    let newLevelReached = (progressItem.levelReached as string | undefined);

    if (!isOpenOrScenario) {
      if (newLevelCorrectCount >= 2) {
        // 2 bonnes réponses auto → passer au niveau suivant (ou terminer si niveau max atteint)
        const next = nextLevel(progressItem.currentLevel as string);
        newLevelReached = progressItem.currentLevel as string;
        const maxLevel = getMaxLevelForSST(session.test.competences, subSubThemeId);
        const nextExceedsMax = next ? LEVEL_ORDER.indexOf(next) > LEVEL_ORDER.indexOf(maxLevel) : false;
        if (!next || nextExceedsMax) {
          completed = true;
          passed = true;
        } else {
          newCurrentLevel = next;
        }
      } else if (newLevelQuestionsAsked >= 2) {
        // Le niveau s'arrête après 2 questions.
        const attainedLevel = getBestAttainedLevel(newLevelReached, progressItem.currentLevel as string, newLevelCorrectCount);
        completed = true;
        passed = Boolean(attainedLevel);
        newLevelReached = attainedLevel || undefined;
      }
    }

    const resetLevel = newLevelCorrectCount >= 2 && !completed;
    await prisma.testSessionProgress.update({
      where: { id: progressItem.id },
      data: {
        questionsAsked: newQuestionsAsked,
        correctCount: newCorrectCount,
        levelQuestionsAsked: resetLevel ? 0 : newLevelQuestionsAsked,
        levelOpenAsked: resetLevel ? 0 : newLevelOpenAsked,
        levelCorrectCount: resetLevel ? 0 : newLevelCorrectCount,
        ...(newLevelReached ? { levelReached: newLevelReached as any } : {}),
        pointsEarned: newPointsEarned,
        maxPoints: newMaxPoints,
        completed,
        passed,
        currentLevel: newCurrentLevel as any,
      },
    });

    if (timeRemaining !== undefined) {
      await prisma.testSession.update({ where: { id: session.id }, data: { timeRemaining } });
    }

    const remainingIncomplete = await prisma.testSessionProgress.count({
      where: { sessionId: session.id, completed: false },
    });
    const allDone = remainingIncomplete === 0;

    if (allDone) {
      await completeSession(session.id, employee);
      return res.json({ completed: true, allDone: true, isCorrect });
    }

    res.json({
      completed: false,
      allDone: false,
      isCorrect,
      progressItem: {
        ...progressItem,
        questionsAsked: newQuestionsAsked,
        correctCount: newCorrectCount,
        levelQuestionsAsked: resetLevel ? 0 : newLevelQuestionsAsked,
        completed,
        passed,
      }
    });
  } catch (err) { next(err); }
});

// POST force-complete session (timer expiry)
router.post("/sessions/:sessionId/complete", authenticate, requireRole("EMPLOYEE"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const employee = await prisma.employee.findFirst({ where: { userId: user.id } });
    if (!employee) return res.status(404).json({ error: "Employé non trouvé" });

    const session = await prisma.testSession.findFirst({
      where: { id: Number(req.params.sessionId), employeeId: employee.id },
    });
    if (!session) return res.status(404).json({ error: "Session non trouvée" });

    await completeSession(session.id, employee);
    res.json({ message: "Session terminée" });
  } catch (err) { next(err); }
});

async function completeSession(sessionId: number, employee: any) {
  const session = await prisma.testSession.findUnique({
    where: { id: sessionId },
    include: { test: { select: { name: true } }, employee: { include: { client: { include: { users: true } } } } },
  });
  if (!session) return;

  await prisma.testSession.update({ where: { id: sessionId }, data: { status: "COMPLETED", completedAt: new Date() } });
  await prisma.testAssignment.updateMany({
    where: { testId: session.testId, employeeId: employee.id },
    data: { status: "COMPLETED" },
  });

  const adminUsers = session.employee.client.users.filter((u: any) => u.role === "CLIENT_ADMIN");
  const employeeName = `${session.employee.firstName} ${session.employee.lastName}`;
  for (const admin of adminUsers) {
    await prisma.notification.create({
      data: {
        userId: admin.id,
        title: "Test terminé",
        message: `${employeeName} a terminé le test « ${session.test.name} »`,
        type: "TEST_COMPLETED",
      },
    });
    await sendTestCompletionNotification(admin.email, admin.username, employeeName, session.test.name).catch(() => {});
  }
}

// GET results (completed sessions)
router.get("/results", authenticate, requireRole("EMPLOYEE"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const employee = await prisma.employee.findFirst({ where: { userId: user.id } });
    if (!employee) return res.status(404).json({ error: "Employé non trouvé" });

    const sessions = await prisma.testSession.findMany({
      where: { employeeId: employee.id, status: "COMPLETED" },
      include: {
        test: { include: { competences: true } },
        progress: true,
        openResponses: {
          include: { question: { select: { text: true, level: true } } }
        },
      },
      orderBy: { completedAt: "desc" },
    });
    res.json(sessions);
  } catch (err) { next(err); }
});

// POST request retake authorization from client admin
router.post("/tests/:testId/retake-request", authenticate, requireRole("EMPLOYEE"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const testId = Number(req.params.testId);
    const employee = await prisma.employee.findFirst({
      where: { userId: user.id },
      include: { client: { select: { id: true } } },
    });
    if (!employee) return res.status(404).json({ error: "Employé non trouvé" });

    const existing = await prisma.retakeRequest.findFirst({
      where: { employeeId: employee.id, testId, status: "PENDING" },
    });
    if (existing) return res.status(400).json({ error: "Une demande est déjà en attente" });

    const request = await prisma.retakeRequest.create({
      data: { employeeId: employee.id, testId },
    });

    // Notify client admin(s)
    const test = await prisma.test.findUnique({ where: { id: testId } });
    const admins = await prisma.user.findMany({
      where: { role: "CLIENT_ADMIN", clientId: employee.clientId },
    });
    for (const admin of admins) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          title: "Demande de reprise de test",
          message: `${employee.firstName} ${employee.lastName} souhaite repasser le test "${test?.name ?? ""}".`,
          type: "RETAKE_REQUEST",
          isRead: false,
        },
      });
    }

    res.status(201).json(request);
  } catch (err) { next(err); }
});

// GET messages sent by this participant (with admin replies)
router.get("/messages", authenticate, requireRole("EMPLOYEE"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const messages = await prisma.message.findMany({
      where: { senderUserId: user.id },
      orderBy: { createdAt: "desc" },
    });
    res.json(messages);
  } catch (err) { next(err); }
});

// POST send help message to admin
router.post("/messages", authenticate, requireRole("EMPLOYEE"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const { subject, body, testName, subSubThemeName } = req.body;
    if (!subject || !body) return res.status(400).json({ error: "Sujet et message requis" });

    const employee = await prisma.employee.findFirst({
      where: { userId: user.id },
      include: { client: { select: { id: true, name: true } } },
    });
    if (!employee) return res.status(404).json({ error: "Employé non trouvé" });

    const message = await prisma.message.create({
      data: {
        senderUserId: user.id,
        toClientId: employee.client.id,
        subject,
        body,
        senderName: `${employee.firstName} ${employee.lastName}`,
        senderEmail: employee.email,
        testName: testName || null,
        subSubThemeName: subSubThemeName || null,
      },
    });
    res.status(201).json(message);
  } catch (err) { next(err); }
});

// ITER12: GET session details with sub-theme labels and open response feedbacks
router.get("/sessions/:sessionId/details", authenticate, requireRole("EMPLOYEE"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const sessionId = Number(req.params.sessionId);
    const subSubThemeId = req.query.subSubThemeId ? Number(req.query.subSubThemeId) : undefined;

    const employee = await prisma.employee.findFirst({ where: { userId: user.id } });
    if (!employee) return res.status(404).json({ error: "Employé non trouvé" });

    const session = await prisma.testSession.findFirst({
      where: { id: sessionId, employeeId: employee.id },
      include: {
        openResponses: {
          where: subSubThemeId ? { question: { subSubThemeId } } : {},
          include: { question: { select: { id: true, text: true, type: true, level: true, subSubThemeId: true } } },
        },
        progress: { where: subSubThemeId ? { subSubThemeId } : {} },
      },
    });
    if (!session) return res.status(404).json({ error: "Session non trouvée" });

    // Enrich with sub-theme labels
    const sstIds = session.progress.map(p => p.subSubThemeId);
    const ssts = await prisma.subSubTheme.findMany({
      where: { id: { in: sstIds } }, select: { id: true, label: true },
    });
    const sstMap: Record<number, string> = {};
    for (const sst of ssts) sstMap[sst.id] = sst.label;

    res.json({
      ...session,
      progress: session.progress.map(p => ({ ...p, subSubThemeLabel: sstMap[p.subSubThemeId] || null })),
    });
  } catch (err) { next(err); }
});

export default router;
