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
  --exclude .env --exclude .env.deploy --exclude '*.log' \
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

`.env` 只给后端运行时用，`docker compose` 与 Nest 读它。前端构建另用一份 `.env.deploy`
（见第 5 节），两份都不进仓库。

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
没有「只建管理员」的分支。不部署公开演示站时，把三个 `DEMO_*` 口令设成随机值，
构建前端时加 `--no-demo`（见第 5 节），它们就不会出现在前端包里；随后可以用私有管理员在用户页删掉这三个账号。

## 5. 构建前端

`/rbac/` 是子路径，前缀与演示账号都是**构建期**注入的：改完 `.env` 再重启后端不会影响
已经构建好的 bundle，必须重新构建一次。

**在第 2 节那台同步过代码的机器上构建**（通常是本机）。不要指望直接在生产服务器上构建：
那里装的可能还是旧版 Node，仓库要求 Node 20+ 与 pnpm 8。

构建脚本从一个显式的环境文件读变量，不依赖 shell 里偶然残留的 `export`；
该文件用「KEY=VALUE」解析，不会被执行（`$(...)` 不会被求值），
被 `.gitignore` 的 `.env.*` 覆盖，不会进仓库。

`.env` 是服务端运行时读的；构建前端另用一份 `.env.deploy`，只放下面这几个变量，
不参与后端启动：

```bash
cp .env.example .env.deploy

# .env.deploy 里至少有：
#   VITE_BASE=/rbac/
#   VITE_API_BASE=/rbac/api
#   DEMO_*_EMAIL / DEMO_*_PASSWORD —— 与服务器 .env 保持一致即可，
#   脚本会把它们映射成 VITE_DEMO_*，保证一键填入的账号就是服务端 seed 的账号

./deploy/build-web.sh --env .env.deploy --print   # 先确认解析出的 base 与账号
./deploy/build-web.sh --env .env.deploy           # 构建
rsync -a --delete apps/web/dist/ ubuntu@<your-server>:/var/www/rbac/
```

不打算公开演示账号时加 `--no-demo`：登录页不再显示一键填入，bundle 里也不会出现任何口令。
`--allow-root-base` 只在确实部署在根路径时用；`--define KEY=VALUE` 可以临时覆盖单个变量。

登录页的一键填入读 `VITE_DEMO_*`，口令会留在 bundle 里，所以只能放公开 demo 账号。
既没有 `VITE_DEMO_*` 也没有 `DEMO_*`、或者加了 `--no-demo` 时，登录页不显示一键填入。

`apps/web/scripts/assert-build.mjs` 会在构建末尾检查子路径、API 前缀，
以及本地开发口令是否漏进了生产包；任一项不通过，构建直接失败。

## 6. nginx

把 `deploy/nginx.conf` 里的 location 片段**合并**进现有站点的 443 server 块——不要整份覆盖，
同一份配置里还有已上线的 `/console/`。手工粘贴容易出两类错：粘进了别的 server 块，或者
粘完 `nginx -t` 没过、`reload` 实际没执行，线上仍是旧配置。`deploy/apply-nginx.py` 把这两件事
都堵住：

```bash
sudo python3 deploy/apply-nginx.py \
  --config /www/server/panel/vhost/nginx/johnyu.wancafu.com.conf \
  --server-name johnyu.wancafu.com --dry-run

sudo python3 deploy/apply-nginx.py \
  --config /www/server/panel/vhost/nginx/johnyu.wancafu.com.conf \
  --server-name johnyu.wancafu.com
```

脚本按 nginx 自己的词法规则解析配置（引号、转义、注释、正则里的量词），只在
「`listen 443` 且 `server_name` 精确匹配」的**唯一** server 块末尾插入；候选块为 0
或大于 1 时直接退出，不猜。`^~ /x` 与 `/x`、`= /x` 与 `=/x` 按 nginx 的判定视为同一个
location，已经存在就拒绝重复插入。

写完依次执行 `nginx -t` → `nginx -s reload` → 用 `--resolve` 指向 127.0.0.1 探活：
不只看状态码，还要求首页里出现 `/rbac/assets/`，并把其中一个静态文件取回来。
`nginx` 或 `curl` 不存在时，动手之前就退出。任何一步失败都原子还原备份并重新 reload，
还原后还会再确认一次 reload 结果，没成功就打印需要手工执行的命令。

部署脚本有自己的回归测试，改完先跑一遍：

```bash
python3 deploy/test_apply_nginx.py
```

`/rbac/assets/` 与 `/rbac/api/` 用的是 `^~` 前缀。宝塔一类面板的默认配置通常带
`location ~ .*\.(js|css)?$` 这类正则 location，nginx 选中最长前缀后仍会尝试正则，
正则一命中就压过普通前缀（与书写顺序无关）——不加 `^~` 会表现为页面白屏、静态资源 404。

```bash
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
