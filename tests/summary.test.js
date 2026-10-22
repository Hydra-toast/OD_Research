import { describe, it, expect } from 'vitest';
import { summaryPrompt, checkSummaryMd, excerptOf, EXCERPT_CAP, SUMMARY_PROMPT_VERSION } from '../src/research/summary.js';

const papers = [
  { id: 'oa:1', doi: '10.1/a', title: 'Alpha resist', year: 2020, abstract: 'Alpha abstract text.' },
  { id: 'oa:2', doi: null, title: 'Beta film', year: 2021, abstract: null },
];

describe('summaryPrompt', () => {
  it('가이드라인·번호·자료 범위를 담고 없는 내용을 지어내지 않게 한다', () => {
    const p = summaryPrompt({ topic: 'EUV', papers, fulltext: { 'oa:1': { status: 'extracted', pageCount: 2 } }, pagesById: { 'oa:1': [{ page: 1, text: 'Dose was 30 mJ' }, { page: 2, text: 'More' }] }, request: '표 위주로' });
    expect(p).toContain('[P1] Alpha resist');
    expect(p).toContain('[P2] Beta film');
    expect(p).toContain('쉬운 한국어');
    expect(p).toContain('그림·그래프 속 값을 읽어 내거나 추정하지 마세요');
    expect(p).toContain('[P1 p.5]');
    expect(p).toContain('- 자료 범위: 원문 일부');
    expect(p).toContain('초록만');
    expect(p).toContain('[p.1] Dose was 30 mJ');
    expect(p).toContain('원문 텍스트 포함 1편, 초록만 0편, 메타데이터만 1편');
    expect(p).toContain('표 위주로');
    expect(p).toContain('없음(초록을 확보하지 못함)');
  });
  it('초록만 있는 논문에는 원문 발췌를 넣지 않는다', () => {
    const p = summaryPrompt({ papers, fulltext: { 'oa:1': { status: 'no_candidate' } }, pagesById: {} });
    expect(p).not.toContain('원문 발췌');
    expect(p).toContain('확보하지 못함(no_candidate)');
  });
  it('이전 정리본을 넣으면 변경 내역을 요청한다', () => {
    const p = summaryPrompt({ papers, previousMd: '# 이전 [P1]' });
    expect(p).toContain('## 변경 내역');
    expect(p).toContain('독립적인 근거가 아닙니다');
    expect(p).toContain('# 이전 [P1]');
  });
  it('새 기본 지침에 분류 근거와 학습 순서를 요청하고 순위·전체 분야 주장과 구분한다', () => {
    const p = summaryPrompt({ papers });
    expect(SUMMARY_PROMPT_VERSION).toBe('summary-v2');
    expect(p).toContain(`(${SUMMARY_PROMPT_VERSION})`);
    const headings = ['### 1. 한눈에 보기와 자료 범위', '### 2. 연구군 지도', '### 3. 공통 입문 읽기 순서', '### 4. 관심사별 읽기 경로', '### 5. 핵심 용어', '### 6. 한계와 추가로 필요한 자료', '### 7. 출처 목록'];
    const positions = headings.map(h => p.indexOf(h));
    expect(positions.every(n => n >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(p).toContain('분류 근거·자료 한계');
    expect(p).toContain('앞 논문과의 연결');
    expect(p).toContain('분야 전체를 대표한다고 보장되지 않습니다');
    expect(p).toContain('인용 수만으로 읽기 순서나 중요도를 정하지 마세요');
    expect(p).toContain('미분류·자료 부족');
    expect(p).toContain('외부 논문을 만들어 추가하지 마세요');
  });
  it('실제 전달 가능한 텍스트로만 근거 수준을 집계한다', () => {
    const p = summaryPrompt({
      papers: [...papers, { id: 'example:empty', title: '가상 예시 · 실제 논문 아님', abstract: ' \n ' }],
      fulltext: { 'oa:1': { status: 'extracted' }, 'oa:2': { status: 'failed' }, 'example:empty': { status: 'extracted' } },
      pagesById: { 'oa:1': [{ page: 1, text: '  ' }], 'oa:2': [{ page: 1, text: '실패 상태의 본문' }] },
    });
    expect(p).toContain('원문 텍스트 포함 0편, 초록만 1편, 메타데이터만 2편');
    const data = p.slice(p.lastIndexOf('## 자료\n'));
    expect(data.match(/- 자료 범위: 초록만/g)).toHaveLength(1);
    expect(data.match(/- 자료 범위: 메타데이터만/g)).toHaveLength(2);
    expect(data).not.toContain('원문 발췌');
    expect(data).not.toContain('실패 상태의 본문');
  });
  it('0편·1편도 처리하며 연구군·읽기 경로를 억지로 채우지 않게 한다', () => {
    for (const selected of [[], [papers[1]]]) {
      const p = summaryPrompt({ papers: selected });
      expect(p).toContain(`논문 ${selected.length}편 중`);
      expect(p).toContain('논문이 없으면 분석 불가');
      expect(p).toContain('한 편뿐이면 그 논문의 접근법만');
      expect(p).toContain('추천을 보류하세요');
      expect(p).toContain('내용에 따른 분류나 입문 추천을 확정하지 마세요');
    }
  });
  it('긴 원문은 잘린 사실을 표시한다', () => {
    const ex = excerptOf([{ page: 1, text: 'x'.repeat(EXCERPT_CAP + 500) }]);
    expect(ex.truncated).toBe(true);
    expect(ex.text).toContain('잘림');
  });
});

describe('checkSummaryMd', () => {
  it('없는 번호, 출처 없는 문단, 표, 그림을 센다', () => {
    const md = '# 제목\n\n근거가 있는 문장입니다 정말로 그렇습니다 [P1 p.2].\n\n근거가 없는 긴 문장이 여기에 있습니다.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```mermaid\npie\n"a": 1\n```\n\n또 다른 문장입니다 정말로 그렇습니다 [P9].';
    const c = checkSummaryMd(md, 2);
    expect(c.invalidRefs).toEqual(['P9']);
    expect(c.unsourcedParagraphs).toBe(1);
    expect(c.tables).toBe(1);
    expect(c.mermaid).toBe(1);
    expect(checkSummaryMd('', 2).empty).toBe(true);
  });
});
