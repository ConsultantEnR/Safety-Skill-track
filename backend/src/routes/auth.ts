import { Router } from "express";
import prisma from "../lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { sendPasswordReset } from "../services/email";

const router = Router();

function generateTokens(user: { id: number; role: string; clientId?: number | null }) {
  const accessToken = jwt.sign(
    { id: user.id, role: user.role, clientId: user.clientId },
    process.env.JWT_SECRET!,
    { expiresIn: "15m" }
  );
  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: "7d" }
  );
  return { accessToken, refreshToken };
}

router.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Identifiants requis", code: "MISSING_CREDENTIALS" });
    }
    const user = await prisma.user.findFirst({
      where: { OR: [{ username }, { email: username }] },
    });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Identifiants incorrects", code: "INVALID_CREDENTIALS" });
    }
    const { accessToken, refreshToken } = generateTokens(user);
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, username: user.username, role: user.role, clientId: user.clientId, language: user.language },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/refresh", async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: "Token requis", code: "MISSING_TOKEN" });
    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken }, include: { user: true } });
    if (!stored || stored.expiresAt < new Date()) {
      return res.status(401).json({ error: "Token invalide ou expiré", code: "INVALID_TOKEN" });
    }
    jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as any;
    const { accessToken, refreshToken: newRefresh } = generateTokens(stored.user);
    await prisma.refreshToken.delete({ where: { id: stored.id } });
    await prisma.refreshToken.create({
      data: { token: newRefresh, userId: stored.user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });
    res.json({ accessToken, refreshToken: newRefresh });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    }
    res.json({ message: "Déconnecté" });
  } catch (err) {
    next(err);
  }
});

router.post("/forgot-password", async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email requis" });

    const user = await prisma.user.findFirst({ where: { email } });
    // Always return 200 to avoid email enumeration
    if (!user) return res.json({ message: "Si cet email existe, un lien a été envoyé." });

    // Invalidate existing tokens
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: { token, userId: user.id, expiresAt },
    });

    const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    await sendPasswordReset(email, token, baseUrl);

    res.json({ message: "Si cet email existe, un lien a été envoyé." });
  } catch (err) {
    next(err);
  }
});

router.post("/reset-password", async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: "Token et mot de passe requis" });

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
      return res.status(400).json({ error: "Token invalide ou expiré", code: "INVALID_TOKEN" });
    }

    const hashed = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: resetToken.userId },
      data: { password: hashed },
    });
    await prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { used: true },
    });

    res.json({ message: "Mot de passe mis à jour avec succès" });
  } catch (err) {
    next(err);
  }
});

export default router;
