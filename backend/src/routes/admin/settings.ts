import { Router } from "express";
import prisma from "../../lib/prisma";
import { authenticate, requireRole } from "../../middleware/auth";
import bcrypt from "bcryptjs";
import multer from "multer";
import { persistUploadedFile } from "../../services/storage";

const router = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// GET client info + admin user info
router.get("/", authenticate, requireRole("CLIENT_ADMIN"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const client = await prisma.client.findUnique({
      where: { id: user.clientId },
      include: { users: { where: { role: "CLIENT_ADMIN" }, select: { id: true, email: true, username: true } } },
    });
    if (!client) return res.status(404).json({ error: "Client non trouvé" });
    res.json({ ...client, adminUser: client.users[0] || null });
  } catch (err) { next(err); }
});

// PUT update client info (can modify all fields except name)
router.put("/", authenticate, requireRole("CLIENT_ADMIN"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    // ITER7: ajout des champs postalCode, city, country
    const { address, siret, sector, contactName, contactEmail, phone, website, postalCode, city, country } = req.body;
    const client = await prisma.client.update({
      where: { id: user.clientId },
      data: { address, siret, sector, contactName, contactEmail, phone, website, updatedByAdmin: true,
        postalCode: postalCode !== undefined ? postalCode : undefined, city: city !== undefined ? city : undefined, country: country !== undefined ? country : undefined }, // ITER7
    });
    res.json(client);
  } catch (err) { next(err); }
});

// POST upload logo for client
router.post("/logo", authenticate, requireRole("CLIENT_ADMIN"), upload.single("logo"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const { primaryColor, accentColor } = req.body;
    const logoUrl = req.file ? await persistUploadedFile(req.file, "clients") : undefined;
    const data: any = {};
    if (primaryColor) data.primaryColor = primaryColor;
    if (accentColor) data.accentColor = accentColor;
    if (logoUrl) data.logoUrl = logoUrl;
    const client = await prisma.client.update({ where: { id: user.clientId }, data });
    res.json(client);
  } catch (err) { next(err); }
});

// PUT change password
router.put("/password", authenticate, requireRole("CLIENT_ADMIN"), async (req, res, next) => {
  try {
    const user = (req as any).user;
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: "Champs requis" });
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser || !(await bcrypt.compare(currentPassword, dbUser.password))) {
      return res.status(400).json({ error: "Mot de passe actuel incorrect" });
    }
    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
    res.json({ message: "Mot de passe mis à jour" });
  } catch (err) { next(err); }
});

export default router;
