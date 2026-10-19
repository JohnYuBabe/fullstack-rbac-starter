import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuditLogEntry, AuthUser, Paginated } from '@rbac/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ListAuditQueryDto } from './dto/list-audit-query.dto';

export interface RecordAuditInput {
  actor: AuthUser;
  /** 形如 article.create / user.roles */
  action: string;
  resourceType: string;
  resourceId: string;
  summary: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 必须在业务写入的同一个事务里调用。
   *
   * 先改业务再单独写审计，中间失败就会出现「改了但没留痕」；放在同一事务里，
   * 审计写不进去则整个操作回滚——对一个留痕系统来说，这是更可接受的失败方向。
   */
  record(tx: Prisma.TransactionClient, input: RecordAuditInput) {
    return tx.auditLog.create({
      data: {
        actorId: input.actor.id,
        actorEmail: input.actor.email,
        // 角色快照：用户后来被改角色或删除，历史记录仍然说明当时的身份
        roleNames: [...input.actor.roles].sort().join(','),
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        summary: input.summary.slice(0, 500),
        ...(input.before === undefined
          ? {}
          : { before: input.before as Prisma.InputJsonValue }),
        ...(input.after === undefined
          ? {}
          : { after: input.after as Prisma.InputJsonValue }),
        ip: normalizeIp(input.ip),
      },
    });
  }

  async list(query: ListAuditQueryDto): Promise<Paginated<AuditLogEntry>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.AuditLogWhereInput = {};
    if (query.resourceType) {
      where.resourceType = query.resourceType;
    }
    if (query.action) {
      where.action = query.action;
    }
    if (query.actorEmail) {
      where.actorEmail = { contains: query.actorEmail };
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items: rows.map(toEntry), total, page, pageSize };
  }
}

/** Node 在双栈监听下会把 IPv4 报成 ::ffff:127.0.0.1，存库前还原成好读的形式。 */
function normalizeIp(ip?: string | null): string | null {
  if (!ip) {
    return null;
  }
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function toEntry(row: {  id: string;
  actorId: string | null;
  actorEmail: string;
  roleNames: string;
  action: string;
  resourceType: string;
  resourceId: string;
  summary: string;
  before: Prisma.JsonValue;
  after: Prisma.JsonValue;
  ip: string | null;
  createdAt: Date;
}): AuditLogEntry {
  return {
    id: row.id,
    actorId: row.actorId,
    actorEmail: row.actorEmail,
    roleNames: row.roleNames,
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    summary: row.summary,
    before: row.before,
    after: row.after,
    ip: row.ip,
    createdAt: row.createdAt.toISOString(),
  };
}
