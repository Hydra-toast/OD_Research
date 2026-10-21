import { describe, it, expect, vi, afterEach } from 'vitest';
import { planQuery } from '../src/search/terms.js';
import { createSearchCache, TTL } from '../src/search/cache.js';
import { createLiveSearch } from '../src/providers/live.js';
import { createApp } from '../server/app.js';
import { createDisabledAuth } from '../server/auth.js';
import { createMemoryProjects } from '../server/projects.js';
import { readConfig } from '../server/env.js';
import { reconstructAbstract } from '../src/providers/live.js';
import { exploreHtml } from '../src/views/explore.js';
import { evidenceHtml } from '../src/views/evidence.js';
import { fresh } from '../src/state/store.js';
import { toRecord, fromRecord, validateRecord } from '../src/state/record.js';
import { buildCompareRows } from '../src/logic.js';
afterEach(() => vi.unstubAllEnvs());

describe('검색 설정과 표시', () => {
  it('키가 없어도 검색을 켜며 명시적인 false만 비활성화한다', () => {
    vi.stubEnv('OPENALEX_API_KEY', ''); vi.stubEnv('SEARCH_ENABLED', '');
    expect(readConfig().searchEnabled).toBe(true);
    expect(readConfig().openalexKey).toBe('');
    vi.stubEnv('SEARCH_ENABLED', 'false');
    expect(readConfig().searchEnabled).toBe(false);
  });
  it('초록 위치를 정렬하고 잘못된 인덱스는 무시한다', () => {
    expect(reconstructAbstract({ result: [2], Test: [0], reported: [1], invalid: [-1, 200000] })).toBe('Test reported result');
    expect(reconstructAbstract(null)).toBeNull();
  });
  it('실제 검색의 0건·오류·초록을 가상 예시로 표시하지 않는다', () => {
    expect(exploreHtml({ ...fresh(), dataMode: 'real', status: 'empty' })).toContain('검색 결과가 없어요');
    const error = exploreHtml({ ...fresh(), dataMode: 'real', status: 'error', searchError: '공급자 오류' });
    expect(error).toContain('공급자 오류');
    expect(error).not.toContain('예시 공급자 오류');
    const evidence = evidenceHtml({ ...fresh(), evOpen: { paperId: 'oa:W1' }, papers: [{ id: 'oa:W1', title: 'Test', source: 'OpenAlex', origin: 'provider', access: 'abstract', abstract: 'Actual API abstract' }] });
    expect(evidence).toContain('OpenAlex');
    expect(evidence).not.toContain('가상 예시 문서');
  });
  it('실검색 저장·복원은 모드를 유지하고 예시 문헌 혼합을 거부한다', () => {
    const p = { id: 'oa:W1', providerId: 'W1', title: 'Fixture', doi: null, authors: [], year: null, venue: null, citationCount: null, abstract: 'Abstract', access: 'abstract', origin: 'provider', source: 'OpenAlex', collectedAt: '2026-10-21T00:00:00Z' };
    const state = { ...fresh(), input: 'EUV photoresist', projectId: 'project-real1', name: '실제 조사', dataMode: 'real', papers: [p], selPapers: [p.id] };
    const rec = { ...toRecord(state, ''), schemaVersion: 2 };
    const checked = validateRecord(rec);
    expect(checked.errors).toEqual([]);
    expect(fromRecord(checked.record).dataMode).toBe('real');
    expect(validateRecord({ ...rec, papers: [{ ...p, id: 'example:bad' }] }).ok).toBe(false);
    expect(JSON.stringify(buildCompareRows([p], {}))).not.toContain('[가상 예시]');
  });
});

describe('검색어', () => {
  it('확인된 용어만 바꾸고 영어는 남긴다', () => {
    const q = planQuery('EUV 포토레지스트와 high-k');
    expect(q.english).toContain('EUV photoresist');
    expect(q.english).toContain('high-k');
    expect(q.dictionary).toBe(true);
  });
  it('사전에 없는 한국어는 번역했다고 두지 않는다', () => {
    const q = planQuery('우리 랩의 비밀 시료');
    expect(q.untranslated).toContain('우리');
    expect(q.english).toContain('비밀');
  });
});

