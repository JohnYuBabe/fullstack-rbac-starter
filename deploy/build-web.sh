#!/usr/bin/env bash
#
# 可复现的生产前端构建。
#
# 子路径前缀和演示账号都是**构建期**注入的：改完 .env 再重启后端不会影响已经
# 构建好的 bundle，必须重新跑一次这个脚本。所有变量从一个显式的环境文件读，
# 不用临时 export，别人拿到仓库也能构建出同一个产物。
#
#   ./deploy/build-web.sh --env .env.deploy --print   # 只打印解析结果
#   ./deploy/build-web.sh --env .env.deploy           # 构建
#
# 环境文件只解析 KEY=VALUE，不执行其中的任何命令；文件里没写的变量取默认值，
# shell 里残留的同名变量一律忽略（--define 是唯一的覆盖入口）。
#
#   VITE_BASE=/rbac/           VITE_API_BASE=/rbac/api
#   三个演示账号可以直接写 VITE_DEMO_*_EMAIL / VITE_DEMO_*_PASSWORD，
#   也可以只写服务端的 DEMO_*_EMAIL / DEMO_*_PASSWORD —— 脚本会把它们
#   映射成 VITE_ 版本，保证登录页一键填入的账号与服务端 seed 完全一致。
#   不部署公开演示站时加 --no-demo：六个 VITE_DEMO_* 会被显式置空（覆盖根目录
#   .env 里的同名值），bundle 里不会出现任何口令。
set -euo pipefail

# --env 相对当前工作目录解析，不能跟着后面的 cd 跑
CALLER_DIR="$PWD"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

usage() {
  cat <<'USAGE'
用法：deploy/build-web.sh --env <文件> [选项]

  --env FILE            必填。部署用的环境文件，例如 .env.deploy
  --print               只打印解析结果，不构建
  --no-demo             不注入演示账号，登录页不显示一键填入
  --allow-root-base     允许 VITE_BASE=/（只在确实部署在根路径时使用）
  --define KEY=VALUE    覆盖环境文件里的某个 VITE_* 变量，可重复
  -h, --help            显示这段说明
USAGE
}

die() { echo "$*" >&2; exit 2; }

ENV_FILE=""
PRINT=0
NO_DEMO=0
ALLOW_ROOT_BASE=0
DEFINES=()

while [ $# -gt 0 ]; do
  case "$1" in
    --env)
      [ $# -ge 2 ] || die "--env 缺少值"
      ENV_FILE="$2"; shift 2 ;;
    --print) PRINT=1; shift ;;
    --no-demo) NO_DEMO=1; shift ;;
    --allow-root-base) ALLOW_ROOT_BASE=1; shift ;;
    --define)
      [ $# -ge 2 ] || die "--define 缺少值"
      DEFINES+=("$2"); shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "未知参数：$1（--help 看用法）" ;;
  esac
done

[ -n "$ENV_FILE" ] || die "必须用 --env 指定部署环境文件（例如 .env.deploy）。生产构建的 VITE_* 不该依赖 shell 里偶然残留的变量。"

case "$ENV_FILE" in
  /*) ;;
  *) ENV_FILE="$CALLER_DIR/$ENV_FILE" ;;
esac
[ -f "$ENV_FILE" ] || die "找不到环境文件：$ENV_FILE"

# 只解析 KEY=VALUE：支持空行、# 注释、export 前缀、成对引号。
# 不做变量展开、不执行 $( )，环境文件不是脚本。
load_env() {
  local file="$1" line key value lineno=0
  while IFS= read -r line || [ -n "$line" ]; do
    lineno=$((lineno + 1))
    line="${line%$'\r'}"
    line="${line#"${line%%[![:space:]]*}"}"
    case "$line" in ''|'#'*) continue ;; esac
    case "$line" in export[[:space:]]*) line="${line#export}"; line="${line#"${line%%[![:space:]]*}"}" ;; esac
    case "$line" in
      *=*) ;;
      *) die "$(basename "$file") 第 $lineno 行不是 KEY=VALUE：$line" ;;
    esac
    key="${line%%=*}"
    key="${key%"${key##*[![:space:]]}"}"
    value="${line#*=}"
    value="${value#"${value%%[![:space:]]*}"}"
    case "$key" in
      ''|[0-9]*|*[!A-Za-z0-9_]*)
        die "$(basename "$file") 第 $lineno 行变量名不合法：'$key'" ;;
    esac
    case "$value" in
      \"*\") value="${value#\"}"; value="${value%\"}" ;;
      \'*\') value="${value#\'}"; value="${value%\'}" ;;
    esac
    printf -v "$key" '%s' "$value"
  done < "$file"
}

# 先清掉 shell 里可能残留的同名变量，结果只由「环境文件 + --define + 默认值」决定。
# DEMO_* 也要清：下面的映射会拿它兜底，不清的话 `set -a; source .env` 之后的 shell
# 会把服务端口令悄悄带进构建，和环境文件写没写完全无关。
unset VITE_BASE VITE_API_BASE
for role in ADMIN EDITOR VIEWER; do
  unset "VITE_DEMO_${role}_EMAIL" "VITE_DEMO_${role}_PASSWORD"
  unset "DEMO_${role}_EMAIL" "DEMO_${role}_PASSWORD"
done

load_env "$ENV_FILE"

for pair in ${DEFINES+"${DEFINES[@]}"}; do
  key="${pair%%=*}"
  value="${pair#*=}"
  case "$key" in
    VITE_*) ;;
    *) die "--define 只接受 VITE_* 变量：$key" ;;
  esac
  [ "$pair" != "$key" ] || die "--define 需要 KEY=VALUE 形式：$pair"
  printf -v "$key" '%s' "$value"
done

# --no-demo 构建到底该禁止哪些口令：环境文件里出现的 VITE_DEMO_* 与 DEMO_*
# 都算（根目录 .env 的那份由 assert-build 自己再读一次）。置空之后再收集就晚了，
# 所以在 --no-demo 处理之前先记下来。
RBAC_FORBIDDEN_SECRETS=""
for role in ADMIN EDITOR VIEWER; do
  for name in "VITE_DEMO_${role}_PASSWORD" "DEMO_${role}_PASSWORD"; do
    value="${!name:-}"
    if [ -n "$value" ]; then
      RBAC_FORBIDDEN_SECRETS+="${value}"$'\n'
    fi
  done
done

VITE_BASE="${VITE_BASE:-/rbac/}"
VITE_API_BASE="${VITE_API_BASE:-/rbac/api}"

case "$VITE_BASE" in
  /*) ;;
  *) die "VITE_BASE 必须以 / 开头，当前是：$VITE_BASE" ;;
esac
case "$VITE_BASE" in
  */) ;;
  *) die "VITE_BASE 必须以 / 结尾（Vite 的 base 是目录），当前是：$VITE_BASE" ;;
