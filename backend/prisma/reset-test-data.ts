import prisma from "../src/lib/prisma";

const TARGET_TESTS = ["test 8p2 #1", "test Aegide #1"];

async function run() {
  const tests = await prisma.test.findMany({
    where: { name: { in: TARGET_TESTS } },
    select: { id: true, name: true },
  });

  if (tests.length === 0) {
    console.log("Aucun test trouvé avec ces noms.");
    return;
  }

  const ids = tests.map((t) => t.id);
  console.log(`Tests trouvés : ${tests.map((t) => `"${t.name}" (id=${t.id})`).join(", ")}`);

  // Dépendants sans cascade, dans l'ordre
  const or = await prisma.openResponse.deleteMany({ where: { session: { testId: { in: ids } } } });
  const s  = await prisma.testSession.deleteMany({ where: { testId: { in: ids } } });
  const a  = await prisma.testAssignment.deleteMany({ where: { testId: { in: ids } } });
  const ct = await prisma.clientTest.deleteMany({ where: { testId: { in: ids } } });
  const t  = await prisma.test.deleteMany({ where: { id: { in: ids } } });

  console.log(`  OpenResponse supprimées  : ${or.count}`);
  console.log(`  Sessions supprimées      : ${s.count}`);
  console.log(`  Assignations supprimées  : ${a.count}`);
  console.log(`  ClientTest supprimés     : ${ct.count}`);
  console.log(`  Tests supprimés          : ${t.count}`);
}

run()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
