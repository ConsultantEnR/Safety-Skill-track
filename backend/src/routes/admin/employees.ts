import { Router } from "express";
import { Role } from "@prisma/client";
import prisma from "../../lib/prisma";
import { authenticate, requireRole } from "../../middleware/auth";
import { sendCredentials } from "../../services/email";
import { provisionUser } from "../../services/userService";

const router = Router();

// GET all employees for the client
router.get("/", authenticate, requireRole("CLIENT_ADMIN"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const employees = await prisma.employee.findMany({
      where: { clientId: user.clientId },
      include: {
        assignments: { include: { test: { select: { id: true, name: true } } } },
        sessions: { select: { testId: true, status: true, completedAt: true }, orderBy: { startedAt: "desc" } },
      },
      orderBy: { lastName: "asc" },
    });
    res.json(employees);
  } catch (err) { next(err); }
});

// POST create employee
router.post("/", authenticate, requireRole("CLIENT_ADMIN"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const { lastName, firstName, email, position, department, site, country, language, birthDate } = req.body;
    const { userId, plainPassword } = await provisionUser(email, Role.EMPLOYEE, user.clientId);
    const employee = await prisma.employee.create({
      data: {
        lastName, firstName, email, position, department, site, country, language,
        birthDate: birthDate ? new Date(birthDate) : null,
        clientId: user.clientId,
        userId,
        plainPassword,
      },
    });
    res.status(201).json({ ...employee, plainPassword });
  } catch (err) { next(err); }
});

// PUT update employee
router.put("/:id", authenticate, requireRole("CLIENT_ADMIN"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const emp = await prisma.employee.findFirst({ where: { id: Number(req.params.id), clientId: user.clientId } });
    if (!emp) return res.status(404).json({ error: "Employé non trouvé" });
    const { lastName, firstName, position, department, site, country, language, birthDate } = req.body;
    const updated = await prisma.employee.update({
      where: { id: emp.id },
      data: { lastName, firstName, position, department, site, country, language, birthDate: birthDate ? new Date(birthDate) : null },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// GET credentials
router.get("/:id/credentials", authenticate, requireRole("CLIENT_ADMIN"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const emp = await prisma.employee.findFirst({
      where: { id: Number(req.params.id), clientId: user.clientId },
      include: { user: { select: { username: true } } },
    });
    if (!emp) return res.status(404).json({ error: "Employé non trouvé" });
    res.json({ username: emp.user?.username || emp.email, plainPassword: emp.plainPassword, firstName: emp.firstName, lastName: emp.lastName });
  } catch (err) { next(err); }
});

// POST send credentials by email
router.post("/:id/send-credentials", authenticate, requireRole("CLIENT_ADMIN"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const emp = await prisma.employee.findFirst({
      where: { id: Number(req.params.id), clientId: user.clientId },
      include: { user: { select: { username: true } }, client: { select: { name: true } } },
    });
    if (!emp) return res.status(404).json({ error: "Employé non trouvé" });
    await sendCredentials(
      emp.email,
      emp.firstName,
      emp.user?.username || emp.email,
      emp.plainPassword || "(non disponible)",
      emp.client.name
    );
    res.json({ message: "Identifiants envoyés" });
  } catch (err) { next(err); }
});

// POST send all credentials
router.post("/send-all-credentials", authenticate, requireRole("CLIENT_ADMIN"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const employees = await prisma.employee.findMany({
      where: { clientId: user.clientId },
      include: { user: { select: { username: true } }, client: { select: { name: true } } },
    });
    let sent = 0;
    for (const emp of employees) {
      if (emp.user) {
        await sendCredentials(emp.email, emp.firstName, emp.user.username, emp.plainPassword || "(non disponible)", emp.client.name);
        sent++;
      }
    }
    res.json({ sent });
  } catch (err) { next(err); }
});

// POST import employees
router.post("/import", authenticate, requireRole("CLIENT_ADMIN"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const { employees } = req.body;
    const results: any[] = [];
    for (const emp of employees) {
      const { userId, plainPassword } = await provisionUser(emp.email, Role.EMPLOYEE, user.clientId);
      const { birthDate, ...rest } = emp;
      const employee = await prisma.employee.upsert({
        where: { email: emp.email },
        update: { ...rest, clientId: user.clientId, plainPassword, userId },
        create: { ...rest, clientId: user.clientId, birthDate: birthDate ? new Date(birthDate) : null, plainPassword, userId },
      });
      results.push({ ...employee, plainPassword });
    }
    res.status(201).json({ imported: results.length, employees: results });
  } catch (err) { next(err); }
});

// GET results for a specific employee (sessions + progress per SubSubTheme)
router.get("/:id/results", authenticate, requireRole("CLIENT_ADMIN"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const emp = await prisma.employee.findFirst({
      where: { id: Number(req.params.id), clientId: user.clientId },
      include: {
        sessions: {
          include: {
            test: { select: { id: true, name: true } },
            progress: true,
          },
          orderBy: { startedAt: "desc" },
        },
      },
    });
    if (!emp) return res.status(404).json({ error: "Employé non trouvé" });

    // Load SubSubTheme labels in bulk
    const sstIds = [...new Set(emp.sessions.flatMap(s => s.progress.map(p => p.subSubThemeId)))];
    const subSubThemes = await prisma.subSubTheme.findMany({ where: { id: { in: sstIds } } });
    const sstLabelMap: Record<number, string> = {};
    for (const sst of subSubThemes) sstLabelMap[sst.id] = sst.label;

    res.json({
      employeeId: emp.id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      sessions: emp.sessions.map(s => ({
        id: s.id,
        testName: s.test.name,
        status: s.status,
        completedAt: s.completedAt,
        progress: s.progress.map(p => ({
          subSubThemeId: p.subSubThemeId,
          subSubThemeName: sstLabelMap[p.subSubThemeId] || `SST ${p.subSubThemeId}`,
          questionsAsked: p.questionsAsked,
          correctCount: p.correctCount,
          passed: p.passed,
          currentLevel: p.currentLevel,
        })),
      })),
    });
  } catch (err) { next(err); }
});

// POST assign test to employee
router.post("/:id/assign-test", authenticate, requireRole("CLIENT_ADMIN"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const { testId, deadline } = req.body;
    const emp = await prisma.employee.findFirst({ where: { id: Number(req.params.id), clientId: user.clientId } });
    if (!emp) return res.status(404).json({ error: "Employé non trouvé" });
    const assignment = await prisma.testAssignment.upsert({
      where: { testId_employeeId: { testId: Number(testId), employeeId: emp.id } },
      update: { deadline: deadline ? new Date(deadline) : null },
      create: { testId: Number(testId), employeeId: emp.id, deadline: deadline ? new Date(deadline) : null },
    });
    res.status(201).json(assignment);
  } catch (err) { next(err); }
});

export default router;
