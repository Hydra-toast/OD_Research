import { describe, it, expect } from 'vitest';
import { EXAMPLE_TOPICS } from '../src/data/examples.js';
import { newScope, buildDirections, makeClaim, makeUserPaper, editCell, nextQuestion } from '../src/logic.js';
import { toRecord, fromRecord, validateRecord, migrateRecord, storedEntry, SCHEMA_VERSION } from '../src/state/record.js';
import { idMatchesMode, dedupePapers, validatePaper } from '../src/schema.js';
import { fixturePaper } from '../src/providers/fixture.js';

const euv = EXAMPLE_TOPICS.euv.papers;
function state() {
  const dir = buildDirections('euv', euv, newScope()).directions[0];
  return {
    projectId: 'proj-x', name: 'n', input: 'EUV', topicKey: 'euv', papers: euv, warnings: [], scope: newScope(), sort: 'relevance', lab: null,
    selPapers: [euv[0].id], selDirs: [dir.id], dirSnap: { [dir.id]: dir }, notes: { [euv[0].id]: '메모' },
    cellEdits: editCell({}, euv[0].id, '주요 결과', { value: '', emptyReason: 'extraction_failed' }),
    claims: { [dir.id]: makeClaim(dir) }, questions: [], versions: [{ at: 'a', label: 'l', scope: 's' }], revision: 1, userMeta: {},
  };
}
const rec = () => JSON.parse(JSON.stringify(toRecord(state(), 'scope')));

describe('레코드', () => {
  it('저장 → 복원 왕복과 검증 통과', () => {
    const r = rec(), v = validateRecord(r);
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
    const back = fromRecord(v.record);
    expect(back.selPapers).toEqual(state().selPapers);
    expect(back.papers.length).toBe(8);
  });
  it('손상 레코드는 열기 전에 사유와 함께 거부', () => {
    for (const mut of [r => { r.topicKey = 'missing'; delete r.papers; }, r => { r.claims = null; }, r => { r.selPapers = ['nope']; }, r => { r.notes = { ghost: 'x' }; }]) {
      const r = rec(); mut(r);
      const v = validateRecord(r);
      expect(v.ok).toBe(false);
      expect(v.errors.length).toBeGreaterThan(0);
    }
  });
  it('끊어진 참조: 근거의 논문 없음, 선택 방향의 스냅샷 없음', () => {
    const r = rec(); const k = Object.keys(r.claims)[0];
    r.claims[k].evidence[0].paperId = 'example:none';
    expect(validateRecord(r).ok).toBe(false);
    const r2 = rec(); r2.dirSnap = {};
    expect(validateRecord(r2).errors.join()).toContain('스냅샷');
  });
  it('더 새로운 버전은 읽기 전용', () => {
    const r = { ...rec(), schemaVersion: SCHEMA_VERSION + 1 };
    const v = validateRecord(r);
    expect(v.ok).toBe(false);
    expect(v.readOnly).toBe(true);
  });
  it('v0 레코드는 예시 논문으로 papers를 복원', () => {
    const r = rec(); delete r.papers; delete r.userMeta; delete r.schemaVersion;
    const m = migrateRecord(r);
    expect(m.papers.length).toBe(8);
    expect(validateRecord(r).ok).toBe(true);
  });
  it('사용자 논문이 섞여도 저장 레코드가 유효', () => {
    const { paper, meta } = makeUserPaper({ title: '내 논문', abstract: '초록', year: '2020', branches: ['euv-car'] });
    const s = state(); s.papers = [...euv, paper]; s.userMeta = { [paper.id]: meta };
    expect(validateRecord(JSON.parse(JSON.stringify(toRecord(s, 's')))).ok).toBe(true);
  });
});

describe('재감사 결손', () => {
  it('v1 비교 셀은 새 형식으로 이전되고 값이 남는다', () => {
    const r = rec();
    r.schemaVersion = 1;
    delete r.papers;
    delete r.userMeta;
    const key = Object.keys(r.cellEdits)[0];
    r.cellEdits[key] = { value: '예전 값', history: [{ at: 't', by: 'user', value: '예전 값' }] };
    const v = validateRecord(r);
    expect(v.errors).toEqual([]);
    expect(v.record.cellEdits[key].cell.value).toBe('예전 값');
    expect(v.record.cellEdits[key].history[0].cell.value).toBe('예전 값');
    expect(v.record.papers).toHaveLength(8);
    expect(r.cellEdits[key].value).toBe('예전 값');
  });
  it('null 근거·null 위치는 예외 없이 거부되고, 목록의 다른 항목은 영향 없다', () => {
    const bad = rec();
    const k = Object.keys(bad.claims)[0];
    bad.claims[k].evidence[0] = null;
    expect(() => validateRecord(bad)).not.toThrow();
    const entry = storedEntry(bad);
    expect(entry.corrupt).toBe(true);
    expect(entry.errors.join()).toContain('evidence[0]');
    expect(storedEntry(rec()).corrupt).toBeUndefined();
    const loc = rec();
    loc.claims[k].evidence[0].location = null;
    expect(validateRecord(loc).ok).toBe(false);
  });
  it('없는 근거·다음 논문 참조는 거부하고, 빈 적용 조건은 빈 문자열로 연다', () => {
    const r = rec();
    const ck = Object.keys(r.cellEdits)[0];
    r.cellEdits[ck].cell.evidenceId = 'ev:missing';
    expect(validateRecord(r).errors.join()).toContain('근거 없음');
    const d = rec();
    const dk = Object.keys(d.dirSnap)[0];
    d.dirSnap[dk].readNext = [{ id: 'example:missing', title: 'GHOST' }];
    expect(validateRecord(d).errors.join()).toContain('readNext');
    const c = rec();
    const id = Object.keys(c.claims)[0];
    c.claims[id].condition = null;
    const v = validateRecord(c);
    expect(v.ok).toBe(true);
    expect(v.record.claims[id].condition).toBe('');
    expect(() => nextQuestion(v.record.claims[id], false)).not.toThrow();
  });
});

describe('ID 접두사와 중복', () => {
  it('모드별 접두사 규칙', () => {
    expect(idMatchesMode('user:a', 'real')).toBe(true);
    expect(idMatchesMode('user:a', 'example')).toBe(true);
    expect(idMatchesMode('fx:a', 'real')).toBe(false);
    expect(idMatchesMode('example:a', 'real')).toBe(false);
    expect(idMatchesMode('example:a', 'fixture')).toBe(false);
    expect(idMatchesMode('s2:a', 'real')).toBe(true);
  });
  it('같은 id는 하나로, 같은 제목·다른 id는 유지', () => {
    const a = fixturePaper('fx:1', { title: 'T' });
    expect(dedupePapers([a, { ...a }]).length).toBe(1);
    expect(dedupePapers([a, fixturePaper('fx:2', { title: 'T' })]).length).toBe(2);
  });
  it('사용자 출처는 user: ID 필요, 공급자는 user: 금지', () => {
    const { paper } = makeUserPaper({ title: 't' });
    expect(validatePaper(paper, 'real')).toEqual([]);
    expect(validatePaper({ ...paper, id: 'x1' }, 'example').length).toBeGreaterThan(0);
    expect(validatePaper({ ...paper, origin: 'provider' }, 'real').length).toBeGreaterThan(0);
  });
});
