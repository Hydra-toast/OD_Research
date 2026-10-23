import { describe, it, expect } from 'vitest';
import { suggestKeywords } from '../src/research/keywords.js';
import { applyRefine, mergePool, refinedQueries, splitTerms } from '../src/research/refine.js';

const papers = [
  { id: 'a', title: 'Perovskite solar cell stability', abstract: 'We study perovskite solar cell stability under humidity.' },
  { id: 'b', title: 'Perovskite solar cell encapsulation', abstract: 'Encapsulation improves perovskite solar cell lifetime.' },
  { id: 'c', title: 'Organic transistor', abstract: 'Organic transistor mobility.' },
];

describe('keywords', () => {
  it('빈도로 표현을 찾고 이미 쓴 단어는 뺀다', () => {
    const k = suggestKeywords(papers, { known: ['stability'] }).map(x => x.term);
    expect(k).toContain('perovskite solar');
    expect(k).not.toContain('stability');
    expect(suggestKeywords([])).toEqual([]);
  });
});

describe('refine', () => {
  it('포함·제외를 적용하고 제외는 해제할 수 있다', () => {
    const r = applyRefine(papers, { include: ['perovskite'], exclude: ['encapsulation'] });
    expect(r.visible.map(p => p.id)).toEqual(['a']);
    expect(r.hidden.map(h => h.paper.id)).toEqual(['b', 'c']);
    expect(r.hidden[0].canRelease).toBe(true);
    expect(applyRefine(papers, { include: ['perovskite'], exclude: ['encapsulation'], released: ['b'] }).visible.map(p => p.id)).toEqual(['a', 'b']);
  });
  it('추가 검색 결과를 중복 없이 합치고 foundBy를 보존한다', () => {
    const m = mergePool([{ id: 'a', doi: '10.1/x', foundBy: ['q1'] }], [{ id: 'z', doi: '10.1/X', foundBy: ['q2'] }, { id: 'n', foundBy: ['q2'] }]);
    expect(m.added).toBe(1);
    expect(m.papers[0].foundBy).toEqual(['q1', 'q2']);
  });
  it('연도가 없으면 연도 조건에서 숨기고, 초록이 없으면 초록 조건에서 숨긴다', () => {
    const dated = [
      { id: 'a', title: 'A', abstract: 'hello there', year: 2018 },
      { id: 'b', title: 'B', abstract: 'hello there', year: 2022 },
      { id: 'c', title: 'C', abstract: '', year: 2021 },
      { id: 'd', title: 'D', abstract: 'hello there' },
    ];
    const years = applyRefine(dated, { yearFrom: 2020, yearTo: 2023 });
    expect(years.visible.map(p => p.id)).toEqual(['b', 'c']);
    const hiddenD = years.hidden.find(h => h.paper.id === 'd');
    expect(hiddenD?.reasons).toContain('연도 없음');
    expect(hiddenD?.canRelease).toBe(false);
    expect(applyRefine(dated, { requireAbstract: true }).visible.map(p => p.id)).toEqual(['a', 'b', 'd']);
  });
  it('검색 문구에 포함어를 붙이고 단어를 나눈다', () => {
    expect(refinedQueries(['solar cell'], ['perovskite'])).toEqual(['solar cell perovskite']);
    expect(splitTerms('a, bb\nccc;bb')).toEqual(['bb', 'ccc']);
  });
});
