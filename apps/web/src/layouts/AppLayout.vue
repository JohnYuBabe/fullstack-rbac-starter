<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { ROLE_LABELS } from '@rbac/shared';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();

const initials = computed(() => auth.user?.name?.slice(0, 1) ?? '?');

function roleLabel(role: string): string {
  return ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role;
}

function logout(): void {
  auth.logout();
  void router.push({ name: 'login' });
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <router-link to="/" class="wordmark">
        rbac<span>/</span>starter
      </router-link>

      <!-- 一级控制：菜单。没有权限的入口不渲染，而不是渲染后禁用 -->
      <nav class="app-nav">
        <router-link to="/" class="nav-link">概览</router-link>
        <router-link
          v-if="auth.hasPermission('article:read')"
          to="/articles"
          class="nav-link"
        >
          文章
        </router-link>
        <router-link
          v-if="auth.hasPermission('user:manage')"
          to="/users"
          class="nav-link"
        >
          用户管理
        </router-link>
        <router-link
          v-if="auth.hasPermission('audit:read')"
          to="/audit"
          class="nav-link"
        >
          审计日志
        </router-link>
      </nav>

      <div v-if="auth.user" class="account">
        <div class="avatar">{{ initials }}</div>
        <div class="account-meta">
          <strong>{{ auth.user.name }}</strong>
          <span>{{ auth.user.email }}</span>
        </div>
        <div class="role-tags">
          <el-tag
            v-for="role in auth.user.roles"
            :key="role"
            size="small"
            effect="plain"
          >
            {{ roleLabel(role) }}
          </el-tag>
        </div>
        <el-button text class="logout" @click="logout">退出</el-button>
      </div>
    </header>

    <main class="app-main">
      <router-view />
    </main>

    <footer class="app-footer">
      <span>fullstack-rbac-starter</span>
      <span class="dot">·</span>
      <span>权限判定在服务端，前端只负责隐藏</span>
    </footer>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f7f6;
}

.app-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 28px;
  height: 64px;
  padding: 0 28px;
  background: rgba(255, 255, 255, 0.92);
  border-bottom: 1px solid #dfe7e3;
  backdrop-filter: blur(10px);
}

.wordmark {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #135e54;
  text-decoration: none;
  white-space: nowrap;
}

.wordmark span {
  color: #1d8b78;
  padding: 0 2px;
}

.app-nav {
  display: flex;
  gap: 6px;
}

.nav-link {
  padding: 7px 12px;
  border-radius: 8px;
  font-size: 13px;
  color: #46554f;
  text-decoration: none;
}

.nav-link.router-link-active {
  color: #135e54;
  background: #ebf4f2;
  font-weight: 600;
}

.account {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
  min-width: 0;
}

.avatar {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #135e54;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  flex: none;
}

.account-meta {
  display: grid;
  min-width: 0;
  line-height: 1.3;
}

.account-meta strong {
  font-size: 13px;
  font-weight: 600;
  color: #14201d;
}

.account-meta span {
  font-size: 11.5px;
  color: #7a8a84;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-tags {
  display: flex;
  gap: 4px;
}

.logout {
  font-size: 13px;
  color: #5d6d67;
}

.app-main {
  flex: 1;
  width: min(1120px, 100%);
  margin: 0 auto;
  padding: 32px 28px 48px;
}

.app-footer {
  display: flex;
  justify-content: center;
  gap: 6px;
  padding: 18px;
  font-size: 12px;
  color: #5d6d67;
  border-top: 1px solid #e6ece9;
}

.dot {
  color: #bccbc5;
}

@media (max-width: 720px) {
  .app-header {
    flex-wrap: wrap;
    gap: 8px 12px;
    height: auto;
    padding: 10px 16px;
  }

  .wordmark {
    order: 1;
  }

  .account {
    order: 2;
  }

  .app-nav {
    order: 3;
    flex: 0 0 100%;
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .nav-link {
    white-space: nowrap;
  }

  .account-meta,
  .role-tags {
    display: none;
  }

  .app-main {
    padding: 22px 16px 36px;
  }
}
</style>
