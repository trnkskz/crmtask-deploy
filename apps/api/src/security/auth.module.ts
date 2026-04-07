import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { RolesGuard } from './roles.guard'
import { DevUserMiddleware } from './dev-user.middleware'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { PermissionsGuard } from './permissions.guard'
import { PrismaService } from '../infrastructure/prisma/prisma.service'

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector) => new RolesGuard(reflector),
      inject: [Reflector],
    },
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector, prisma: PrismaService) => new PermissionsGuard(reflector, prisma),
      inject: [Reflector, PrismaService],
    },
    AuthService,
    PrismaService,
  ],
  controllers: [AuthController],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Development-only middleware to simulate authenticated users.
    consumer.apply(DevUserMiddleware).forRoutes('*')
  }
}
