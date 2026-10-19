import type { AuthUser, LoginRequest, LoginResponse } from '@rbac/shared';
import { api } from './client';

export async function loginRequest(payload: LoginRequest): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/login', payload);
  return data;
}

export async function fetchMeRequest(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>('/auth/me');
  return data;
}
