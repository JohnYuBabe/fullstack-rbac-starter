import { SetMetadata } from '@nestjs/common';
import type { PermissionString } from '@rbac/shared';

export const PERMISSIONS_KEY = 'permissions';

/**
 * 声明访问该路由所需的权限，多个权限之间是「且」的关系。
 * PermissionsGuard 在全局守卫中读取并校验当前登录用户的权限集合。
 */
export const RequirePermission = (...permissions: PermissionString[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
