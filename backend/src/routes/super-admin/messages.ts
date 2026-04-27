import { Router } from "express";
import prisma from "../../lib/prisma";
import { authenticate, requireRole } from "../../middleware/auth";

const router = Router();

// GET all messages sent TO super admin (toClientId is null means it's for super admin)
router.get("/", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const messages = await prisma.message.findMany({
      where: { toClientId: null },
      include: {
        sender: { select: { email: true, username: true, clientId: true, client: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(messages);
  } catch (err) { next(err); }
});

router.put("/:id/handled", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const msg = await prisma.message.update({
      where: { id: Number(req.params.id) },
      data: { isHandled: !((await prisma.message.findUnique({ where: { id: Number(req.params.id) } }))?.isHandled) },
    });
    res.json(msg);
  } catch (err) { next(err); }
});

// ITER11: POST reply to a message
router.post("/:id/reply", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const { replyText } = req.body;
    if (!replyText) return res.status(400).json({ error: "Réponse requise" });
    const msg = await prisma.message.update({
      where: { id: Number(req.params.id) },
      data: { replyText, repliedAt: new Date(), isHandled: true } as any,
    });
    res.json(msg);
  } catch (err) { next(err); }
});

export default router;