describe('캐시', () => {
  it('검색은 1시간, 0건은 5분, 개인 검색은 사용자별로 격리한다', async () => {
    let t = 0;
    const cache = createSearchCache({ now: () => t });
    let n = 0;
    const a = await cache.get('s2|q|0', () => TTL.search, async () => { n++; return { data: [{}] }; });
    const b = await cache.get('s2|q|0', () => TTL.search, async () => { n++; return { data: [{}] }; });
    expect(a.cached).toBe(false);
    expect(b.cached).toBe(true);
    t += TTL.search + 1;
    await cache.get('s2|q|0', () => TTL.search, async () => { n++; return { data: [{}] }; });
    expect(n).toBe(2);
    const empty = createSearchCache({ now: () => 0 });
    await empty.get('s2|none|0', (v) => (v.data.length ? TTL.search : TTL.empty), async () => ({ data: [] }));
    t = TTL.empty + 1;
    const personal = createSearchCache({ now: () => 0 });
    let calls = 0;
    await personal.get('k', TTL.search, async () => { calls++; return 1; }, { personal: true, userId: 'a' });
    await personal.get('k', TTL.search, async () => { calls++; return 1; }, { personal: true, userId: 'b' });
    await personal.get('k', TTL.search, async () => { calls++; return 1; }, { personal: true });
    expect(calls).toBe(3);
  });
});

function json(body, status = 200, headers = {}) {
  return { ok: status < 300, status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, json: async () => body };
}
const row = (id, extra = {}) => ({
  id: 'https://openalex.org/W' + id, title: 'Fixture paper ' + id,
  abstract_inverted_index: { Test: [0], abstract: [1] }, publication_year: 2020,
  authorships: [{ author: { display_name: 'Fixture Author' } }], cited_by_count: 3,
  doi: 'https://doi.org/10.1234/' + id, primary_location: { source: { display_name: 'Fixture Journal' } }, ...extra,
});
const oa = (rows, count = rows.length) => ({ meta: { count }, results: rows });

