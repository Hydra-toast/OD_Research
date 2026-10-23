import { describe, it, expect, beforeEach } from 'vitest';
import { EXAMPLE_TOPICS } from '../src/data/examples.js';
import { S, resetState } from '../src/state/store.js';
import { newScope, buildDirections, makeClaim, makeUserPaper, editCell } from '../src/logic.js';
import { exploreHtml } from '../src/views/explore.js';
import { prepareHtml } from '../src/views/prepare.js';
import { recoveryHtml, savedListHtml } from '../src/views/saved.js';
import { evidenceHtml } from '../src/views/evidence.js';

const euv = EXAMPLE_TOPICS.euv.papers;
const base = () => resetState({ status: 'ok', topicKey: 'euv', papers: euv, input: 'EUV <img src=x onerror=alert(1)>', projectId: 'p-test', warnings: ['x'] });
const withDirs = () => { const a = buildDirections('euv', euv, newScope()); S.analysis = { status: 'ok', ...a, notices: [] }; return a; };

describe('탐색 뷰', () => {
  beforeEach(() => { base(); withDirs(); });
  it('사용자 입력은 이스케이프된다', () => {
    expect(exploreHtml(S)).not.toContain('<img src=x');
  });
  it('소재 불일치 안내와 다른 주제 제안 버튼', () => {
    S.scope.material = 'HBM';
    const html = exploreHtml(S);
    expect(html).toContain('일치하는 논문이 수집한 자료에 없어요');
    expect(html).toContain('data-act="rebuild-topic" data-key="hbm"');
  });
  it('탐색 화면에는 연구 갈래와 연구 방향을 그리지 않는다', () => {
    const html = exploreHtml(S);
    expect(html).not.toContain('연구 갈래');
    expect(html).not.toContain('연구 방향');
    expect(html).not.toContain('기능 예시');
  });
  it('사용자 논문 카드는 사용자 제공 자료·확인 전 표시, 가상 라벨 아님', () => {
    const u = makeUserPaper({ title: '내 논문', abstract: '초록' });
    S.papers = [...euv, u.paper]; S.userMeta = { [u.paper.id]: u.meta }; S.showAll = true;
    const html = exploreHtml(S);
    expect(html).toContain('사용자 제공 자료 · 확인 전');
    expect(html).toContain('입력 내용 보기');
  });
  it('추가 폼 오류는 role=alert', () => {
    S.addOpen = true; S.addError = '제목을 적어주세요.';
    expect(exploreHtml(S)).toContain('role="alert" id="add-error"');
  });
  it('실검색 목록은 30편이고 받는 중에는 취소로 바뀐다', () => {
    S.dataMode = 'real';
    S.papers = Array.from({ length: 40 }, (_, i) => ({ id: `oa:${i}`, title: `Paper ${i}`, authors: ['Kim'], year: 2020, venue: 'Journal', origin: 'provider', access: 'abstract', abstract: 'text', doi: `10.1000/${i}` }));
    S.selPapers = S.papers.slice(0, 30).map(p => p.id);
    const html = exploreHtml(S);
    expect(html.match(/<article/g)).toHaveLength(30);
    expect(html).toContain('30편 원문 모두 받기');
    expect(html).toContain('PDF 폴더 · data/inbox-pdfs/');
    expect(html).toContain('날짜와 주제 앞부분');
    expect(html).toContain('paper-row');
    expect(html).not.toContain('추가 결과 펼치기');
    S.fulltextBusy = true;
    expect(exploreHtml(S)).toContain('받기 취소');
  });
  it('상태 태그는 아이콘 + 글자', () => {
    expect(exploreHtml(S)).toMatch(/<span class="ico" aria-hidden="true">[✓!◇i]<\/span>/);
  });
});

describe('준비 뷰', () => {
  it('논문만 선택해도 화면이 구성된다(내보내기 안내 포함)', () => {
    base(); S.selPapers = [euv[0].id];
    const html = prepareHtml(S);
    expect(html).toContain('논문 비교 (1편)');
    expect(html).toContain('선택한 논문·메모·수정한 값');
  });
  it('셀 편집 양식: 값·단위·조건·근거·빈값 사유', () => {
    base(); S.selPapers = [euv[0].id]; S.editCell = { pid: euv[0].id, item: '주요 결과' };
    const html = prepareHtml(S);
    for (const n of ['name="value"', 'name="unit"', 'name="condition"', 'name="evidenceId"', 'name="emptyReason"']) expect(html).toContain(n);
  });
  it('직접 비교 제한 경고와 미연결 플래그', () => {
    base(); S.selPapers = [euv[0].id, euv[1].id];
    S.cellEdits = editCell(editCell({}, euv[0].id, '주요 결과', { value: '12', unit: 'nm', condition: 'A' }), euv[1].id, '주요 결과', { value: '14', unit: 'pm', condition: 'A' });
    const html = prepareHtml(S);
    expect(html).toContain('직접 비교 제한');
    expect(html).toContain('근거 미연결');
  });
  it('근거 후보가 없으면 안내 메시지를 그린다', () => {
    base(); const dir = /** @type {any} */ (withDirs().directions.find(d => d.id === 'euv-sto'));
    S.selDirs = [dir.id]; S.dirSnap = { [dir.id]: dir }; S.claims = { [dir.id]: makeClaim(dir) };
    S.qClaim = S.claims[dir.id].id; S.qMsg = '연결할 수 있는 다른 근거가 없어요.';
    expect(prepareHtml(S)).toContain('연결할 수 있는 다른 근거가 없어요');
  });
});

describe('복구·저장 목록·근거 패널 뷰', () => {
  it('손상 화면: 사유 목록과 원본 내보내기, 자동 삭제 없음', () => {
    resetState({ status: 'corrupt', corrupt: { id: 'p-bad1', name: 'x', errors: ['claims: 객체 필요'] } });
    const html = recoveryHtml(S);
    expect(html).toContain('claims: 객체 필요'); expect(html).toContain('원본 내보내기'); expect(html).toContain('role="alert"');
  });
  it('읽기 전용 화면은 삭제 버튼이 없다', () => {
    resetState({ status: 'corrupt', readOnly: true, corrupt: { id: 'p-new1', errors: ['v3'] } });
    expect(recoveryHtml(S)).not.toContain('이 조사 삭제');
  });
  it('없는 프로젝트 화면', () => {
    resetState({ status: 'missing', notFoundId: 'p-none' });
    expect(recoveryHtml(S)).toContain('찾지 못했어요');
  });
  it('저장 목록: 손상 항목은 복구 필요 표시', () => {
    expect(savedListHtml([{ id: 'a', corrupt: true, errors: [] }])).toContain('복구 필요');
  });
  it('근거 위치가 null이어도 패널은 예외 없이 위치 없음을 보여준다', () => {
    base();
    const dir = buildDirections('euv', euv, newScope()).directions[0];
    const c = makeClaim(dir);
    c.evidence[0].location = null;
    resetState({ ...S, claims: { [dir.id]: c }, evOpen: { claimId: c.id } });
    expect(evidenceHtml(S)).toContain('위치 정보 없음');
  });
  it('예시 문서 보기: 초록과 위치 없음 안내', () => {
    base(); S.evOpen = { paperId: euv[0].id };
    const html = evidenceHtml(S);
    expect(html).toContain('가상 예시 문서'); expect(html).toContain('위치 정보 없음');
  });
});
