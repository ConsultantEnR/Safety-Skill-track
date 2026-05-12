import { Router } from "express";
import prisma from "../../lib/prisma";
import { authenticate, requireRole } from "../../middleware/auth";

const router = Router();

// GET messages from participants of this client
router.get("/", authenticate, requireRole("CLIENT_ADMIN"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const messages = await prisma.message.findMany({
      where: { toClientId: user.clientId },
      include: {
        sender: { select: { id: true, email: true, username: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(messages);
  } catch (err) { next(err); }
});

router.get("/pending-count", authenticate, requireRole("CLIENT_ADMIN"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const count = await prisma.message.count({
      where: { toClientId: user.clientId, isHandled: false },
    });
    res.json({ count });
  } catch (err) { next(err); }
});

// POST send message to super admin
router.post("/", authenticate, requireRole("CLIENT_ADMIN"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const { subject, body, senderEmail } = req.body;
    if (!subject || !body) return res.status(400).json({ error: "Sujet et message requis" });
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { client: { select: { name: true } } },
    });
    const message = await prisma.message.create({
      data: {
        senderUserId: user.id,
        toClientId: null, // goes to super admin
        subject,
        body,
        senderName: dbUser?.client?.name || "",
        senderEmail: senderEmail || dbUser?.email || "",
      },
    });
    res.status(201).json(message);
  } catch (err) { next(err); }
});

// ITER12: POST help-request — CLIENT_ADMIN sends help request to Super Admin
router.post("/help-request", authenticate, requireRole("CLIENT_ADMIN"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const { subject, body, contactEmail } = req.body;
    if (!subject || !body) return res.status(400).json({ error: "Sujet et message requis" });
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { client: { select: { name: true } } },
    });
    const message = await prisma.message.create({
      data: {
        senderUserId: user.id,
        toClientId: null, // null = goes to Super Admin
        subject,
        body,
        senderName: dbUser?.client?.name || dbUser?.username || "",
        senderEmail: contactEmail || dbUser?.email || "",
      },
    });
    res.status(201).json(message);
  } catch (err) { next(err); }
});

// ITER12: POST reply to a message (from CLIENT_ADMIN to sender)
router.post("/:id/reply", authenticate, requireRole("CLIENT_ADMIN"), async (req, res, next) => {
  try {
    const { replyText } = req.body;
    const id = Number(req.params.id);
    if (!replyText?.trim()) return res.status(400).json({ error: "Texte requis" });
    const msg = await prisma.message.update({
      where: { id },
      data: { replyText, repliedAt: new Date(), isHandled: true } as any,
    });
    res.json(msg);
  } catch (err) { next(err); }
});

// ITER11: POST forward employee message to super admin
router.post("/:id/forward", authenticate, requireRole("CLIENT_ADMIN"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const original = await prisma.message.findFirst({
      where: { id: Number(req.params.id), toClientId: user.clientId },
    });
    if (!original) return res.status(404).json({ error: "Message non trouvé" });
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { client: { select: { name: true } } },
    });
    await prisma.message.create({
      data: {
        senderUserId: user.id,
        toClientId: null, // goes to super admin
        subject: `[Transféré] ${original.subject}`,
        body: original.body,
        senderName: dbUser?.client?.name || "",
        senderEmail: dbUser?.email || "",
      },
    });
    await prisma.message.update({
      where: { id: Number(req.params.id) },
      data: { forwardedToSuperAdmin: true, forwardedAt: new Date() } as any,
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.put("/:id/handled", authenticate, requireRole("CLIENT_ADMIN"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const existing = await prisma.message.findFirst({
      where: { id: Number(req.params.id), toClientId: user.clientId },
    });
    if (!existing) return res.status(404).json({ error: "Message non trouvé" });
    const msg = await prisma.message.update({
      where: { id: Number(req.params.id) },
      data: { isHandled: !existing.isHandled },
    });
    res.json(msg);
  } catch (err) { next(err); }
});

export default router;
