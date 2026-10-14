import { describe, it, expect } from 'vitest';
import { EXAMPLE_TOPICS } from '../src/data/examples.js';
import { fixturePaper } from '../src/providers/fixture.js';
import { metaFor, newScope, rankPapers, buildDirections, labConnection, createLatest, buildCompareRows, editCell, makeClaim, editClaimText, confirmClaim, nextQuestion, buildSummaryMd, buildGuideMd } from '../src/logic.js';
import { EXAMPLE_LAB } from '../src/data/content.js';

const euv = EXAMPLE_TOPICS.euv.papers;
const meta = metaFor('euv', euv);
const project = { id: 'p', originalInput: 'EUV', scope: 's', dataMode: 'example' };

describe('범위와 정렬', () => {
  it('제외·더 보기·방향 설정이 결과를 바꾼다', () => {
    const base = rankPapers(euv, meta, newScope());
    expect(base.items.length).toBe(8);
    const ex = rankPapers(euv, meta, { ...newScope(), exclude: ['금속산화물'] });
    expect(ex.items.length).toBeLessThan(8);
    expect(ex.excluded.length).toBeGreaterThan(0);
    const boosted = rankPapers(euv, meta, { ...newScope(), boost: ['확률적 결함'] });
    expect(meta[boosted.items[0].paper.id].tags).toContain('확률적 결함');
    expect(boosted.items[0].reasons[0]).toContain('더 보기');
  });
  it('인용수 null은 0이 아니라 뒤로 간다', () => {
    const r = rankPapers(euv, meta, newScope(), 'citations');
    const last = r.items[r.items.length - 1].paper;
    expect(last.citationCount).toBeNull();
    expect(r.items[0].paper.citationCount).toBe(Math.max(...euv.map(p => p.citationCount ?? -1)));
  });
  it('최신순', () => {
    const r = rankPapers(euv, meta, newScope(), 'recent');
    expect(r.items[0].paper.year).toBe(Math.max(...euv.map(p => p.year ?? 0)));
  });
});

describe('방향 기준', () => {
  it('7편은 거부, 8편은 허용', () => {
    expect(buildDirections('euv', euv.slice(0, 7), newScope()).available).toBe(false);
    expect(buildDirections('euv', euv, newScope()).available).toBe(true);
  });
  it('HBM 3편은 자료 부족', () => {
    const r = buildDirections('hbm', EXAMPLE_TOPICS.hbm.papers, newScope());
    expect(r.available).toBe(false);
    expect(r.reason).toContain('3편');
  });
  it('초록 없는 서지정보만 있는 항목은 8편에 세지 않는다', () => {
    const md = euv.map((p, i) => (i === 0 ? { ...p, access: 'metadata', abstract: null } : p));
    expect(buildDirections('euv', md, newScope()).available).toBe(false);
  });
  it('방향별 근거 2편 미만이면 숨김', () => {
    const r = buildDirections('euv', euv, { ...newScope(), exclude: ['확률적 결함'] });
    expect(r.directions.every(d => d.papers.length >= 2)).toBe(true);
    expect(r.directions.find(d => d.id === 'euv-sto')).toBeUndefined();
  });
  it('논문 하나가 여러 방향에 속할 수 있다', () => {
    const r = buildDirections('euv', euv, newScope());
    const c = {};
    r.directions.forEach(d => d.papers.forEach(p => { c[p.id] = (c[p.id] ?? 0) + 1; }));
    expect(Math.max(...Object.values(c))).toBeGreaterThan(1);
  });
});

describe('연구실 연결', () => {
  const dir = buildDirections('euv', euv, newScope()).directions.find(d => d.id === 'euv-mo');
  it('미입력이면 맞춤 연결 없음', () => {
    expect(labConnection(dir, null).status).toBe('none');
    expect(labConnection(dir, { materials: '', processes: '', equipment: '', measures: '' }).status).toBe('none');
  });
  it('장비는 입력 없으면 확인 필요, 있어도 실제 보유 확인 필요 문구', () => {
    const none = labConnection(dir, { materials: '금속산화물', processes: '', equipment: '', measures: '' });
    expect(none.needs.every(n => n.status === '확인 필요')).toBe(true);
    const some = labConnection(dir, EXAMPLE_LAB);
    expect(some.common).toContain('금속산화물');
    expect(some.needs.find(n => n.name === '현상 장비').status).toContain('확인 필요');
  });
});

