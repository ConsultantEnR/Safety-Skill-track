import prisma from "../src/lib/prisma";
import ExcelJS from "exceljs";
import path from "path";

// ─── Mappings ────────────────────────────────────────────────────────────────

function mapLevel(raw: string): "FONDAMENTAL" | "BASIQUE" | "INTERMEDIAIRE" | "AVANCE" | "COMPLET" {
  const s = raw.toLowerCase().replace(/\s/g, "");
  if (s.includes("fondamental"))  return "FONDAMENTAL";
  if (s.includes("basique") || s.includes("base")) return "BASIQUE";
  if (s.includes("interm"))       return "INTERMEDIAIRE";
  if (s.includes("avanc"))        return "AVANCE";
  if (s.includes("complet"))      return "COMPLET";
  return "FONDAMENTAL";
}

type QType = "QCM" | "TRUE_FALSE" | "OPEN" | "SCENARIO" | "RANKING";

function mapType(raw: string): QType | null {
  const s = raw.toLowerCase().trim();
  if (s === "qcm_1 réponse" || s === "qcm") return "QCM";
  if (s === "choix multiple")                return "QCM";   // multi-answer
  if (s === "vrai / faux" || s === "vrai/faux") return "TRUE_FALSE";
  if (s === "classement")                    return "RANKING";
  if (s === "question ouverte")              return "OPEN";
  if (s === "scénario")                      return "SCENARIO";
  // unsupported: association d'idées, texte à trous, sondage, complétion de diagramme
  return null;
}

