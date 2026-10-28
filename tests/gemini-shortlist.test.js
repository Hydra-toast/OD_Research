import { describe, it, expect } from 'vitest';
import { createGeminiShortlist, validateShortlistInput, validateShortlistResult } from '../server/gemini-shortlist.js';
import { createApp } from '../server/app.js';

const body = { topic: '가상 주제', focus: '', papers: [
  { title: '가상 예시 · 실제 논문 아님 A', abstract: '가상 초록 A' },
  { title: '가상 예시 · 실제 논문 아님 B', abstract: '' },
  { title: '가상 예시 · 실제 논문 아님 C', abstract: '가상 초록 C' },
  { title: '가상 예시 · 실제 논문 아님 D', abstract: '가상 초록 D' },
] };

describe('Gemini 1단계 추천', () => {
  it('초록 없는 논문, 범위 밖 번호, 중복 번호를 추천하지 않는다', () => {
    const input = validateShortlistInput(body);
    expect(validateShortlistResult({ overview: '개요', recommendations: [1, 3, 4].map(number => ({ number, reason: '이유' })) }, input).recommendations).toHaveLength(3);
    for (const rows of [[{ number: 1, reason: '이유' }], [1, 2, 4].map(number => ({ number, reason: '이유' })), [1, 3, 5].map(number => ({ number, reason: '이유' })), [1, 3, 3].map(number => ({ number, reason: '이유' }))]) {
      expect(() => validateShortlistResult({ overview: '', recommendations: rows }, input)).toThrow();
    }
    expect(() => validateShortlistInput({ ...body, papers: [body.papers[1]] })).toThrow();
  });
  it('30편을 넘는 후보에서 3~5편을 추천하고 후보가 100편을 넘으면 거절한다', () => {
    const papers = Array.from({ length: 60 }, (_, i) => ({ title: `가상 예시 · 실제 논문 아님 ${i}`, abstract: `가상 초록 ${i}` }));
    const input = validateShortlistInput({ ...body, papers });
    expect(input.papers).toHaveLength(60);
    expect(validateShortlistResult({ overview: '', recommendations: [1, 30, 60].map(number => ({ number, reason: '가상 이유' })) }, input).recommendations).toHaveLength(3);
    expect(() => validateShortlistInput({ ...body, papers: Array.from({ length: 101 }, () => papers[0]) })).toThrow();
  });
  it('Gemini에는 제목·초록 자료만 보내고 서버 키나 오류 원문은 반환하지 않는다', async () => {
    let sent = /** @type {any} */ (null);
    const ai = createGeminiShortlist({ apiKey: 'test-key', fetchImpl: /** @type {any} */ (async (_url, options) => { sent = JSON.parse(options.body); return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ overview: '개요', recommendations: [{ number: 1, reason: '이유' }] }) }] } }] }) }; }) });
    const input = validateShortlistInput(body);
    expect((await ai(input)).recommendations[0].number).toBe(1);
    expect(sent.contents[0].parts[0].text).not.toContain('test-key');
    expect(sent.generationConfig.responseMimeType).toBe('application/json');
    const fail = createGeminiShortlist({ apiKey: 'test-key', fetchImpl: /** @type {any} */ (async () => ({ ok: false, status: 429 })) });
    await expect(fail(input)).rejects.toMatchObject({ code: 'gemini_limit' });
  });
  it('로컬 요청만 처리하고 정상 검증된 결과만 반환한다', async () => {
    let calls = 0;
    const app = createApp({ root: process.cwd(), auth: {}, projects: {}, schedule: false, config: { authEnabled: false }, geminiShortlist: async () => { calls++; return { overview: '개요', recommendations: [1, 3, 4].map(number => ({ number, reason: '이유' })) }; } });
    const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    try {
      const base = `http://127.0.0.1:${/** @type {any} */ (server).address().port}`;
      const post = (origin) => fetch(`${base}/api/research/gemini-shortlist`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) });
      expect((await post('https://other.example')).status).toBe(403);
      expect((await post(base)).status).toBe(200);
      expect(calls).toBe(1);
    } finally { /** @type {any} */ (server).close(); }
  });
});
