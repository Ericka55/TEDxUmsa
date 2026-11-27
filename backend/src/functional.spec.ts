import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { EventsService } from './events.service';
import { HallsService } from './halls.service';
import { AuditInterceptor } from './audit.interceptor';
import { RegistrationDto } from './dto';

function eventService(prisma: Record<string, any>) { return new EventsService(prisma as any); }

test('collaborator check-in requires assignment and does not disclose attendee email', async () => {
  const prisma = {
    eventCollaborator: { findUnique: async () => ({ userId: 'collaborator-1' }) },
    registration: {
      findUnique: async () => ({ id: 'registration-1', eventId: 'event-1', status: 'CONFIRMED', checkedInAt: null, attendee: { firstName: 'Test', lastName: 'Person', email: 'private@example.test' }, event: { id: 'event-1', name: 'Test event', closedAt: null }, reservation: null }),
      updateMany: async () => ({ count: 1 }),
      findUniqueOrThrow: async () => ({ checkedInAt: new Date('2026-01-01T00:00:00Z') }),
    },
  };
  const result = await eventService(prisma).checkIn('event-1', 'TEST-CODE', 'collaborator-1');
  assert.deepEqual(result.attendee, { firstName: 'Test', lastName: 'Person' });
  assert.equal(result.alreadyCheckedIn, false);
});

test('collaborator cannot check in another event and already checked registrations are not changed', async () => {
  const crossEvent = eventService({ eventCollaborator: { findUnique: async () => null } });
  await assert.rejects(crossEvent.checkIn('event-2', 'TEST-CODE', 'collaborator-1'), ForbiddenException);

  let writes = 0;
  const duplicate = eventService({
    eventCollaborator: { findUnique: async () => ({ userId: 'collaborator-1' }) },
    registration: {
      findUnique: async () => ({ id: 'registration-1', eventId: 'event-1', status: 'CONFIRMED', checkedInAt: new Date(), attendee: { firstName: 'Test', lastName: 'Person', email: 'private@example.test' }, event: { id: 'event-1', name: 'Test event', closedAt: null }, reservation: null }),
      updateMany: async () => { writes += 1; return { count: 0 }; },
      findUniqueOrThrow: async () => ({ checkedInAt: new Date() }),
    },
  });
  const result = await duplicate.checkIn('event-1', 'TEST-CODE', 'collaborator-1');
  assert.equal(result.alreadyCheckedIn, true);
  assert.equal(writes, 0);
});

test('wrong event QR returns not found; finalized event cannot be checked in', async () => {
  const mismatch = eventService({ registration: { findUnique: async () => ({ eventId: 'different-event', status: 'CONFIRMED' }) } });
  await assert.rejects(mismatch.checkIn('event-1', 'TEST-CODE'), NotFoundException);
  const closed = eventService({ registration: { findUnique: async () => ({ id: 'r', eventId: 'event-1', status: 'CONFIRMED', checkedInAt: null, attendee: {}, event: { id: 'event-1', name: 'Test', closedAt: new Date() }, reservation: null }) } });
  await assert.rejects(closed.checkIn('event-1', 'TEST-CODE'), ConflictException);
});

test('hall listing performs read-only query', async () => {
  let reads = 0;
  const halls = new HallsService({ hall: { findMany: async () => { reads += 1; return []; } } } as any);
  assert.deepEqual(await halls.list(), []);
  assert.equal(reads, 1);
});

test('registration DTO rejects invalid email, overlong input, missing required data and unknown properties', () => {
  const valid = { email: 'person@example.test', firstName: 'Test', lastName: 'Person', phone: '+59112345678', occupation: 'Student' };
  assert.equal(validateSync(plainToInstance(RegistrationDto, valid)).length, 0);
  const invalid = plainToInstance(RegistrationDto, { ...valid, email: 'not-an-email', unexpected: 'not allowed', firstName: 'x'.repeat(101) });
  const failures = validateSync(invalid, { whitelist: true, forbidNonWhitelisted: true });
  assert.ok(failures.length >= 3);
});

