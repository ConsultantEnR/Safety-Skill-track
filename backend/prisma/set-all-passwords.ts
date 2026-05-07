import prisma from "../src/lib/prisma";
import bcrypt from "bcryptjs";

const NEW_PASSWORD = "Dolfines2026.";

async function run() {
  const hashed = await bcrypt.hash(NEW_PASSWORD, 12);

  const users = await prisma.user.findMany({ select: { id: true, email: true, role: true } });
  console.log(`${users.length} utilisateurs trouvés.`);

  await prisma.user.updateMany({ data: { password: hashed } });

  // Mettre à jour plainPassword pour tous les employés
  await prisma.employee.updateMany({ data: { plainPassword: NEW_PASSWORD } });

  console.log(`Mot de passe défini à "${NEW_PASSWORD}" pour tous les utilisateurs.`);
  for (const u of users) console.log(`  [${u.role}] ${u.email}`);
}

run()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
