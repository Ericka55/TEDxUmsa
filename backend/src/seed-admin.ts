import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { randomBytes, scryptSync } from 'node:crypto';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '../.env') });

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) {
    throw new Error('Define ADMIN_EMAIL y una ADMIN_PASSWORD de al menos 12 caracteres en el .env de la raíz.');
  }

  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const passwordHash = `scrypt$16384$8$1$${salt.toString('hex')}$${derived.toString('hex')}`;
  const prisma = new PrismaClient();
  try {
    await prisma.user.upsert({
      where: { email },
      update: { name: 'Administrador', passwordHash, role: 'ADMIN', active: true },
      create: { email, name: 'Administrador', passwordHash, role: 'ADMIN', active: true },
    });
    console.log(`Cuenta administradora creada o actualizada para ${email}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