test('invalid image bytes are rejected even when the declared type says PNG', async () => {
  const service = new HallsService({} as any) as any;
  await assert.rejects(service.savePhoto('data:image/png;base64,aGVsbG8='));
});

test('audit interceptor records actor, action, entity, event, and HTTP result without request body', async () => {
  let finish: (() => void) | undefined;
  let record: any;
  const interceptor = new AuditInterceptor({ auditLog: { create: async ({ data }: any) => { record = data; } } } as any);
  const context = { switchToHttp: () => ({
    getRequest: () => ({ user: { id: 'actor-id' }, method: 'PATCH', params: { eventId: '123e4567-e89b-12d3-a456-426614174000' }, route: { path: '/api/events/admin/:eventId' }, body: { password: 'must-not-be-recorded' } }),
    getResponse: () => ({ statusCode: 200, once: (_event: string, listener: () => void) => { finish = listener; } }),
  }) } as any;
  interceptor.intercept(context, { handle: () => ({}) } as any);
  finish?.();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(record.userId, 'actor-id');
  assert.equal(record.action, 'patch');
  assert.equal(record.eventId, '123e4567-e89b-12d3-a456-426614174000');
  assert.deepEqual(record.metadata, { statusCode: 200, result: 'success' });
  assert.equal(JSON.stringify(record).includes('must-not-be-recorded'), false);
});

const isolatedUrl = process.env.TEDX_TEST_DATABASE_URL;
const parsedTestDb = isolatedUrl ? new URL(isolatedUrl) : null;
const safeIsolatedDatabase = Boolean(parsedTestDb && ['localhost', '127.0.0.1', '::1'].includes(parsedTestDb.hostname) && parsedTestDb.pathname.replace(/^\//, '') === 'tedxumsa_phase3_test');
test('PostgreSQL integration tests require a dedicated local tedxumsa_phase3_test database', { skip: !safeIsolatedDatabase }, async () => {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: isolatedUrl! } } });
  class Rollback extends Error {}
  try {
    try {
      await prisma.$transaction(async (tx) => {
        const eventId = randomUUID(); const otherEventId = randomUUID(); const userId = randomUUID(); const attendeeId = randomUUID();
        const stamp = randomUUID();
        await tx.event.create({ data: { id: eventId, slug: `test-${stamp}`, name: 'Integration test event', description: 'Synthetic test data', venue: 'Isolated PostgreSQL', startsAt: new Date(), status: 'PUBLISHED', registrationEnabled: true } });
        await tx.event.create({ data: { id: otherEventId, slug: `test-other-${stamp}`, name: 'Other test event', description: 'Synthetic test data', venue: 'Isolated PostgreSQL', startsAt: new Date(), status: 'PUBLISHED', registrationEnabled: true } });
        await tx.user.create({ data: { id: userId, email: `collaborator-${stamp}@example.test`, name: 'Synthetic collaborator', passwordHash: 'not-a-real-password', role: 'COLLABORATOR' } });
        await tx.eventCollaborator.create({ data: { eventId, userId } });
        await tx.attendee.create({ data: { id: attendeeId, email: `attendee-${stamp}@example.test`, firstName: 'Synthetic', lastName: 'Attendee', phone: '0000000000', occupation: 'Test' } });
        const registration = await tx.registration.create({ data: { eventId, attendeeId, status: 'CONFIRMED' } });
        const service = eventService(tx as any);
        const first = await service.checkIn(eventId, registration.confirmationCode, userId);
        assert.equal(first.alreadyCheckedIn, false);
        assert.deepEqual(first.attendee, { firstName: 'Synthetic', lastName: 'Attendee' });
        const duplicate = await service.checkIn(eventId, registration.confirmationCode, userId);
        assert.equal(duplicate.alreadyCheckedIn, true);
        await assert.rejects(service.checkIn(otherEventId, registration.confirmationCode), NotFoundException);
        await assert.rejects(service.checkIn(otherEventId, registration.confirmationCode, userId), ForbiddenException);
        throw new Rollback();
      });
    } catch (error) { if (!(error instanceof Rollback)) throw error; }
  } finally { await prisma.$disconnect(); }
});
