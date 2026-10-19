import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type { Article, AuthUser } from '@rbac/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ArticlesService } from './articles.service';
import { CreateArticleDto, UpdateArticleDto } from './dto/article.dto';

@Controller('articles')
export class ArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  @Get()
  @RequirePermission('article:read')
  list(): Promise<Article[]> {
    return this.articles.list();
  }

  @Get(':id')
  @RequirePermission('article:read')
  findOne(@Param('id') id: string): Promise<Article> {
    return this.articles.findOne(id);
  }

  @Post()
  @RequirePermission('article:create')
  create(
    @Body() dto: CreateArticleDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ): Promise<Article> {
    return this.articles.create(dto, actor, ip);
  }

  @Patch(':id')
  @RequirePermission('article:update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ): Promise<Article> {
    return this.articles.update(id, dto, actor, ip);
  }

  @Delete(':id')
  @RequirePermission('article:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ): Promise<void> {
    return this.articles.remove(id, actor, ip);
  }
}
