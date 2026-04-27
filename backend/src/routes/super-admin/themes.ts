import { Router } from "express";
import prisma from "../../lib/prisma";
import { authenticate, requireRole } from "../../middleware/auth";


// ITER11: mapping FR→EN pour les thèmes et sous-thèmes (seed + import)
export const THEME_EN_MAP: Record<string, string> = {
  "Techniques": "Technical",
  "Fondamentales": "Core",
  "Comportementales": "Behavioural",
};
export const SUBTHEME_EN_MAP: Record<string, string> = {
  "Règlementations en santé sécurité": "Health and safety law",
  "Gestion des risques": "Risk management",
  "Gestion des incidents": "Incident management",
  "Culture": "Culture",
  "Durabilité": "Sustainability",
  "Stratégie": "Strategy",
  "Planning": "Planning",
  "Leadership et management": "Leadership and management",
  "Gestion des parties prenantes": "Stakeholder management",
  "Performance personnelle": "Personal performance",
  "Communication": "Communication",
  "Travailler avec les autres": "Working with others",
};

// Themes router — mounted at /api/super-admin/themes
export const themesRouter = Router();

themesRouter.get("/", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const themes = await prisma.theme.findMany({
      include: { subThemes: { include: { subSubThemes: true } } }
    });
    res.json(themes);
  } catch (err) { next(err); }
});

themesRouter.post("/", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const { label, nameEn } = req.body;
    // Auto-lookup nameEn from mapping if not provided
    const resolvedNameEn = nameEn || THEME_EN_MAP[label] || null;
    const theme = await prisma.theme.create({ data: { label, nameEn: resolvedNameEn } });
    res.status(201).json(theme);
  } catch (err) { next(err); }
});

// ITER11: PUT pour mettre à jour le nameEn d'un thème
themesRouter.put("/:id", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const { label, nameEn } = req.body;
    const theme = await prisma.theme.update({
      where: { id: Number(req.params.id) },
      data: { ...(label !== undefined ? { label } : {}), ...(nameEn !== undefined ? { nameEn } : {}) },
    });
    res.json(theme);
  } catch (err) { next(err); }
});

// Sub-themes router — mounted at /api/super-admin/sub-themes
export const subThemesRouter = Router();

subThemesRouter.get("/", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const { themeId } = req.query;
    const where = themeId ? { themeId: Number(themeId) } : {};
    const subThemes = await prisma.subTheme.findMany({ where, include: { subSubThemes: true } });
    res.json(subThemes);
  } catch (err) { next(err); }
});

subThemesRouter.post("/", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const { label, themeId, nameEn } = req.body;
    const resolvedNameEn = nameEn || SUBTHEME_EN_MAP[label] || null;
    const subTheme = await prisma.subTheme.create({ data: { label, themeId: Number(themeId), nameEn: resolvedNameEn } });
    res.status(201).json(subTheme);
  } catch (err) { next(err); }
});

// ITER11: PUT pour mettre à jour le nameEn d'un sous-thème
subThemesRouter.put("/:id", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const { label, nameEn } = req.body;
    const subTheme = await prisma.subTheme.update({
      where: { id: Number(req.params.id) },
      data: { ...(label !== undefined ? { label } : {}), ...(nameEn !== undefined ? { nameEn } : {}) },
    });
    res.json(subTheme);
  } catch (err) { next(err); }
});

// Sub-sub-themes router — mounted at /api/super-admin/sub-sub-themes
export const subSubThemesRouter = Router();

subSubThemesRouter.get("/", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const { subThemeId } = req.query;
    const where = subThemeId ? { subThemeId: Number(subThemeId) } : {};
    const subSubThemes = await prisma.subSubTheme.findMany({ where });
    res.json(subSubThemes);
  } catch (err) { next(err); }
});

subSubThemesRouter.post("/", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const { label, subThemeId } = req.body;
    const subSubTheme = await prisma.subSubTheme.create({ data: { label, subThemeId: Number(subThemeId) } });
    res.status(201).json(subSubTheme);
  } catch (err) { next(err); }
});
