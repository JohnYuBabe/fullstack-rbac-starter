import { PrismaClient } from '@prisma/client';
import {
  PERMISSION_LIST,
  ROLE_LABELS,
  ROLE_PRESETS,
  type RoleName,
} from '@rbac/shared';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

interface SeedAccount {
  role: RoleName;
  email: string;
  password: string;
  /**
   * 是否覆盖已有账号的密码。
   * 私有管理员置为 false：运维改过密码之后，再跑一次 seed 不应该把它重置回环境变量里的值。
   */
  updatePassword: boolean;
  /** 生产口令最小长度；文档对私有管理员承诺 16 位，这里必须一致 */
  minPasswordLength: number;
}

/** 仅本地/CI 使用的固定账号，保证 E2E 可重复。 */
const DEV_ACCOUNTS: ReadonlyArray<SeedAccount> = [
  {
    role: 'admin',
    email: 'admin@example.com',
    password: 'admin123',
    updatePassword: true,
    minPasswordLength: 8,
  },
  {
    role: 'editor',
    email: 'editor@example.com',
    password: 'editor123',
    updatePassword: true,
    minPasswordLength: 8,
  },
  {
    role: 'viewer',
    email: 'viewer@example.com',
    password: 'viewer123',
    updatePassword: true,
    minPasswordLength: 8,
  },
];

const PLACEHOLDER = /change[_-]?me|placeholder|your[_-]?password/i;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`生产 seed 缺少环境变量 ${name}`);
  }
  if (PLACEHOLDER.test(value)) {
    throw new Error(`${name} 仍是 .env.example 里的占位值，请改用随机口令`);
  }
  return value;
}

/**
 * 生产创建四个账号：
 * - 私有管理员（ADMIN_*）：密码不写入仓库、不进前端 bundle；
 * - 三个公开演示账号（DEMO_*）：口令会被 VITE_DEMO_* 打进前端 bundle，
 *   站点因此对所有人可写。演示库里的数据一律视为可丢弃。
 */
function resolveAccounts(isProduction: boolean): SeedAccount[] {
  if (!isProduction) {
    return [...DEV_ACCOUNTS];
  }

  const accounts: SeedAccount[] = [
    {
      role: 'admin',
      email: requireEnv('ADMIN_EMAIL'),
      password: requireEnv('ADMIN_PASSWORD'),
      updatePassword: false,
      minPasswordLength: 16,
    },
    {
      role: 'admin',
      email: requireEnv('DEMO_ADMIN_EMAIL'),
      password: requireEnv('DEMO_ADMIN_PASSWORD'),
      updatePassword: true,
      minPasswordLength: 12,
    },
    {
      role: 'editor',
      email: requireEnv('DEMO_EDITOR_EMAIL'),
      password: requireEnv('DEMO_EDITOR_PASSWORD'),
      updatePassword: true,
      minPasswordLength: 12,
    },
    {
      role: 'viewer',
      email: requireEnv('DEMO_VIEWER_EMAIL'),
      password: requireEnv('DEMO_VIEWER_PASSWORD'),
      updatePassword: true,
      minPasswordLength: 12,
    },
  ];

  // 邮箱重复时后面的账号会覆盖前面的角色/口令：私有管理员可能被 demo 账号顶掉。
  const emails = new Set(accounts.map((account) => account.email.toLowerCase()));
  if (emails.size !== accounts.length) {
    throw new Error('生产 seed 的四个账号邮箱必须互不相同');
  }

  for (const account of accounts) {
    if (account.password.length < account.minPasswordLength) {
      throw new Error(
        `${account.email} 的口令至少 ${account.minPasswordLength} 位`,
      );
    }
  }

  return accounts;
}

