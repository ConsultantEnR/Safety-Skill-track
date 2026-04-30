import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma";

export function generatePassword(): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;
  const pwd = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];
  for (let i = 0; i < 8; i++) pwd.push(all[Math.floor(Math.random() * all.length)]);
  for (let i = pwd.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
  }
  return pwd.join("");
}

/**
 * Creates or updates a user account with a freshly generated password.
 * On upsert: only the password is updated — role and clientId are never downgraded.
 * Returns the userId and the plain-text password (to be shown once or emailed).
 */
export async function provisionUser(
  email: string,
  role: Role,
  clientId: number | null = null
): Promise<{ userId: number; plainPassword: string }> {
  const plainPassword = generatePassword();
  const hashed = await bcrypt.hash(plainPassword, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { password: hashed },
    create: { email, username: email, password: hashed, role, clientId },
  });
  return { userId: user.id, plainPassword };
}

/**
 * Resets the password of an existing user by userId.
 * Returns the new plain-text password.
 */
export async function resetUserPassword(userId: number): Promise<string> {
  const plainPassword = generatePassword();
  const hashed = await bcrypt.hash(plainPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
  return plainPassword;
}
