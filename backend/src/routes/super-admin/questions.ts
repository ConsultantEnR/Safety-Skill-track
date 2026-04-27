import { Router } from "express";
import prisma from "../../lib/prisma";
import { authenticate, requireRole } from "../../middleware/auth";
import ExcelJS from "exceljs";

const router = Router();

router.get("/", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const questions = await prisma.question.findMany({
      include: {
        subSubTheme: {
          include: {
            subTheme: { include: { theme: true } }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(questions);
  } catch (err) { next(err); }
});

router.post("/", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const { text, type, level, subSubThemeId, options, expectedAnswer, correctAnswers, customScore } = req.body;
    const question = await prisma.question.create({
      data: {
        text, type, level, subSubThemeId: Number(subSubThemeId), options, expectedAnswer,
        correctAnswers: Array.isArray(correctAnswers) ? correctAnswers : (correctAnswers ? [correctAnswers] : []),
        customScore: customScore !== undefined ? (customScore === null ? null : Number(customScore)) : null,
      }
    });
    res.status(201).json(question);
  } catch (err) { next(err); }
});

router.put("/:id", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const { text, type, level, subSubThemeId, options, expectedAnswer, correctAnswers, customScore } = req.body;
    const question = await prisma.question.update({
      where: { id: Number(req.params.id) },
      data: {
        text, type, level, subSubThemeId: Number(subSubThemeId), options, expectedAnswer,
        ...(correctAnswers !== undefined ? { correctAnswers: Array.isArray(correctAnswers) ? correctAnswers : [correctAnswers] } : {}),
        customScore: customScore !== undefined ? (customScore === null ? null : Number(customScore)) : undefined,
      }
    });
    res.json(question);
  } catch (err) { next(err); }
});

router.delete("/:id", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    // ITER9: supprimer d'abord les OpenResponse liées (FK constraint)
    await prisma.openResponse.deleteMany({ where: { questionId: id } });
    await prisma.question.delete({ where: { id } });
    res.json({ message: "Question supprimée" });
  } catch (err) { next(err); }
});

const VALID_TYPES = ["QCM", "TRUE_FALSE", "OPEN", "SCENARIO", "RANKING"];
const VALID_LEVELS = ["FONDAMENTAL", "BASIQUE", "INTERMEDIAIRE", "AVANCE", "COMPLET"];
// ITER7: étendu pour couvrir toutes les variantes françaises de l'Excel réel
const TYPE_MAP: Record<string, string> = {
  "qcm": "QCM",
  "vrai/faux": "TRUE_FALSE", "vrai-faux": "TRUE_FALSE", "true_false": "TRUE_FALSE",
  "vrai ou faux": "TRUE_FALSE", "vrai / faux": "TRUE_FALSE",
  "ouvert": "OPEN", "open": "OPEN", "question ouverte": "OPEN", "question ouvert": "OPEN",
  "texte a trous": "OPEN", "texte à trous": "OPEN", "texte a trou": "OPEN", "texte à trou": "OPEN",
  "scenario": "SCENARIO", "scénario": "SCENARIO",
  "classement": "RANKING", "ranking": "RANKING"
};
const LEVEL_MAP: Record<string, string> = {
  "fondamental": "FONDAMENTAL", "basique": "BASIQUE", "base": "BASIQUE",
  "intermédiaire": "INTERMEDIAIRE", "intermediaire": "INTERMEDIAIRE", "moyen": "INTERMEDIAIRE",
  "avancé": "AVANCE", "avance": "AVANCE", "expert": "AVANCE",
  "complet": "COMPLET", "maitrise": "COMPLET", "maîtrise": "COMPLET",
  "1": "FONDAMENTAL", "2": "BASIQUE", "3": "INTERMEDIAIRE", "4": "AVANCE", "5": "COMPLET"
};

