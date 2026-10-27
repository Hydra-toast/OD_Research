import { describe, it, expect } from 'vitest';
import { summaryPrompt, checkSummaryMd, excerptOf, EXCERPT_CAP, SUMMARY_PROMPT_VERSION, parseShortlist } from '../src/research/summary.js';

describe('추천 논문 자동 선택', () => {
  const ids = ['example:a', 'example:b', 'example:c', 'example:d', 'example:e', 'example:f'];
  it('설명 속 참조는 제외하고 선택 전용 줄의 순서와 원래 번호를 따른다', () => {
    expect(parseShortlist('연구군 [P1]\n1. [P1] 설명\n선택 논문: [P4], [P2], [P4]', ids, ids).ids).toEqual([ids[3], ids[1]]);
  });
  it('이전 번호 목록에서도 제목의 번호만 추출한다', () => {
    expect(parseShortlist('연구군 [P1]\n1. **[P3] 제목**\n추천 이유 [P5]\n2) [P2] 제목', ids, ids).ids).toEqual([ids[2], ids[1]]);
  });
  it.each(['선택 논문: 없음', '선택 논문: [P0]', '선택 논문: [P7]', '선택 논문: [P1], [P2], [P3], [P4], [P5], [P6]', '설명에서만 [P2]', '선택 논문: [P1]\n선택 논문: [P2]', '선택 논문: [P1], 잘못된번호'])('불명확하거나 잘못된 결과는 적용하지 않는다: %s', md => {
    expect(parseShortlist(md, ids, ids).ok).toBe(false);
  });
  it('삭제된 논문에 대응하는 번호는 적용하지 않는다', () => {
    expect(parseShortlist('선택 논문: [P2]', ids, [ids[0]]).ok).toBe(false);
  });
});

const papers = [
  { id: 'oa:1', doi: '10.1/a', title: 'Alpha resist', year: 2020, abstract: 'Alpha abstract text.' },
  { id: 'oa:2', doi: null, title: 'Beta film', year: 2021, abstract: null },
];

