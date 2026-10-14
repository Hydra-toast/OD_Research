import { describe, it, expect } from 'vitest';
import { EXAMPLE_TOPICS } from '../src/data/examples.js';
import {
  metaFor, newScope, rankPapers, buildDirections, labConnection, makeUserPaper, makeClaim, candidateEvidencePapers, addEvidence,
  buildCompareRows, editCell, rowCompareWarning, suggestTopicForMaterial, buildSummaryMd, buildGuideMd, parseTerms,
} from '../src/logic.js';
import { EXAMPLE_LAB } from '../src/data/content.js';
import { createExampleAnalysis, createFixtureAnalysis } from '../src/providers/analysis.js';
import { validateDirection } from '../src/schema.js';

const euv = EXAMPLE_TOPICS.euv.papers;
const meta = metaFor('euv', euv);
const project = { id: 'p', originalInput: 'EUV', scope: 's', dataMode: 'example' };

describe('소재/대상 반영', () => {
  it('일치하는 논문이 위로, 이유에 표시', () => {
    const r = rankPapers(euv, meta, { ...newScope(), material: '금속산화물' });
    expect(meta[r.items[0].paper.id].tags).toContain('금속산화물');
    expect(r.items[0].reasons.join()).toContain('소재/대상');
    expect(r.materialMiss).toBe(false);
  });
  it('일치하는 것만 보기', () => {
    const r = rankPapers(euv, meta, { ...newScope(), material: '금속산화물', materialOnly: true });
    expect(r.items.length).toBeLessThan(8);
    expect(r.items.every(i => meta[i.paper.id].tags.includes('금속산화물'))).toBe(true);
  });
  it('일치가 없으면 알리고, 다른 주제 후보를 제안', () => {
    const r = rankPapers(euv, meta, { ...newScope(), material: 'HBM', materialOnly: true });
    expect(r.materialMiss).toBe(true);
    expect(r.items.length).toBe(8);
    expect(suggestTopicForMaterial('HBM', 'euv')).toBe('hbm');
    expect(suggestTopicForMaterial('없는 소재', 'euv')).toBeNull();
  });
  it('방향 구성도 소재로 달라진다', () => {
    const a = buildDirections('euv', euv, newScope()), b = buildDirections('euv', euv, { ...newScope(), material: '금속산화물', materialOnly: true });
    expect(b.directions.map(d => d.papers.length).join()).not.toBe(a.directions.map(d => d.papers.length).join());
  });
});

describe('방향 카드 필드', () => {
  const d = buildDirections('euv', euv, newScope()).directions[0];
  it('대표·최근·읽을 이유·관찰·해석', () => {
    expect(d.representative.length).toBeGreaterThan(0);
    expect(d.readNextWhy.length).toBe(d.readNext.length);
    expect(d.readNextWhy.every(x => x.why)).toBe(true);
    expect(d.observation.inScope).toBe(d.papers.length);
    expect(d.interpretation).toContain('예시 해석');
    expect(validateDirection(d)).toEqual([]);
  });
  it('재료/공정 유사성과 장비 가능성을 분리', () => {
    const mo = buildDirections('euv', euv, newScope()).directions.find(x => x.id === 'euv-mo');
    const c = labConnection(mo, EXAMPLE_LAB);
    expect(c.materialCommon).toContain('금속산화물');
    expect(c.processCommon).toContain('현상');
    expect(c.needs.length).toBeGreaterThan(0);
  });
  it('HBM 방향은 질문이 있다', () => {
    const hbm = EXAMPLE_TOPICS.hbm.papers;
    const user = Array.from({ length: 5 }, (_, i) => makeUserPaper({ title: `내 논문 ${i}`, abstract: '초록', branches: ['hbm-stack'], role: 'approach', tags: '적층' }, 't', () => 'r' + i));
    const um = Object.fromEntries(user.map(u => [u.paper.id, u.meta]));
    const r = buildDirections('hbm', [...hbm, ...user.map(u => u.paper)], newScope(), um);
    expect(r.available).toBe(true);
    expect(r.directions[0].question).not.toBe('');
  });
});

describe('사용자 논문', () => {
  it('검증: 제목·DOI·연도', () => {
    expect(() => makeUserPaper({ title: '' })).toThrow();
    expect(() => makeUserPaper({ title: 't', doi: 'abc' })).toThrow('DOI');
    expect(() => makeUserPaper({ title: 't', year: '12' })).toThrow('연도');
    const { paper } = makeUserPaper({ title: 't', doi: '10.1234/x', abstract: '' });
    expect(paper.access).toBe('metadata');
    expect(paper.origin).toBe('user');
  });
  it('초록 없으면 방향 8편에 세지 않는다', () => {
    const u = makeUserPaper({ title: 'a', branches: ['euv-car'] });
    expect(buildDirections('euv', [...euv.slice(0, 7), u.paper], newScope(), { [u.paper.id]: u.meta }).available).toBe(false);
  });
});

