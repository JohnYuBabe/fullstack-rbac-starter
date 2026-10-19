import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateArticleDto {
  @IsString()
  @MinLength(2, { message: '标题至少 2 个字符' })
  @MaxLength(120, { message: '标题最多 120 个字符' })
  title!: string;

  @IsString()
  @MinLength(1, { message: '正文不能为空' })
  @MaxLength(20000, { message: '正文最多 20000 个字符' })
  content!: string;
}

export class UpdateArticleDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: '标题至少 2 个字符' })
  @MaxLength(120, { message: '标题最多 120 个字符' })
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: '正文不能为空' })
  @MaxLength(20000, { message: '正文最多 20000 个字符' })
  content?: string;
}
