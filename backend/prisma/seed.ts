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

  // Super Admin
  const adminExists = await prisma.user.findUnique({ where: { email: "admin@trainingsaas.com" } });
  if (!adminExists) {
    const password = "SuperAdmin2024!";
    const hashed = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: {
        email: "admin@trainingsaas.com",
        username: "superadmin",
        password: hashed,
        role: Role.SUPER_ADMIN,
      },
    });
    console.log("\n======================================");
    console.log("  Super Admin créé !");
    console.log("  Email    : admin@trainingsaas.com");
    console.log("  Username : superadmin");
    console.log("  Password : SuperAdmin2024!");
    console.log("======================================\n");
  }

  const extraAdmins = [
    { email: "nicolas.lecoeur@8p2.fr", username: "nicolas.lecoeur" },
    { email: "richard.musi@8p2.fr",    username: "richard.musi"    },
  ];
  for (const admin of extraAdmins) {
    const exists = await prisma.user.findUnique({ where: { email: admin.email } });
    if (!exists) {
      const hashed = await bcrypt.hash("SuperAdmin2024!", 12);
      await prisma.user.create({
        data: { email: admin.email, username: admin.username, password: hashed, role: Role.SUPER_ADMIN },
      });
      console.log("Created super admin:", admin.email);
    }
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
