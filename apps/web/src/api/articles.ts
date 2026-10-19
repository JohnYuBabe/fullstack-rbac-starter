import type { Article } from '@rbac/shared';
import { api } from './client';

export interface ArticleInput {
  title: string;
  content: string;
}

export async function listArticles(): Promise<Article[]> {
  const { data } = await api.get<Article[]>('/articles');
  return data;
}

export async function getArticle(id: string): Promise<Article> {
  const { data } = await api.get<Article>(`/articles/${id}`);
  return data;
}

export async function createArticle(payload: ArticleInput): Promise<Article> {
  const { data } = await api.post<Article>('/articles', payload);
  return data;
}

export async function updateArticle(
  id: string,
  payload: Partial<ArticleInput>,
): Promise<Article> {
  const { data } = await api.patch<Article>(`/articles/${id}`, payload);
  return data;
}

export async function deleteArticle(id: string): Promise<void> {
  await api.delete(`/articles/${id}`);
}
