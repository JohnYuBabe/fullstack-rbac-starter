import { createRouter, createWebHistory } from 'vue-router';
import { ElMessage } from 'element-plus';
import type { PermissionString } from '@rbac/shared';
import { useAuthStore } from '@/stores/auth';

declare module 'vue-router' {
  interface RouteMeta {
    /** 无需登录即可访问 */
    public?: boolean;
    /** 进入页面前必须拥有的权限 */
    permission?: PermissionString;
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: () => import('@/layouts/AppLayout.vue'),
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('@/views/DashboardView.vue'),
        },
        {
          path: 'articles',
          name: 'articles',
          component: () => import('@/views/ArticlesView.vue'),
          meta: { permission: 'article:read' },
        },
        {
          path: 'articles/:id',
          name: 'article-detail',
          component: () => import('@/views/ArticleDetailView.vue'),
          meta: { permission: 'article:read' },
        },
        {
          path: 'users',
          name: 'users',
          component: () => import('@/views/UsersView.vue'),
          meta: { permission: 'user:manage' },
        },
        {
          path: 'audit',
          name: 'audit',
          component: () => import('@/views/AuditView.vue'),
          meta: { permission: 'audit:read' },
        },
        {
          path: '403',
          name: 'forbidden',
          component: () => import('@/views/ForbiddenView.vue'),
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  const isPublic = Boolean(to.meta.public);

  if (isPublic) {
    if (auth.isAuthenticated && to.name === 'login') {
      return { name: 'dashboard' };
    }
    return true;
  }

  if (!auth.isAuthenticated) {
    return {
      name: 'login',
      query: { redirect: to.fullPath },
    };
  }

  if (!auth.user) {
    try {
      await auth.fetchMe();
    } catch {
      auth.logout();
      return {
        name: 'login',
        query: { redirect: to.fullPath },
      };
    }
  }

  const required = to.meta.permission;
  if (required && !auth.hasPermission(required)) {
    ElMessage.warning('没有访问该页面的权限');
    return { name: 'forbidden' };
  }

  return true;
});

export default router;