/** 示例文章用固定 id，重复 seed 走 upsert，不会累积副本。 */
const SAMPLE_ARTICLES = [
  {
    id: 'seed-article-permission-model',
    title: '权限为什么用「资源:动作」而不是罗列接口',
    content: [
      '接口会随版本增删，权限不应该跟着接口走。article:update 描述的是「能改文章」这件事，',
      '而 PATCH /api/articles/:id 只是它当下的一种实现方式。',
      '',
      '这样拆开还有一个直接好处：菜单、路由、按钮需要的都是「能不能做这件事」，',
      '而不是「能不能调这个接口」。前端因此可以判断 article:create 决定是否显示新建按钮，',
      '服务端用同一个字符串判断是否放行——两边共享同一个词汇表。',
    ].join('\n'),
  },
  {
    id: 'seed-article-role-preset',
    title: '角色是权限的预设组合，不是权限本身',
    content: [
      '角色表里只存名字和描述，真正决定能力的是它挂了哪些权限。',
      '管理员、编辑、访客三个预设写在 packages/shared 的 ROLE_PRESETS 里，',
      'server 的 seed 按它建库，web 的权限矩阵页面也按它渲染——不存在两份定义。',
      '',
      '改一个用户的角色时，实际上是重建了他的权限集合。',
      '因为鉴权在每个请求上回查数据库，角色变更在下一次请求就生效，不需要用户重新登录。',
    ].join('\n'),
  },
  {
    id: 'seed-article-audit',
    title: '审计日志要和业务写入放在同一个事务里',
    content: [
      '如果先改文章、再单独写审计记录，中间失败就会出现「改了但没留痕」。',
      '反过来的取舍同样明确：审计写不进去时，业务操作也应当失败。',
      '',
      'articles 与 audit_logs 的写入在同一个 $transaction 中提交。',
      '记录里的 actorEmail 和 roleNames 是快照，用户被删除或换角色后，',
      '历史记录仍然说明当时是谁、以什么身份完成的这次操作。',
    ].join('\n'),
  },
] as const;

async function main(): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    console.warn(
      '[seed] NODE_ENV 不是 production：本次写入的是本地开发账号（admin@example.com 等）。' +
        '生产环境请显式设置 NODE_ENV=production，否则会得到错误的账号集合。',
    );
  }
  const accounts = resolveAccounts(isProduction);

  // 1. 权限：从 PERMISSION_LIST 推导，不另写一份清单
  const permissionIds = new Map<string, string>();
  for (const key of PERMISSION_LIST) {
    const [resource, action] = key.split(':');
    const permission = await prisma.permission.upsert({
      where: { resource_action: { resource, action } },
      update: {},
      create: { resource, action },
    });
    permissionIds.set(key, permission.id);
  }

  // 2. 角色：权限集合每次整体重建，删掉预设里已经不存在的权限
  for (const roleName of Object.keys(ROLE_PRESETS) as RoleName[]) {
    const keys = ROLE_PRESETS[roleName];
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: { description: ROLE_LABELS[roleName] },
      create: { name: roleName, description: ROLE_LABELS[roleName] },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: keys.map((key) => ({
        roleId: role.id,
        permissionId: permissionIds.get(key) as string,
      })),
    });
  }

  // 3. 账号：角色同样整体重建，避免重复 seed 时 user_roles 累积
  for (const account of accounts) {
    const passwordHash = await hash(account.password, 10);
    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: account.updatePassword
        ? { name: ROLE_LABELS[account.role], passwordHash }
        : {},
      create: {
        email: account.email,
        name: ROLE_LABELS[account.role],
        passwordHash,
      },
    });

    const role = await prisma.role.findUniqueOrThrow({
      where: { name: account.role },
    });

    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id },
    });
  }

  // 4. 示例文章：固定 id + update: {} 保证幂等，也不覆盖演示者改过的内容
  const ownerEmail = isProduction
    ? requireEnv('ADMIN_EMAIL')
    : 'admin@example.com';
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: ownerEmail },
  });

  for (const article of SAMPLE_ARTICLES) {
    await prisma.article.upsert({
      where: { id: article.id },
      update: {},
      create: {
        id: article.id,
        title: article.title,
        content: article.content,
        authorId: owner.id,
      },
    });
  }

  // 日志里不打印口令：生产 seed 的输出会进容器日志
  if (isProduction) {
    console.log(
      `Seed complete: 私有管理员 ${ownerEmail}；公开演示账号 ${accounts
        .filter((account) => account.email !== ownerEmail)
        .map((account) => account.email)
        .join(', ')}。口令不写入日志。`,
    );
  } else {
    console.log(
      `Seed complete: ${DEV_ACCOUNTS.map(
        (account) => `${account.email} / ${account.password}`,
      ).join(', ')}`,
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