describe('OpenAlex + Crossref 공급자', () => {
  it('키 없이 OpenAlex 검색·초록 복원·중복 정리, Crossref 이메일로 결측만 보완한다', async () => {
    const calls = [];
    const fetchImpl = async (url, opts) => {
      calls.push({ url: String(url), headers: opts.headers });
      if (String(url).includes('crossref')) return json({ message: { DOI: '10.1234/1', title: ['Fixture'], 'container-title': ['Applied'], issued: { 'date-parts': [[2021]] } } });
      return json(oa([row('1', { abstract_inverted_index: null, primary_location: null, publication_year: null }), row('2'), row('3', { doi: 'https://doi.org/10.1234/1' })], 3));
    };
    const r = await createLiveSearch({ fetchImpl, mailto: 'a@example.test' }).search({ english: 'EUV photoresist' });
    expect(r.papers.map(p => p.id)).toEqual(['oa:W1', 'oa:W2']);
    expect(r.papers[0].access).toBe('metadata');
    expect(r.papers[0].venue).toBe('Applied');
    expect(r.papers[0].year).toBe(2021);
    expect(r.papers[0].fieldSources?.venue).toBe('Crossref');
    expect(r.papers[1].abstract).toBe('Test abstract');
    expect(r.estimatedTotal).toBe(3);
    expect(r.source).toBe('OpenAlex');
    expect(calls[0].url).toContain('per_page=50');
    expect(calls[0].headers).not.toHaveProperty('Authorization');
    expect(calls[1].url).toContain('mailto=a%40example.test');
    expect(calls[1].headers['user-agent']).toContain('mailto:a@example.test');
    expect(calls.every(c => !c.url.includes('semanticscholar'))).toBe(true);
  });
  it('선택 키는 OpenAlex 헤더에만 보내고 원문 URL 존재를 fulltext로 오인하지 않는다', async () => {
    const calls = [];
    const live = createLiveSearch({ apiKey: 'secret', mailto: 'a@example.test', fetchImpl: async (url, opts) => {
      calls.push({ url: String(url), headers: opts.headers });
      if (String(url).includes('crossref')) return json({ message: { DOI: '10.1234/1', title: ['Fixture'] } });
      return json(oa([row('1', { abstract_inverted_index: null, best_oa_location: { pdf_url: 'https://example.test/paper.pdf' }, content_urls: { pdf: 'https://content.openalex.org/works/W1.pdf?api_key=secret' } })]));
    } });
    const r = await live.search({ english: 'q', page: 1 });
    expect(calls[0].headers.Authorization).toBe('Bearer secret');
    expect(calls[0].url).not.toContain('secret');
    expect(calls[0].url).toContain('page=2');
    expect(calls[1].headers).not.toHaveProperty('Authorization');
    expect(r.papers[0].access).toBe('metadata');
    expect(r.papers[0].fulltext?.status).toBe('not_fetched');
    expect(JSON.stringify(r)).not.toContain('secret');
  });
  it('인용수 결측과 초록 미확보를 그대로 두고 0건은 다른 공급자로 채우지 않는다', async () => {
    const live = createLiveSearch({ fetchImpl: async () => json(oa([row('1', { cited_by_count: undefined, abstract_inverted_index: null })])) });
    const p = (await live.search({ english: 'q' })).papers[0];
    expect(p.citationCount).toBeNull();
    expect(p.abstract).toBeNull();
    let n = 0;
    const empty = createLiveSearch({ fetchImpl: async () => { n++; return json(oa([])); } });
    expect((await empty.search({ english: 'none' })).papers).toEqual([]);
    expect(n).toBe(1);
  });
  it('OpenAlex 장애는 명시적으로 Crossref로 대체하고 초록 JATS를 텍스트로 보완한다', async () => {
    const live = createLiveSearch({ fetchImpl: async url => String(url).includes('openalex') ? json({}, 503) : json({ message: { 'total-results': 1, items: [{
      DOI: '10.1234/test', title: ['Crossref fixture'], abstract: '<jats:p>Reported <b>result</b></jats:p>',
      author: [{ given: 'Test', family: 'Author' }], issued: { 'date-parts': [[2024]] },
    }] } }) });
    const r = await live.search({ english: 'q' });
    expect(r.source).toBe('Crossref');
    expect(r.partial).toBe(true);
    expect(r.warnings.join()).toContain('Crossref 공개 검색');
    expect(r.papers[0].abstract).toBe('Reported result');
    expect(r.papers[0].id).toBe('cr:10.1234%2Ftest');
    expect(r.papers[0].citationCount).toBeNull();
  });
  it('Crossref 보완 실패는 OpenAlex 논문을 보존하고 경고한다', async () => {
    const live = createLiveSearch({ mailto: 'a@example.test', fetchImpl: async url => String(url).includes('openalex') ? json(oa([row('1', { primary_location: null })])) : json({}, 500) });
    const r = await live.search({ english: 'q' });
    expect(r.papers).toHaveLength(1);
    expect(r.partial).toBe(true);
    expect(r.warnings.join()).toContain('서지 보완 일부');
  });
  it('429 재시도는 지수적으로 대기하고 모두 실패해도 예시는 반환하지 않는다', async () => {
    let n = 0;
    const waits = [];
    const live = createLiveSearch({ sleep: async ms => { waits.push(ms); }, fetchImpl: async () => ++n < 3 ? json({}, 429, { 'retry-after': '0' }) : json(oa([row('1')])) });
    expect((await live.search({ english: 'q' })).papers).toHaveLength(1);
    expect(waits[0]).toBeGreaterThanOrEqual(1000);
    expect(waits[1]).toBeGreaterThanOrEqual(2000);
    const stuck = createLiveSearch({ sleep: async () => {}, fetchImpl: async () => json({}, 429) });
    await expect(stuck.search({ english: 'q' })).rejects.toMatchObject({ code: 'rate_limited' });
  });
  it('양쪽 공급자 타임아웃은 오류이며 잘못된 응답도 빈 성공으로 위장하지 않는다', async () => {
    const live = createLiveSearch({ timeoutMs: 10, sleep: async () => {}, fetchImpl: (_url, opt) => new Promise((_res, rej) => opt.signal.addEventListener('abort', () => rej(Object.assign(new Error(), { name: 'AbortError' })))) });
    await expect(live.search({ english: 'q' })).rejects.toMatchObject({ code: 'timeout' });
    const bad = createLiveSearch({ fetchImpl: async () => json({ unexpected: true }) });
    await expect(bad.search({ english: 'q' })).rejects.toBeTruthy();
  });
  it('DOI URL을 정규화하고 OpenAlex 누락 시 Crossref로 조회한다', async () => {
    const live = createLiveSearch({ fetchImpl: async url => String(url).includes('openalex') ? json({}, 404) : json({ message: { DOI: '10.1234/test', title: ['Fixture title'] } }) });
    expect((await live.resolve('https://doi.org/10.1234/test'))?.source).toBe('Crossref');
    await expect(live.resolve('not-doi')).rejects.toMatchObject({ code: 'bad_mode' });
    const missing = createLiveSearch({ fetchImpl: async () => json({}, 404) });
    expect(await missing.resolve('10.1234/test')).toBeNull();
  });
});

describe('검색 API', () => {
  it('명시적으로 검색을 끄면 503이며 키 발급 오류로 오인시키지 않는다', async () => {
    const app = createApp({ auth: createDisabledAuth(), projects: createMemoryProjects(), search: null, schedule: false, config: { authEnabled: false, searchEnabled: false }, root: process.cwd() });
    const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    try {
      const res = await fetch('http://127.0.0.1:' + /** @type {any} */ (server.address()).port + '/api/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ english: 'EUV photoresist' }) });
      const body = await res.json();
      expect(res.status).toBe(503);
      expect(body.error.message).toContain('SEARCH_ENABLED');
      expect(JSON.stringify(body)).not.toContain('example:');
    } finally { server.close(); }
  });
});
