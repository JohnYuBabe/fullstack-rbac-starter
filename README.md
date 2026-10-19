# fullstack-rbac-starter

一个可以直接起项目用的权限脚手架：**权限串只定义一次**，菜单、路由、按钮、接口判定四处用同一份数据。

- 权限用 `资源:动作` 表示（`article:update`、`user:manage`），不是接口路径列表。
- 角色只是权限的预设组合。改角色 = 重建用户的权限集合。
- 鉴权在每个请求上回查数据库，**改角色在下一次请求生效**，不写 JWT 快照，不用重新登录。
- 前端只负责隐藏；绕过界面直接调接口，服务端照样返回 403。
- 写操作与审计记录在同一个事务里提交，记录操作人、当时角色、对象与前后值。

技术栈：Vue 3 + TypeScript + Vite + Element Plus + Pinia ｜ NestJS + Prisma ｜ MySQL 8 ｜ Docker Compose + Nginx。

## 权限模型

```
PERMISSION_LIST (packages/shared/src/permissions.ts)
        │
        ├─→ PermissionString 类型           编译期：写错动作名直接报错
        ├─→ ROLE_PRESETS → seed 建库         运行期：roles / permissions / role_permissions
        ├─→ 后端 PermissionsGuard            请求期：every()，多权限为「且」
        └─→ 前端菜单 / 路由 / v-permission   渲染期：同一个 hasAllPermissions 函数
```

六个权限、三个角色：

| 权限 | admin | editor | viewer |
| --- | :---: | :---: | :---: |
| `article:read` | ✓ | ✓ | ✓ |
| `article:create` | ✓ | ✓ | |
| `article:update` | ✓ | ✓ | |
| `article:delete` | ✓ | | |
| `user:manage` | ✓ | | |
| `audit:read` | ✓ | | |

角色预设在代码里是 `as const satisfies Record<RoleName, readonly PermissionString[]>`：
写了一个 `PERMISSION_LIST` 里不存在的权限，`tsc` 直接失败，不会等到 seed 运行期才炸。

## 三级控制

| 层级 | 位置 | 做法 | 少了它会怎样 |
| --- | --- | --- | --- |
| 菜单 | `layouts/AppLayout.vue` | `v-if="auth.hasPermission('user:manage')"` | 访客看到点不动的入口 |
| 路由 | `router/index.ts` | `meta.permission` + 全局守卫落到 403 | 直接输地址能进页面，接口再报错 |
| 按钮 | 各页面 | `v-if="auth.hasPermission(...)"`（现有页面）；也可用已注册的 `v-permission` | 能点但有权限的人才会成功 |

三处都**不是**判定方。真正的判定在 `PermissionsGuard`：完整权限集合来自数据库，
请求带什么角色不重要，`required.every(p => granted.has(p))` 通过才放行。

## 本地启动

需要 Node.js 20+ 与 pnpm 8（`corepack enable` 会按根 `package.json` 的 `packageManager` 启用），
以及 Docker（只用于起 MySQL）。

```bash
cp .env.example .env        # 按注释替换 CHANGE_ME_*
pnpm install
pnpm --filter @rbac/shared build   # seed / server 都从 dist 引用它，必须先构建
pnpm db:up                  # MySQL 8，映射到 127.0.0.1:3309
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- Web：http://localhost:5174
- API：http://localhost:3020/api

`pnpm db:migrate` 走的是 `prisma migrate dev`，需要临时创建 shadow database。compose 里的
`rbac` 用户只有单库权限，若报 `P3014`，改用 root 连接执行一次，或直接
`pnpm --filter @rbac/server prisma:deploy` 应用仓库里已有的迁移。

本地开发时，Nest 的 `ConfigModule` 与 Vite 都读根目录的 `.env`（`VITE_BASE=/`、
`VITE_API_BASE=/api`）。部署到 `/rbac/` 时换一份 `.env.deploy`，由
`deploy/build-web.sh --env .env.deploy` 在构建期注入前缀与演示账号；它只给构建用，
不参与后端启动。两份文件都不进仓库。

| 账号 | 密码 | 角色 |
| --- | --- | --- |
| admin@example.com | admin123 | 管理员：6 项权限 |
| editor@example.com | editor123 | 编辑：读写文章，不能管用户 |
| viewer@example.com | viewer123 | 访客：只能看文章 |

> 这三个账号只在 `NODE_ENV !== production` 时创建。生产 seed 用的是 `ADMIN_*` 与三个 `DEMO_*` 账号。

## 目录

```
packages/shared/       权限常量、角色预设、前后端共用的 hasAllPermissions
apps/server/src/
  auth/                登录、JWT 策略、两个全局守卫、@RequirePermission
  users/               用户与角色管理（user:manage）
  articles/            文章 CRUD（article:read / create / update / delete）
  audit/               审计写入与查询（audit:read）
  config/              启动时的密钥强度校验等
  health/              健康检查（含数据库连通性）
  prisma/              PrismaService 与模块
