import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Platform settings
  const existing = await prisma.platformSettings.findFirst();
  if (!existing) {
    await prisma.platformSettings.create({
      data: { primaryColor: "#27295A", accentColor: "#FCC00E" },
    });
  }

  const SUPER_ADMIN_PASSWORD = "Dolfines2026.";
  const superAdmins = [
    { email: "admin@trainingsaas.com",                username: "superadmin"    },
    { email: "nicolas.lecoeur@8p2.fr",               username: "nicolas.lecoeur" },
    { email: "richard.musi@8p2.fr",                  username: "richard.musi"    },
    { email: "ines.dechaut@aegide-international.com", username: "ines.dechaut"   },
  ];
  const hashed = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12);
  for (const admin of superAdmins) {
    await prisma.user.upsert({
      where: { email: admin.email },
      update: { password: hashed, role: Role.SUPER_ADMIN },
      create: { email: admin.email, username: admin.username, password: hashed, role: Role.SUPER_ADMIN },
    });
    console.log("Upserted super admin:", admin.email);
  }

  // Taxonomy
  const taxonomy = [
    {
      label: "Techniques",
      subThemes: [
        "Règlementations en santé sécurité",
        "Gestion des risques",
        "Gestion des incidents",
        "Culture",
        "Durabilité"
      ]
    },
    {
      label: "Fondamentales",
      subThemes: ["Stratégie", "Planning", "Leadership et management"]
    },
    {
      label: "Comportementales",
      subThemes: [
        "Gestion des parties prenantes",
        "Performance personnelle",
        "Communication",
        "Travailler avec les autres"
      ]
    }
  ];

  // ITER11: mapping FR→EN pour thèmes et sous-thèmes
  const THEME_EN: Record<string, string> = {
    "Techniques": "Technical",
    "Fondamentales": "Core",
    "Comportementales": "Behavioural",
  };
  const SUBTHEME_EN: Record<string, string> = {
    "Règlementations en santé sécurité": "Health and safety law",
    "Gestion des risques": "Risk management",
    "Gestion des incidents": "Incident management",
    "Culture": "Culture",
    "Durabilité": "Sustainability",
    "Stratégie": "Strategy",
    "Planning": "Planning",
    "Leadership et management": "Leadership and management",
    "Gestion des parties prenantes": "Stakeholder management",
    "Performance personnelle": "Personal performance",
    "Communication": "Communication",
    "Travailler avec les autres": "Working with others",
  };

  for (const t of taxonomy) {
    const theme = await prisma.theme.upsert({
      where: { label: t.label },
      update: { nameEn: THEME_EN[t.label] || null },
      create: { label: t.label, nameEn: THEME_EN[t.label] || null },
    } as any);
    for (const stLabel of t.subThemes) {
      const existing = await prisma.subTheme.findFirst({ where: { label: stLabel, themeId: theme.id } });
      if (!existing) {
        await (prisma.subTheme.create as any)({ data: { label: stLabel, themeId: theme.id, nameEn: SUBTHEME_EN[stLabel] || null } });
      } else if (!existing.nameEn) {
        await (prisma.subTheme.update as any)({ where: { id: existing.id }, data: { nameEn: SUBTHEME_EN[stLabel] || null } });
      }
    }
  }
  console.log("Taxonomy seeded with nameEn translations");
  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
