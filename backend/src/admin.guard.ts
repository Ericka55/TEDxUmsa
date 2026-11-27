import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AuthService } from './auth.service';

export function cookieToken(request: any): string {
  const raw = String(request.headers.cookie ?? '');
  const name = `${AuthService.cookieName}=`;
  const value = raw.split(';').map((part: string) => part.trim()).find((part: string) => part.startsWith(name));
  return value ? decodeURIComponent(value.slice(name.length)) : '';
}
export function assertSameOrigin(request: any) {
  const origin = request.headers.origin;
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method) && !origin) throw new ForbiddenException('La solicitud debe incluir un origen web válido.');
  if (origin && origin !== (process.env.WEB_ORIGIN ?? 'http://localhost:3000')) throw new ForbiddenException('Origen de solicitud no permitido.');
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: AuthService, private readonly prisma: PrismaClient) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    assertSameOrigin(request);
    const user = await this.auth.authenticate(cookieToken(request));
    if (!['ADMIN', 'ORGANIZER'].includes(user.role)) throw new ForbiddenException('Tu rol no tiene acceso al panel administrativo.');
    const eventId = request.params?.eventId;
    if (user.role === 'ORGANIZER' && eventId) {
      const assigned = await this.prisma.eventCollaborator.findUnique({ where: { eventId_userId: { eventId, userId: user.id } }, select: { userId: true } });
      if (!assigned) throw new ForbiddenException('No tienes acceso a este evento.');
    }
    if (user.role === 'ORGANIZER' && !eventId && request.path?.endsWith('/admin')) {
      // The list endpoint is deliberately filtered by assignment in the service.
    }
    request.user = user;
    return true;
  }
}
