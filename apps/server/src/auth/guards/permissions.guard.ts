import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasAllPermissions, type AuthUser, type PermissionString } from '@rbac/shared';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionString[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 未声明权限要求的路由只要求登录（由 JwtAuthGuard 负责）
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();

    // 与前端 v-permission 共用同一个判断函数，避免两边语义漂移
    if (hasAllPermissions(request.user?.permissions ?? [], required)) {
      return true;
    }

    throw new ForbiddenException('没有权限执行该操作');
  }
}
