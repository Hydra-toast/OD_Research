import { describe, it, expect } from 'vitest';
import { validatePaper, validateEvidence, validateClaim, validateCell, dedupePapers, assertModeConsistent, validateProject } from '../src/schema.js';
import { EXAMPLE_TOPICS } from '../src/data/examples.js';
import { createExampleProvider } from '../src/providers/example.js';
import { createFixtureProvider, createFailingRepository, fixturePaper, SCENARIOS } from '../src/providers/fixture.js';
import { createMemoryRepository } from '../src/repository/memory.js';

describe('예시 자료', () => {
  it('충분 사례 8편 이상, 부족 사례 3편, 모두 유효', () => {
    expect(EXAMPLE_TOPICS.euv.papers.length).toBeGreaterThanOrEqual(8);
    expect(EXAMPLE_TOPICS.ald.papers.length).toBeGreaterThanOrEqual(8);
    expect(EXAMPLE_TOPICS.hbm.papers.length).toBe(3);
    for (const t of Object.values(EXAMPLE_TOPICS)) for (const p of t.papers) {
      expect(validatePaper(p, 'example')).toEqual([]);
      expect(p.doi).toBeNull();
      expect(p.title).toContain('예시');
    }
  });
});

describe('스키마', () => {
  it('초록 전용 논문에 위치가 있으면 거부', () => {
    const p = fixturePaper('fx:1');
    const ev = { paperId: 'fx:1', excerpt: 'x', location: { page: 3, section: null, figure: null, table: null } };
    expect(validateEvidence(ev, [p]).length).toBeGreaterThan(0);
    expect(validateEvidence({ ...ev, location: { page: null, section: null, figure: null, table: null } }, [p])).toEqual([]);
  });
  it('존재하지 않는 논문/근거 ID 참조 거부', () => {
    expect(validateEvidence({ paperId: 'nope', excerpt: 'x', location: {} }, [])).toEqual(['paperId가 존재하지 않음']);
    const c = { text: 't', evidenceIds: ['e9'], state: { sourceLinked: true, aiInterpreted: false, userConfirmed: false, needsCheck: true } };
    expect(validateClaim(c, [{ id: 'e1' }]).length).toBeGreaterThan(0);
  });
  it('실자료에 example: ID, 예시에 DOI 거부', () => {
    expect(validatePaper(fixturePaper('example:x'))).toContain('실자료에 example: ID 금지');
    const ex = { ...EXAMPLE_TOPICS.euv.papers[0], doi: '10.1/x' };
    expect(validatePaper(ex)).toContain('예시에 DOI 금지');
  });
  it('접근 상태와 초록 일관성', () => {
    expect(validatePaper(fixturePaper('a', { access: 'metadata' })).length).toBeGreaterThan(0);
  });
  it('빈 셀은 이유 필수', () => {
    expect(validateCell({ value: null }).length).toBe(1);
    expect(validateCell({ value: null, emptyReason: 'extraction_failed' })).toEqual([]);
    expect(validateCell({ value: '10 nm' })).toEqual([]);
  });
  it('Project 검증', () => {
    expect(validateProject({ id: 'p', originalInput: 'x', dataMode: 'example', queries: [], exclusions: [] })).toEqual([]);
    expect(validateProject({ id: 'p' }).length).toBeGreaterThan(0);
  });
});

describe('중복 정리와 모드', () => {
  it('제목만 같으면 합치지 않고 DOI/providerId가 같으면 합친다', () => {
    const a = fixturePaper('a', { title: 'same', providerId: 'p1' });
    const b = fixturePaper('b', { title: 'same', providerId: 'p2' });
    const c = fixturePaper('c', { title: 'other', providerId: 'p1' });
    expect(dedupePapers([a, b]).length).toBe(2);
    expect(dedupePapers([a, c]).length).toBe(1);
    const d1 = fixturePaper('d1', { doi: '10.1/ABC', providerId: null });
    const d2 = fixturePaper('d2', { doi: '10.1/abc', providerId: null });
    expect(dedupePapers([d1, d2]).length).toBe(1);
  });
  it('모드 혼합 차단', () => {
    expect(() => assertModeConsistent('real', EXAMPLE_TOPICS.euv.papers)).toThrow();
    expect(() => assertModeConsistent('example', [fixturePaper('fx:1')])).toThrow();
  });
});

describe('공급자', () => {
  it('예시 공급자: 범위 밖 입력은 빈 결과와 안내', async () => {
    const r = await createExampleProvider().search('양자 컴퓨터');
    expect(r.papers).toEqual([]);
    expect(r.warnings[0]).toContain('실검색은 아직 연결되지 않았어요');
  });
  it('예시 공급자가 EUV 입력에 예시 8편 반환', async () => {
    const r = await createExampleProvider().search('EUV 포토레지스트');
    expect(r.papers.length).toBe(8);
  });
  it('고정 응답 9개 시나리오', async () => {
    expect(SCENARIOS.length).toBe(9);
    expect((await createFixtureProvider('ok').search('q')).papers.length).toBe(3);
    expect((await createFixtureProvider('empty').search('q')).papers.length).toBe(0);
    await expect(createFixtureProvider('rate_limited').search('q')).rejects.toMatchObject({ code: 'rate_limited', retryAfterSec: 2 });
    const na = await createFixtureProvider('no_abstract').search('q');
    expect(na.papers[0].abstract).toBeNull();
    expect((await createFixtureProvider('partial').search('q')).partial).toBe(true);
    expect((await createFixtureProvider('slow', { delayMs: 5 }).search('q')).papers.length).toBe(3);
    expect(() => createFixtureProvider('unknown')).toThrow();
  });
  it('실패 시 예시 공급자로 바꾸지 않음(공급자 mode 유지)', async () => {
    const p = createFixtureProvider('rate_limited');
    await expect(p.search('EUV')).rejects.toBeTruthy();
    expect(p.mode).toBe('fixture');
  });
  it('같은 계약을 따른다', () => {
    for (const p of [createExampleProvider(), createFixtureProvider('ok')]) {
      expect(typeof p.search).toBe('function');
      expect(typeof p.resolve).toBe('function');
    }
  });
});

describe('저장소', () => {
  it('저장·조회·목록·삭제', async () => {
    const r = createMemoryRepository();
    const proj = { id: 'p1', originalInput: 'x', scope: '', exclusions: [], queries: [], dataMode: /** @type {'example'} */ ('example') };
    await r.save(proj);
    expect((await r.list()).length).toBe(1);
    expect((await r.load('p1'))?.id).toBe('p1');
    await r.delete('p1');
    expect(await r.load('p1')).toBeNull();
  });
  it('잘못된 Project 저장 거부, 저장 실패 시뮬레이션', async () => {
    await expect(createMemoryRepository().save(/** @type {any} */ ({ id: 'x' }))).rejects.toThrow();
    await expect(createFailingRepository().save(/** @type {any} */ ({}))).rejects.toMatchObject({ code: 'save_failed' });
  });
});
