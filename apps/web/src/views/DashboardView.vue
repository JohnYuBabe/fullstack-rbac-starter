<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  PERMISSION_LABELS,
  PERMISSION_LIST,
  ROLE_LABELS,
  ROLE_NAMES,
  ROLE_PRESETS,
  type PermissionString,
} from '@rbac/shared';
import { listArticles } from '@/api/articles';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const articleCount = ref<number | null>(null);

const matrix = computed(() =>
  PERMISSION_LIST.map((permission) => ({
    permission,
    label: PERMISSION_LABELS[permission],
    roles: ROLE_NAMES.map((role) => ({
      role,
      granted: (ROLE_PRESETS[role] as readonly PermissionString[]).includes(
        permission,
      ),
    })),
  })),
);

const roleLabel = (role: string): string =>
  ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role;

onMounted(async () => {
  if (!auth.hasPermission('article:read')) {
    return;
  }
  try {
    articleCount.value = (await listArticles()).length;
  } catch {
    articleCount.value = null;
  }
});
</script>

<template>
  <div class="dashboard">
    <section class="hero">
      <div>
        <p class="eyebrow">当前身份</p>
        <h1>{{ auth.user?.name }}</h1>
        <p class="hero-sub">
          {{ auth.user?.email }}
          <span class="sep">·</span>
          {{ auth.user?.roles.map(roleLabel).join(' / ') }}
        </p>
      </div>
      <div class="hero-stat">
        <span class="stat-value">{{ auth.user?.permissions.length ?? 0 }}</span>
        <span class="stat-label">项权限 / 共 {{ PERMISSION_LIST.length }} 项</span>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <h2>我拥有的权限串</h2>
        <p>服务端每个请求都会回查数据库重建这份列表，改角色在下一次请求生效。</p>
      </div>
      <div class="chips">
        <el-tag
          v-for="permission in auth.user?.permissions ?? []"
          :key="permission"
          effect="plain"
          size="small"
        >
          {{ permission }}
        </el-tag>
        <span v-if="(auth.user?.permissions.length ?? 0) === 0" class="empty">
          没有任何权限
        </span>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <h2>三级控制</h2>
        <p>同一份权限数据，在三个位置生效。任何一处都不是判定的全部。</p>
      </div>
      <div class="levels">
        <article class="level">
          <span class="level-tag">菜单</span>
          <h3>没有权限就不出现入口</h3>
          <p>
            导航项由 <code>v-if</code> 加 <code>hasPermission('user:manage')</code> 控制。
            访客的导航里没有「用户管理」，也没有「审计日志」。
          </p>
        </article>
        <article class="level">
          <span class="level-tag">路由</span>
          <h3>直接输地址也进不去</h3>
          <p>
            路由 <code>meta.permission</code> 在进入前检查，缺权限落到 403 页，
            而不是先渲染再报错。
          </p>
        </article>
        <article class="level">
          <span class="level-tag">按钮</span>
          <h3>看得见列表，不意味着能改</h3>
          <p>
            访客能看文章列表，「新建 / 编辑 / 删除」三个按钮都不渲染；
            就算绕过界面调接口，服务端返回 403。
          </p>
        </article>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <h2>角色 × 权限</h2>
        <p>
          表格由 <code>ROLE_PRESETS</code> 直接渲染——和 seed 建库用的是同一份定义。
        </p>
      </div>
      <div class="matrix-wrap">
        <table class="matrix">
          <thead>
            <tr>
              <th>权限</th>
              <th v-for="role in ROLE_NAMES" :key="role">
                {{ ROLE_LABELS[role] }}
                <span class="role-name">{{ role }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in matrix" :key="row.permission">
              <td>
                <code>{{ row.permission }}</code>
                <span class="perm-label">{{ row.label }}</span>
              </td>
              <td v-for="cell in row.roles" :key="cell.role">
                <span v-if="cell.granted" class="yes">✓</span>
                <span v-else class="no">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <h2>试试看</h2>
        <p>
          用另外两个账号登录同一站点，对比导航、页面与按钮的差别。
        </p>
      </div>
      <div class="try-grid">
        <div class="try">
          <strong>编辑</strong>
          <p>能写文章，但没有 <code>user:manage</code> 与 <code>audit:read</code>。</p>
        </div>
        <div class="try">
          <strong>访客</strong>
          <p>只有 <code>article:read</code>：看得到文章，看不到任何写操作。</p>
        </div>
        <div class="try">
          <strong>文章数</strong>
          <p>
            <template v-if="articleCount !== null">{{ articleCount }} 篇</template>
            <template v-else>当前账号无权读取</template>
          </p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dashboard {
  display: grid;
  gap: 18px;
}

.hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding: 28px 30px;
  border-radius: 16px;
  background:
    radial-gradient(circle at 12% 8%, rgba(45, 160, 140, 0.28), transparent 46%),
    #0f2b26;
  color: #eef7f4;
}

