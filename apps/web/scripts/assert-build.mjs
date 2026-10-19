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

if (failures.length > 0) {
  console.error('[assert-build] 构建产物检查失败：');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(`[assert-build] ok · base=${base} · api=${apiBase} · ${scripts.length} 个 js 文件`);
