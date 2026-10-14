import { describe, it, expect, afterEach } from 'vitest';
import { createApp } from '../server/app.js';
import { createFixtureAuth, createSupabaseAuth } from '../server/auth.js';
import { createMemoryProjects, createSupabaseProjects } from '../server/projects.js';
import { isPublicPath } from '../server/static.js';
import { resolve } from 'node:path';

const seed = {
  users: [
    { id: 'user-a', email: 'a@example.test', password: 'password-a-123', confirmed: true },
    { id: 'user-b', email: 'b@example.test', password: 'password-b-123', confirmed: true },
    { id: 'user-p', email: 'pending@example.test', password: 'password-p-123', confirmed: false },
  ],
};

/** @type {import('node:http').Server[]} */
const servers = [];
async function boot(extra = {}) {
  const auth = createFixtureAuth(seed);
  const app = createApp({ auth, projects: extra.projects ?? createMemoryProjects(), config: { authEnabled: true }, root: resolve('.') });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  servers.push(server);
  const addr = /** @type {any} */ (server.address());
  return { auth, url: `http://127.0.0.1:${addr.port}` };
}
afterEach(() => { while (servers.length) servers.pop()?.close(); });

async function login(url, email, password) {
  const res = await fetch(url + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const body = await res.json();
  return { res, body, headers: { authorization: `Bearer ${body.token}`, 'content-type': 'application/json' } };
}
const record = { id: 'p-test1', name: '조사', originalInput: 'EUV', dataMode: 'example', queries: ['EUV'], exclusions: [], lab: { materials: '박막' } };

describe('접근 제어', () => {
  it('인증 누락·만료·로그아웃 후 접근을 막는다', async () => {
    const { auth, url } = await boot();
    const missing = await fetch(url + '/api/projects');
    expect(missing.status).toBe(401);
    expect((await missing.json()).error.code).toBe('unauthorized');
    expect(missing.headers.get('x-request-id')).toBeTruthy();

    const a = await login(url, 'a@example.test', 'password-a-123');
    auth.expire(a.body.token);
    const expired = await fetch(url + '/api/projects', { headers: a.headers });
    expect(expired.status).toBe(401);
    expect((await expired.json()).error.code).toBe('token_expired');

    const again = await login(url, 'a@example.test', 'password-a-123');
    expect((await fetch(url + '/api/auth/logout', { method: 'POST', headers: again.headers })).status).toBe(200);
    const after = await fetch(url + '/api/projects', { headers: again.headers });
    expect(after.status).toBe(401);
  });

  it('다른 사용자의 조사를 읽거나 고치거나 지우지 못한다', async () => {
    const { url } = await boot();
    const a = await login(url, 'a@example.test', 'password-a-123');
    const b = await login(url, 'b@example.test', 'password-b-123');
    const saved = await fetch(url + '/api/projects/p-test1', { method: 'PUT', headers: a.headers, body: JSON.stringify({ name: 'A의 조사', baseRevision: 0, userId: 'user-b', record }) });
    expect(saved.status).toBe(200);
    for (const path of ['/api/projects/p-test1', '/api/projects']) {
      const res = await fetch(url + path, { headers: b.headers });
      const body = await res.json();
      if (path.endsWith('p-test1')) expect(res.status).toBe(404);
      else expect(body.projects).toEqual([]);
    }
    expect((await fetch(url + '/api/projects/p-test1', { method: 'PUT', headers: b.headers, body: JSON.stringify({ name: '가로채기', baseRevision: 1, record }) })).status).toBe(404);
    expect((await fetch(url + '/api/projects/p-test1', { method: 'DELETE', headers: b.headers })).status).toBe(404);
    const mine = await (await fetch(url + '/api/projects/p-test1', { headers: a.headers })).json();
    expect(mine.name).toBe('A의 조사');
    expect(JSON.stringify(mine)).not.toContain('user-b');
  });

  it('revision이 다르면 덮어쓰지 않고, 확인한 버전으로만 저장한다', async () => {
    const { url } = await boot();
    const a = await login(url, 'a@example.test', 'password-a-123');
    await fetch(url + '/api/projects/p-test1', { method: 'PUT', headers: a.headers, body: JSON.stringify({ name: 'v1', baseRevision: 0, record }) });
    const stale = await fetch(url + '/api/projects/p-test1', { method: 'PUT', headers: a.headers, body: JSON.stringify({ name: '늦은 저장', baseRevision: 0, record }) });
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.serverRevision).toBe(1);
    const still = await (await fetch(url + '/api/projects/p-test1', { headers: a.headers })).json();
    expect(still.name).toBe('v1');
    const ack = await fetch(url + '/api/projects/p-test1', { method: 'PUT', headers: a.headers, body: JSON.stringify({ name: '확인 후 저장', baseRevision: 0, acknowledgeRevision: 1, record }) });
    expect(ack.status).toBe(200);
    expect((await ack.json()).name).toBe('확인 후 저장');
  });

  it('삭제는 완료와 실패를 구분하고, 실패하면 조사를 남긴다', async () => {
    const projects = createMemoryProjects();
    const real = projects.remove.bind(projects);
    projects.remove = async (userId, id) => id === 'p-fail1' ? { status: 'failed' } : real(userId, id);
    const { url } = await boot({ projects });
    const a = await login(url, 'a@example.test', 'password-a-123');
    await fetch(url + '/api/projects/p-fail1', { method: 'PUT', headers: a.headers, body: JSON.stringify({ name: '남길 조사', baseRevision: 0, record: { ...record, id: 'p-fail1' } }) });
    const failed = await fetch(url + '/api/projects/p-fail1', { method: 'DELETE', headers: a.headers });
    expect(failed.status).toBe(500);
    expect((await failed.json()).error.status).toBe('failed');
    expect((await fetch(url + '/api/projects/p-fail1', { headers: a.headers })).status).toBe(200);
    await fetch(url + '/api/projects/p-ok1', { method: 'PUT', headers: a.headers, body: JSON.stringify({ name: '지울 조사', baseRevision: 0, record: { ...record, id: 'p-ok1' } }) });
    const ok = await fetch(url + '/api/projects/p-ok1', { method: 'DELETE', headers: a.headers });
    expect((await ok.json()).status).toBe('completed');
    expect((await fetch(url + '/api/projects/p-ok1', { headers: a.headers })).status).toBe(404);
  });

  it('이메일 미확인과 잘못된 비밀번호와 재설정 응답을 구분한다', async () => {
    const { url } = await boot();
    const pending = await fetch(url + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'pending@example.test', password: 'password-p-123' }) });
    expect((await pending.json()).error.code).toBe('email_unconfirmed');
    const bad = await fetch(url + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a@example.test', password: 'wrong-password' }) });
    expect((await bad.json()).error.code).toBe('invalid_credentials');
    const signup = await fetch(url + '/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'new@example.test', password: 'password-n-123' }) });
    expect((await signup.json()).status).toBe('confirmation_sent');
    const known = await (await fetch(url + '/api/auth/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a@example.test' }) })).json();
    const unknown = await (await fetch(url + '/api/auth/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'nobody@example.test' }) })).json();
    expect(known).toEqual(unknown);
  });
});

