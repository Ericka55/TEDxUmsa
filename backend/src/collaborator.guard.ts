import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AuthService } from './auth.service';
import { assertSameOrigin, cookieToken } from './admin.guard';

@Injectable()
export class CollaboratorGuard implements CanActivate {
  constructor(private readonly auth: AuthService, private readonly prisma: PrismaClient) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    assertSameOrigin(request);
    const user = await this.auth.authenticate(cookieToken(request));
    if (user.role !== 'COLLABORATOR') throw new ForbiddenException('Esta acción requiere rol COLLABORATOR.');
    request.collaboratorId = user.id;
    request.user = user;
    return true;
  }
}