.eyebrow {
  margin: 0 0 8px;
  font-size: 11px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #7fd6c4;
}

.hero h1 {
  margin: 0;
  font-size: 28px;
  letter-spacing: -0.01em;
}

.hero-sub {
  margin: 8px 0 0;
  font-size: 13px;
  color: #b6cfc8;
}

.sep {
  margin: 0 6px;
  color: #4f7a70;
}

.hero-stat {
  text-align: right;
  flex: none;
}

.stat-value {
  display: block;
  font-size: 40px;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: #9fe4d5;
}

.stat-label {
  font-size: 12px;
  color: #9ab8b0;
}

.card {
  padding: 22px 24px;
  background: #fff;
  border: 1px solid #dfe7e3;
  border-radius: 14px;
}

.card-head {
  margin-bottom: 16px;
}

.card-head h2 {
  margin: 0 0 4px;
  font-size: 15px;
  color: #14201d;
}

.card-head p {
  margin: 0;
  font-size: 12.5px;
  color: #6f807a;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.empty {
  font-size: 13px;
  color: #93a29c;
}

.levels {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.level {
  padding: 16px;
  border: 1px solid #e6ece9;
  border-radius: 12px;
  background: #fbfcfc;
}

.level-tag {
  display: inline-block;
  margin-bottom: 8px;
  padding: 1px 8px;
  border-radius: 999px;
  background: #ebf4f2;
  color: #135e54;
  font-size: 11.5px;
  font-weight: 600;
}

.level h3 {
  margin: 0 0 6px;
  font-size: 13.5px;
  color: #14201d;
}

.level p {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.8;
  color: #5d6d67;
}

.matrix-wrap {
  overflow-x: auto;
}

.matrix {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.matrix th,
.matrix td {
  padding: 9px 12px;
  border-bottom: 1px solid #eef2f0;
  text-align: left;
}

.matrix th {
  font-size: 12px;
  font-weight: 600;
  color: #6f807a;
  white-space: nowrap;
}

.matrix th:not(:first-child),
.matrix td:not(:first-child) {
  text-align: center;
  width: 110px;
}

.role-name {
  display: block;
  font-weight: 400;
  font-size: 10.5px;
  color: #a3b1ac;
  letter-spacing: 0.06em;
}

.perm-label {
  margin-left: 8px;
  font-size: 12px;
  color: #6f807a;
}

.yes {
  color: #1d8b78;
  font-weight: 700;
}

.no {
  color: #c8d2cd;
}

.try-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.try {
  padding: 14px 16px;
  border-radius: 10px;
  background: #f7faf9;
  border: 1px solid #eef2f0;
}

.try strong {
  font-size: 13px;
  color: #14201d;
}

.try p {
  margin: 4px 0 0;
  font-size: 12.5px;
  line-height: 1.75;
  color: #5d6d67;
}

@media (max-width: 860px) {
  .levels,
  .try-grid {
    grid-template-columns: 1fr;
  }

  .hero {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }

  .hero-stat {
    text-align: left;
  }
}
</style>
