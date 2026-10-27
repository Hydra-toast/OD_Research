import { describe, it, expect } from 'vitest';
import { createApp } from '../server/app.js';
import { createMemoryProjects } from '../server/projects.js';
import { privateIp, findDoi } from '../server/fulltext.js';

function makePdf(text) {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const stream = `BT /F1 12 Tf 50 700 Td (${text}) Tj ET`;
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}
const PDF = makePdf('Sample paper doi 10.1234/abc.5 shows resist sensitivity of 30 mJ per cm2');

const reply = (bytes, { status = 200, headers = {} } = {}) => ({
  status, ok: status < 400, headers: { get: k => headers[k.toLowerCase()] ?? null }, arrayBuffer: async () => bytes,
});
const publicLookup = async () => [{ address: '93.184.216.34' }];

async function start(fetchImpl, extra = {}) {
  const app = createApp({ auth: {}, projects: createMemoryProjects(), schedule: false, config: { authEnabled: false, searchEnabled: false }, root: process.cwd(), fulltext: { fetchImpl, lookup: publicLookup, ...extra } });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  return { server, base: `http://127.0.0.1:${/** @type {any} */ (server.address()).port}` };
}
const post = (base, body) => fetch(base + '/api/fulltext/fetch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());

describe('fulltext', () => {
  it('암호화 표시만으로 접근 가능한 PDF를 거절하지 않는다', async () => {
    const readable = Buffer.concat([PDF, Buffer.from('\n% /Encrypt\n')]);
    const { server, base } = await start(async () => reply(readable));
    try { expect((await post(base, { urls: ['https://example.org/a.pdf'] })).status).toBe('extracted'); }
    finally { server.close(); }
  });
  it('공개 사이트는 공개 PDF 경로만 허용하고 출처·파일 크기·내부 주소를 확인한다', async () => {
    const { server, base } = await start(async () => reply(PDF), { publicFetch: true, maxFileBytes: 1024 });
    try {
      const headers = { 'content-type': 'application/json', origin: 'https://www.ondot.my' };
      const ok = await fetch(base + '/api/fulltext/fetch', { method: 'POST', headers, body: JSON.stringify({ urls: ['https://example.org/a.pdf'] }) });
      expect((await ok.json()).status).toBe('extracted');
      const bad = await fetch(base + '/api/fulltext/fetch', { method: 'POST', headers: { ...headers, origin: 'https://evil.example' }, body: '{}' });
      expect(bad.status).toBe(403);
      const internal = await fetch(base + '/api/fulltext/fetch', { method: 'POST', headers, body: JSON.stringify({ urls: ['https://127.0.0.1/a.pdf'] }) });
      expect((await internal.json()).status).toBe('blocked_host');
      const upload = await fetch(base + '/api/fulltext/upload', { method: 'POST', headers, body: '{}' });
      expect(upload.status).toBe(403);
    } finally { server.close(); }
    const limited = await start(async () => reply(PDF), { publicFetch: true, maxFileBytes: 5 });
    try { expect((await post(limited.base, { urls: ['https://example.org/a.pdf'] })).status).toBe('too_large'); }
    finally { limited.server.close(); }
  });
  it('보조 함수', () => {
    expect(privateIp('10.1.2.3')).toBe(true);
    expect(privateIp('::1')).toBe(true);
    expect(privateIp('93.184.216.34')).toBe(false);
    expect(findDoi('see 10.1234/abc.5).')).toBe('10.1234/abc.5');
  });

  it('공개 PDF를 받아 쪽별 텍스트를 추출하고 다음 후보로 넘어간다', async () => {
    const seen = [];
    const { server, base } = await start(async (url) => {
      seen.push(url);
      if (url.includes('landing')) return reply(Buffer.from('<html>login</html>'));
      return reply(PDF);
    });
    const r = await post(base, { urls: ['https://example.org/landing', 'https://example.org/a.pdf'] });
    expect(r.status).toBe('extracted');
    expect(r.pages[0].text).toContain('resist sensitivity');
    expect(r.sha256).toHaveLength(64);
    expect(r.source).toBe('example.org');
    expect(seen).toHaveLength(2);
    server.close();
  });

  it('HTML만 오면 not_pdf, 후보가 없으면 no_candidate', async () => {
    const { server, base } = await start(async () => reply(Buffer.from('<html></html>')));
    expect((await post(base, { urls: ['https://example.org/x'] })).status).toBe('not_pdf');
    expect((await post(base, { urls: [] })).status).toBe('no_candidate');
    server.close();
  });

  it('http, 내부망, 사설 IP로 풀리는 이름, 사설 주소 리다이렉트를 막는다', async () => {
    let calls = 0;
    const { server, base } = await start(async (url) => {
      calls++;
      if (url.includes('redir')) return reply(Buffer.alloc(0), { status: 302, headers: { location: 'https://127.0.0.1/secret.pdf' } });
      return reply(PDF);
    });
    expect((await post(base, { urls: ['http://example.org/a.pdf'] })).status).toBe('not_https');
    expect((await post(base, { urls: ['https://127.0.0.1/a.pdf'] })).status).toBe('blocked_host');
    expect((await post(base, { urls: ['https://example.org/redir'] })).status).toBe('blocked_host');
    expect(calls).toBe(1);
    server.close();
    const priv = await start(async () => reply(PDF), { lookup: async () => [{ address: '192.168.0.5' }] });
    expect((await post(priv.base, { urls: ['https://example.org/a.pdf'] })).status).toBe('blocked_host');
    priv.server.close();
  });

  it('크기 초과와 다른 출처 요청을 거절한다', async () => {
    const { server, base } = await start(async () => reply(PDF, { headers: { 'content-length': String(30 * 1024 * 1024) } }));
    expect((await post(base, { urls: ['https://example.org/a.pdf'] })).status).toBe('too_large');
    const bad = await fetch(base + '/api/fulltext/fetch', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{}' });
    expect(bad.status).toBe(403);
    server.close();
  });

  it('메일 주소가 있으면 Unpaywall의 모든 사본을 후보로 쓴다', async () => {
    const seen = [];
    const { server, base } = await start(async (url) => {
      seen.push(url);
      if (url.startsWith('https://api.unpaywall.org/')) return reply(Buffer.from(JSON.stringify({ oa_locations: [{ url_for_pdf: 'https://repo.example.org/p.pdf' }, { url_for_pdf: null }] })));
      return reply(PDF);
    }, { mailto: 'me@example.org' });
    const r = await post(base, { doi: '10.1234/abc', urls: [] });
    expect(r.status).toBe('extracted');
    expect(r.source).toBe('repo.example.org');
    expect(seen[0]).toContain('api.unpaywall.org/v2/10.1234%2Fabc');
    server.close();
  });

  it('올린 PDF에서 텍스트와 DOI를 찾고, PDF가 아니면 거절한다', async () => {
    const { server, base } = await start(async () => reply(PDF));
    const ok = await (await fetch(base + '/api/fulltext/upload', { method: 'POST', headers: { 'content-type': 'application/pdf' }, body: PDF })).json();
    expect(ok.status).toBe('extracted');
    expect(ok.doiFound).toBe('10.1234/abc.5');
    const bad = await (await fetch(base + '/api/fulltext/upload', { method: 'POST', headers: { 'content-type': 'application/pdf' }, body: Buffer.from('hello world') })).json();
    expect(bad.status).toBe('not_pdf');
    server.close();
  });
});
