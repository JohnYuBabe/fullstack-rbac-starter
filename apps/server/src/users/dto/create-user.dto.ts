import { ROLE_NAMES } from '@rbac/shared';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const ROLE_VALUES: string[] = [...ROLE_NAMES];

export class CreateUserDto {
  @IsEmail({}, { message: '请输入有效的邮箱' })
  email!: string;

  @IsString()
  @MinLength(2, { message: '姓名至少 2 个字符' })
  @MaxLength(40, { message: '姓名最多 40 个字符' })
  name!: string;

  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  @MaxLength(72, { message: '密码最多 72 位' })
  password!: string;

  @IsArray()
  @ArrayNotEmpty({ message: '至少选择一个角色' })
  @IsIn(ROLE_VALUES, { each: true, message: '角色只能是 admin / editor / viewer' })
  roles!: string[];
}
