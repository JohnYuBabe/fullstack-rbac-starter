import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * 标记无需登录即可访问的路由。
 * JwtAuthGuard 在全局守卫中读取该元数据，命中时直接放行。
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
