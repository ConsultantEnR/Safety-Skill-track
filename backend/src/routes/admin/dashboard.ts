import { Router } from "express";
import prisma from "../../lib/prisma";
import { authenticate, requireRole } from "../../middleware/auth";
import ExcelJS from "exceljs";

const router = Router();

// ITER11: helper – build taxonomy lookup maps (grand theme, sub-theme 1, sub-theme 2)
async function buildTaxonomyMaps() {
  const allSst = await prisma.subSubTheme.findMany({
    include: { subTheme: { include: { theme: true } } },
  });
  const sstThemeMap: Record<number, string> = {};       // sstId → grand theme label (FR)
  const sstSubThemeMap: Record<number, string> = {};    // sstId → sub-theme 1 label (FR)
  const sstLabelMap: Record<number, string> = {};       // sstId → sub-theme 2 label
  const sstSubThemeIdMap: Record<number, number> = {};  // sstId → sub-theme 1 id
  const sstThemeIdMap: Record<number, number> = {};     // sstId → grand theme id
  const sstThemeEnMap: Record<number, string> = {};     // sstId → grand theme nameEn
  const sstSubThemeEnMap: Record<number, string> = {};  // sstId → sub-theme 1 nameEn
  for (const sst of allSst) {
    sstThemeMap[sst.id] = sst.subTheme.theme.label;
    sstSubThemeMap[sst.id] = sst.subTheme.label;
    sstLabelMap[sst.id] = sst.label;
    sstSubThemeIdMap[sst.id] = sst.subThemeId;
    sstThemeIdMap[sst.id] = sst.subTheme.themeId;
    if ((sst.subTheme.theme as any).nameEn) sstThemeEnMap[sst.id] = (sst.subTheme.theme as any).nameEn;
    if ((sst.subTheme as any).nameEn) sstSubThemeEnMap[sst.id] = (sst.subTheme as any).nameEn;
  }
  // Build FR→EN label lookup maps for aggregated data
  const themeEnByLabel: Record<string, string> = {};
  const subThemeEnByLabel: Record<string, string> = {};
  for (const id of Object.keys(sstThemeMap).map(Number)) {
    if (sstThemeEnMap[id]) themeEnByLabel[sstThemeMap[id]] = sstThemeEnMap[id];
    if (sstSubThemeEnMap[id]) subThemeEnByLabel[sstSubThemeMap[id]] = sstSubThemeEnMap[id];
  }
  return { allSst, sstThemeMap, sstSubThemeMap, sstLabelMap, sstSubThemeIdMap, sstThemeIdMap, themeEnByLabel, subThemeEnByLabel };
}

