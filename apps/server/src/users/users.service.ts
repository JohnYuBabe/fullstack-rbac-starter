import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AdminUser, AuthUser, PermissionString } from '@rbac/shared';
import { hash } from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const userInclude = {
  roles: {
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  },
} as const;

type UserWithRoles = {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  roles: Array<{
    role: {
      name: string;
      permissions: Array<{
        permission: {
          resource: string;
          action: string;
        };
      }>;
    };
  }>;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------- 认证侧 ----------

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: userInclude,
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: userInclude,
    });
  }

  toAuthUser(user: UserWithRoles): AuthUser {
    const roles = user.roles.map((userRole) => userRole.role.name).sort();

    const permissions = Array.from(
      new Set(
        user.roles.flatMap((userRole) =>
          userRole.role.permissions.map(
            (rolePermission) =>
              `${rolePermission.permission.resource}:${rolePermission.permission.action}`,
          ),
        ),
      ),
    ).sort() as PermissionString[];

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roles,
      permissions,
    };
  }

  // ---------- 管理侧 ----------

  async list(): Promise<AdminUser[]> {
    const users = await this.prisma.user.findMany({
      include: userInclude,
      orderBy: { createdAt: 'asc' },
    });

    return users.map((user) => this.toAdminUser(user));
  }

  async create(
    dto: CreateUserDto,
    actor: AuthUser,
    ip?: string,
  ): Promise<AdminUser> {
    const email = dto.email.toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('该邮箱已被使用');
    }

    const roles = await this.resolveRoles(dto.roles);
    const passwordHash = await hash(dto.password, 10);

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name: dto.name,
          passwordHash,
          roles: { create: roles.map((role) => ({ roleId: role.id })) },
        },
        include: userInclude,
      });

      await this.audit.record(tx, {
        actor,
        action: 'user.create',
        resourceType: 'user',
        resourceId: user.id,
        summary: `新建用户 ${user.email}（${dto.roles.join(', ')}）`,
        after: { email: user.email, name: user.name, roles: dto.roles },
        ip,
      });

      return user;
    });

    return this.toAdminUser(created);
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actor: AuthUser,
    ip?: string,
  ): Promise<AdminUser> {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      include: userInclude,
    });
    if (!existing) {
      throw new NotFoundException('用户不存在');
    }

    const before = {
      name: existing.name,
      roles: existing.roles.map((userRole) => userRole.role.name).sort(),
    };

    // 把自己从管理员改成普通角色，会让当前会话立刻失去管理入口；
    // 单管理员部署下这一步等于把自己锁在门外。
    if (
      id === actor.id &&
      dto.roles !== undefined &&
      !dto.roles.includes('admin')
    ) {
      throw new BadRequestException('不能移除自己的管理员角色');
    }

    const roles = dto.roles ? await this.resolveRoles(dto.roles) : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (roles) {
        // 管理员数量检查必须在事务内、且覆盖「改角色」这条路径：
        // 只靠 update 外的那次判断，把最后一个管理员降级不会被拦。
        const wasAdmin = existing.roles.some(
          (userRole) => userRole.role.name === 'admin',
        );
        const willBeAdmin = roles.some((role) => role.name === 'admin');

        if (wasAdmin && !willBeAdmin) {
          const remainingAdmins = await tx.userRole.count({
            where: { role: { name: 'admin' }, userId: { not: id } },
          });
          if (remainingAdmins === 0) {
            throw new BadRequestException('至少保留一个管理员账号');
          }
        }

        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({
          data: roles.map((role) => ({ userId: id, roleId: role.id })),
        });
      }

      if (dto.name !== undefined) {
        await tx.user.update({ where: { id }, data: { name: dto.name } });
      }

      const user = await tx.user.findUniqueOrThrow({
        where: { id },
        include: userInclude,
      });

      const after = {
        name: user.name,
        roles: user.roles.map((userRole) => userRole.role.name).sort(),
      };

      if (before.name !== after.name || before.roles.join() !== after.roles.join()) {
        await this.audit.record(tx, {
          actor,
          action: 'user.update',
          resourceType: 'user',
          resourceId: id,
          summary: `修改用户 ${user.email}`,
          before,
          after,
          ip,
        });
      }

      return user;
    });

    return this.toAdminUser(updated);
  }

  async remove(id: string, actor: AuthUser, ip?: string): Promise<void> {
    if (id === actor.id) {
      throw new BadRequestException('不能删除当前登录的账号');
    }

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { id },
        include: userInclude,
      });
      if (!existing) {
        throw new NotFoundException('用户不存在');
      }

      const roles = existing.roles.map((userRole) => userRole.role.name);
      if (roles.includes('admin')) {
        const remainingAdmins = await tx.userRole.count({
          where: { role: { name: 'admin' }, userId: { not: id } },
        });
        if (remainingAdmins === 0) {
          throw new BadRequestException('至少保留一个管理员账号');
        }
      }

      // 文章保留作者外键（Restrict）：删人不顺带删文章，也不把作者置空。
      // 否则要么静默丢掉内容，要么让"文章有作者"这个约束变成可空——两种都比报错更难追。
      // 计数放在事务里，缩小「检查后到删除前有人插入文章」的窗口。
      const articleCount = await tx.article.count({
        where: { authorId: id },
      });
      if (articleCount > 0) {
        throw new ConflictException(
          `该用户名下还有 ${articleCount} 篇文章，请先删除这些文章再删除账号`,
        );
      }

      // user_roles 级联删除；audit_logs 的 actorId 置空，记录本身保留
      await tx.user.delete({ where: { id } });

      await this.audit.record(tx, {
        actor,
        action: 'user.delete',
        resourceType: 'user',
        resourceId: id,
        summary: `删除用户 ${existing.email}`,
        before: { email: existing.email, name: existing.name, roles },
        ip,
      });
    });
  }

  private async resolveRoles(names: readonly string[]) {
    const unique = Array.from(new Set(names));
    const roles = await this.prisma.role.findMany({
      where: { name: { in: unique } },
    });

    if (roles.length !== unique.length) {
      throw new BadRequestException('包含不存在的角色');
    }

    return roles;
  }

  private toAdminUser(user: UserWithRoles): AdminUser {
    const auth = this.toAuthUser(user);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: auth.roles,
      permissions: auth.permissions,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
