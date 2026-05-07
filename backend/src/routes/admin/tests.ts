import { Router } from "express";
import prisma from "../../lib/prisma";
import { authenticate, requireRole, AuthRequest } from "../../middleware/auth";

const router = Router();

// GET tests available to client (assigned by super admin)
router.get("/available", authenticate, requireRole("CLIENT_ADMIN"), async (req: AuthRequest, res, next) => {
  try {
    const clientId = req.user!.clientId!;
    const clientTests = await prisma.clientTest.findMany({
      where: { clientId },
      include: { test: { include: { competences: true } } }
    });
    res.json(clientTests.map(ct => ct.test));
  } catch (err) { next(err); }
});

router.get("/", authenticate, requireRole("CLIENT_ADMIN"), async (req: AuthRequest, res, next) => {
  try {
    const clientId = req.user!.clientId!;
    const clientTests = await prisma.clientTest.findMany({
      where: { clientId },
      include: { test: { include: { competences: true } } }
    });
    res.json(clientTests.map(ct => ct.test));
  } catch (err) { next(err); }
});

router.put("/", authenticate, requireRole("CLIENT_ADMIN"), async (req: AuthRequest, res, next) => {
  try {
    const clientId = req.user!.clientId!;
    const { selections } = req.body; // [{ themeId: number, selected: boolean }]
    for (const sel of selections) {
      await prisma.testSelection.upsert({
        where: { clientId_themeId: { clientId, themeId: sel.themeId } },
        update: { selected: sel.selected },
        create: { clientId, themeId: sel.themeId, selected: sel.selected },
      });
    }
    res.json({ message: "Sélection enregistrée" });
  } catch (err) { next(err); }
});

// POST assign test to employees
router.post("/:testId/assign", authenticate, requireRole("CLIENT_ADMIN"), async (req: AuthRequest, res, next) => {
  try {
    const { mode, employeeIds, filter, deadline } = req.body;
    const clientId = req.user!.clientId!;
    const testId = Number(req.params.testId);
    let targetIds: number[] = [];
    if (mode === "individual" && employeeIds) {
      targetIds = employeeIds;
    } else if (mode === "group" && filter) {
      const where: any = { clientId, isActive: true };
      where[filter.field] = Array.isArray(filter.values) ? { in: filter.values } : filter.value;
      const emps = await prisma.employee.findMany({ where, select: { id: true } });
      targetIds = emps.map(e => e.id);
    }
    const created = [];
    for (const empId of targetIds) {
      const a = await prisma.testAssignment.upsert({
        where: { testId_employeeId: { testId, employeeId: empId } } as any,
        update: { deadline: deadline ? new Date(deadline) : null },
        create: { testId, employeeId: empId, deadline: deadline ? new Date(deadline) : null }
      });
      created.push(a);
    }
    res.status(201).json({ assigned: created.length });
  } catch (err) { next(err); }
});

export default router;
