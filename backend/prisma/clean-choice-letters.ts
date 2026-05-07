import prisma from "../src/lib/prisma";

// Strip leading letter prefixes like "A) ", "B. ", "a) " from QCM choice texts
const PREFIX = /^[A-Ea-e][.)]\s+/;

async function main() {
  const questions = await prisma.question.findMany({ where: { type: "QCM" } });
  let updated = 0;

  for (const q of questions) {
    const opts = q.options as any;
    if (!opts?.choices || !Array.isArray(opts.choices)) continue;

    const cleaned: string[] = opts.choices.map((c: string) =>
      typeof c === "string" ? c.replace(PREFIX, "").trim() : c
    );

    if (JSON.stringify(cleaned) === JSON.stringify(opts.choices)) continue;

    await prisma.question.update({
      where: { id: q.id },
      data: { options: { ...opts, choices: cleaned } as any },
    });
    updated++;
  }

  console.log(`Cleaned letter prefixes from ${updated} questions.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