// Normalize family name for case-insensitive dedup (ex: "SURFACE DEVELOPMENT" == "Surface Development")
function normFamily(raw: string): string {
  return raw.trim().toLowerCase();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cellStr(row: ExcelJS.Row, col: number): string {
  const v = row.getCell(col).value;
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return String(v);
  if (typeof v === "object" && "richText" in (v as any)) {
    return (v as any).richText.map((rt: any) => rt.text).join("").trim();
  }
  return String(v).trim();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const filePath = path.join(__dirname, "../../Safety_Skill_Track_Database_PERENCO_FINAL.xlsx");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  // ── 1. Charger les textes de questions existantes pour déduplication ───────
  const existingRows = await prisma.question.findMany({ select: { text: true } });
  const existingTexts = new Set(existingRows.map(q => q.text.trim().toLowerCase()));
  console.log(`Questions déjà en base : ${existingTexts.size}`);

  // ── 2. Caches theme / subTheme / subSubTheme ──────────────────────────────
  // Chargement initial depuis la DB
  const allThemes = await prisma.theme.findMany({ include: { subThemes: { include: { subSubThemes: true } } } });
  // Map normFamily(label) → id
  const themeCache = new Map<string, number>();
  // Map normFamily(themeLabel)::normFamily(stLabel) → id
  const subThemeCache = new Map<string, number>();
  // Map subThemeId::normFamily(sstLabel) → id
  const subSubThemeCache = new Map<string, number>();

  for (const t of allThemes) {
    themeCache.set(normFamily(t.label), t.id);
    for (const st of t.subThemes) {
      subThemeCache.set(`${normFamily(t.label)}::${normFamily(st.label)}`, st.id);
      for (const sst of st.subSubThemes) {
        subSubThemeCache.set(`${st.id}::${normFamily(sst.label)}`, sst.id);
      }
    }
  }

  async function getOrCreateTheme(label: string): Promise<{ id: number; canonical: string }> {
    const key = normFamily(label);
    if (themeCache.has(key)) return { id: themeCache.get(key)!, canonical: key };
    // Find by case-insensitive label
    const existing = await prisma.theme.findFirst({ where: { label: { mode: "insensitive", equals: label } } });
    if (existing) { themeCache.set(key, existing.id); return { id: existing.id, canonical: key }; }
    // Create with canonical casing (first occurrence wins)
    const created = await prisma.theme.create({ data: { label: label.trim() } });
    themeCache.set(key, created.id);
    return { id: created.id, canonical: key };
  }

  async function getOrCreateSubTheme(label: string, themeId: number, themeKey: string): Promise<number> {
    const key = `${themeKey}::${normFamily(label)}`;
    if (subThemeCache.has(key)) return subThemeCache.get(key)!;
    const existing = await prisma.subTheme.findFirst({ where: { themeId, label: { mode: "insensitive", equals: label } } });
    if (existing) { subThemeCache.set(key, existing.id); return existing.id; }
    const created = await prisma.subTheme.create({ data: { label: label.trim(), themeId } });
    subThemeCache.set(key, created.id);
    return created.id;
  }

  async function getOrCreateSubSubTheme(label: string, subThemeId: number): Promise<number> {
    const key = `${subThemeId}::${normFamily(label)}`;
    if (subSubThemeCache.has(key)) return subSubThemeCache.get(key)!;
    const existing = await prisma.subSubTheme.findFirst({ where: { subThemeId, label: { mode: "insensitive", equals: label } } });
    if (existing) { subSubThemeCache.set(key, existing.id); return existing.id; }
    const created = await prisma.subSubTheme.create({ data: { label: label.trim(), subThemeId } });
    subSubThemeCache.set(key, created.id);
    return created.id;
  }

  // ── 3. Traitement d'une ligne ─────────────────────────────────────────────
  let created = 0, skipped = 0, unsupported = 0, errors = 0;

  async function processRow(row: ExcelJS.Row, rowNum: number) {
    const famille       = cellStr(row, 2);
    const competence    = cellStr(row, 3);
    const sousCompetence = cellStr(row, 4);
    const niveauRaw     = cellStr(row, 5);
    const typeRaw       = cellStr(row, 6);
    const questionText  = cellStr(row, 7);

    if (!famille || !questionText) return;

    const type = mapType(typeRaw);
    if (!type) {
      unsupported++;
      return;
    }

    // Déduplication par texte
    const textKey = questionText.toLowerCase();
    if (existingTexts.has(textKey)) {
      skipped++;
      return;
    }

    const level = mapLevel(niveauRaw);

    try {
      const { id: themeId, canonical: themeKey } = await getOrCreateTheme(famille);
      const subThemeId = await getOrCreateSubTheme(competence, themeId, themeKey);
      const subSubThemeId = await getOrCreateSubSubTheme(sousCompetence, subThemeId);

      let options: any = undefined;
      let expectedAnswer: string | null = null;
      let correctAnswers: string[] = [];

      if (type === "QCM") {
        const isMulti = typeRaw.toLowerCase().includes("multiple");
        const choices: string[] = [];
        const correctIndices: number[] = [];
        // colonnes : A=8/9, B=10/11, C=12/13, D=14/15, E=16/17
        for (let col = 8; col <= 17; col += 2) {
          const opt = cellStr(row, col);
          const isCorrect = cellStr(row, col + 1).toUpperCase() === "TRUE";
          if (opt) {
            choices.push(opt);
            if (isCorrect) correctIndices.push(choices.length - 1);
          }
        }
        if (choices.length === 0) { errors++; return; }
        if (isMulti) {
          correctAnswers = correctIndices.map(i => choices[i]);
          options = { choices, correctIndexes: correctIndices };
        } else {
          options = { choices, correctIndex: correctIndices[0] ?? 0 };
        }

      } else if (type === "TRUE_FALSE") {
        // A = Vrai (true), B = Faux (false)
        const aCorrect = cellStr(row, 9).toUpperCase() === "TRUE";
        expectedAnswer = aCorrect ? "true" : "false";

      } else if (type === "RANKING") {
        const rawItems = cellStr(row, 8);
        if (!rawItems || rawItems.toLowerCase().includes("personnalis")) {
          // Items embedded in question text → traiter comme OPEN
          await prisma.question.create({
            data: { text: questionText, type: "OPEN", level, subSubThemeId },
          });
          existingTexts.add(textKey);
          created++;
          return;
        }
        const choices = rawItems.split(",").map(s => s.trim()).filter(Boolean);
        options = { choices };
      }
      // OPEN / SCENARIO : rien à ajouter

      await prisma.question.create({
        data: {
          text: questionText,
          type,
          level,
          subSubThemeId,
          ...(options !== undefined ? { options } : {}),
          ...(expectedAnswer !== null ? { expectedAnswer } : {}),
          ...(correctAnswers.length > 0 ? { correctAnswers } : {}),
        },
      });
      existingTexts.add(textKey);
      created++;

    } catch (e: any) {
      console.error(`  [row ${rowNum}] Erreur: ${e.message} — question: "${questionText.substring(0, 60)}..."`);
      errors++;
    }
  }

  // ── 4. Parcourir la feuille Database ─────────────────────────────────────
  for (const sheetName of ["Database"]) {
    const sheet = wb.getWorksheet(sheetName);
    if (!sheet) { console.warn(`Feuille "${sheetName}" non trouvée`); continue; }
    process.stdout.write(`Traitement "${sheetName}" (${sheet.rowCount - 1} lignes)... `);
    for (let rn = 2; rn <= sheet.rowCount; rn++) {
      await processRow(sheet.getRow(rn), rn);
    }
    console.log("OK");
  }

  // ── 5. Résumé ─────────────────────────────────────────────────────────────
  const total = created + skipped + unsupported + errors;
  console.log(`\n─────────────────────────────────────────`);
  console.log(`Total lignes traitées : ${total}`);
  console.log(`  ✓ Créées            : ${created}`);
  console.log(`  ~ Doublons ignorés  : ${skipped}`);
  console.log(`  ⊘ Types non supportés (Texte à trous, Sondage…) : ${unsupported}`);
  console.log(`  ✗ Erreurs           : ${errors}`);

  const finalCount = await prisma.question.count();
  console.log(`\nQuestions totales en base : ${finalCount}`);
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
