import { Controller, Get, Query } from '@nestjs/common';
import type { AuditLogEntry, Paginated } from '@rbac/shared';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AuditService } from './audit.service';
import { ListAuditQueryDto } from './dto/list-audit-query.dto';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermission('audit:read')
  list(@Query() query: ListAuditQueryDto): Promise<Paginated<AuditLogEntry>> {
    return this.audit.list(query);
  }
}