describe('구조화 셀과 직접 비교 제한', () => {
  const two = euv.slice(0, 2);
  const run = (a, b) => {
    let e = editCell({}, two[0].id, '주요 결과', a);
    e = editCell(e, two[1].id, '주요 결과', b);
    return rowCompareWarning(buildCompareRows(two, meta, e), '주요 결과');
  };
  it('단위·조건이 다르면 경고', () => {
    expect(run({ value: '12', unit: 'nm', condition: 'A' }, { value: '14', unit: 'nm', condition: 'B' })).toContain('조건');
    expect(run({ value: '12', unit: 'nm', condition: 'A' }, { value: '14', unit: 'pm', condition: 'A' })).toContain('단위');
  });
  it('같으면 경고 없음, 근거 미연결은 플래그', () => {
    expect(run({ value: '12', unit: 'nm', condition: 'A' }, { value: '14', unit: 'nm', condition: 'A' })).toBeNull();
    const c = buildCompareRows(two, meta, editCell({}, two[0].id, '주요 결과', { value: '12' }))[0].cells['주요 결과'];
    expect(c.flags).toEqual(['단위 없음', '측정 조건 없음', '근거 미연결']);
  });
  it('빈 값은 사유 필수', () => {
    expect(() => editCell({}, 'a', 'b', { value: '  ' })).toThrow();
    expect(() => editCell({}, 'a', 'b', { value: '', emptyReason: 'bogus' })).toThrow();
  });
});

describe('근거 추가 후보', () => {
  const dir = /** @type {any} */ (buildDirections('euv', euv, newScope()).directions.find(x => x.id === 'euv-sto'));
  it('후보가 있으면 추가, 없으면 빈 배열', () => {
    const c = makeClaim(dir);
    const cand = candidateEvidencePapers(c, dir, []);
    expect(cand.length).toBe(dir.papers.length - c.evidence.length);
    if (cand.length) expect(addEvidence(c, cand[0]).evidence.length).toBe(c.evidence.length + 1);
    let full = c; for (const p of cand) full = addEvidence(full, p);
    expect(candidateEvidencePapers(full, dir, [])).toEqual([]);
  });
  it('선택한 사용자 논문도 후보', () => {
    const u = makeUserPaper({ title: 'u', abstract: '초록' }).paper;
    expect(candidateEvidencePapers(makeClaim(dir), dir, [u]).map(p => p.id)).toContain(u.id);
  });
});

describe('내보내기 재작성', () => {
  const dirs = buildDirections('euv', euv, newScope()).directions.slice(0, 1);
  const u = makeUserPaper({ title: '내 논문', abstract: '내가 적은 초록' }).paper;
  const base = { project, directions: [], papers: [euv[0], u], claims: [], notesByPaper: { [euv[0].id]: '읽을 메모' }, lab: null, questions: [] };
  it('논문만 선택해도 논문·메모·사용자 혼합 안내가 들어간다', () => {
    const s = buildSummaryMd(base);
    expect(s).toContain(euv[0].title);
    expect(s).toContain('읽을 메모');
    expect(s).toContain('사용자 제공 자료');
    expect(s).toContain('가상 예시와 섞여');
    expect(buildGuideMd(base)).toContain('선택 논문 비교');
  });
  it('수정한 셀 값·조건과 문장 조건/해석·교수님 질문', () => {
    const edits = editCell({}, euv[0].id, '주요 결과', { value: '12', unit: 'nm', condition: '조건A' });
    const rows = buildCompareRows([euv[0]], meta, edits);
    const c = { ...makeClaim(dirs[0]), condition: '조건B', interpretation: '내 해석' };
    const s = buildSummaryMd({ ...base, papers: [euv[0]], rows, directions: dirs, claims: [c], questions: ['교수님 질문1'], allPapers: euv });
    for (const t of ['12 nm', '조건A', '조건B', '내 해석', '교수님 질문1', '근거 미연결', '위치 없음']) expect(s).toContain(t);
    const g = buildGuideMd({ ...base, papers: [euv[0]], rows, directions: dirs, claims: [c], notesByPaper: { [euv[0].id]: '가이드메모' }, questions: ['교수님 질문1'], allPapers: euv });
    for (const t of [euv[0].title, '가이드메모', '12 nm', '조건A', '근거 미연결']) expect(g).toContain(t);
  });
});

describe('AnalysisProvider', () => {
  const input = { topicKey: 'euv', papers: euv, scope: newScope() };
  it('예시: 8편이면 방향, 3편(HBM)이면 사유', async () => {
    const a = createExampleAnalysis();
    expect((await a.analyze(input)).directions.length).toBeGreaterThan(0);
    const h = await a.analyze({ topicKey: 'hbm', papers: EXAMPLE_TOPICS.hbm.papers, scope: newScope() });
    expect(h.directions).toEqual([]);
    expect(h.notices[0]).toContain('3편');
  });
  it('고정 응답: 성공·부분·형식오류·실패·시간초과', async () => {
    expect((await createFixtureAnalysis('ok').analyze(input)).status).toBe('ok');
    const p = await createFixtureAnalysis('partial').analyze(input);
    expect(p.status).toBe('partial'); expect(p.notices.length).toBeGreaterThan(0);
    const m = await createFixtureAnalysis('malformed').analyze(input);
    expect(m.status).toBe('partial'); expect(m.directions.every(d => d.id)).toBe(true);
    expect((await createFixtureAnalysis('fail').analyze(input)).status).toBe('failed');
    await expect(createFixtureAnalysis('timeout').analyze(input)).rejects.toMatchObject({ code: 'timeout' });
  });
  it('예시 분석은 실모드 id를 거부', async () => {
    await expect(createExampleAnalysis().analyze({ ...input, papers: [{ ...euv[0], id: 'fx:1' }] })).rejects.toThrow('모드 혼합');
  });
});

describe('parseTerms', () => { it('쉼표/줄바꿈', () => expect(parseTerms('a, b\nc')).toEqual(['a', 'b', 'c'])); });
