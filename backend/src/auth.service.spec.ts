import { strict as assert } from 'node:assert';
import { after, before, test } from 'node:test';
import { createHmac } from 'node:crypto';
import { AuthService } from './auth.service';
import { AdminGuard } from './admin.guard';
import { UnauthorizedException } from '@nestjs/common';

const secret = 'unit-test-secret-that-is-long-enough-for-hmac';
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
function token(claims: Record<string, unknown>, header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' }) {
  const unsigned = `${encode(header)}.${encode(claims)}`;
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
}

before(() => { process.env.JWT_SECRET = secret; });
after(() => { delete process.env.JWT_SECRET; });

test('JWT accepts a valid signature and required claims, rejects modified/expired/wrong-audience tokens', () => {
  const service = new AuthService({} as any);
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: 'tedxumsa-api', aud: 'tedxumsa-web', sub: 'user-id', role: 'ADMIN', jti: 'session-id', iat: now, exp: now + 60 };
  const valid = token(claims);
  assert.equal(service.verify(valid)?.id, 'user-id');
  const changedSignature = valid.split('.');
  changedSignature[2] = `${changedSignature[2][0] === 'A' ? 'B' : 'A'}${changedSignature[2].slice(1)}`;
  assert.equal(service.verify(changedSignature.join('.')), null);
  assert.equal(service.verify(token({ ...claims, exp: now - 1 })), null);
  assert.equal(service.verify(token({ ...claims, aud: 'other' })), null);
  assert.equal(service.verify(token(claims, { alg: 'none', typ: 'JWT' })), null);
});

function guardContext(request: any) {
  return { switchToHttp: () => ({ getRequest: () => request }) } as any;
}

test('admin guard returns 401 without a valid identity and 403 for a cross-event ORGANIZER request', async () => {
  const unauthenticated = new AdminGuard({ authenticate: async () => { throw new UnauthorizedException(); } } as any, {} as any);
  await assert.rejects(unauthenticated.canActivate(guardContext({ headers: {}, params: {} })), { status: 401 });

  const organizerGuard = new AdminGuard(
    { authenticate: async () => ({ id: 'organizer-id', email: 'org@example.test', role: 'ORGANIZER', active: true }) } as any,
    { eventCollaborator: { findUnique: async () => null } } as any,
  );
  await assert.rejects(organizerGuard.canActivate(guardContext({ headers: {}, params: { eventId: 'another-event' } })), { status: 403 });
});

test('ADMIN may reach the same assigned-event guard without event assignment', async () => {
  const adminGuard = new AdminGuard(
    { authenticate: async () => ({ id: 'admin-id', email: 'admin@example.test', role: 'ADMIN', active: true }) } as any,
    {} as any,
  );
  assert.equal(await adminGuard.canActivate(guardContext({ headers: {}, params: { eventId: 'event-id' } })), true);
});
