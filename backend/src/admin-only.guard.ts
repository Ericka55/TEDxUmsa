import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AdminGuard, cookieToken } from './admin.guard';

@Injectable()
export class AdminOnlyGuard implements CanActivate {
  constructor(private readonly auth: AuthService, private readonly adminGuard: AdminGuard) {}
  async canActivate(context: ExecutionContext) {
    await this.adminGuard.canActivate(context);
    const request = context.switchToHttp().getRequest();
    const user = await this.auth.authenticate(cookieToken(request));
    if (user.role !== 'ADMIN') throw new ForbiddenException('Esta acción requiere rol ADMIN.');
    request.user = user;
    return true;
  }
}
