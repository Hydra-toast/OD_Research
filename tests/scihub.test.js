import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.js';
import { normalizeDoi, parseScihubPage } from '../server/scihub.js';
import { request } from 'node:http';

// 가상 응답만 사용하며 실제 논문·Sci-Hub에 연결하지 않는다.
const DOI = '10.9999/fixture';
const PDF = Buffer.from('%PDF-1.4\nfixture bytes only');
const servers = [];
afterEach(async () => { for (const s of servers.splice(0)) { s.closeAllConnections(); await new Promise(r => s.close(r)); } });
async function start(fetchImpl, extra = {}) {
  const app = createApp({ auth: {}, projects: {}, schedule: false, root: process.cwd(), config: { authEnabled: false }, fulltext: {
    fetchImpl, lookup: async () => [{ address: '93.184.216.34' }], scihubOrigins: ['https://fixture.example'],
    extract: async () => ({ status: 'extracted', pages: [{ page: 1, text: `Fixture ${DOI}` }], pageCount: 1 }), ...extra,
  } });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  servers.push(server);
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, post: (body = { doi: DOI }) => fetch(base + '/api/fulltext/scihub', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) };
}

describe('Sci-Hub adapter and HTTP boundary', () => {
  it('DOI와 현재 meta/object 및 상대 PDF 주소를 처리한다', () => {
    expect(normalizeDoi('https://doi.org/' + DOI)).toBe(DOI);
    expect(normalizeDoi('https://127.0.0.1/secret')).toBeNull();
    expect(parseScihubPage('<meta name="citation_pdf_url" content="/paper.pdf?a=1&amp;b=2"><object data="/paper.pdf?a=1&amp;b=2#view=FitH"></object>', 'https://fixture.example/doi', DOI).urls).toEqual(['https://fixture.example/paper.pdf?a=1&b=2']);
  });
  it('다른 DOI와 로봇 확인 화면을 성공으로 표시하지 않는다', () => {
    expect(parseScihubPage('<meta name="citation_doi" content="10.9999/other"><embed src="/x.pdf">', 'https://fixture.example/', DOI).status).toBe('doi_mismatch');
    expect(parseScihubPage('<title>로봇 확인</title><altcha-widget>', 'https://fixture.example/', DOI).status).toBe('challenge_required');
  });
  it('최종 이동 주소를 기준으로 PDF를 받아 원본·본문·DOI 일치 상태를 반환한다', async () => {
    const seen = [];
    const api = await start(async url => {
      seen.push(url);
      if (url.includes('fixture.example')) return new Response(null, { status: 302, headers: { location: 'https://mirror.example/article' } });
      if (url.endsWith('/article')) return new Response('<object data="/paper.pdf"></object>');
      return new Response(PDF);
    });
    const r = await (await api.post()).json();
    expect(r.status).toBe('extracted'); expect(r.doiVerified).toBe(true);
    expect(Buffer.from(r.pdfBase64, 'base64')).toEqual(PDF);
    expect(r.source).toBe('Sci-Hub'); expect(r.sourceUrl).toBe('https://mirror.example/paper.pdf');
    expect(r.sha256).toHaveLength(64); expect(seen).toHaveLength(3);
  });
  it('인증/도전 페이지, 원문 없음, 손상 파일을 구분한다', async () => {
    let content = '<altcha-widget>challenge</altcha-widget>';
    const api = await start(async () => new Response(content));
    expect((await (await api.post()).json()).status).toBe('challenge_required');
    content = '<html>nothing here</html>';
    expect((await (await api.post()).json()).status).toBe('not_found');
    content = '<object data="/p.pdf"></object>';
    expect((await (await api.post()).json()).status).toBe('not_pdf');
  });
  it('PDF 리다이렉트의 내부망 접근을 차단한다', async () => {
    const seen = [];
    const api = await start(async url => {
      seen.push(url);
      return url.endsWith('.pdf') ? new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/private.pdf' } }) : new Response('<embed src="/p.pdf">');
    });
    expect((await (await api.post()).json()).status).toBe('blocked_host'); expect(seen).toHaveLength(2);
  });
  it('잘못된 DOI·다른 출처·잘못된 Host는 외부 호출 전에 거절한다', async () => {
    let calls = 0;
    const api = await start(async () => { calls++; return new Response(PDF); });
    expect((await api.post({ doi: '../bad' })).status).toBe(400);
    const cross = await fetch(api.base + '/api/fulltext/scihub', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://other.example' }, body: JSON.stringify({ doi: DOI }) });
    expect(cross.status).toBe(403);
    const hostStatus = await new Promise((resolve, reject) => {
      const req = request(api.base + '/api/fulltext/scihub', { method: 'POST', headers: { 'content-type': 'application/json', host: 'other.example' } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end(JSON.stringify({ doi: DOI }));
    });
    expect(hostStatus).toBe(403); expect(calls).toBe(0);
  });
  it('20MB 초과 응답을 거절하고 다음 요청은 실행할 수 있다', async () => {
    let large = true;
    const api = await start(async () => new Response(PDF, { headers: large ? { 'content-length': String(21 * 1024 * 1024) } : {} }));
    expect((await (await api.post()).json()).status).toBe('too_large');
    large = false;
    expect((await (await api.post()).json()).status).toBe('extracted');
  });
  it('동시 다운로드를 하나로 제한한다', async () => {
    let release = () => {}, entered = () => {};
    const ready = new Promise(r => { entered = () => r(null); });
    const gate = new Promise(r => { release = () => r(null); });
    const api = await start(async () => { entered(); await gate; return new Response(PDF); });
    const first = api.post(); await ready;
    expect((await api.post()).status).toBe(429);
    release(); expect((await first).status).toBe(200);
  });
});
