import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ArticlesModule } from './articles/articles.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60_000,
          limit: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 120),
        },
      ],
      // 默认文案是 "ThrottlerException: Too Many Requests"，会原样显示在登录页
      errorMessage: '请求过于频繁，请稍后重试',
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ArticlesModule,
    AuditModule,
    HealthModule,
  ],
  providers: [
    // 限流最先执行，避免未认证请求消耗 JWT 与数据库查询
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // 顺序有意义：先解析 JWT 得到 request.user，再按权限放行
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
