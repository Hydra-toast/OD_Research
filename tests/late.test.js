import { describe, it, expect, afterEach, vi } from 'vitest';
import { createConsentStore } from '../src/ai/consent.js';
import { createBudget } from '../src/ai/budget.js';
import { validateAnalysisOutput, DATA_NOT_INSTRUCTIONS } from '../src/ai/validate.js';
import { liveAiEnabled } from '../src/ai/prices.js';
import { createJobStore } from '../src/jobs/store.js';
import { blockedUrl, inspectPdf } from '../src/pdf/policy.js';
import { createFileStore } from '../src/pdf/files.js';
import { extractReported, refuseRank } from '../src/compare/euv.js';
import { createApp } from '../server/app.js';
import { createMemoryProjects } from '../server/projects.js';

const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
const papers = [{ id: 's2:a', access: 'abstract', abstract: 'thickness 30 nm' }];

afterEach(() => vi.unstubAllEnvs());

describe('동의·예산·분석 검증', () => {
  it('동의 전 전송 불가, 철회 후 중단, 범위가 바뀌면 다시 동의', () => {
    const c = createConsentStore();
    expect(c.allows('p', 'analyze', ['instruction'])).toBe(false);
    c.grant({ projectId: 'p', purpose: 'analyze', items: ['instruction'] });
    expect(c.allows('p', 'analyze', ['instruction'])).toBe(true);
    expect(c.allows('p', 'analyze', ['instruction', 'lab'])).toBe(false);
    expect(c.withdraw('p').providerDeletion).toContain('확인하지 않았');
    expect(c.allows('p', 'analyze', ['instruction'])).toBe(false);
  });
  it('병렬 예약은 프로젝트 예산을 넘기지 않는다', async () => {
    const b = createBudget({ dailyUsd: 1, projectUsd: 0.25 });
    const results = await Promise.allSettled([b.reserve('p', 0.2), b.reserve('p', 0.2)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
  });
  it('없는 ID·허위 위치·근거 없는 수치·제거한 제약을 거부한다', () => {
    expect(DATA_NOT_INSTRUCTIONS).toContain('실행하지 않는다');
    expect(validateAnalysisOutput({ paperIds: ['missing'] }, papers).ok).toBe(false);
    expect(validateAnalysisOutput({ paperIds: ['s2:a'], locations: [{ paperId: 's2:a', page: 1 }] }, papers).errors.join()).toContain('본문');
    expect(validateAnalysisOutput({ paperIds: ['s2:a'], numbers: [{ value: 99 }] }, papers).errors.join()).toContain('수치');
    expect(validateAnalysisOutput({ paperIds: ['s2:a'], note: '스핀 코터 필수' }, papers, ['스핀 코터']).ok).toBe(false);
    expect(validateAnalysisOutput({ paperIds: ['s2:a'], numbers: [{ value: '30' }] }, papers).accuracyVerified).toBe(false);
  });
  it('단가를 확인하지 못하면 실호출을 열지 않는다', () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    expect(liveAiEnabled()).toBe(false);
  });
});

describe('작업', () => {
  it('중복 제출, 취소, 중단된 running 복구', async () => {
    let t = 0;
    const jobs = createJobStore({ now: () => t, staleMs: 10 });
    const a = await jobs.enqueue({ projectId: 'p', idempotencyKey: 'same', inputRevision: 1, kind: 'analyze' });
    const b = await jobs.enqueue({ projectId: 'p', idempotencyKey: 'same', inputRevision: 1, kind: 'analyze' });
    expect(b.id).toBe(a.id);
    const running = await jobs.claim();
    expect(running.status).toBe('running');
    t = 50;
    expect(jobs.recover()).toEqual([a.id]);
    const again = await jobs.claim();
    jobs.cancel(again.id);
    expect(jobs.finish(again.id, { partial: true })?.status).toBe('cancelled');
  });
});

describe('PDF와 비교', () => {
  it('위장 확장자·용량·암호화·스캔·다른 소유자·삭제를 구분한다', () => {
    expect(inspectPdf(Buffer.from('fake.pdf')).code).toBe('not_pdf');
    expect(inspectPdf(Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(21 * 1024 * 1024)])).code).toBe('too_large');
    expect(inspectPdf(Buffer.from('%PDF-1.4\n/Encrypt')).code).toBe('encrypted');
    const files = createFileStore();
    const saved = files.add({ ownerId: 'a', projectId: 'p', filename: '../x.pdf', bytes: pdf });
    if (!saved.file) throw new Error('save');
    expect(saved.file.id).not.toContain('x.pdf');
    expect(files.get('b', saved.file.id)).toBeNull();
    expect(files.remove('b', saved.file.id).status).toBe('not_found');
    const gone = files.remove('a', saved.file.id);
    expect(gone.status).toBe('completed');
    expect(gone.providerDeletion).toContain('보장하지 않');
    expect(extractReported([{ page: 1, text: '' }]).every(c => c.emptyReason === 'not_found_in_sources')).toBe(true);
  });
  it('차단 URL과 합성 문서의 보고된 값만 추출한다', () => {
    expect(blockedUrl('http://example.com/a')).toBe('not_https');
    expect(blockedUrl('https://127.0.0.1/a')).toBe('blocked_host');
    expect(blockedUrl('https://169.254.169.254/')).toBe('blocked_host');
    expect(blockedUrl('https://10.1.1.1/a')).toBe('blocked_host');
    const cells = extractReported([{ page: 2, label: 'ii', text: 'photoresist: CAR\nthickness 30 nm' }]);
    expect(cells.find(c => c.key === 'thickness')).toMatchObject({ value: '30', unit: 'nm', page: 2 });
    expect(refuseRank([{ value: '30', unit: 'nm' }, { value: '40', unit: 'μm' }])).toContain('순위');
  });
  it('동의 없는 분석은 막히고 동의 후에는 고정 응답만 받는다', async () => {
    const auth = { async verify(token) { return token === 't' ? { ok: true, user: { id: 'user-a', email: 'a@x' } } : { ok: false, code: 'unauthorized' }; }, async signup() {}, async login() {}, async logout() {}, async requestReset() { return { status: 'reset_requested' }; } };
    const app = createApp({ auth, projects: createMemoryProjects(), schedule: false, config: { authEnabled: true, searchEnabled: false }, root: process.cwd(), completeAi: async () => ({ paperIds: ['s2:a'], numbers: [{ value: '30' }] }) });
    const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const port = /** @type {any} */ (server.address()).port;
    const base = `http://127.0.0.1:${port}`;
    const blocked = await fetch(base + '/api/ai/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: 'p', purpose: 'analyze', items: ['instruction'], papers }) });
    expect(blocked.status).toBe(403);
    await fetch(base + '/api/ai/consent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: 'p', purpose: 'analyze', items: ['instruction'] }) });
    const ok = await fetch(base + '/api/ai/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: 'p', purpose: 'analyze', items: ['instruction'], papers, maxUsd: 0.05 }) });
    const body = await ok.json();
    expect(ok.status).toBe(200);
    expect(body.accuracyVerified).toBe(false);
    server.close();
  });
});
