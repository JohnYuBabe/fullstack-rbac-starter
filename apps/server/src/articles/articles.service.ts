import { Injectable, NotFoundException } from '@nestjs/common';
import type { Article, AuthUser } from '@rbac/shared';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateArticleDto, UpdateArticleDto } from './dto/article.dto';

const articleSelect = {
  id: true,
  title: true,
  content: true,
  authorId: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { name: true } },
} as const;

type ArticleRow = {
  id: string;
  title: string;
  content: string;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
  author: { name: string };
};

function toDto(row: ArticleRow): Article {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    authorId: row.authorId,
    authorName: row.author.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class ArticlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<Article[]> {
    const rows = await this.prisma.article.findMany({
      select: articleSelect,
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(toDto);
  }

  async findOne(id: string): Promise<Article> {
    const row = await this.prisma.article.findUnique({
      where: { id },
      select: articleSelect,
    });
    if (!row) {
      throw new NotFoundException('文章不存在');
    }
    return toDto(row);
  }

  create(
    dto: CreateArticleDto,
    actor: AuthUser,
    ip?: string,
  ): Promise<Article> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.article.create({
        data: {
          title: dto.title,
          content: dto.content,
          authorId: actor.id,
        },
        select: articleSelect,
      });

      await this.audit.record(tx, {
        actor,
        action: 'article.create',
        resourceType: 'article',
        resourceId: row.id,
        summary: `新建文章《${row.title}》`,
        after: { title: row.title, content: row.content },
        ip,
      });

      return toDto(row);
    });
  }

  update(
    id: string,
    dto: UpdateArticleDto,
    actor: AuthUser,
    ip?: string,
  ): Promise<Article> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.article.findUnique({
        where: { id },
        select: articleSelect,
      });
      if (!existing) {
        throw new NotFoundException('文章不存在');
      }

      const row = await tx.article.update({
        where: { id },
        data: {
          ...(dto.title === undefined ? {} : { title: dto.title }),
          ...(dto.content === undefined ? {} : { content: dto.content }),
        },
        select: articleSelect,
      });

      await this.audit.record(tx, {
        actor,
        action: 'article.update',
        resourceType: 'article',
        resourceId: id,
        summary: `编辑文章《${row.title}》`,
        before: { title: existing.title, content: existing.content },
        after: { title: row.title, content: row.content },
        ip,
      });

      return toDto(row);
    });
  }

  async remove(id: string, actor: AuthUser, ip?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.article.findUnique({
        where: { id },
        select: articleSelect,
      });
      if (!existing) {
        throw new NotFoundException('文章不存在');
      }

      await tx.article.delete({ where: { id } });

      await this.audit.record(tx, {
        actor,
        action: 'article.delete',
        resourceType: 'article',
        resourceId: id,
        summary: `删除文章《${existing.title}》`,
        before: { title: existing.title, content: existing.content },
        ip,
      });
    });
  }
}
