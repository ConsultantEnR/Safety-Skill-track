import prisma from "../src/lib/prisma";

const TARGET_EMAIL = "nicolas.lecoeur@8p2.fr";

async function run() {
  const user = await prisma.user.findUnique({ where: { email: TARGET_EMAIL } });
  if (!user) { console.error(`Utilisateur ${TARGET_EMAIL} introuvable`); return; }

  const employee = await prisma.employee.findFirst({ where: { userId: user.id } });
  if (!employee) { console.error("Employé introuvable pour cet utilisateur"); return; }

  console.log(`Employé : ${employee.firstName} ${employee.lastName} (id=${employee.id})`);

  // Supprimer les réponses ouvertes liées aux sessions de cet employé
  const or = await prisma.openResponse.deleteMany({ where: { employeeId: employee.id } });
  console.log(`  OpenResponse supprimées  : ${or.count}`);

  // Supprimer toutes les sessions (cascade sur TestSessionProgress)
  const s = await prisma.testSession.deleteMany({ where: { employeeId: employee.id } });
  console.log(`  Sessions supprimées      : ${s.count}`);

  // Remettre toutes les assignations en PENDING
  const a = await prisma.testAssignment.updateMany({
    where: { employeeId: employee.id },
    data: { status: "PENDING" },
  });
  console.log(`  Assignations réinitialisées (→ PENDING) : ${a.count}`);
}

run()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
