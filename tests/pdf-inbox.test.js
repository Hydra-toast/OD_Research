import { describe, expect, it, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { createPdfInbox, documentDois, normalizeInboxDoi } from '../server/pdf-inbox.js';
import { extractPdfText } from '../server/fulltext.js';
import { buildSimplePdf } from './pdf-fixture.js';
import { matchInboxItem, parseAuthorYear } from '../src/research/inbox-match.js';

const PDF = Buffer.from('%PDF-1.4\nfixture\n%%EOF\n');
const dirs = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) {
    for (let i = 0; i < 8; i++) {
      try { await rm(d, { recursive: true, force: true }); break; }
      catch { await new Promise(r => setTimeout(r, 40)); }
    }
  }
});

async function make(extract) {
  const root = await mkdtemp(join(tmpdir(), 'rl-in-'));
  dirs.push(root);
  const inboxDir = join(root, 'inbox');
  const pdfDir = join(root, 'pdfs');
  await mkdir(inboxDir);
  await mkdir(pdfDir);
  const box = createPdfInbox({ inboxDir, pdfDir, stateFile: join(root, 'state.json'), extract, stabilityMs: 0, skipMetadata: true });
  await box.start();
  return { root, inboxDir, pdfDir, box };
}
const pages = (text) => async () => ({ status: 'extracted', pages: [{ page: 1, text }], pageCount: 1 });
async function settle(box) { await box.scanOnce(); await box.scanOnce(); await box.scanOnce(); }

describe('간단한 PDF', () => {
  it('텍스트와 DOI를 추출한다', async () => {
    const out = await extractPdfText(buildSimplePdf('doi: 10.9999/fixture'));
    expect(out.status).toBe('extracted');
    expect(out.pages[0].text).toContain('10.9999/fixture');
  });
});

describe('수신 DOI', () => {
  it('문서 DOI만 인정하고 참고문헌 DOI는 자동 연결 근거가 아니다', () => {
    expect(normalizeInboxDoi('https://doi.org/10.9999/Fixture.')).toBe('10.9999/Fixture');
    expect(documentDois({ firstPage: 'doi: 10.1000/main', metadataText: '' }).doi).toBe('10.1000/main');
    const refs = documentDois({ firstPage: 'Introduction only. References doi: 10.1000/cited' });
    expect(refs.doi).toBeNull();
    expect(refs.candidates).toEqual([]);
    expect(documentDois({ firstPage: 'doi: 10.1000/a doi: 10.1000/b' }).ambiguous).toBe(true);
  });
});

describe('조사 연결', () => {
  const papers = [{ id: 'p1', doi: '10.1000/main', title: 'Fixture title' }, { id: 'p2', doi: '10.1000/other', title: 'Other' }];
  it('고유 DOI는 자동, 복수·없음·기존 원문은 확인', () => {
    expect(matchInboxItem({ doi: '10.1000/main', doiCandidates: ['10.1000/main'], sha256: 'a', extractStatus: 'extracted', status: 'ready' }, papers, {}).action).toBe('auto');
    expect(matchInboxItem({ doi: null, doiCandidates: [], ambiguous: false, sha256: 'b', extractStatus: 'extracted', status: 'review' }, papers, {}).action).toBe('review');
    expect(matchInboxItem({ doi: null, doiCandidates: ['10.1000/a', '10.1000/b'], ambiguous: true, sha256: 'c', extractStatus: 'extracted', status: 'review' }, papers, {}).action).toBe('review');
    expect(matchInboxItem({ doi: '10.1000/main', doiCandidates: ['10.1000/main'], sha256: 'd', extractStatus: 'extracted', status: 'ready' }, papers, { p1: { status: 'extracted', sha256: 'old' } }).action).toBe('replace');
    expect(matchInboxItem({ sha256: 'old', extractStatus: 'extracted', status: 'ready', doi: '10.1000/main', doiCandidates: ['10.1000/main'] }, papers, { p1: { status: 'extracted', sha256: 'old' } }).action).toBe('ack');
  });
  it('저자명연도.pdf는 그 저자와 연도의 논문 한 편에 자동 연결한다', () => {
    const named = [{ id: 'p1', doi: null, year: 2020, title: 'Stability', authors: ['Kim, Ji'] }, { id: 'p2', doi: null, year: 2019, title: 'Other', authors: ['Lee, Ann'] }];
    expect(parseAuthorYear('Kim2020.pdf')).toEqual({ author: 'Kim', year: 2020 });
    expect(parseAuthorYear('Kim_2020.pdf')).toEqual({ author: 'Kim', year: 2020 });
    const hit = matchInboxItem({ name: 'Kim2020.pdf', doi: null, doiCandidates: [], sha256: 'n', extractStatus: 'extracted', status: 'review' }, named, {});
    expect(hit).toMatchObject({ action: 'auto', paperId: 'p1' });
    expect(matchInboxItem({ name: 'Kim2020.pdf', doi: null, doiCandidates: [], sha256: 'n2', extractStatus: 'extracted', status: 'review' }, [...named, { id: 'p3', year: 2020, title: 'Also', authors: ['Kim, Bo'] }], {}).action).toBe('review');
  });
});

