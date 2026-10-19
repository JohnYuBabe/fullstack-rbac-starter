#!/bin/sh
set -e

echo "[entrypoint] prisma migrate deploy"
./node_modules/.bin/prisma migrate deploy

if [ "${SEED_ON_START:-false}" = "true" ]; then
  # 「启动即写演示数据」是显式动作，避免误把线上数据重建
  if [ "${NODE_ENV:-production}" = "production" ] && [ "${ALLOW_DEMO_SEED:-false}" != "true" ]; then
    echo "[entrypoint] SEED_ON_START=true 但未设置 ALLOW_DEMO_SEED=true，跳过 seed"
  else
    echo "[entrypoint] seeding demo data"
    ./node_modules/.bin/tsx prisma/seed.ts
  fi
fi

exec node dist/main.js
