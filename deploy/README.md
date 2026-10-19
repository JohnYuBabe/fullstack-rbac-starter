# 部署到 johnyu.wancafu.com/rbac/

与同机的 `/console/` 站点共存（同一个域名、同一个 Nginx），因此下面每一项都与它错开：
端口 `3020`（`/console/` 用 3010）、MySQL 映射 `3309`（`/console/` 用 3308）、
容器名 `rbac-*`、卷 `rbac-mysql-data`、前端 token key `vibe_rbac_token`。

## 1. 服务器上的目录

```bash
sudo mkdir -p /opt/fullstack-rbac-starter /var/www/rbac
sudo chown -R ubuntu:ubuntu /opt/fullstack-rbac-starter /var/www/rbac
```

两个目录都要交给 `ubuntu`：后面的 `rsync` 发布前端时没有 `sudo`，目录若归 root，
会直接 `Permission denied`。

## 2. 同步代码

在本地仓库根目录执行（排除构建产物与本机配置）。下面的 `<your-server>` 换成自己的主机地址：

```bash
rsync -az --delete \
  --exclude node_modules --exclude .git --exclude dist \
  --exclude .env --exclude '*.log' \
  ./ ubuntu@<your-server>:/opt/fullstack-rbac-starter/
```

## 3. 生产 .env

```bash
ssh ubuntu@<your-server>
cd /opt/fullstack-rbac-starter
cp .env.example .env
# 至少替换：MYSQL_ROOT_PASSWORD / MYSQL_PASSWORD / JWT_SECRET / ADMIN_PASSWORD
# 以及三个 DEMO_*_PASSWORD（12 位以上）
openssl rand -hex 24
```

`VITE_*` 变量只在构建前端时生效，写进同一个 `.env` 即可。

## 4. 启动后端

```bash
cd /opt/fullstack-rbac-starter
sudo docker compose up -d --build mysql server
curl -fsS http://127.0.0.1:3020/api/health
```

首次启动时 `docker-entrypoint.sh` 会执行 `prisma migrate deploy`。
演示数据（三个公开账号 + 示例文章）需要显式打开：

```bash
# .env
SEED_ON_START=true
ALLOW_DEMO_SEED=true
# 然后
sudo docker compose up -d --force-recreate server
# 灌完立即关掉，避免每次重启都重建演示库
```

注意 seed 会一次建齐四个账号：私有管理员 `ADMIN_*` 加三个公开演示账号 `DEMO_*`，
没有「只建管理员」的分支。不部署公开演示站时，把三个 `DEMO_*` 口令设成随机值、
**不要**配置 `VITE_DEMO_*`，它们就不会出现在前端包里；随后可以用私有管理员在用户页删掉这三个账号。

## 5. 构建前端

`/rbac/` 是子路径，必须在构建时注入前缀。这些 `VITE_*` 直接写进第 3 步的 `.env` 即可——
构建读的是仓库根目录的 `.env`，进程里 `export` 的同名变量优先级更高：

```bash
VITE_BASE=/rbac/
VITE_API_BASE=/rbac/api
# 登录页的一键填入账号（口令会进 bundle，只能放公开 demo 账号）
VITE_DEMO_ADMIN_EMAIL=demo-admin@example.com
VITE_DEMO_ADMIN_PASSWORD=...
VITE_DEMO_EDITOR_EMAIL=demo-editor@example.com
VITE_DEMO_EDITOR_PASSWORD=...
VITE_DEMO_VIEWER_EMAIL=demo-viewer@example.com
VITE_DEMO_VIEWER_PASSWORD=...
```

然后构建并发布：

```bash
cd /opt/fullstack-rbac-starter
pnpm install --frozen-lockfile
pnpm --filter @rbac/shared build
pnpm --filter @rbac/web build
rsync -a --delete apps/web/dist/ /var/www/rbac/
```

`apps/web/scripts/assert-build.mjs` 会在构建末尾检查子路径、API 前缀，
以及本地开发口令是否漏进了生产包；任一项不通过，构建直接失败。

## 6. nginx

把 `deploy/nginx.conf` 里的 location 片段**合并**进现有的
`johnyu.wancafu.com` 443 server 块——不要整份覆盖，现有配置里还有已上线的
`/console/`。

```bash
sudo nginx -t && sudo nginx -s reload
curl -I https://johnyu.wancafu.com/rbac/
curl -fsS https://johnyu.wancafu.com/rbac/healthz
```

## 7. 上线后的固定检查

```bash
# 未登录访问接口必须是 401
curl -s -o /dev/null -w '%{http_code}\n' https://johnyu.wancafu.com/rbac/api/articles

# 首页 200 且页面里引用的是 /rbac/assets/
curl -s https://johnyu.wancafu.com/rbac/ | grep -o '/rbac/assets/[^"]*' | head -1
```

## 已知限制

- 演示账号的密码会被打进前端 bundle，站点因此对所有人可写。演示库里不要放真实数据。
- 审计日志只覆盖文章与用户的写操作，不含登录与读取。
- 单工作区：没有按部门/项目的对象级授权，`article:read` 能看到全部文章。
