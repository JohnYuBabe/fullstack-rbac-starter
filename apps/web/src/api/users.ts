import type { AdminUser } from '@rbac/shared';
import { api } from './client';

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  roles: string[];
}

export interface UpdateUserInput {
  name?: string;
  roles?: string[];
}

export async function listUsers(): Promise<AdminUser[]> {
  const { data } = await api.get<AdminUser[]>('/users');
  return data;
}

export async function createUser(payload: CreateUserInput): Promise<AdminUser> {
  const { data } = await api.post<AdminUser>('/users', payload);
  return data;
}

export async function updateUser(
  id: string,
  payload: UpdateUserInput,
): Promise<AdminUser> {
  const { data } = await api.patch<AdminUser>(`/users/${id}`, payload);
  return data;
}

export async function deleteUser(id: string): Promise<void> {
  await api.delete(`/users/${id}`);
}
