import axios from 'axios';

/**
 * 从 Axios 错误里取出后端的中文提示。
 * NestJS 的 ValidationPipe 可能返回 string[]，统一用分号拼接。
 */
export function readApiError(
  value: unknown,
  fallback = '操作失败，请稍后重试。',
): string {
  if (axios.isAxiosError(value)) {
    const status = value.response?.status;

    // 5xx 的服务端文案通常是英文兜底或内部错误，不直接展示给用户
    if (typeof status === 'number' && status >= 500) {
      return '服务端异常，请稍后重试。';
    }

    const body = value.response?.data as
      | { message?: string | string[] }
      | undefined;

    if (Array.isArray(body?.message)) {
      return body.message.join('；');
    }
    if (typeof body?.message === 'string' && body.message) {
      return body.message;
    }
    if (value.code === 'ECONNABORTED') {
      return '请求超时，请稍后重试。';
    }
    if (!value.response) {
      return '无法连接服务端，请确认 API 已启动。';
    }
  }

  if (value instanceof Error && value.message) {
    return value.message;
  }

  return fallback;
}
