import { ROLE_NAMES } from '@rbac/shared';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const ROLE_VALUES: string[] = [...ROLE_NAMES];

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: '姓名至少 2 个字符' })
  @MaxLength(40, { message: '姓名最多 40 个字符' })
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({ message: '至少选择一个角色' })
  @IsIn(ROLE_VALUES, { each: true, message: '角色只能是 admin / editor / viewer' })
  roles?: string[];
}