esac
if [ "$VITE_BASE" = "/" ] && [ "$ALLOW_ROOT_BASE" != "1" ]; then
  die "VITE_BASE=/ 会构建成根路径版本，部署到 /rbac/ 会白屏。确实需要根路径就加 --allow-root-base。"
fi

case "$VITE_API_BASE" in
  /*) ;;
  *) die "VITE_API_BASE 必须以 / 开头（同源相对路径），当前是：$VITE_API_BASE" ;;
esac
if [ "$VITE_BASE" != "/" ]; then
  case "$VITE_API_BASE" in
    "${VITE_BASE%/}"/*) ;;
    *) echo "警告：VITE_BASE=$VITE_BASE 但 VITE_API_BASE=$VITE_API_BASE 不在同一个前缀下；确认 nginx 确实在根路径代理了它。" >&2 ;;
  esac
fi

DEMO_SOURCE=""
# 不要从 shell 继承这个标志：外部残留 =1 会让普通演示构建被误判成 --no-demo 而失败
RBAC_BUILD_NO_DEMO=0
if [ "$NO_DEMO" = "1" ]; then
  # 必须显式设成空串，不能 unset：Vite 的 loadEnv 会把根目录 .env 里的
  # VITE_DEMO_* 读进来，只有进程环境里存在的变量才会覆盖它。
  # unset 之后 .env 的值照样生效，前面的承诺就是假的。
  for role in ADMIN EDITOR VIEWER; do
    printf -v "VITE_DEMO_${role}_EMAIL" '%s' ''
    printf -v "VITE_DEMO_${role}_PASSWORD" '%s' ''
  done
  RBAC_BUILD_NO_DEMO=1
  DEMO_SOURCE="已关闭（--no-demo）"
else
  # 演示账号：VITE_DEMO_* 优先，没有就从服务端的 DEMO_* 映射
  for role in ADMIN EDITOR VIEWER; do
    email="VITE_DEMO_${role}_EMAIL"
    pass="VITE_DEMO_${role}_PASSWORD"
    fallback_email="DEMO_${role}_EMAIL"
    fallback_pass="DEMO_${role}_PASSWORD"
    if [ -n "${!email:-}" ] || [ -n "${!pass:-}" ]; then
      DEMO_SOURCE="${DEMO_SOURCE:-VITE_DEMO_*}"
    elif [ -n "${!fallback_email:-}" ] || [ -n "${!fallback_pass:-}" ]; then
      DEMO_SOURCE="${DEMO_SOURCE:-由 DEMO_* 映射}"
    fi
    printf -v "$email" '%s' "${!email:-${!fallback_email:-}}"
    printf -v "$pass" '%s' "${!pass:-${!fallback_pass:-}}"
  done
  [ -n "$DEMO_SOURCE" ] || DEMO_SOURCE="未配置（登录页不显示一键填入）"
fi

export VITE_BASE VITE_API_BASE
for role in ADMIN EDITOR VIEWER; do
  export "VITE_DEMO_${role}_EMAIL" "VITE_DEMO_${role}_PASSWORD"
done
# 让 assert-build 在 --no-demo 构建里额外断言：bundle 中不含任何演示口令
export RBAC_BUILD_NO_DEMO RBAC_FORBIDDEN_SECRETS

if [ "$PRINT" = "1" ]; then
  echo "环境文件：$ENV_FILE"
  echo "VITE_BASE=$VITE_BASE"
  echo "VITE_API_BASE=$VITE_API_BASE"
  echo "演示账号来源：$DEMO_SOURCE"
  for role in ADMIN EDITOR VIEWER; do
    email="VITE_DEMO_${role}_EMAIL"
    pass="VITE_DEMO_${role}_PASSWORD"
    pass_value="${!pass:-}"
    if [ -n "$pass_value" ]; then shown="***（${#pass_value} 位）"; else shown="（空）"; fi
    echo "VITE_DEMO_${role}_EMAIL=${!email:-（空）}"
    echo "VITE_DEMO_${role}_PASSWORD=$shown"
  done
  exit 0
fi

command -v pnpm >/dev/null 2>&1 || die "需要 pnpm 8（corepack enable）"

cd "$SCRIPT_DIR/.."

pnpm --filter @rbac/shared build
pnpm --filter @rbac/web build

echo
echo "构建完成：apps/web/dist"
echo "  base=$VITE_BASE  api=$VITE_API_BASE"
echo "发布（在构建机上执行）：rsync -a --delete apps/web/dist/ user@<your-server>:/var/www/rbac/"
