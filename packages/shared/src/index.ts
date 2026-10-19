import type { PermissionString } from './permissions';

export * from './permissions';

/** 登录后由服务端下发的当前用户；每次请求都按数据库重建，不是 JWT 里的快照。 */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: PermissionString[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}

export interface Article {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: PermissionString[];
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorEmail: string;
  roleNames: string;
  action: string;
  resourceType: string;
  resourceId: string;
  summary: string;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
