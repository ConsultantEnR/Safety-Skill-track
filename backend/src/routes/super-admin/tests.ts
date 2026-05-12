import { Router } from "express";
import prisma from "../../lib/prisma";
import { authenticate, requireRole } from "../../middleware/auth";

const router = Router();

// GET all tests with competence details and question counts
router.get("/", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const tests = await prisma.test.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        timerEnabled: true,
        timerDuration: true,
        createdAt: true,
        competences: {
          select: {
            id: true,
            subSubThemeId: true,
            subThemeId: true,
            questionCount: true,
            expectedLevel: true,
          },
        },
        clientTests: {
          select: {
            clientId: true,
            client: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(tests);
  } catch (err) { next(err); }
});

// GET single test
router.get("/:id", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const test = await prisma.test.findUnique({
      where: { id: Number(req.params.id) },
      include: { competences: true }
    });
    if (!test) return res.status(404).json({ error: "Test non trouvé" });
    res.json(test);
  } catch (err) { next(err); }
});

// POST create test avec ses Sous-thèmes 2, niveaux attendus et option timer
router.post("/", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const { name, description, competences, timerEnabled, timerDuration } = req.body;
    const test = await prisma.test.create({
      data: {
        name,
        description,
        // Timer : activé si timerEnabled=true, durée en minutes
        timerEnabled: Boolean(timerEnabled),
        timerDuration: timerEnabled && timerDuration ? Number(timerDuration) : null,
        competences: {
          create: (competences || []).map((c: any) => ({
            subSubThemeId: c.subSubThemeId || null,
            subThemeId: c.subThemeId || null,
            questionCount: c.questionCount || 3,
            expectedLevel: c.expectedLevel || "COMPLET",
          }))
        }
      },
      include: { competences: true }
    });
    res.status(201).json(test);
  } catch (err) { next(err); }
});

// PUT update test
router.put("/:id", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const { name, description, competences, timerEnabled, timerDuration } = req.body;
    await prisma.testCompetence.deleteMany({ where: { testId: Number(req.params.id) } });
    const test = await prisma.test.update({
      where: { id: Number(req.params.id) },
      data: {
        name,
        description,
        timerEnabled: Boolean(timerEnabled),
        timerDuration: timerEnabled && timerDuration ? Number(timerDuration) : null,
        competences: {
          create: (competences || []).map((c: any) => ({
            subSubThemeId: c.subSubThemeId || null,
            subThemeId: c.subThemeId || null,
            questionCount: c.questionCount || 3,
            expectedLevel: c.expectedLevel || "COMPLET",
          }))
        }
      },
      include: { competences: true }
    });
    res.json(test);
  } catch (err) { next(err); }
});

// DELETE test
router.delete("/:id", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    await prisma.test.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: "Test supprimé" });
  } catch (err) { next(err); }
});

export default router;