describe('서버 경계', () => {
  it('비밀 경로와 잘못된 본문, 계정 미설정을 막는다', async () => {
    expect(isPublicPath('/.env')).toBe(false);
    expect(isPublicPath('/docs/PROGRESS.md')).toBe(false);
    expect(isPublicPath('/server/index.js')).toBe(false);
    expect(isPublicPath('/src/app.js')).toBe(true);
    const { url } = await boot();
    expect((await fetch(url + '/.env')).status).toBe(404);
    expect((await fetch(url + '/docs/PROGRESS.md')).status).toBe(404);
    const big = await fetch(url + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a@example.test', password: 'x'.repeat(300000) }) });
    expect(big.status).toBe(413);
    const broken = await fetch(url + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
    expect((await broken.json()).error.code).toBe('bad_json');

    const { createDisabledAuth } = await import('../server/auth.js');
    const app = createApp({ auth: createDisabledAuth(), projects: createMemoryProjects(), config: { authEnabled: false }, root: resolve('.') });
    const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    servers.push(server);
    const port = /** @type {any} */ (server.address()).port;
    const cfg = await (await fetch(`http://127.0.0.1:${port}/api/config`)).json();
    expect(cfg.auth).toBe(false);
    expect(cfg.mode).toBe('example');
    expect(JSON.stringify(cfg)).not.toMatch(/service|eyJ|secret/i);
    expect((await fetch(`http://127.0.0.1:${port}/api/projects`)).status).toBe(503);
  });

  it('Supabase 어댑터는 사용자 토큰만 쓰고 service-role을 거절한다', async () => {
    /** @type {any[]} */
    const calls = [];
    const fetchImpl = async (url, opt = {}) => {
      calls.push({ url: String(url), auth: opt.headers?.authorization, apikey: opt.headers?.apikey, body: opt.body ? JSON.parse(opt.body) : null });
      if (String(url).endsWith('/auth/v1/user')) return json({ id: 'user-a', email: 'a@example.test' });
      if (String(url).includes('/projects?id=')) return json([]);
      return json([{ id: 'p-1' }], 201);
    };
    const env = { url: 'https://example.supabase.co', anonKey: 'anon-public', serviceRoleKey: 'service-secret' };
    const auth = createSupabaseAuth(env, fetchImpl);
    expect((await auth.verify('service-secret')).ok).toBe(false);
    expect((await auth.verify('user-token')).user?.id).toBe('user-a');
    expect(calls.some(c => c.apikey === 'service-secret' || c.auth?.includes('service-secret'))).toBe(false);

    const projects = createSupabaseProjects(env, fetchImpl);
    await projects.forToken('user-token').save('user-a', { id: 'p-test1', name: 'n', baseRevision: 0, record: { lab: { materials: '박막' } } });
    const post = calls.find(c => c.body?.owner_id);
    expect(post?.body.owner_id).toBe('user-a');
    expect(post?.apikey).toBe('anon-public');
    expect(post?.auth).toBe('Bearer user-token');
    await expect(projects.forToken('service-secret').list('user-a')).rejects.toMatchObject({ code: 'bad_config' });
  });
});

function json(body, status = 200) {
  return { ok: status < 300, status, json: async () => body };
}
