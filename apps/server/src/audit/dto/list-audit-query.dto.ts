import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListAuditQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  resourceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  actorEmail?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
