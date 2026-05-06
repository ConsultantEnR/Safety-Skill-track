import { Router } from "express";
import prisma from "../../lib/prisma";
import { authenticate, requireRole, AuthRequest } from "../../middleware/auth";

const router = Router();

// GET pending retake requests for this client
router.get("/", authenticate, requireRole("CLIENT_ADMIN"), async (req: AuthRequest, res, next) => {
  try {
    const clientId = req.user!.clientId!;
    const requests = await prisma.retakeRequest.findMany({
      where: { status: "PENDING", employee: { clientId } },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        test:     { select: { id: true, name: true } },
      },
      orderBy: { requestedAt: "desc" },
    });
    res.json(requests);
  } catch (err) { next(err); }
});

// POST approve — resets TestAssignment to PENDING so employee can retake
router.post("/:id/approve", authenticate, requireRole("CLIENT_ADMIN"), async (req: AuthRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    const request = await prisma.retakeRequest.findUnique({
      where: { id },
      include: { employee: true, test: true },
    });
    if (!request) return res.status(404).json({ error: "Demande non trouvée" });

    await prisma.retakeRequest.update({
      where: { id },
      data: { status: "APPROVED", reviewedAt: new Date() },
    });

    // Reset assignment so the employee sees it as a new PENDING test
    await prisma.testAssignment.updateMany({
      where: { testId: request.testId, employeeId: request.employeeId },
      data: { status: "PENDING" },
    });

    // Notify employee
    if (request.employee.userId) {
      await prisma.notification.create({
        data: {
          userId: request.employee.userId,
          title: "Reprise de test autorisée",
          message: `Votre demande de reprise pour le test "${request.test.name}" a été approuvée.`,
          type: "RETAKE_APPROVED",
          isRead: false,
        },
      });
    }

    res.json({ message: "Demande approuvée" });
  } catch (err) { next(err); }
});

// POST deny
router.post("/:id/deny", authenticate, requireRole("CLIENT_ADMIN"), async (req: AuthRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    const request = await prisma.retakeRequest.findUnique({
      where: { id },
      include: { employee: true, test: true },
    });
    if (!request) return res.status(404).json({ error: "Demande non trouvée" });

    await prisma.retakeRequest.update({
      where: { id },
      data: { status: "DENIED", reviewedAt: new Date() },
    });

    if (request.employee.userId) {
      await prisma.notification.create({
        data: {
          userId: request.employee.userId,
          title: "Reprise de test refusée",
          message: `Votre demande de reprise pour le test "${request.test.name}" a été refusée.`,
          type: "RETAKE_DENIED",
          isRead: false,
        },
      });
    }

    res.json({ message: "Demande refusée" });
  } catch (err) { next(err); }
});

export default router;
