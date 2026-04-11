import 'reflect-metadata';
import * as path from 'path';
import * as dotenv from 'dotenv';
// Load only app-specific .env to avoid root overrides on DATABASE_URL
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { NestFactory } from '@nestjs/core';
import { AppModule } from './modules/app.module';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';
import { ValidationPipe } from '@nestjs/common';
import { RequestLoggerInterceptor } from './common/interceptors/logger.interceptor';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from './security/token.util';
import { RealtimeEventsService } from './realtime/realtime.service';
import { ensureDefaultPricing } from './pricing/default-pricing-data';

function assertProductionSecurityConfig() {
  if (process.env.NODE_ENV !== 'production') return

  const authSecret = (process.env.AUTH_SECRET || '').trim()
  if (!authSecret) throw new Error('AUTH_SECRET is required in production')
  if (authSecret.length < 32) throw new Error('AUTH_SECRET must be at least 32 characters in production')

  const corsOrigins = (process.env.CORS_ORIGINS || '').trim()
  if (!corsOrigins) throw new Error('CORS_ORIGINS is required in production')
  if (corsOrigins === '*') throw new Error('CORS_ORIGINS cannot be * in production')
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      const hashed = await hashPassword(password);
      await prisma.user.create({
        data: { email, name: 'Admin', role: 'ADMIN', password: hashed, isActive: true },
      });
      console.log(`Admin user created: ${email}`);
    } else {
      const data: any = {}
      if (!existing.password) {
        data.password = await hashPassword(password)
      }
      if (existing.role !== 'ADMIN') {
        data.role = 'ADMIN'
      }
      if (!existing.isActive) {
        data.isActive = true
      }
      if (!existing.name || ['system admin', 'sistem yöneticisi'].includes(String(existing.name).trim().toLowerCase())) {
        data.name = 'Admin'
      }
      if (Object.keys(data).length > 0) {
        await prisma.user.update({ where: { email }, data })
        console.log(`Admin user normalized: ${email}`)
      }
    }
  } catch (e: any) {
    console.error('Admin seed error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

async function cleanupDevFallbackUser() {
  const prisma = new PrismaClient();
  try {
    await prisma.refreshToken.deleteMany({
      where: {
        user: {
          OR: [
            { id: 'dev-user' },
            { email: 'dev@example.com' },
          ],
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        OR: [
          { id: 'dev-user' },
          { email: 'dev@example.com' },
        ],
      },
    });
  } catch (e: any) {
    console.error('Dev fallback cleanup error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

async function bootstrap() {
  assertProductionSecurityConfig();
  await cleanupDevFallbackUser();
  await seedAdmin();
  const pricingPrisma = new PrismaClient();
  try {
    const pricingResult = await ensureDefaultPricing(pricingPrisma);
    if (pricingResult.created) {
      console.log('Default pricing data created');
    }
  } finally {
    await pricingPrisma.$disconnect();
  }
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });
  const expressJson = require('express').json({ limit: '10mb' });
  const expressUrlencoded = require('express').urlencoded({ extended: true, limit: '10mb' });
  app.use(expressJson);
  app.use(expressUrlencoded);
  if (process.env.NODE_ENV === 'production') {
    (app as any).set('trust proxy', 1);
  }
  const defaultOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000']
  const raw = (process.env.CORS_ORIGINS || '').trim()
  const corsOrigins = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : []
  // With credentials=true, wildcard '*' is invalid. Reflect request origin instead.
  const origin: any = raw === '*'
    ? true
    : (corsOrigins.length ? corsOrigins : defaultOrigins)
  const isProd = process.env.NODE_ENV === 'production'
  const allowedHeaders = ['Content-Type','Authorization','x-requested-with','accept','origin']
  if (!isProd) {
    allowedHeaders.push('x-user-id', 'x-user-email', 'x-user-role')
  }
  app.enableCors({
    origin,
    credentials: true,
    methods: ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'],
    allowedHeaders,
    exposedHeaders: ['x-request-id'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new GlobalHttpExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalInterceptors(new RequestLoggerInterceptor());
  const realtime = app.get(RealtimeEventsService);
  const buildRealtimeDelta = (req: any) => {
    const method = String(req?.method || '').toUpperCase()
    const rawPath = String(req?.originalUrl || req?.url || '')
    const normalizedPath = rawPath.split('?')[0]
    const taskMatch = normalizedPath.match(/\/api\/tasks\/([^/]+)/)
    if (taskMatch) {
      return {
        type: method === 'DELETE' ? 'TASK_DELETED' : 'TASK_UPDATED',
        taskId: taskMatch[1],
        method,
        path: rawPath,
      }
    }

    const accountMatch = normalizedPath.match(/\/api\/accounts\/([^/]+)/)
    if (accountMatch) {
      return {
        type: method === 'DELETE' ? 'ACCOUNT_DELETED' : 'ACCOUNT_UPDATED',
        accountId: accountMatch[1],
        method,
        path: rawPath,
      }
    }

    if (normalizedPath.startsWith('/api/users')) return { type: 'USERS_CHANGED', method, path: rawPath }
    if (normalizedPath.startsWith('/api/projects')) return { type: 'PROJECTS_CHANGED', method, path: rawPath }
    if (normalizedPath.startsWith('/api/notifications')) return { type: 'NOTIFICATIONS_CHANGED', method, path: rawPath }
    if (normalizedPath.startsWith('/api/pricing')) return { type: 'PRICING_CHANGED', method, path: rawPath }
    if (normalizedPath.startsWith('/api/lov/categories')) return { type: 'CATEGORIES_CHANGED', method, path: rawPath }

    return {
      type: 'invalidate',
      method,
      path: rawPath,
    }
  }
  app.use((req: any, res: any, next: any) => {
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
      realtime.publish({
        ...buildRealtimeDelta(req),
        userId: req?.user?.id || null,
        ts: Date.now(),
      });
    });
    next();
  });

  // Swagger/OpenAPI — only in development
  if (process.env.NODE_ENV !== 'production') {
    const port = process.env.PORT ? Number(process.env.PORT) : 3001
    const config = new DocumentBuilder()
      .setTitle('Grupanya Task Management API')
      .setDescription('Internal API for Leads, Accounts, Tasks, Reports')
      .setVersion('0.1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Reserved for future real auth' }, 'bearer')
      .addServer(`http://localhost:${port}/api`)
      .build();
    const document = SwaggerModule.createDocument(app as any, config);
    SwaggerModule.setup('api/docs', app as any, document);
  }
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3001);
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${process.env.PORT ?? 3001}`);
}

bootstrap();
