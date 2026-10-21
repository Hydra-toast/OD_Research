import { describe, it, expect } from 'vitest';
import { summaryPrompt, checkSummaryMd, excerptOf, EXCERPT_CAP } from '../src/research/summary.js';

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
    expect(p).toContain('원문 추출');
    expect(p).toContain('초록만');
    expect(p).toContain('[p.1] Dose was 30 mJ');
    expect(p).toContain('원문 텍스트 포함 1편, 초록만 1편');
    expect(p).toContain('표 위주로');
    expect(p).toContain('없음(초록을 확보하지 못함)');
  });
  it('초록만 있는 논문에는 원문 발췌를 넣지 않는다', () => {
    const p = summaryPrompt({ papers, fulltext: { 'oa:1': { status: 'no_candidate' } }, pagesById: {} });
    expect(p).not.toContain('원문 발췌');
    expect(p).toContain('확보하지 못함(no_candidate)');
  });
  it('이전 정리본을 넣으면 변경 내역을 요청한다', () => {
    expect(summaryPrompt({ papers, previousMd: '# 이전 [P1]' })).toContain('## 변경 내역');
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
