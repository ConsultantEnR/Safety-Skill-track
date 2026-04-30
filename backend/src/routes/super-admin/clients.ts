import { Router } from "express";
import { Role } from "@prisma/client";
import prisma from "../../lib/prisma";
import { authenticate, requireRole } from "../../middleware/auth";
import multer from "multer";
import { sendCredentials } from "../../services/email";
import { persistUploadedFile } from "../../services/storage";
import { provisionUser, resetUserPassword } from "../../services/userService";

const router = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

router.get("/", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const clients = await prisma.client.findMany({
      include: {
        _count: { select: { employees: true } },
        users: { where: { role: Role.CLIENT_ADMIN }, select: { id: true, email: true, username: true } },
      },
    });
    res.json(clients);
  } catch (err) { next(err); }
});

router.post("/", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const { name, address, adminEmail, primaryColor, accentColor, siret, sector, contactName, contactEmail, phone, website, postalCode, city, country, state } = req.body;
    // Create client first, then provision admin user (needs clientId)
    const client = await prisma.client.create({
      data: {
        name, address, primaryColor: primaryColor || "#27295A", accentColor: accentColor || "#FCC00E",
        siret, sector, contactName, contactEmail, phone, website,
        postalCode: postalCode || null, city: city || null, country: country || null,
        state: state || null,
      },
    });
    const { plainPassword } = await provisionUser(adminEmail, Role.CLIENT_ADMIN, client.id);
    const updatedClient = await prisma.client.update({
      where: { id: client.id },
      data: { adminPassword: plainPassword },
      include: { users: true },
    });
    res.status(201).json({ client: updatedClient, generatedPassword: plainPassword });
  } catch (err) { next(err); }
});

router.get("/:id", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: Number(req.params.id) },
      include: { users: { where: { role: Role.CLIENT_ADMIN } } }
    });
    if (!client) return res.status(404).json({ error: "Client non trouvé", code: "NOT_FOUND" });
    res.json(client);
  } catch (err) { next(err); }
});

router.put("/:id", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    // ITER7: ajout des champs postalCode, city, country
    const { name, address, primaryColor, accentColor, siret, sector, contactName, contactEmail, phone, website, postalCode, city, country, state } = req.body;
    const client = await prisma.client.update({
      where: { id: Number(req.params.id) },
      data: { name, address, primaryColor, accentColor, siret, sector, contactName, contactEmail, phone, website, updatedByAdmin: false,
        postalCode: postalCode !== undefined ? postalCode : undefined, city: city !== undefined ? city : undefined, country: country !== undefined ? country : undefined, // ITER7
        state: state !== undefined ? state : undefined, // ITER10
      }
    });
    res.json(client);
  } catch (err) { next(err); }
});

router.post("/:id/branding", authenticate, requireRole("SUPER_ADMIN"), upload.single("logo"), async (req, res, next) => {
  try {
    const { primaryColor, accentColor } = req.body;
    const logoUrl = req.file ? await persistUploadedFile(req.file, "clients") : undefined;
    const data: any = {};
    if (primaryColor) data.primaryColor = primaryColor;
    if (accentColor) data.accentColor = accentColor;
    if (logoUrl) data.logoUrl = logoUrl;
    const client = await prisma.client.update({ where: { id: Number(req.params.id) }, data });
    res.json(client);
  } catch (err) { next(err); }
});

router.get("/:id/tests", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const clientTests = await prisma.clientTest.findMany({
      where: { clientId: Number(req.params.id) },
      include: { test: { include: { competences: true } }, levels: true }
    });
    res.json(clientTests);
  } catch (err) { next(err); }
});

router.post("/:id/assign-test", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const { testId } = req.body;
    const clientTest = await prisma.clientTest.upsert({
      where: { clientId_testId: { clientId: Number(req.params.id), testId: Number(testId) } },
      update: {},
      create: { clientId: Number(req.params.id), testId: Number(testId) },
      include: { test: { include: { competences: true } }, levels: true }
    });
    res.status(201).json(clientTest);
  } catch (err) { next(err); }
});

router.delete("/:id/assign-test/:testId", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    await prisma.clientTest.deleteMany({
      where: { clientId: Number(req.params.id), testId: Number(req.params.testId) }
    });
    res.json({ message: "Test désassigné" });
  } catch (err) { next(err); }
});