// Strip leading "N-" or "N." prefix (e.g. "1-Fondamental" → "Fondamental", "2. Basique" → "Basique")
function stripPrefix(val: string): string {
  return (val || "").replace(/^\d+[\s\-\.]+/, "").trim();
}

// ITER9: strip A) B) C) D) prefixes — supprime les préfixes A), B), C), D), a), 1), etc.
function stripOptionPrefix(val: string): string {
  return (val || "").replace(/^[A-Da-d1-4][).:\s]+\s*/u, "").trim();
}
function normalizeType(val: string): string {
  const clean = stripPrefix(val);
  const lower = clean.toLowerCase().trim();
  // ITER7: correspondance exacte d'abord
  if (TYPE_MAP[lower]) return TYPE_MAP[lower];
  if (VALID_TYPES.includes(clean.toUpperCase())) return clean.toUpperCase();
  // ITER7: détection par sous-chaîne pour les valeurs Excel non normalisées
  // Normaliser les accents pour la comparaison
  const normalized = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (normalized.includes("vrai")) return "TRUE_FALSE";
  if (normalized.includes("trou")) return "OPEN";
  if (normalized.includes("scenario")) return "SCENARIO";
  if (normalized.includes("ouverte") || normalized.includes("ouvert")) return "OPEN";
  return "QCM";
}
function normalizeLevel(val: string): string {
  const clean = stripPrefix(val);
  const lower = clean.toLowerCase().trim();
  // Also try matching just the numeric prefix if the rest is empty
  const numOnly = (val || "").trim();
  return LEVEL_MAP[lower] || LEVEL_MAP[numOnly] || (VALID_LEVELS.includes(clean.toUpperCase()) ? clean.toUpperCase() : "FONDAMENTAL");
}

// ITER13: Import rewritten — receives pre-parsed structured questions from frontend
router.post("/import", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const { questions } = req.body as { questions: any[] };
    let imported = 0;
    const errors: string[] = [];

    for (const q of questions) {
      try {
        const questionText: string = (q.question_text || "").trim();
        const questionLevel: string = q.level || "FONDAMENTAL";
        const grandTheme: string = (q.theme || "").trim();
        const sousTheme: string = (q.sub_theme_1 || "").trim();
        const sousSousTheme: string = (q.sub_theme_2 || "").trim();
        // correct_answers and distractors are already clean arrays from the frontend parser
        const correctAnswersArr: string[] = Array.isArray(q.correct_answers) ? q.correct_answers.filter(Boolean) : [];
        const distractorsArr: string[] = Array.isArray(q.distractors) ? q.distractors.filter(Boolean) : [];
        // If type is empty and no answers provided → treat as open question
        const questionType: string = q.type || (correctAnswersArr.length === 0 && distractorsArr.length === 0 ? "OPEN" : "QCM");

        if (!questionText) { errors.push(`Ligne ${q._rowIndex}: Question vide`); continue; }
        if (!grandTheme)   { errors.push(`Ligne ${q._rowIndex}: Grand thème manquant`); continue; }

        // Find or create taxonomy
        let theme = await prisma.theme.findFirst({ where: { label: grandTheme } });
        if (!theme) theme = await prisma.theme.create({ data: { label: grandTheme } });

        const subLabel = sousTheme || grandTheme;
        let subTheme = await prisma.subTheme.findFirst({ where: { label: subLabel, themeId: theme.id } });
        if (!subTheme) subTheme = await prisma.subTheme.create({ data: { label: subLabel, themeId: theme.id } });

        const sstLabel = sousSousTheme || subLabel;
        let subSubTheme = await prisma.subSubTheme.findFirst({ where: { label: sstLabel, subThemeId: subTheme.id } });
        if (!subSubTheme) subSubTheme = await prisma.subSubTheme.create({ data: { label: sstLabel, subThemeId: subTheme.id } });

        // Build options from correct_answers + distractors
        const normalizedType = normalizeType(questionType);
        let choices: string[] = [];
        let finalCorrectIndex = 0;
        let finalCorrectIndexes: number[] = [];

        if (normalizedType === "TRUE_FALSE") {
          const rep = (correctAnswersArr[0] || "").toLowerCase().trim();
          const isVrai = ["vrai","true","oui","yes","1","v"].includes(rep);
          choices = ["Vrai", "Faux"];
          finalCorrectIndex = isVrai ? 0 : 1;
          finalCorrectIndexes = [finalCorrectIndex];
        } else if (normalizedType === "QCM" || normalizedType === "RANKING") {
          // choices = correct answers first, then distractors
          choices = [...correctAnswersArr, ...distractorsArr];
          finalCorrectIndexes = correctAnswersArr.map((_, i) => i);
          finalCorrectIndex = 0;
        } else {
          // OPEN / SCENARIO — no choices
          choices = [];
        }

        const isMultiAnswer = finalCorrectIndexes.length > 1;
        await prisma.question.create({
          data: {
            text: questionText,
            type: normalizedType as any,
            level: normalizeLevel(questionLevel) as any,
            subSubThemeId: subSubTheme.id,
            options: choices.length > 0 ? {
              choices,
              correctIndex: finalCorrectIndex,
              correctIndexes: isMultiAnswer ? finalCorrectIndexes : undefined,
            } : null,
            expectedAnswer: correctAnswersArr[0] || null,
            correctAnswers: correctAnswersArr,
            customScore: null,
          }
        } as any);
        imported++;
      } catch (e: any) {
        errors.push(`Ligne ${q._rowIndex}: ${e.message}`);
      }
    }
    res.json({ imported, skipped: errors.length, errors });
  } catch (err) { next(err); }
});