router.get("/", authenticate, requireRole("CLIENT_ADMIN"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const { country, site, position, employeeId } = req.query;

    const whereEmployee: any = { clientId: user.clientId };
    if (country)  whereEmployee.country  = country;
    if (site)     whereEmployee.site     = site;
    if (position) whereEmployee.position = position;
    if (employeeId) whereEmployee.id     = Number(employeeId);

    const { sstThemeMap, sstSubThemeMap, sstLabelMap, themeEnByLabel, subThemeEnByLabel } = await buildTaxonomyMaps();

    const employees = await prisma.employee.findMany({
      where: whereEmployee,
      include: {
        sessions: {
          where: { status: "COMPLETED" },
          include: { progress: true },
        },
      },
    });

    const employeeCount = employees.length;

    // Grand theme scores
    const themeScores: Record<string, { total: number; count: number }> = {};
    // Sub-theme 1 scores
    const subThemeScores: Record<string, { total: number; count: number }> = {};
    // Sub-theme 2 scores
    const subSubThemeScores: Record<string, { total: number; count: number }> = {};

    for (const emp of employees) {
      for (const session of emp.sessions) {
        for (const prog of session.progress) {
          if (prog.questionsAsked === 0) continue;
          const scoreVal = (prog.correctCount / prog.questionsAsked) * 100;
          const theme = sstThemeMap[prog.subSubThemeId];
          const subTheme = sstSubThemeMap[prog.subSubThemeId];
          const subSubTheme = sstLabelMap[prog.subSubThemeId];
          if (theme) {
            if (!themeScores[theme]) themeScores[theme] = { total: 0, count: 0 };
            themeScores[theme].total += scoreVal; themeScores[theme].count++;
          }
          if (subTheme) {
            if (!subThemeScores[subTheme]) subThemeScores[subTheme] = { total: 0, count: 0 };
            subThemeScores[subTheme].total += scoreVal; subThemeScores[subTheme].count++;
          }
          if (subSubTheme) {
            if (!subSubThemeScores[subSubTheme]) subSubThemeScores[subSubTheme] = { total: 0, count: 0 };
            subSubThemeScores[subSubTheme].total += scoreVal; subSubThemeScores[subSubTheme].count++;
          }
        }
      }
    }

    const radarData = Object.entries(themeScores).map(([theme, { total, count }]) => ({
      theme, themeEn: themeEnByLabel[theme] || null, score: Math.round(total / count),
    }));
    const subThemeData = Object.entries(subThemeScores).map(([theme, { total, count }]) => ({
      theme, themeEn: subThemeEnByLabel[theme] || null, score: Math.round(total / count),
    }));
    const subSubThemeData = Object.entries(subSubThemeScores).map(([theme, { total, count }]) => ({
      theme, score: Math.round(total / count),
    }));

    const themes = await prisma.theme.findMany({ orderBy: { label: "asc" } });
    // ITER11: all filters
    const allEmployees = await prisma.employee.findMany({
      where: { clientId: user.clientId },
      select: { id: true, firstName: true, lastName: true, country: true, site: true, position: true },
    });
    const countries   = [...new Set(allEmployees.map(e => e.country).filter(Boolean))];
    const sites       = [...new Set(allEmployees.map(e => e.site).filter(Boolean))];
    const positions   = [...new Set(allEmployees.map(e => e.position).filter(Boolean))];
    const employeeList = allEmployees.map(e => ({ id: e.id, name: `${e.firstName} ${e.lastName}` }));

    res.json({
      employeeCount,
      radarData,
      subThemeData,
      subSubThemeData,
      themes,
      filters: { countries, sites, positions, employeeList },
    });
  } catch (err) { next(err); }
});

