import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import {
  hasAllPermissions,
  type AuthUser,
  type LoginResponse,
  type PermissionString,
} from '@rbac/shared';
import { fetchMeRequest, loginRequest } from '@/api/auth';
import { TOKEN_KEY } from '@/api/client';

export { TOKEN_KEY };

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY));
  const user = ref<AuthUser | null>(null);

  const isAuthenticated = computed(() => Boolean(token.value));

  function setToken(value: string): void {
    token.value = value;
    localStorage.setItem(TOKEN_KEY, value);
  }

  function clear(): void {
    token.value = null;
    user.value = null;
    localStorage.removeItem(TOKEN_KEY);
  }

  async function login(email: string, password: string): Promise<AuthUser> {
    const result: LoginResponse = await loginRequest({ email, password });
    setToken(result.accessToken);
    user.value = result.user;
    return result.user;
  }

  async function fetchMe(): Promise<AuthUser> {
    const me = await fetchMeRequest();
    user.value = me;
    return me;
  }

  /** 当前用户是否拥有某个权限；未登录或未加载用户时一律视为没有 */
  function hasPermission(permission: PermissionString): boolean {
    // 单权限也走共享函数：菜单/路由/按钮与后端守卫的判定入口保持同一个。
    return hasAllPermissions(user.value?.permissions ?? [], [permission]);
  }

  /** 多权限之间是「且」，与后端 PermissionsGuard 使用同一个函数 */
  function hasPermissions(required: PermissionString[]): boolean {
    return hasAllPermissions(user.value?.permissions ?? [], required);
  }

  function logout(): void {
    clear();
  }

  return {
    token,
    user,
    isAuthenticated,
    login,
    fetchMe,
    hasPermission,
    hasPermissions,
    logout,
  };
});
