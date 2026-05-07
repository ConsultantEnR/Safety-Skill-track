import prisma from "../src/lib/prisma";

async function run() {
  const user = await prisma.user.findFirst({ where: { email: "elena.koch@aegide-international.com" } });
  if (!user) { console.log("Utilisateur non trouvé"); return; }
  const emp = await prisma.employee.findFirst({ where: { userId: user.id }, select: { id: true, plainPassword: true } });
  console.log("plainPassword en base :", emp?.plainPassword ?? "(null)");
}

run().catch(console.error).finally(() => prisma.$disconnect());
