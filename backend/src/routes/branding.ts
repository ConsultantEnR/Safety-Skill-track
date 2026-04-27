import { Router } from "express";
import prisma from "../lib/prisma";

const router = Router();

// ITER7: Architecture branding :
//   - Super Admin : stocké dans PlatformSettings (table globale, sans clientId)
//     → GET  /api/branding          : retourne les couleurs/logo Super Admin (ci-dessous)
//     → PUT  /api/super-admin/settings : upload logo + couleurs Super Admin
//   - Client     : stocké dans Client.primaryColor / accentColor / logoUrl (par clientId)
//     → GET  /api/branding/client/:clientId : retourne le branding d'un client spécifique
router.get("/", async (req, res, next) => {
  try {
    const settings = await prisma.platformSettings.findFirst();
    res.json({
      primaryColor: settings?.primaryColor || "#27295A",
      accentColor: settings?.accentColor || "#FCC00E",
      logoUrl: settings?.logoUrl || null,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/public", async (req, res, next) => {
  try {
    const settings = await prisma.platformSettings.findFirst();
    res.json({
      primaryColor: settings?.primaryColor || "#27295A",
      accentColor: settings?.accentColor || "#FCC00E",
      logoUrl: settings?.logoUrl || null,
    });
  } catch (err) { next(err); }
});

router.get("/client/:clientId", async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.clientId);
    if (isNaN(clientId)) return res.status(400).json({ error: "Invalid clientId" });
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return res.status(404).json({ error: "Client non trouvé" });
    res.json({
      primaryColor: client.primaryColor || "#27295A",
      accentColor: client.accentColor || "#FCC00E",
      logoUrl: client.logoUrl || null,
      companyName: client.name,
    });
  } catch (err) { next(err); }
});

export default router;
