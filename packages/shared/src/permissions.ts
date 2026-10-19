/**
 * 权限的唯一来源。
 *
 * 权限串形如 `资源:动作`。`PERMISSION_LIST` 同时决定：
 * 1. TypeScript 里的 `PermissionString`（由它推导，不是手写的字符串联合）；
 * 2. 数据库 `permissions` 表（seed 逐条 upsert）；
 * 3. 前端菜单、路由与按钮的可用性。
 *
 * 角色预设用 `satisfies` 约束到 `PermissionString`，写错一个动作名会直接编译失败——
 * 否则要等到 seed 运行期才发现角色里挂了一个不存在的权限。
 */
export const PERMISSION_LIST = [
  'article:read',
  'article:create',
  'article:update',
  'article:delete',
  'user:manage',
  'audit:read',
] as const;

export type PermissionString = (typeof PERMISSION_LIST)[number];

export const PERMISSION_LABELS: Record<PermissionString, string> = {
  'article:read': '查看文章',
  'article:create': '新建文章',
  'article:update': '编辑文章',
  'article:delete': '删除文章',
  'user:manage': '管理用户',
  'audit:read': '查看审计日志',
};

export const ROLE_NAMES = ['admin', 'editor', 'viewer'] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

export const ROLE_LABELS: Record<RoleName, string> = {
  admin: '管理员',
  editor: '编辑',
  viewer: '访客',
};

export const ROLE_PRESETS = {
  admin: PERMISSION_LIST,
  editor: ['article:read', 'article:create', 'article:update'],
  viewer: ['article:read'],
} as const satisfies Record<RoleName, readonly PermissionString[]>;

/**
 * 多权限之间是「且」。
 *
 * 后端 PermissionsGuard 与前端 v-permission 指令都调用这一个函数：
 * 两边各写一份判断，迟早会出现「按钮能点但接口 403」或「有权限却不显示按钮」的漂移。
 */
export function hasAllPermissions(
  granted: readonly string[],
  required: readonly string[],
): boolean {
  return required.every((permission) => granted.includes(permission));
}
