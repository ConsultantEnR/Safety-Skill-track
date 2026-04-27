// ITER8: ajout des routes password, username, logo dédiées
import { Router } from "express";
import prisma from "../../lib/prisma";
import { authenticate, requireRole } from "../../middleware/auth";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import { sendEmailVerification } from "../../services/email"; // ITER11
import { persistUploadedFile } from "../../services/storage";

const router = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

router.get("/", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const settings = await prisma.platformSettings.findFirst();
    res.json(settings || { primaryColor: "#27295A", accentColor: "#FCC00E", logoUrl: null });
  } catch (err) { next(err); }
});

router.put("/", authenticate, requireRole("SUPER_ADMIN"), upload.single("logo"), async (req, res, next) => {
  try {
    const { primaryColor, accentColor } = req.body;
    const logoUrl = req.file ? await persistUploadedFile(req.file, "platform") : undefined;
    const data: any = {};
    if (primaryColor) data.primaryColor = primaryColor;
    if (accentColor) data.accentColor = accentColor;
    if (logoUrl) data.logoUrl = logoUrl;
    let settings = await prisma.platformSettings.findFirst();
    if (settings) {
      settings = await prisma.platformSettings.update({ where: { id: settings.id }, data });
    } else {
      settings = await prisma.platformSettings.create({ data });
    }
    res.json(settings);
  } catch (err) { next(err); }
});

// ITER8: GET profil super admin (id, email, username, logoUrl depuis PlatformSettings)
router.get("/profile", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, username: true },
    });
    if (!dbUser) return res.status(404).json({ error: "Utilisateur non trouvé" });
    const settings = await prisma.platformSettings.findFirst();
    res.json({ ...dbUser, logoUrl: settings?.logoUrl || null });
  } catch (err) { next(err); }
});

// ITER8: PUT /password — changer le mot de passe du Super Admin
router.put("/password", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "currentPassword et newPassword sont requis" });
    }
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser || !(await bcrypt.compare(currentPassword, dbUser.password))) {
      return res.status(400).json({ error: "Mot de passe actuel incorrect" });
    }
    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
    res.json({ message: "Mot de passe mis à jour" });
  } catch (err) { next(err); }
});

// ITER8: PUT /username — changer l'identifiant du Super Admin
router.put("/username", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const { newUsername, currentPassword } = req.body;
    if (!newUsername || !currentPassword) {
      return res.status(400).json({ error: "newUsername et currentPassword sont requis" });
    }
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser || !(await bcrypt.compare(currentPassword, dbUser.password))) {
      return res.status(400).json({ error: "Mot de passe de confirmation incorrect" });
    }
    // Vérifier l'unicité du nouvel identifiant
    const existing = await prisma.user.findUnique({ where: { username: newUsername } });
    if (existing && existing.id !== user.id) {
      return res.status(409).json({ error: "Cet identifiant est déjà utilisé" });
    }
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { username: newUsername },
      select: { id: true, email: true, username: true },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// ITER11: PUT /email — initier le changement d'e-mail (envoie un lien de vérification)
router.put("/email", authenticate, requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const { newEmail, currentPassword } = req.body;
    if (!newEmail || !currentPassword) {
      return res.status(400).json({ error: "newEmail et currentPassword sont requis" });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return res.status(400).json({ error: "Format d'e-mail invalide", code: "INVALID_EMAIL" });
    }
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser || !(await bcrypt.compare(currentPassword, dbUser.password))) {
      return res.status(400).json({ error: "Mot de passe de confirmation incorrect", code: "WRONG_PASSWORD" });
    }
    const existing = await prisma.user.findUnique({ where: { email: newEmail } });
    if (existing && existing.id !== user.id) {
      return res.status(409).json({ error: "Cet e-mail est déjà utilisé", code: "EMAIL_TAKEN" });
    }
    // Générer un token à usage unique expirant dans 1h
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await (prisma.user.update as any)({
      where: { id: dbUser.id },
      data: {
        pendingEmail: newEmail,
        emailVerificationToken: `${token}|${expiresAt.toISOString()}`,
      },
    });
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    await sendEmailVerification(newEmail, token, baseUrl);
    res.json({ message: "Un lien de vérification a été envoyé à votre nouvelle adresse." });
  } catch (err) { next(err); }
});

// ITER11: GET /verify-email?token=xxx — confirmer le changement d'e-mail (lien cliqué)
router.get("/verify-email", async (req, res, next) => {
  try {
    const { token } = req.query as { token: string };
    if (!token) return res.status(400).json({ error: "Token manquant" });
    // Chercher l'utilisateur avec ce token
    const users = await (prisma.user.findMany as any)({
      where: { emailVerificationToken: { startsWith: token } },
    });
    if (!users.length) return res.status(400).json({ error: "Token invalide ou expiré", code: "INVALID_TOKEN" });
    const dbUser = users[0];
    const parts = (dbUser.emailVerificationToken as string).split("|");
    if (parts.length < 2 || parts[0] !== token) {
      return res.status(400).json({ error: "Token invalide", code: "INVALID_TOKEN" });
    }
    const expiresAt = new Date(parts[1]);
    if (expiresAt < new Date()) {
      return res.status(400).json({ error: "Token expiré", code: "TOKEN_EXPIRED" });
    }
    if (!dbUser.pendingEmail) return res.status(400).json({ error: "Aucune demande en attente" });
    await (prisma.user.update as any)({
      where: { id: dbUser.id },
      data: { email: dbUser.pendingEmail, pendingEmail: null, emailVerificationToken: null },
    });
    res.json({ message: "Adresse e-mail mise à jour avec succès." });
  } catch (err) { next(err); }
});

// ITER8: POST /logo — upload du logo Super Admin (sauvegarde dans PlatformSettings)
router.post("/logo", authenticate, requireRole("SUPER_ADMIN"), upload.single("logo"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier fourni" });
    const logoUrl = await persistUploadedFile(req.file, "platform");
    let settings = await prisma.platformSettings.findFirst();
    if (settings) {
      settings = await prisma.platformSettings.update({ where: { id: settings.id }, data: { logoUrl } });
    } else {
      settings = await prisma.platformSettings.create({ data: { logoUrl } });
    }
    res.json({ logoUrl: settings.logoUrl });
  } catch (err) { next(err); }
});

export default router;
