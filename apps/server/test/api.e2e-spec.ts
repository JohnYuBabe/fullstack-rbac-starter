import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';

/**
 * 走真实 HTTP：先用 Test 创建 Nest 应用并监听随机端口，再用 fetch 请求。
 * 不引入 supertest，E2E 与生产请求路径一致；代价是需要先把数据库迁移并 seed。
 */
describe('RBAC API (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;

  const uniqueEmail = `e2e-${Date.now()}@example.com`;
  const uniquePassword = 'e2e-password-123';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  async function call(
    path: string,
    init: RequestInit & { token?: string } = {},
  ): Promise<Response> {
    const { token, headers, ...rest } = init;
    return fetch(`${baseUrl}/api${path}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  }

  async function login(email: string, password: string): Promise<string> {
    const response = await call('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { accessToken: string };
    return body.accessToken;
  }

  it('没有 Token 时拒绝访问文章列表', async () => {
    const response = await call('/articles');
    expect(response.status).toBe(401);
  });

  it('viewer 能读，但不能写', async () => {
    const token = await login('viewer@example.com', 'viewer123');

    const list = await call('/articles', { token });
    expect(list.status).toBe(200);

    const create = await call('/articles', {
      token,
      method: 'POST',
      body: JSON.stringify({ title: 'viewer 不该写进来', content: 'x' }),
    });
    expect(create.status).toBe(403);
  });

  it('editor 能写文章，但不能管用户', async () => {
    const token = await login('editor@example.com', 'editor123');

    const create = await call('/articles', {
      token,
      method: 'POST',
      body: JSON.stringify({
        title: `editor 创建的 ${Date.now()}`,
        content: '由 e2e 创建',
      }),
    });
    expect(create.status).toBe(201);
    const article = (await create.json()) as { id: string };

    const users = await call('/users', { token });
    expect(users.status).toBe(403);

    const remove = await call(`/articles/${article.id}`, {
      token,
      method: 'DELETE',
    });
    // editor 没有 article:delete
    expect(remove.status).toBe(403);

    // 用例自己收拾干净：本地反复跑 e2e 不该在演示库里堆垃圾
    const adminToken = await login('admin@example.com', 'admin123');
    const cleaned = await call(`/articles/${article.id}`, {
      token: adminToken,
      method: 'DELETE',
    });
    expect(cleaned.status).toBe(204);
  });

  it('改角色在下一次请求就生效，不需要重新登录', async () => {
    const adminToken = await login('admin@example.com', 'admin123');

    const created = await call('/users', {
      token: adminToken,
      method: 'POST',
      body: JSON.stringify({
        email: uniqueEmail,
        name: 'E2E 用户',
        password: uniquePassword,
        roles: ['viewer'],
      }),
    });
    expect(created.status).toBe(201);
    const user = (await created.json()) as { id: string };

    const userToken = await login(uniqueEmail, uniquePassword);

    const denied = await call('/articles', {
      token: userToken,
      method: 'POST',
      body: JSON.stringify({ title: 'viewer 新建', content: 'x' }),
    });
    expect(denied.status).toBe(403);

    const promoted = await call(`/users/${user.id}`, {
      token: adminToken,
      method: 'PATCH',
      body: JSON.stringify({ roles: ['editor'] }),
    });
    expect(promoted.status).toBe(200);

    // 同一个 Token、不重新登录，权限已经变了
    const allowed = await call('/articles', {
      token: userToken,
      method: 'POST',
      body: JSON.stringify({ title: 'editor 新建', content: 'x' }),
    });
    expect(allowed.status).toBe(201);
    const authored = (await allowed.json()) as { id: string };

    // 名下有文章时删人被挡下：409，而不是外键把请求打成 500
    const blocked = await call(`/users/${user.id}`, {
      token: adminToken,
      method: 'DELETE',
    });
    expect(blocked.status).toBe(409);
    const blockedBody = (await blocked.json()) as { message: string };
    expect(blockedBody.message).toContain('篇文章');

    const articleRemoved = await call(`/articles/${authored.id}`, {
      token: adminToken,
      method: 'DELETE',
    });
    expect(articleRemoved.status).toBe(204);

    const removed = await call(`/users/${user.id}`, {
      token: adminToken,
      method: 'DELETE',
    });
    expect(removed.status).toBe(204);
  });

  it('写操作留下审计记录，包含操作人、对象与前后值', async () => {
    const adminToken = await login('admin@example.com', 'admin123');

    const created = await call('/articles', {
      token: adminToken,
      method: 'POST',
      body: JSON.stringify({
        title: `审计验证 ${Date.now()}`,
        content: '第一版',
      }),
    });
    expect(created.status).toBe(201);
    const article = (await created.json()) as { id: string };

    const updated = await call(`/articles/${article.id}`, {
      token: adminToken,
      method: 'PATCH',
      body: JSON.stringify({ content: '第二版' }),
    });
    expect(updated.status).toBe(200);

    const logs = await call('/audit-logs?pageSize=50', { token: adminToken });
    expect(logs.status).toBe(200);
    const body = (await logs.json()) as {
      items: Array<{
        action: string;
        resourceId: string;
        actorEmail: string;
        before: unknown;
        after: unknown;
      }>;
    };

    const entry = body.items.find(
      (item) =>
        item.action === 'article.update' && item.resourceId === article.id,
    );
    expect(entry).toBeDefined();
    expect(entry?.actorEmail).toBe('admin@example.com');
    expect((entry?.before as { content: string }).content).toBe('第一版');
    expect((entry?.after as { content: string }).content).toBe('第二版');

    const cleaned = await call(`/articles/${article.id}`, {
      token: adminToken,
      method: 'DELETE',
    });
    expect(cleaned.status).toBe(204);
  });

  it('admin 不能删除自己', async () => {
    const adminToken = await login('admin@example.com', 'admin123');
    const me = await call('/auth/me', { token: adminToken });
    const user = (await me.json()) as { id: string };

    const response = await call(`/users/${user.id}`, {
      token: adminToken,
      method: 'DELETE',
    });
    expect(response.status).toBe(400);
  });
});
