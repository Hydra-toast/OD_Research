import { afterEach, describe, expect, it } from 'vitest';
import middleware from '../middleware.js';

describe('사이트 비밀번호', () => {
  const original = process.env.SITE_PASSWORD;
  afterEach(() => { if (original === undefined) delete process.env.SITE_PASSWORD; else process.env.SITE_PASSWORD = original; });
  const request = (path, password) => new Request(`https://example.test${path}`, {
    headers: password === undefined ? {} : { authorization: `Basic ${btoa(`ondot:${password}`)}` },
  });
  it('설정 누락 시 사이트와 API를 차단한다', async () => {
    delete process.env.SITE_PASSWORD;
    expect((await middleware(request('/'))).status).toBe(503);
    expect((await middleware(request('/api/research/gemini-shortlist'))).status).toBe(503);
  });
  it('화면, 정적 파일, API에 동일하게 비밀번호를 요구한다', async () => {
    process.env.SITE_PASSWORD = 'example-test-password';
    for (const path of ['/', '/index.html', '/src/main.js', '/api/research/gemini-shortlist']) {
      expect((await middleware(request(path))).status).toBe(401);
      expect((await middleware(request(path, 'wrong'))).status).toBe(401);
      expect((await middleware(request(path, 'example-test-password'))).headers.get('x-middleware-next')).toBe('1');
    }
  });
});