// GET export results as Excel with full filters
router.get("/export", authenticate, requireRole("CLIENT_ADMIN"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const { theme, subTheme, subSubTheme, site, country, position, employeeId } = req.query;

    const whereEmployee: any = { clientId: user.clientId };
    if (site)       whereEmployee.site     = site;
    if (country)    whereEmployee.country  = country;
    if (position)   whereEmployee.position = position;
    if (employeeId) whereEmployee.id       = Number(employeeId);

    const { sstThemeMap, sstSubThemeMap, sstLabelMap } = await buildTaxonomyMaps();

    const employees = await prisma.employee.findMany({
      where: whereEmployee,
      include: {
        sessions: {
          where: { status: "COMPLETED" },
          include: {
            test: { select: { name: true } },
            progress: true,
          },
        },
      },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Résultats");

    sheet.columns = [
      { header: "Nom",             key: "lastName",       width: 20 },
      { header: "Prénom",          key: "firstName",      width: 20 },
      { header: "Email",           key: "email",          width: 30 },
      { header: "Site",            key: "site",           width: 15 },
      { header: "Pays",            key: "country",        width: 15 },
      { header: "Poste",           key: "position",       width: 20 },
      { header: "Test",            key: "testName",       width: 30 },
      { header: "Grand thème",     key: "grandTheme",     width: 25 },
      { header: "Sous-thème 1",    key: "subThemeName",   width: 25 },
      { header: "Sous-thème 2",    key: "subSubTheme",    width: 30 },
      { header: "Questions posées",key: "questionsAsked", width: 18 },
      { header: "Bonnes réponses", key: "correctCount",   width: 18 },
      { header: "Score (%)",       key: "score",          width: 12 },
      { header: "Terminé le",      key: "completedAt",    width: 20 },
    ];

    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF27295A" } };
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

    for (const emp of employees) {
      for (const session of emp.sessions) {
        for (const prog of session.progress) {
          const grandTheme    = sstThemeMap[prog.subSubThemeId]    || "";
          const subThemeName  = sstSubThemeMap[prog.subSubThemeId] || "";
          const subSubThemeName = sstLabelMap[prog.subSubThemeId]  || `SST ${prog.subSubThemeId}`;
          const score = prog.questionsAsked > 0
            ? Math.round((prog.correctCount / prog.questionsAsked) * 100)
            : 0;

          // Apply taxonomy filters
          if (theme      && grandTheme    !== theme)      continue;
          if (subTheme   && subThemeName  !== subTheme)   continue;
          if (subSubTheme && subSubThemeName !== subSubTheme) continue;

          sheet.addRow({
            lastName: emp.lastName, firstName: emp.firstName, email: emp.email,
            site: emp.site || "", country: emp.country || "", position: emp.position || "",
            testName: session.test.name,
            grandTheme, subThemeName, subSubTheme: subSubThemeName,
            questionsAsked: prog.questionsAsked, correctCount: prog.correctCount,
            score,
            completedAt: session.completedAt
              ? new Date(session.completedAt).toLocaleDateString("fr-FR") : "",
          });
        }
      }
    }

    // ITER12: PDF export — return print-ready HTML
    if (req.query.format === "pdf") {
      const rows: any[] = [];
      for (const emp of employees) {
        for (const session of emp.sessions) {
          for (const prog of session.progress) {
            const grandTheme    = sstThemeMap[prog.subSubThemeId]    || "";
            const subThemeName  = sstSubThemeMap[prog.subSubThemeId] || "";
            const subSubThemeName = sstLabelMap[prog.subSubThemeId]  || `SST ${prog.subSubThemeId}`;
            const score = prog.questionsAsked > 0
              ? Math.round((prog.correctCount / prog.questionsAsked) * 100) : 0;
            if (theme      && grandTheme    !== theme)      continue;
            if (subTheme   && subThemeName  !== subTheme)   continue;
            if (subSubTheme && subSubThemeName !== subSubTheme) continue;
            rows.push({ emp, session, prog, grandTheme, subThemeName, subSubThemeName, score });
          }
        }
      }
      const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Résultats</title>
<style>
  body{font-family:Arial,sans-serif;font-size:11px;margin:20px;color:#222}
  h1{font-size:16px;color:#27295A;margin-bottom:12px}
  table{width:100%;border-collapse:collapse}
  th{background:#27295A;color:#fff;padding:6px 8px;text-align:left;font-size:10px}
  td{padding:5px 8px;border-bottom:1px solid #e5e7eb}
  tr:nth-child(even) td{background:#f9fafb}
  .score-pass{color:#16a34a;font-weight:bold}
  .score-fail{color:#dc2626;font-weight:bold}
  @media print{@page{size:A4 landscape;margin:15mm}}
</style></head><body>
<h1>Résultats — exporté le ${new Date().toLocaleDateString("fr-FR")}</h1>
<table><thead><tr>
  <th>Nom</th><th>Prénom</th><th>Email</th><th>Test</th>
  <th>Grand thème</th><th>Sous-thème 2</th>
  <th>Questions</th><th>Bonnes rép.</th><th>Score</th><th>Terminé le</th>
</tr></thead><tbody>
${rows.map(r => `<tr>
  <td>${r.emp.lastName}</td><td>${r.emp.firstName}</td><td>${r.emp.email}</td>
  <td>${r.session.test.name}</td><td>${r.grandTheme}</td><td>${r.subSubThemeName}</td>
  <td>${r.prog.questionsAsked}</td><td>${r.prog.correctCount}</td>
  <td class="${r.score >= 60 ? "score-pass" : "score-fail"}">${r.score}%</td>
  <td>${r.session.completedAt ? new Date(r.session.completedAt).toLocaleDateString("fr-FR") : ""}</td>
</tr>`).join("")}
</tbody></table>
<script>window.onload=function(){window.print();}</script>
</body></html>`;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(html);
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=resultats.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

export default router;
