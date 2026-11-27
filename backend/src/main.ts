import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PrismaClient } from '@prisma/client';
import { AppModule } from './app.module';
import { AuditInterceptor } from './audit.interceptor';

config({ path: resolve(process.cwd(), '../.env') });

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.useBodyParser('json', { limit: '8mb' });
  app.useStaticAssets(resolve(process.cwd(), 'uploads'), { prefix: '/uploads/' });
  app.setGlobalPrefix('api');
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 0));
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type'] });
  app.use((_request: any, response: any, next: () => void) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  // Per-process limiter for local/single-instance use. Multi-instance deployment also needs an edge/shared limiter.
  const buckets = new Map<string, { count: number; resetAt: number }>();
  app.use((request: any, response: any, next: () => void) => {
    const path = request.path ?? '';
    const method = request.method;
    const login = method === 'POST' && path.endsWith('/auth/login');
    const registration = method === 'POST' && /\/events\/[^/]+\/registrations$/.test(path);
    const survey = /\/events\/satisfaction\/[^/]+$/.test(path) && ['GET', 'POST'].includes(method);
    const limit = login ? 8 : registration ? 12 : survey ? 12 : 0;
    if (!limit) return next();
    const now = Date.now();
    const duration = login ? 15 * 60_000 : 60_000;
    const ip = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    const key = `${login ? 'login' : registration ? 'registration' : 'survey'}:${ip}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) { bucket = { count: 0, resetAt: now + duration }; buckets.set(key, bucket); }
    bucket.count += 1;
    if (buckets.size > 10000) for (const [bucketKey, value] of buckets) if (value.resetAt <= now) buckets.delete(bucketKey);
    if (bucket.count > limit) {
      response.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return response.status(429).json({ statusCode: 429, message: 'Demasiadas solicitudes. Intenta nuevamente más tarde.' });
    }
    next();
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder().setTitle('TEDxUMSA Eventos API')
      .setDescription('API de gestión de eventos y registro de asistentes').setVersion('1.0')
      .addCookieAuth('tedxumsa_session', { type: 'apiKey', in: 'cookie' }).build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }
  app.useGlobalInterceptors(new AuditInterceptor(app.get(PrismaClient)));
  await app.listen(Number(process.env.API_PORT ?? 3001));
}

void bootstrap();