// ITER13: GET template Excel (Format A + Format B + Instructions)
router.get("/template", authenticate, requireRole("SUPER_ADMIN"), async (_req, res, next) => {
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Safety Skill Track";

    // ── Onglet 1 : Format A ──────────────────────────────────────────────────
    const wsA = wb.addWorksheet("Template Format A");
    wsA.columns = [
      { header: "Question",          key: "q",   width: 45 },
      { header: "Type",              key: "t",   width: 18 },
      { header: "Niveau",            key: "n",   width: 16 },
      { header: "Grand thème",       key: "gt",  width: 22 },
      { header: "Sous-thème 1",      key: "st1", width: 22 },
      { header: "Sous-thème 2",      key: "st2", width: 22 },
      { header: "Réponse proposée",  key: "ans", width: 35 },
      { header: "Correcte",          key: "ok",  width: 10 },
    ];
    // Header row style
    wsA.getRow(1).eachCell(cell => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF27295A" } };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    });
    // Exemples
    const exA = [
      ["Quel EPI pour les risques chimiques ?","QCM","Intermédiaire","Techniques","Gestion des risques","Risques chimiques","Gants en nitrile","OUI"],
      ["","","","","","","Lunettes de protection","OUI"],
      ["","","","","","","Tablier résistant","OUI"],
      ["","","","","","","Casquette de baseball","NON"],
      ["","","","","","","Chaussures ouvertes","NON"],
      ["Le port du casque est obligatoire en zone de travail","Vrai/Faux","Fondamental","Techniques","Règlementations","Port des EPI","Vrai","OUI"],
      ["","","","","","","Faux","NON"],
      ["Décrivez la procédure d'évacuation d'urgence","Question ouverte","Avancé","Techniques","Gestion des incidents","Plans d'urgence","",""],
    ];
    exA.forEach(row => wsA.addRow(row));
    // Data validations
    for (let r = 2; r <= 200; r++) {
      wsA.getCell(`H${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"OUI,NON"'] };
      wsA.getCell(`B${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"QCM,Vrai/Faux,Question ouverte,Scénario"'] };
      wsA.getCell(`C${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"Fondamental,Basique,Intermédiaire,Avancé,Complet"'] };
    }

    // ── Onglet 2 : Format B ──────────────────────────────────────────────────
    const wsB = wb.addWorksheet("Template Format B");
    wsB.columns = [
      { header: "Question",     key: "q",   width: 45 },
      { header: "Type",         key: "t",   width: 18 },
      { header: "Niveau",       key: "n",   width: 16 },
      { header: "Grand thème",  key: "gt",  width: 22 },
      { header: "Sous-thème 1", key: "st1", width: 22 },
      { header: "Sous-thème 2", key: "st2", width: 22 },
      { header: "✅ Réponse 1", key: "c1",  width: 25 },
      { header: "✅ Réponse 2", key: "c2",  width: 25 },
      { header: "✅ Réponse 3", key: "c3",  width: 25 },
      { header: "❌ Réponse 4", key: "d1",  width: 25 },
      { header: "❌ Réponse 5", key: "d2",  width: 25 },
      { header: "❌ Réponse 6", key: "d3",  width: 25 },
    ];
    wsB.getRow(1).eachCell(cell => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF27295A" } };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    });
    wsB.addRow(["Quel EPI pour les risques chimiques ?","QCM","Intermédiaire","Techniques","Gestion des risques","Risques chimiques","Gants en nitrile","Lunettes","Tablier résistant","Casquette","Chaussures ouvertes",""]);
    wsB.addRow(["Le port du casque est obligatoire en zone de travail","Vrai/Faux","Fondamental","Techniques","Règlementations","Port des EPI","Vrai","","","Faux","",""]);
    wsB.addRow(["Décrivez la procédure d'évacuation d'urgence","Question ouverte","Avancé","Techniques","Gestion des incidents","Plans d'urgence","","","","","",""]);
    for (let r = 2; r <= 200; r++) {
      wsB.getCell(`B${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"QCM,Vrai/Faux,Question ouverte,Scénario"'] };
      wsB.getCell(`C${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"Fondamental,Basique,Intermédiaire,Avancé,Complet"'] };
    }

    // ── Onglet 3 : Instructions ──────────────────────────────────────────────
    const wsI = wb.addWorksheet("Instructions");
    const instructions = [
      ["Safety Skill Track — Guide d'import des questions"],
      [""],
      ["FORMAT A (recommandé) : une ligne par réponse"],
      ["  • Colonne 'Correcte' : OUI pour bonne réponse, NON pour distracteur"],
      ["  • Si la cellule 'Question' est vide, la ligne appartient à la question précédente"],
      ["  • Supporte le nombre illimité de réponses par question"],
      [""],
      ["FORMAT B : une ligne par question"],
      ["  • Colonnes préfixées ✅ = réponses correctes"],
      ["  • Colonnes préfixées ❌ = distracteurs"],
      ["  • Les cellules vides sont ignorées"],
      [""],
      ["VALEURS ACCEPTÉES"],
      ["  • Correcte (Format A) : OUI, NON (ou YES/NO, VRAI/FAUX, 1/0)"],
      ["  • Niveau : Fondamental, Basique, Intermédiaire, Avancé, Complet"],
      ["  • Type : QCM, Vrai/Faux, Question ouverte, Scénario"],
      [""],
      ["CONSEILS"],
      ["  • Pour un QCM avec toutes les réponses correctes : laissez colonne ❌ vide"],
      ["  • Pour une question ouverte : laissez les colonnes réponse vides"],
      ["  • Les thèmes inconnus seront automatiquement créés"],
    ];
    instructions.forEach((row, i) => {
      const r = wsI.addRow(row);
      if (i === 0) r.getCell(1).font = { bold: true, size: 14 };
      if (row[0]?.toString().startsWith("FORMAT") || row[0]?.toString().startsWith("VALEURS") || row[0]?.toString().startsWith("CONSEILS")) {
        r.getCell(1).font = { bold: true };
      }
    });
    wsI.getColumn(1).width = 80;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=template_questions.xlsx");
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

export default router;
