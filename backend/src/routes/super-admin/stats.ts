import { Router } from "express";
import prisma from "../../lib/prisma";
import { authenticate, requireRole } from "../../middleware/auth";

const router = Router();

router.get("/", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const { clientId } = req.query; // ITER9: filtre optionnel par client
    const cid = clientId ? Number(clientId) : undefined; // ITER9

    // ITER9: filtres employés selon clientId
    const employeeFilter = cid ? { clientId: cid, isActive: true } : { isActive: true };
    const employeeFilterAll = cid ? { clientId: cid } : {};

    const clientCount = await prisma.client.count(); // ITER9: total clients (pas filtré par clientId)
    const employeeCount = await prisma.employee.count({ where: employeeFilter }); // ITER9

    // ITER9: total tests (pas filtré par client, les tests sont globaux)
    const testCount = await prisma.test.count();

    // ITER9: filtrer les assignments par employees du client si clientId fourni
    const assignmentWhere: any = {}; // ITER9
    if (cid) {
      assignmentWhere.employee = { clientId: cid }; // ITER9
    }
    const assignedCount = await prisma.testAssignment.count({ where: assignmentWhere }); // ITER9
    const inProgressCount = await prisma.testAssignment.count({ where: { ...assignmentWhere, status: "IN_PROGRESS" } }); // ITER9
    const completedCount = await prisma.testAssignment.count({ where: { ...assignmentWhere, status: "COMPLETED" } }); // ITER9

    // ITER9: réponses ouvertes non relues, filtrées par client si besoin
    const openResponseWhere: any = { isReviewed: false }; // ITER9
    if (cid) {
      openResponseWhere.employee = { clientId: cid }; // ITER9
    }
    const openResponsesCount = await prisma.openResponse.count({ where: { ...openResponseWhere, questionType: "OPEN" } }); // ITER9
    const scenarioResponsesCount = await prisma.openResponse.count({ where: { ...openResponseWhere, questionType: "SCENARIO" } }); // ITER9

    res.json({ clientCount, employeeCount, testCount, assignedCount, inProgressCount, completedCount, openResponsesCount, scenarioResponsesCount }); // ITER9
  } catch (err) {
    next(err);
  }
});

export default router;
