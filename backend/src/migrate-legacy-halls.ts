import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';

config({ path: resolve(process.cwd(), '../.env') });

async function main() {
  const prisma = new PrismaClient();
  try {
    const legacyEvents = await prisma.event.findMany({
      where: { hallId: null, hallName: { not: null }, seatRows: { not: null }, seatColumns: { not: null } },
      select: { id: true, hallName: true, venue: true, seatRows: true, seatColumns: true, seats: { select: { status: true, rowOrder: true, columnOrder: true } } },
    });
    let linked = 0;
    for (const event of legacyEvents) {
      if (!event.hallName || !event.seatRows || !event.seatColumns) continue;
      const layout = [...event.seats].sort((a, b) => a.rowOrder - b.rowOrder || a.columnOrder - b.columnOrder).map(({ status, rowOrder, columnOrder }) => ({ status, rowOrder, columnOrder }));
      const legacyKey = createHash('sha256').update(JSON.stringify([event.venue, event.hallName, event.seatRows, event.seatColumns, layout])).digest('hex');
      await prisma.$transaction(async (tx) => {
        const hall = await tx.hall.upsert({
          where: { legacyKey },
          create: { name: event.hallName!, venue: event.venue, seatRows: event.seatRows!, seatColumns: event.seatColumns!, seatLayout: layout as Prisma.InputJsonValue, legacyKey },
          update: {},
        });
        const result = await tx.event.updateMany({ where: { id: event.id, hallId: null }, data: { hallId: hall.id } });
        linked += result.count;
      });
    }
    process.stdout.write(`Migración de salones terminada. Eventos vinculados: ${linked}.\n`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => { process.stderr.write(`Falló la migración de salones: ${error instanceof Error ? error.message : 'error desconocido'}\n`); process.exitCode = 1; });
