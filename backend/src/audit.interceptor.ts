import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaClient) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    response.once('finish', () => {
      const user = request.user as { id?: string } | undefined;
      if (!user?.id || !['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)) return;
      const eventId = request.method === 'DELETE' ? null : request.params?.eventId;
      const rawEntityId = request.params?.eventId ?? request.params?.id ?? 'collection';
      const path = String(request.route?.path ?? request.path).slice(0, 180);
      void this.prisma.auditLog.create({ data: {
        userId: user.id,
        ...(eventId && /^[0-9a-f-]{36}$/i.test(eventId) ? { eventId } : {}),
        action: request.method.toLowerCase(), entity: path.slice(0, 100), entityId: String(rawEntityId).slice(0, 80),
        metadata: { statusCode: response.statusCode, result: response.statusCode < 400 ? 'success' : 'failure' },
      } }).catch(() => undefined);
    });
    return next.handle();
  }
}
