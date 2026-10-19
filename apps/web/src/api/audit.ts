import type { AuditLogEntry, Paginated } from '@rbac/shared';
import { api } from './client';

export interface AuditQuery {
  resourceType?: string;
  action?: string;
  actorEmail?: string;
  page?: number;
  pageSize?: number;
}

export async function listAuditLogs(
  query: AuditQuery = {},
): Promise<Paginated<AuditLogEntry>> {
  const { data } = await api.get<Paginated<AuditLogEntry>>('/audit-logs', {
    params: query,
  });
  return data;
}