describe('수신 폴더', () => {
  it('중간 파일은 무시하고 안정된 PDF만 검사한다', async () => {
    const { inboxDir, box } = await make(pages('doi: 10.9999/fixture'));
    await box.setSettings({ enabled: true });
    await writeFile(join(inboxDir, 'a.crdownload'), PDF);
    await writeFile(join(inboxDir, 'b.pdf'), PDF);
    await box.scanOnce();
    expect(box.snapshot().items).toHaveLength(0);
    await settle(box);
    const items = box.snapshot().items;
    expect(items.map(it => it.name)).toEqual(['b.pdf']);
    expect(items[0].status).toBe('ready');
    expect(items[0].doi).toBe('10.9999/fixture');
    box.stop();
  });
  it('크기가 바뀌면 기다렸다가 안정되면 처리한다', async () => {
    const { inboxDir, box } = await make(pages('doi: 10.9999/fixture'));
    await box.setSettings({ enabled: true });
    const file = join(inboxDir, 'c.pdf');
    await writeFile(file, PDF);
    await box.scanOnce();
    await writeFile(file, Buffer.concat([PDF, Buffer.from('more')]));
    await box.scanOnce();
    expect(box.snapshot().items.every(it => it.status !== 'ready')).toBe(true);
    await settle(box);
    expect(box.snapshot().items.some(it => it.status === 'ready')).toBe(true);
    box.stop();
  });
  it('출력 폴더의 PDF는 수신하지 않고, 같은 해시는 다시 처리하지 않는다', async () => {
    const { inboxDir, pdfDir, box } = await make(pages('doi: 10.9999/fixture'));
    await box.setSettings({ enabled: true });
    await writeFile(join(pdfDir, 'kept.pdf'), PDF);
    await writeFile(join(inboxDir, 'in.pdf'), PDF);
    await settle(box);
    expect(box.snapshot().items).toHaveLength(1);
    const first = box.snapshot().items[0].id;
    await writeFile(join(inboxDir, 'renamed.pdf'), PDF);
    await settle(box);
    expect(box.snapshot().items.filter(it => it.status !== 'excluded')).toHaveLength(1);
    expect(box.snapshot().items[0].id).toBe(first);
    box.stop();
  });
  it('서버를 다시 만들어도 대기열과 완료 기록이 남고 ack는 한 번만 완료된다', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rl-in-'));
    dirs.push(root);
    const inboxDir = join(root, 'inbox');
    await mkdir(inboxDir);
    const stateFile = join(root, 'state.json');
    const opts = { inboxDir, pdfDir: join(root, 'pdfs'), stateFile, extract: pages('doi: 10.9999/fixture'), stabilityMs: 0, skipMetadata: true };
    const first = createPdfInbox(opts);
    await first.start();
    await first.setSettings({ enabled: true, targetProjectId: 'p-target1' });
    await writeFile(join(inboxDir, 'paper.pdf'), PDF);
    await settle(first);
    const item = first.snapshot().items[0];
    expect(item.projectId).toBe('p-target1');
    const claimed = await first.claim(item.id, 'tab-a');
    expect(claimed && !claimed.conflict && claimed.pages?.[0]?.text).toContain('10.9999/fixture');
    expect(await first.claim(item.id, 'tab-b')).toMatchObject({ conflict: true });
    const ack = await first.ack(item.id, { token: 'tab-a', projectId: 'p-target1', paperId: 'paper-1', sha256: item.sha256 });
    expect(ack?.ok).toBe(true);
    expect((await first.ack(item.id, { token: 'tab-a', projectId: 'p-target1', paperId: 'paper-1', sha256: item.sha256 }))?.duplicate).toBe(true);
    expect((await first.ack(item.id, { token: 'tab-a', projectId: 'p-other01', paperId: 'paper-1', sha256: item.sha256 }))?.mismatch).toBe(true);
    first.stop();
    const second = createPdfInbox(opts);
    await second.start();
    expect(second.snapshot().items[0].status).toBe('done');
    await writeFile(join(inboxDir, 'paper-copy.pdf'), PDF);
    await settle(second);
    expect(second.snapshot().items.filter(it => it.status !== 'done')).toHaveLength(0);
    second.stop();
  });
  it('잠긴 파일은 대기하고 원본은 그대로다', async () => {
    let reads = 0;
    const root = await mkdtemp(join(tmpdir(), 'rl-in-'));
    dirs.push(root);
    const inboxDir = join(root, 'inbox');
    await mkdir(inboxDir);
    await writeFile(join(inboxDir, 'lock.pdf'), PDF);
    const box = createPdfInbox({
      inboxDir, pdfDir: join(root, 'pdfs'), stateFile: join(root, 'state.json'), stabilityMs: 0, skipMetadata: true,
      extract: pages('doi: 10.9999/fixture'),
      readFile: async () => { reads++; const err = /** @type {any} */ (new Error('busy')); err.code = 'EBUSY'; throw err; },
    });
    await box.start();
    await box.setSettings({ enabled: true });
    await settle(box);
    expect(box.snapshot().items[0].status).toBe('waiting');
    expect(reads).toBeGreaterThan(0);
    box.stop();
  });
});

describe('수신 API', () => {
  it('다른 출처 요청을 거절한다', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rl-in-'));
    dirs.push(root);
    const app = createApp({
      auth: {}, projects: {}, schedule: false, root, config: { authEnabled: false },
      inbox: { inboxDir: join(root, 'inbox'), pdfDir: join(root, 'pdfs'), stateFile: join(root, 'state.json'), extract: pages('x'), stabilityMs: 0 },
    });
    const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const cross = await fetch(base + '/api/pdf-inbox/settings', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://other.example' }, body: '{}' });
    expect(cross.status).toBe(403);
    const bad = await fetch(base + '/api/pdf-inbox/' + encodeURIComponent('../secret') + '/pdf');
    expect(bad.status).toBe(404);
    server.closeAllConnections();
    await new Promise(r => server.close(r));
    app.locals.inbox?.stop();
  });
});
