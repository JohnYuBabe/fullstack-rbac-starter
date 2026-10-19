#!/usr/bin/env node
// 构建后自检：子路径、API 前缀、开发口令泄漏。
// 这些错误在浏览器里表现为白屏或 404，放在构建阶段直接失败更省事。
//
// 期望值必须和构建时的来源一致：Vite 先读根目录 .env，再让进程环境变量覆盖它。
// 只读 process.env 会让「改 .env 构建」时检查落空（`/rbac/assets/` 里也含 `/assets/`，
// 所以旧写法同样能"通过"，等于没检查）。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
// 本文件在 apps/web/scripts/，根目录要再上两级
const rootDir = fileURLToPath(new URL('../../..', import.meta.url));

const env = { ...loadEnv('production', rootDir, 'VITE_') };
for (const key of ['VITE_BASE', 'VITE_API_BASE']) {
  if (process.env[key]) {
    env[key] = process.env[key];
  }
}

const base = env.VITE_BASE || '/';
const apiBase = env.VITE_API_BASE || '/api';

const failures = [];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const assetPrefix = `${base.replace(/\/$/, '')}/assets/`;

if (!html.includes(`src="${assetPrefix}`)) {
  failures.push(`index.html 没有引用 ${assetPrefix}（检查 VITE_BASE）`);
}

const scripts = walk(join(dist, 'assets')).filter((file) => file.endsWith('.js'));
const code = scripts.map((file) => readFileSync(file, 'utf8')).join('\n');

if (!code.includes(apiBase)) {
  failures.push(`bundle 中找不到 VITE_API_BASE=${apiBase}`);
}

// 生产包不允许出现本地开发账号口令；生产用 DEMO_* 账号，口令走 VITE_DEMO_*
for (const secret of ['admin123', 'editor123', 'viewer123', 'dev-secret-change-me']) {
  if (code.includes(secret)) {
    failures.push(`bundle 中仍然包含本地开发口令：${secret}`);
  }
}

// deploy/build-web.sh --no-demo 承诺 bundle 里没有口令。检查两类来源：
//   1. 构建环境文件里的口令：由 build-web.sh 通过 RBAC_FORBIDDEN_SECRETS 传进来
//   2. 根目录 .env 里的 VITE_DEMO_*：Vite 会自动读它，进程变量置空只能覆盖
//      Vite 的取值，不能阻止文件里本来就有的值被检查到
// loadEnv 自己会让 process.env 覆盖文件值，所以取文件值前先把这几个键摘掉。
const DEMO_SECRET_KEYS = ['ADMIN', 'EDITOR', 'VIEWER'].flatMap((role) => [
  `VITE_DEMO_${role}_PASSWORD`,
  `DEMO_${role}_PASSWORD`,
]);

function readEnvFilesOnly(keys) {
  const saved = new Map(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  const values = loadEnv('production', rootDir, '');
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return values;
}

if (process.env.RBAC_BUILD_NO_DEMO === '1') {
  const secrets = new Set(
    (process.env.RBAC_FORBIDDEN_SECRETS || '').split('\n').filter(Boolean),
  );
  const fromEnvFiles = readEnvFilesOnly(DEMO_SECRET_KEYS);
  for (const key of DEMO_SECRET_KEYS) {
    if (fromEnvFiles[key]) secrets.add(fromEnvFiles[key]);
  }
  for (const secret of secrets) {
    // 报错时只打前两位，不把口令写进构建日志
    if (code.includes(secret)) {
      failures.push(`--no-demo 构建里仍然包含演示口令（${secret.slice(0, 2)}***）`);
    }
  }
}

if (failures.length > 0) {
  console.error('[assert-build] 构建产物检查失败：');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(`[assert-build] ok · base=${base} · api=${apiBase} · ${scripts.length} 个 js 文件`);