router.put("/:id/test-levels/:clientTestId", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const clientTestId = Number(req.params.clientTestId);
    const { levels } = req.body;
    const ct = await prisma.clientTest.findFirst({ where: { id: clientTestId, clientId: Number(req.params.id) } });
    if (!ct) return res.status(404).json({ error: "Assignation non trouvée" });
    for (const lv of levels) {
      await prisma.clientTestLevel.upsert({
        where: { clientTestId_subSubThemeId: { clientTestId, subSubThemeId: lv.subSubThemeId } },
        update: { expectedLevel: lv.expectedLevel },
        create: { clientTestId, subSubThemeId: lv.subSubThemeId, expectedLevel: lv.expectedLevel }
      });
    }
    const updated = await prisma.clientTest.findUnique({
      where: { id: clientTestId },
      include: { test: { include: { competences: true } }, levels: true }
    });
    res.json(updated);
  } catch (err) { next(err); }
});

router.post("/:id/employees/import", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const clientId = Number(req.params.id);
    const { employees } = req.body;
    const results: any[] = [];
    for (const emp of employees) {
      const { userId, plainPassword } = await provisionUser(emp.email, Role.EMPLOYEE, clientId);
      const { birthDate, ...empRest } = emp;
      const employee = await prisma.employee.upsert({
        where: { email: emp.email },
        update: { ...empRest, clientId, plainPassword, userId },
        create: { ...empRest, clientId, birthDate: birthDate ? new Date(birthDate) : null, plainPassword, userId }
      });
      results.push({ ...employee, plainPassword });
    }
    res.status(201).json({ imported: results.length, employees: results });
  } catch (err) { next(err); }
});

// GET employees with test assignment status
router.get("/:id/employees", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const employees = await prisma.employee.findMany({
      where: { clientId: Number(req.params.id) },
      include: {
        assignments: {
          include: { test: { select: { id: true, name: true } } },
        },
        sessions: {
          select: { testId: true, status: true, completedAt: true },
          orderBy: { startedAt: "desc" },
        },
      },
      orderBy: { lastName: "asc" },
    });

    // Compute test status per employee
    const result = employees.map(emp => {
      const testStatuses = emp.assignments.map(a => {
        const sessions = emp.sessions.filter(s => s.testId === a.testId);
        const completed = sessions.find(s => s.status === "COMPLETED");
        const inProgress = sessions.find(s => s.status === "IN_PROGRESS");
        let status = "NOT_STARTED";
        if (completed) status = "COMPLETED";
        else if (inProgress) status = "IN_PROGRESS";
        return { testId: a.testId, testName: a.test.name, status };
      });
      return { ...emp, testStatuses };
    });

    res.json(result);
  } catch (err) { next(err); }
});

// Reset employee password
router.post("/:clientId/employees/:empId/reset-password", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const employee = await prisma.employee.findFirst({
      where: { id: Number(req.params.empId), clientId: Number(req.params.clientId) },
      include: { user: true },
    });
    if (!employee || !employee.user) return res.status(404).json({ error: "Employé non trouvé" });

    const plainPassword = await resetUserPassword(employee.user.id);
    await prisma.employee.update({ where: { id: employee.id }, data: { plainPassword } });

    res.json({ plainPassword, email: employee.email, username: employee.user.username });
  } catch (err) { next(err); }
});

// Send credentials by email
router.post("/:clientId/employees/:empId/send-credentials", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const employee = await prisma.employee.findFirst({
      where: { id: Number(req.params.empId), clientId: Number(req.params.clientId) },
      include: { user: true, client: true },
    });
    if (!employee || !employee.user) return res.status(404).json({ error: "Employé non trouvé" });

    await sendCredentials(
      employee.email,
      employee.firstName,
      employee.user.username,
      employee.plainPassword || "(non disponible)",
      employee.client.name
    );
    res.json({ message: "Identifiants envoyés" });
  } catch (err) { next(err); }
});

// ITER11: Reset admin password for a client (CLIENT_ADMIN user)
router.post("/:id/reset-admin-password", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const clientId = Number(req.params.id);
    const adminUser = await prisma.user.findFirst({ where: { clientId, role: Role.CLIENT_ADMIN } });
    if (!adminUser) return res.status(404).json({ error: "Admin non trouvé", code: "NOT_FOUND" });
    const newPassword = await resetUserPassword(adminUser.id);
    await prisma.client.update({ where: { id: clientId }, data: { adminPassword: newPassword } });
    res.json({ adminPassword: newPassword, username: adminUser.username });
  } catch (err) { next(err); }
});

// Send all credentials for a client
router.post("/:clientId/send-all-credentials", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const employees = await prisma.employee.findMany({
      where: { clientId: Number(req.params.clientId) },
      include: { user: true, client: true },
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

export default router;