apps/web/src/
  api/                 axios 实例与各资源请求
  stores/              auth store：token、用户、权限判定入口
  router/              路由守卫：meta.permission
  layouts/             菜单按权限渲染
  directives/          v-permission（非破坏性隐藏，用户信息到达后会自动恢复）
  views/               概览 / 文章 / 用户 / 审计 / 403
```

## 几个刻意的取舍

**为什么每个请求都查库重建权限。**
把 permissions 写进 JWT 会少一次查询，但改角色要等 token 过期、删号后 token 仍然有效。
这里选了「下一次请求就生效」，代价是每请求一次带 join 的查询——本项目的量级完全承受得起。
E2E 里有一条用例专门锁这个行为：同一个 token，改完角色后立刻能写。

**为什么审计与业务在同一个事务。**
先改业务再写审计，中间失败就会「改了但没留痕」。放在同一事务里，审计写不进去则整体回滚。
`actorEmail` 与 `roleNames` 存的是快照，用户被改角色或删除后，历史记录仍然说明当时是谁、以什么身份做的。

**为什么 `v-permission` 用 `display` 而不是 `removeChild`。**
`removeChild` 不可逆。用户信息是异步拉取的，如果指令先执行，元素被删掉就再也不回来，
表现为「刷新一次按钮才出现」。现在改成隐藏 + 监听 auth store，用户信息到达后自动恢复。

## 测试

```bash
pnpm --filter @rbac/server test      # 单测：密钥强度、权限「且」语义、角色预设一致性
pnpm --filter @rbac/server test:e2e  # 需要先 db:migrate + db:seed
```

E2E 走真实 HTTP（随机端口 + fetch），覆盖：无 token 401、viewer 写 403、editor 不能管用户、
改角色下一次请求生效、审计记录含前后值、不能删除自己、名下有文章的用户删不掉（409）。

## 部署

见 [`deploy/README.md`](deploy/README.md)。要点：

- 端口 `3020`（宿主回环）/ MySQL `3309` / 卷 `rbac-mysql-data`，专为与同机其它项目共存而错开。
- 前端 token key 是 `vibe_rbac_token`；同域多站点共用 `localStorage` 时不会互相踢下线。
- `/rbac/` 的 nginx location 必须**合并**进现有站点配置，不能整份覆盖。
- 前端用 `deploy/build-web.sh --env .env.deploy` 构建：子路径前缀与演示账号是构建期注入的，
  变量落在一个显式文件里，换台机器也能构建出同一份产物。
- 片段用 `deploy/apply-nginx.py` 合并：只在唯一匹配的 443 server 块里插入，写完跑
  `nginx -t`、reload、探活，失败自动还原。`assets` 与 `api` 使用 `^~`，否则会被面板默认的
  `\.(js|css)$` 正则 location 截走，表现为白屏。

## 已知限制

- 单工作区：没有按部门或资源的对象级授权，有 `article:read` 就能看到全部文章。
- 分享给公开演示站时，三个 demo 账号的口令会被打进前端 bundle。其中 `DEMO_ADMIN` 拥有完整管理员权限，
  任何人都能用它改角色、删用户、删文章——不只是「可写」。演示库一律视为可丢弃，不要放真实数据，
  也不要复用任何真实账号。
- 审计只覆盖文章与用户的写操作，不含登录与读取。
- 角色是全局的，不支持「用户 A 在项目 1 是编辑、在项目 2 是访客」。
- 服务端生产镜像沿用同一套依赖（含 `tsc`、`jest` 等 devDependencies），镜像体积偏大。
  瘦身需要改成 `pnpm install --prod` 并把 `prisma`、`tsx` 移入 dependencies（entrypoint 需要它们）。
- 删除用户前要先删掉他名下的文章：作者外键是 `Restrict`，服务端返回 409 并报出剩余篇数。
  不做级联删除，也不把作者置空——前者会静默丢内容，后者会让「文章有作者」这条约束失效。

## License

MIT
