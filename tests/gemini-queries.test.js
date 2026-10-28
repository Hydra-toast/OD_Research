import { describe, it, expect } from 'vitest';
import { queryInput, queryResult, createGeminiQueries } from '../server/gemini-queries.js';
import { createApp } from '../server/app.js';

const input = { speech: '리그닌 전기방사', field: '소재', conditions: '' };
const raw = { name: '리그닌 전기방사', question: '어떻게 만드는가?', core: ['lignin', 'electrospinning'], assumptions: [], unknowns: [], queries: ['lignin electrospinning fibers', 'lignin nanofiber polymers', 'lignin spinning conditions', 'lignin polymer blends', 'lignin fiber morphology'].map(text => ({ text, purpose: '관련 연구 탐색' })) };

describe('Gemini 검색어 생성', () => {
  it('기존 상담 형식과 검색 제약을 검증한다', () => {
    expect(queryResult(raw, queryInput(input))).toMatchObject({ schemaVersion: 'consult-v1', source: 'gemini-api', speech: input.speech });
    expect(() => queryResult({ ...raw, queries: raw.queries.slice(0, 4) }, input)).toThrow();
    expect(() => queryResult({ ...raw, queries: [...raw.queries.slice(0, 4), { text: 'lignin AND fibers', purpose: 'x' }] }, input)).toThrow();
    expect(() => queryResult({ ...raw, queries: [...raw.queries.slice(0, 4), raw.queries[0]] }, input)).toThrow();
    expect(() => queryInput({ ...input, speech: '' })).toThrow();
  });
  it('Gemini에 조사 내용만 전달하고 지정된 응답 형식을 요청한다', async () => {
    let sent = /** @type {any} */ (null);
    const ai = createGeminiQueries({ apiKey: 'fixture-secret', fetchImpl: /** @type {any} */ (async (_url, options) => { sent = JSON.parse(options.body); return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(raw) }] } }] }) }; }) });
    expect((await ai(input)).queries).toHaveLength(5);
    expect(JSON.parse(sent.contents[0].parts[0].text)).toEqual(input);
    expect(sent.generationConfig.responseMimeType).toBe('application/json');
  });
  it('로컬 같은 출처만 허용하고 검증된 결과를 반환한다', async () => {
    let calls = 0;
    const app = createApp({ root: process.cwd(), auth: {}, projects: {}, schedule: false, config: { authEnabled: false }, geminiQueries: async () => { calls++; return raw; } });
    const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    try {
      const base = `http://127.0.0.1:${/** @type {any} */ (server).address().port}`;
      const post = origin => fetch(base + '/api/research/gemini-queries', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(input) });
      expect((await post('https://example.com')).status).toBe(403);
      const response = await post(base);
      expect(response.status).toBe(200);
      expect((await response.json()).brief.queries).toHaveLength(5);
      expect(calls).toBe(1);
    } finally { /** @type {any} */ (server).close(); }
  });
});
