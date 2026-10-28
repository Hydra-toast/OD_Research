import { describe, it, expect, vi } from 'vitest';

describe('공개 사이트의 Gemini 연결', () => {
  it('활성화된 서버에서 방문자는 개인 코드 없이 요청하고 API 키는 서버에만 남는다', async () => {
    const oldKey = process.env.GEMINI_API_KEY, oldEnabled = process.env.GEMINI_PUBLIC_ENABLED;
    const realFetch = globalThis.fetch;
    let calls = 0;
    process.env.GEMINI_API_KEY = 'fixture-gemini-key';
    process.env.GEMINI_PUBLIC_ENABLED = 'true';
    vi.stubGlobal('fetch', async (url, options) => {
      if (!String(url).startsWith('https://generativelanguage.googleapis.com/')) return realFetch(url, options);
      calls++;
      expect(options.headers['x-goog-api-key']).toBe('fixture-gemini-key');
      const query = JSON.parse(options.body).generationConfig.responseJsonSchema.properties.name;
      const content = query ? { name: '가상 주제', question: '가상 질문', core: ['lignin'], assumptions: [], unknowns: [], queries: ['lignin fibers', 'lignin spinning', 'lignin polymer blend', 'lignin nanofiber process', 'lignin carbon fibers'].map(text => ({ text, purpose: '가상 탐색' })) } : { overview: '가상 연구군', recommendations: [1, 2, 3].map(number => ({ number, reason: '가상 근거' })) };
      return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(content) }] } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.resetModules();
    const { app } = await import('../server/vercel-search.js');
    const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    try {
      const base = `http://127.0.0.1:${/** @type {any} */ (server).address().port}`;
      const config = await (await realFetch(base + '/api/config')).json();
      expect(config.geminiShortlist).toBe(true);
      expect(JSON.stringify(config)).not.toContain('fixture-gemini-key');
      const response = await realFetch(base + '/api/research/gemini-shortlist', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://www.ondot.my' }, body: JSON.stringify({ topic: '가상 주제', focus: '', papers: [1, 2, 3].map(i => ({ title: `가상 예시 · 실제 논문 아님 ${i}`, abstract: `가상 초록 ${i}` })) }) });
      expect(response.status).toBe(200);
      expect((await response.json()).recommendations).toHaveLength(3);
      const queries = await realFetch(base + '/api/research/gemini-queries', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://www.ondot.my' }, body: JSON.stringify({ speech: '가상 주제', field: '', conditions: '' }) });
      expect(queries.status).toBe(200);
      expect((await queries.json()).brief.queries).toHaveLength(5);
      expect(calls).toBe(2);
    } finally {
      /** @type {any} */ (server).close();
      if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey;
      if (oldEnabled === undefined) delete process.env.GEMINI_PUBLIC_ENABLED; else process.env.GEMINI_PUBLIC_ENABLED = oldEnabled;
      vi.unstubAllGlobals();
    }
  });
});