describe('오래된 응답', () => {
  it('최신 요청만 반영', () => {
    const g = createLatest();
    const a = g.next(), b = g.next();
    expect(g.isLatest(a)).toBe(false);
    expect(g.isLatest(b)).toBe(true);
  });
});

describe('비교와 주장', () => {
  it('빈 셀은 이유가 있고 수정 이력이 남는다', () => {
    const rows = buildCompareRows(euv.slice(0, 2), meta);
    const empty = Object.values(rows[0].cells).filter(c => !c.value);
    expect(empty.length).toBeGreaterThan(0);
    expect(empty.every(c => c.emptyReason)).toBe(true);
    const edits = editCell({}, euv[0].id, '주요 결과', { value: '내가 확인한 값' }, '2026-01-01');
    const row = buildCompareRows(euv.slice(0, 1), meta, edits)[0].cells['주요 결과'];
    expect(row.value).toBe('내가 확인한 값');
    expect(row.edited).toBe(true);
    expect(row.original.emptyReason).toBe('fulltext_unavailable');
    expect(row.edits.length).toBe(1);
  });
  it('문장 수정 시 확인 해제, 근거 보존', () => {
    const dir = buildDirections('euv', euv, newScope()).directions[0];
    let c = confirmClaim(makeClaim(dir));
    expect(c.state.userConfirmed).toBe(true);
    c = editClaimText(c, '수정한 문장');
    expect(c.state.userConfirmed).toBe(false);
    expect(c.state.needsCheck).toBe(true);
    expect(c.evidenceIds.length).toBeGreaterThan(0);
    expect(c.history.length).toBe(1);
  });
  it('초록 기반 근거에는 위치가 없다', () => {
    const dir = buildDirections('euv', euv, newScope()).directions[0];
    for (const e of makeClaim(dir).evidence) expect(Object.values(e.location).every(v => v === null)).toBe(true);
  });
  it('질문 우선순위', () => {
    const dir = buildDirections('euv', euv, newScope()).directions[0];
    const c = makeClaim(dir);
    expect(nextQuestion({ ...c, evidenceIds: [] }, false)?.id).toBe('no-evidence');
    expect(nextQuestion(c, false)?.id).toBe('no-condition');
    expect(nextQuestion({ ...c, condition: 'x' }, false)).toBeNull();
    expect(nextQuestion({ ...c, condition: 'x', text: '우리 랩에서 가능하다' }, false)?.id).toBe('lab-info');
  });
});

describe('내보내기', () => {
  const dirs = buildDirections('euv', euv, newScope()).directions.slice(0, 2);
  const ctx = { project, directions: dirs, papers: euv, claims: dirs.map(makeClaim), notesByPaper: {}, lab: null, questions: [] };
  it('예시 표시·미확인·출처 범위 유지', () => {
    for (const md of [buildSummaryMd(ctx), buildGuideMd(ctx)]) {
      expect(md).toContain('가상 예시 · 실제 논문 아님');
      expect(md).toContain('미확인');
    }
    const s = buildSummaryMd(ctx);
    expect(s).toContain('초록 확보');
    expect(s).toContain('연구실 정보 미입력');
    expect(s).not.toMatch(/Figure|Fig\.|p\.\s?\d/);
  });
  it('마크다운 특수문자를 이스케이프', () => {
    const p = fixturePaper('fx:1', { title: '[x](http://evil) *b*' });
    const d = { ...dirs[0], papers: [p], readNext: [p] };
    const md = buildSummaryMd({ ...ctx, directions: [d], claims: [] });
    expect(md).not.toContain('[x](http://evil)');
  });
});
