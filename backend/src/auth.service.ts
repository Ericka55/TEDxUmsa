import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma, PrismaClient, UserRole } from '@prisma/client';
import { createHash, createHmac, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

function encode(value: string) { return Buffer.from(value).toString('base64url'); }
const cookieName = 'tedxumsa_session';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaClient) {}

  async login(email: string, password: string) {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) throw new UnauthorizedException('El servidor no tiene un JWT_SECRET válido configurado.');
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user || !user.active || !this.verifyPassword(password, user.passwordHash)) throw new UnauthorizedException('Correo o contraseña incorrectos.');
    const now = Math.floor(Date.now() / 1000);
    const id = randomUUID();
    const header = encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = encode(JSON.stringify({ iss: 'tedxumsa-api', aud: 'tedxumsa-web', sub: user.id, role: user.role, jti: id, iat: now, exp: now + 28800 }));
    const input = `${header}.${payload}`;
    const token = `${input}.${createHmac('sha256', secret).update(input).digest('base64url')}`;
    const expiresAt = new Date((now + 28800) * 1000);
    await this.prisma.$executeRaw(Prisma.sql`INSERT INTO "AuthSession" ("id", "tokenHash", "userId", "expiresAt") VALUES (${id}::uuid, ${createHash('sha256').update(token).digest('hex')}, ${user.id}::uuid, ${expiresAt})`);
    return { token, user: { id: user.id, email: user.email, role: user.role }, expiresAt };
  }

  verify(token: string): { id: string; role: UserRole; jti: string } | null {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) return null;
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some((part) => !part)) return null;
    try {
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      if (header.alg !== 'HS256' || header.typ !== 'JWT' || payload.iss !== 'tedxumsa-api' || payload.aud !== 'tedxumsa-web'
        || typeof payload.sub !== 'string' || typeof payload.jti !== 'string' || !['ADMIN', 'ORGANIZER', 'COLLABORATOR'].includes(payload.role)
        || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000) || payload.iat > Math.floor(Date.now() / 1000) + 30) return null;
      const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
      const actual = Buffer.from(parts[2], 'base64url');
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
      return { id: payload.sub, role: payload.role, jti: payload.jti };
    } catch { return null; }
  }

  async authenticate(token: string) {
    const claims = this.verify(token);
    if (!claims) throw new UnauthorizedException('Inicia sesión nuevamente.');
    const sessions = await this.prisma.$queryRaw<Array<{ tokenHash: string; userId: string; expiresAt: Date; revokedAt: Date | null }>>(Prisma.sql`SELECT "tokenHash", "userId", "expiresAt", "revokedAt" FROM "AuthSession" WHERE "id" = ${claims.jti}::uuid LIMIT 1`);
    const session = sessions[0];
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const user = await this.prisma.user.findUnique({ where: { id: claims.id }, select: { id: true, email: true, role: true, active: true } });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.userId !== claims.id || session.tokenHash !== tokenHash
      || !user?.active || user.role !== claims.role) throw new UnauthorizedException('La sesión no es válida o expiró.');
    return user;
  }

  async logout(token: string) {
    const claims = this.verify(token);
    if (claims) await this.prisma.$executeRaw(Prisma.sql`UPDATE "AuthSession" SET "revokedAt" = CURRENT_TIMESTAMP WHERE "id" = ${claims.jti}::uuid AND "userId" = ${claims.id}::uuid AND "revokedAt" IS NULL`);
  }

  static readonly cookieName = cookieName;
  static cookieOptions() {
    const secure = process.env.NODE_ENV === 'production';
    const sameSite = (process.env.AUTH_COOKIE_SAME_SITE ?? 'lax').toLowerCase();
    return `Path=/api; HttpOnly; SameSite=${sameSite === 'none' ? 'None' : sameSite === 'strict' ? 'Strict' : 'Lax'}; Max-Age=28800${secure ? '; Secure' : ''}`;
  }
  static clearCookieOptions() { return `Path=/api; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`; }

  private verifyPassword(password: string, encodedHash: string) {
    const [algorithm, workFactor, blockSize, parallelism, salt, savedHash] = encodedHash.split('$');
    if (algorithm !== 'scrypt' || !salt || !savedHash) return false;
    try {
      const actual = scryptSync(password, Buffer.from(salt, 'hex'), 64, { N: Number(workFactor), r: Number(blockSize), p: Number(parallelism), maxmem: 64 * 1024 * 1024 });
      const expected = Buffer.from(savedHash, 'hex');
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    } catch { return false; }
  }
}
