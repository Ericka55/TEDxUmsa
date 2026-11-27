import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const confirmed = process.argv.includes('--confirm');
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) throw new Error('DATABASE_URL no está configurada.');
const database = new URL(databaseUrl);
if (!['localhost', '127.0.0.1', '::1'].includes(database.hostname) || database.pathname !== '/tedxumsa') {
  throw new Error('Por seguridad, este restablecimiento solo se permite para la base tedxumsa en localhost.');
}
if (confirmed && process.env.TEDXUMSA_RESET_CONFIRM !== 'tedxumsa') {
  throw new Error('Define TEDXUMSA_RESET_CONFIRM=tedxumsa para confirmar el borrado local.');
}

const prisma = new PrismaClient();
try {
  const counts = {
    events: await prisma.event.count(),
    halls: await prisma.hall.count(),
    attendees: await prisma.attendee.count(),
    registrations: await prisma.registration.count(),
    satisfactionResponses: await prisma.satisfactionResponse.count(),
    users: await prisma.user.count(),
    activeAdmins: await prisma.user.count({ where: { role: 'ADMIN', active: true } }),
  };
  if (!confirmed) {
    console.log('Vista previa; no se modificó ningún dato.');
    console.log(JSON.stringify(counts));
    console.log('Para confirmar el borrado local: $env:TEDXUMSA_RESET_CONFIRM="tedxumsa"; node scripts/reset-local-product-data.mjs --confirm');
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.deleteMany({ where: { eventId: { not: null } } });
      await tx.satisfactionResponse.deleteMany();
      await tx.seatReservation.deleteMany();
      await tx.registration.deleteMany();
      await tx.eventCollaborator.deleteMany();
      await tx.event.deleteMany();
      await tx.hall.deleteMany();
      await tx.attendee.deleteMany();
      await tx.authSession.deleteMany();
    });
    console.log('Restablecimiento local completado; las cuentas de usuario se conservaron.');
    console.log(JSON.stringify(counts));
  }
} finally {
  await prisma.$disconnect();
}
