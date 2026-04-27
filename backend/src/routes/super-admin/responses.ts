// ITER8: routes Super Admin pour la gestion des réponses ouvertes (OPEN / SCENARIO)
import { Router } from "express";
import prisma from "../../lib/prisma";
import { authenticate, requireRole } from "../../middleware/auth";

const router = Router();

// GET toutes les réponses ouvertes avec filtres
// ?type=OPEN|SCENARIO&clientId=X&employeeId=Y&reviewed=true|false&subThemeId=X&subSubThemeId=X
router.get("/", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const { type, clientId, employeeId, reviewed, subThemeId, subSubThemeId } = req.query; // ITER9: ajout subThemeId, subSubThemeId
    const where: any = {};
    if (type) where.questionType = String(type);
    if (reviewed !== undefined) where.isReviewed = reviewed === "true";
    if (employeeId) where.employeeId = Number(employeeId);
    // ITER9: filtre employé par client (AND compatible avec employeeId)
    if (clientId) {
      where.employee = { clientId: Number(clientId) };
    }
    // ITER9: filtres par subSubTheme ou subTheme sur la question liée
    if (subSubThemeId) {
      where.question = { subSubThemeId: Number(subSubThemeId) }; // ITER9
    } else if (subThemeId) {
      where.question = { subSubTheme: { subThemeId: Number(subThemeId) } }; // ITER9
    }
    const responses = await prisma.openResponse.findMany({
      where,
      include: {
        employee: { include: { client: { select: { id: true, name: true } } } },
        question: {
          include: {
            subSubTheme: { include: { subTheme: { include: { theme: true } } } }
          }
        },
        session: { select: { id: true, testId: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(responses);
  } catch (err) { next(err); }
});

// GET /count — compteur de réponses non analysées
router.get("/count", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const count = await prisma.openResponse.count({ where: { isReviewed: false } });
    res.json({ count });
  } catch (err) { next(err); }
});

// PUT /:id/review — ajouter feedback + note
router.put("/:id/review", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const { reviewerFeedback, score } = req.body;

    // ITER10: lire l'état AVANT update pour éviter de compter deux fois
    const before = await prisma.openResponse.findUnique({ where: { id: Number(req.params.id) } });
    const wasAlreadyReviewed = before?.isReviewed ?? true;

    const updated = await prisma.openResponse.update({
      where: { id: Number(req.params.id) },
      data: {
        reviewerFeedback,
        score: score !== undefined ? Number(score) : undefined,
        isReviewed: true,
        reviewedAt: new Date(),
        reviewedById: user.id,
      },
      include: { employee: { include: { client: true } } }
    });

    // Notifier l'employé
    const empRecord = await prisma.employee.findUnique({
      where: { id: updated.employeeId },
      include: { user: true },
    });
    const empUserId = empRecord?.user?.id;
    if (empUserId) {
      await prisma.notification.create({
        data: { userId: empUserId, title: "Correction disponible", message: "Un correcteur a analysé votre réponse.", type: "FEEDBACK_READY", isRead: false }
      });
    }

    // ITER9: notifier si toutes les réponses de la session sont corrigées
    const allResponsesForSession = await prisma.openResponse.findMany({ where: { sessionId: updated.sessionId } });
    const allReviewed = allResponsesForSession.every(r => r.isReviewed);
    if (allReviewed && empUserId) {
      await prisma.notification.create({
        data: { userId: empUserId, title: "Toutes vos réponses corrigées", message: "Toutes vos réponses ouvertes pour ce test ont été analysées par un correcteur.", type: "ALL_RESPONSES_REVIEWED", isRead: false }
      });
    }

    // ITER10: recalculer le score du progress item (seulement si c'est la première correction)
    if (!wasAlreadyReviewed) {
      const openRespWithQ = await prisma.openResponse.findUnique({
        where: { id: Number(req.params.id) },
        include: { question: { select: { level: true, customScore: true, subSubThemeId: true } } }
      });
      if (openRespWithQ) {
        const scorePts = openRespWithQ.score !== null && openRespWithQ.score !== undefined
          ? openRespWithQ.score
          : ({ FONDAMENTAL:1, BASIQUE:2, INTERMEDIAIRE:3, AVANCE:4, COMPLET:5 } as Record<string,number>)[openRespWithQ.question.level] || 1;
        const prog = await (prisma.testSessionProgress as any).findFirst({
          where: { sessionId: openRespWithQ.sessionId, subSubThemeId: openRespWithQ.question.subSubThemeId }
        });
        if (prog) {
          await prisma.testSessionProgress.update({
            where: { id: prog.id },
            data: { pointsEarned: { increment: Math.round(scorePts) }, correctCount: { increment: 1 } }
          });
        }
      }
    }

    res.json(updated);
  } catch (err) { next(err); }
});

// ITER9: GET /themes — liste tous les thèmes avec sous-thèmes pour les dropdowns de filtres
router.get("/themes", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const themes = await prisma.theme.findMany({
      include: { subThemes: { include: { subSubThemes: true } } },
      orderBy: { label: "asc" },
    });
    res.json(themes);
  } catch (err) { next(err); }
});

export default router;
