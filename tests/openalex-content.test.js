import { afterEach, expect, it } from 'vitest';
import { createApp } from '../server/app.js';

/** @type {import('node:http').Server[]} */
const servers = [];
async function start(options) {
  const app = createApp({ root: process.cwd(), auth: {}, projects: {}, schedule: false, config: { authEnabled: false }, openalexContent: options });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}
afterEach(() => { while (servers.length) servers.pop()?.close(); });

it('서버 키로 고정된 OpenAlex 원문만 요청하고 키는 응답에 넣지 않는다', async () => {
  let url = '', authorization = '';
  const base = await start({ apiKey: 'fixture-secret', fetchImpl: async (u, options) => {
    url = String(u); authorization = options.headers.Authorization;
    return new Response('%PDF-fixture', { status: 200, headers: { 'content-type': 'application/pdf' } });
  } });
  const response = await fetch(base + '/api/openalex-pdf?work=W123');
  expect(response.status).toBe(200);
  expect(url).toBe('https://content.openalex.org/works/W123.pdf');
  expect(authorization).toBe('Bearer fixture-secret');
  expect(await response.text()).toBe('%PDF-fixture');
  expect(JSON.stringify([...response.headers])).not.toContain('fixture-secret');
  expect((await fetch(base + '/api/openalex-pdf?work=W123%2F..')).status).toBe(400);
});

it('키 누락·한도·리다이렉트·잘못된 PDF를 명확히 거절한다', async () => {
  const missing = await start({});
  expect((await fetch(missing + '/api/openalex-pdf?work=W1')).status).toBe(503);
  for (const status of [429, 302, 200]) {
    const base = await start({ apiKey: 'fixture-secret', fetchImpl: async () => new Response('not a pdf', { status, headers: { 'content-type': 'text/html' } }) });
    const response = await fetch(base + '/api/openalex-pdf?work=W1');
    expect(response.status).toBe(status === 429 ? 429 : 502);
    expect(await response.text()).not.toContain('fixture-secret');
  }
});