describe('1단계 짧은 초록 추천', () => {
  it('초록과 번호를 보존하고 상세 정리 지시·원문·이전 결과를 포함하지 않는다', () => {
    const p = { id: 'example:shortlist', title: '가상 예시 · 실제 논문 아님', abstract: 'ABSTRACT_SENTINEL' };
    const prompt = summaryPrompt({ mode: 'abstracts', papers: [p, { id: 'example:missing', title: '가상 예시 · 초록 없음' }], request: '합성 조건', fulltext: { [p.id]: { status: 'extracted' } }, pagesById: { [p.id]: [{ page: 1, text: 'BODY_SENTINEL' }] }, previousMd: 'PREVIOUS_SENTINEL' });
    expect(prompt).toContain('[P1] 가상 예시 · 실제 논문 아님');
    expect(prompt).toContain('[P2] 가상 예시 · 초록 없음');
    expect(prompt).toContain('ABSTRACT_SENTINEL');
    expect(prompt).toContain('합성 조건');
    expect(prompt).toContain('초록만 1편, 메타데이터만 1편');
    expect(prompt).toContain('추천 논문 3~5편');
    expect(prompt).toContain('2~3문장');
    expect(prompt).toContain('최대 3개');
    expect(prompt).not.toMatch(/BODY_SENTINEL|PREVIOUS_SENTINEL|### 2\. 연구군 지도|### 5\. 핵심 용어|### 7\. 출처 목록/);
  });
  it('자료가 적거나 없어도 추천 개수를 억지로 채우지 않게 한다', () => {
    const prompt = summaryPrompt({ mode: 'abstracts', papers: [] });
    expect(prompt).toContain('3편 미만이면 있는 만큼만');
    expect(prompt).toContain('하나도 없으면 추천 불가 이유만');
    expect(prompt).toContain('초록만 0편, 메타데이터만 0편');
  });
});

describe('Gemini PDF 첨부용 기본 지시서', () => {
  it('긴 원문·초록·이전 문서가 기본 프롬프트 길이를 늘리지 않는다', () => {
    const fixture = { id: 'example:compact', title: '가상 예시 · 실제 논문 아님', doi: null, abstract: 'ABSTRACT_SENTINEL'.repeat(1000) };
    const args = { papers: [fixture], fulltext: { [fixture.id]: { status: 'extracted', localFile: 'private-folder/sample.pdf' } } };
    const short = summaryPrompt(args);
    const long = summaryPrompt({ ...args, pagesById: { [fixture.id]: [{ page: 1, text: 'BODY_SENTINEL'.repeat(2000) }] }, previousMd: 'PREVIOUS_SENTINEL'.repeat(2000) });
    expect(long).not.toMatch(/ABSTRACT_SENTINEL|BODY_SENTINEL|PREVIOUS_SENTINEL|private-folder/);
    expect(long).toContain('sample.pdf');
    expect(long).toContain('DOI: 미확인');
    expect(long.length - short.length).toBeLessThan(300);
    expect(long).toContain('첨부 여부는 Gemini에서 확인');
    expect(long).toContain('정리 시작');
    expect(long).toContain('메타데이터만 있으면 내용 분류·추천을 보류');
  });
  it('번호·DOI·제목을 유지하고 없는 논문과 빈 목록을 표시한다', () => {
    const p = summaryPrompt({ papers });
    expect(p).toContain('[P1] Alpha resist | DOI: 10.1/a');
    expect(p).toContain('[P2] Beta film | DOI: 미확인');
    expect(p).toContain('연구군 표');
    expect(p).toContain('입문 읽기 순서');
    expect(p).toContain('모든 논문');
    expect(summaryPrompt({ papers: [] })).toContain('논문 없음 — 자료를 요청하세요.');
  });
  it('정리 초점을 가장 우선하는 섹션으로 넣고 일반론을 막는다', () => {
    const p = summaryPrompt({ topic: 'EUV', papers, request: '결함 원인 위주로 2~3편' });
    expect(p).toContain('## 이번 정리의 초점 (가장 우선)\n결함 원인 위주로 2~3편');
    expect(p).toContain('"초점 밖"');
    expect(p.indexOf('## 조사 주제')).toBeLessThan(p.indexOf('## 이번 정리의 초점'));
    expect(p.indexOf('## 이번 정리의 초점')).toBeLessThan(p.indexOf('## 논문 목록'));
    expect(summaryPrompt({ papers })).toContain('분야 일반론이나 배경 설명을 늘어놓지 마세요');
  });
});

describe('summaryPrompt', () => {
  it('가이드라인·번호·자료 범위를 담고 없는 내용을 지어내지 않게 한다', () => {
    const p = summaryPrompt({ mode: 'text', topic: 'EUV', papers, fulltext: { 'oa:1': { status: 'extracted', pageCount: 2 } }, pagesById: { 'oa:1': [{ page: 1, text: 'Dose was 30 mJ' }, { page: 2, text: 'More' }] }, request: '표 위주로' });
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
    const p = summaryPrompt({ mode: 'text', papers, fulltext: { 'oa:1': { status: 'no_candidate' } }, pagesById: {} });
    expect(p).not.toContain('원문 발췌');
    expect(p).toContain('확보하지 못함(no_candidate)');
  });
  it('이전 정리본을 넣으면 변경 내역을 요청한다', () => {
    const p = summaryPrompt({ mode: 'text', papers, previousMd: '# 이전 [P1]' });
    expect(p).toContain('## 변경 내역');
    expect(p).toContain('독립적인 근거가 아닙니다');
    expect(p).toContain('# 이전 [P1]');
  });
  it('상세 정리는 논문별 설명과 비교·종합 문단을 요청하며 자료 경계를 유지한다', () => {
    const p = summaryPrompt({ mode: 'text', papers });
    expect(SUMMARY_PROMPT_VERSION).toBe('summary-v3-gemini');
    expect(p).toContain(`(${SUMMARY_PROMPT_VERSION})`);
    const headings = ['### 1. 조사 질문과 전체 결론', '### 2. 연구군 지도와 접근법의 차이', '### 3. 논문별 핵심 설명', '### 4. 논문 간 비교와 종합 해석', '### 5. 다른 사람에게 설명하는 종합 문단', '### 6. 남은 질문과 확인할 근거', '### 7. 다시 확인할 곳'];
    const positions = headings.map(h => p.indexOf(h));
    expect(positions.every(n => n >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    for (const mode of ['attachments', 'text']) {
      const detailed = summaryPrompt({ mode, papers });
      expect(detailed).toContain('### 3. 논문별 핵심 설명');
      expect(detailed).toContain('### 5. 다른 사람에게 설명하는 종합 문단');
      expect(detailed).not.toContain('1,500~2,500');
    }
    expect(summaryPrompt({ mode: 'abstracts', papers })).not.toContain('### 3. 논문별 핵심 설명');
    expect(p).toContain('분류 근거·자료 한계');
    expect(p).toContain('앞 논문과의 연결');
    expect(p).toContain('분야 전체를 대표한다고 보장되지 않습니다');
    expect(p).toContain('인용 수만으로 읽기 순서나 중요도를 정하지 마세요');
    expect(p).toContain('미분류·자료 부족');
    expect(p).toContain('외부 논문을 만들어 추가하지 마세요');
  });
  it('실제 전달 가능한 텍스트로만 근거 수준을 집계한다', () => {
    const p = summaryPrompt({ mode: 'text',
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
      const p = summaryPrompt({ mode: 'text', papers: selected });
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
