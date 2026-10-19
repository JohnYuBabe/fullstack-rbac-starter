import axios from 'axios';
import { ElMessage } from 'element-plus';

/**
 * 与 console 演示站同域部署时会撞车：localStorage 的 key 必须按站点区分，
 * 否则 /console 与 /rbac 共用 token，登录一个会把另一个踢下线。
 */
export const TOKEN_KEY = 'vibe_rbac_token';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (!axios.isAxiosError(error)) {
      return Promise.reject(error);
    }

    const status = error.response?.status;

    if (status === 401) {
      localStorage.removeItem(TOKEN_KEY);

      const base = import.meta.env.BASE_URL || '/';
      const loginPath = `${base.replace(/\/$/, '')}/login`;
      if (!window.location.pathname.endsWith('/login')) {
        window.location.assign(loginPath);
      }
    }

    // 前端隐藏按钮只是体验；权限判定以服务端为准。绕过界面直接调接口时，
    // 403 必须给出明确提示，而不是静默失败。
    if (status === 403) {
      ElMessage.error('没有权限执行该操作');
    }

    return Promise.reject(error);
  },
);
