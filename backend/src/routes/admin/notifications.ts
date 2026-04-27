import { Router } from "express";
import prisma from "../../lib/prisma";
import { authenticate, requireRole } from "../../middleware/auth";

const router = Router();

router.get("/", authenticate, requireRole("CLIENT_ADMIN"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const notifications = await prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(notifications);
  } catch (err) { next(err); }
});

router.put("/:id/read", authenticate, requireRole("CLIENT_ADMIN"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    await prisma.notification.updateMany({
      where: { id: Number(req.params.id), userId: user.id },
      data: { isRead: true },
    });
    res.json({ message: "Marqué comme lu" });
  } catch (err) { next(err); }
});

router.put("/read-all", authenticate, requireRole("CLIENT_ADMIN"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    await prisma.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true },
    });
    res.json({ message: "Tout marqué comme lu" });
  } catch (err) { next(err); }
});

// ITER10: badge "Mes messages" — exclut TEST_COMPLETED pour éviter pastille fantôme
router.get("/messages-count", authenticate, requireRole("CLIENT_ADMIN"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const count = await prisma.notification.count({
      where: { userId: user.id, isRead: false, type: { not: "TEST_COMPLETED" } }
    });
    res.json({ count });
  } catch (err) { next(err); }
});

export default router;
