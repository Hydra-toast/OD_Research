import { afterAll, beforeAll, expect, it } from 'vitest';
let server;
let base;
let configHandler, searchHandler, multiHandler, resolveHandler;
const previousSearchEnabled = process.env.SEARCH_ENABLED;
beforeAll(async () => {
  process.env.SEARCH_ENABLED = 'true';
  ({ default: configHandler } = await import('../api/config.js'));
  ({ default: searchHandler } = await import('../api/search.js'));
  ({ default: multiHandler } = await import('../api/research/search.js'));
  ({ default: resolveHandler } = await import('../api/papers/resolve.js'));
  server = await new Promise(resolve => {
    const s = configHandler.listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => {
  server?.close();
  if (previousSearchEnabled === undefined) delete process.env.SEARCH_ENABLED;
  else process.env.SEARCH_ENABLED = previousSearchEnabled;
});

it('검색 경로가 같은 서버 앱을 사용하고 설정과 입력 오류를 반환한다', async () => {
  expect(searchHandler).toBe(configHandler);
  expect(multiHandler).toBe(configHandler);
  expect(resolveHandler).toBe(configHandler);
  const config = await (await fetch(`${base}/api/config`)).json();
  expect(config).toMatchObject({ search: true, auth: false });
  const bad = await fetch(`${base}/api/search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ english: '' }) });
  expect(bad.status).toBe(400);
  expect((await bad.json()).error.code).toBe('bad_input');
  expect((await fetch(`${base}/api/inbox/status`)).status).toBe(404);
});
