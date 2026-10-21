// 규칙 기반 관련성. 의미 분석이 아니며 같은 입력이면 같은 순서가 나온다.
export const RANK_VERSION = 'rule-v1';

/** 핵심 제목 4점(합계 12점 상한), 핵심 초록 2점(8점 상한), 동의어 묶음은 제목 2·초록 1로 한 번만, 선호 단어 1점(4점 상한), 서로 다른 검색 문구는 1점씩 최대 3점. 제외 단어는 점수 대신 제외 표시. */
export const WEIGHTS = { coreTitle: 4, coreTitleCap: 12, coreAbstract: 2, coreAbstractCap: 8, synonymTitle: 2, synonymAbstract: 1, preferred: 1, preferredCap: 4, multiQuery: 1, multiQueryCap: 3 };

const norm = (/** @type {any} */ s) => String(s || '').toLowerCase();
const hit = (/** @type {string} */ text, /** @type {string} */ term) => term.length >= 2 && norm(text).includes(norm(term));

/** @param {any[]} papers @param {{ core?: string[], preferred?: string[], excluded?: string[], synonyms?: string[][] }} criteria */
export function ruleRank(papers, criteria = {}) {
  const core = criteria.core || [];
  const preferred = criteria.preferred || [];
  const excluded = criteria.excluded || [];
  const groups = criteria.synonyms || [];
  const ranked = papers.map(paper => {
    const title = paper.title || '';
    const abstract = paper.abstract || '';
    const blocked = excluded.filter(term => hit(title, term) || hit(abstract, term));
    if (blocked.length) {
      return { ...paper, relevance: { kind: 'rule', version: RANK_VERSION, score: 0, excluded: true, limited: !abstract, reasons: [`사용자가 제외한 단어 포함: ${blocked.join(', ')}`] } };
    }
    /** @type {string[]} */
    const reasons = [];
    const titleCore = core.filter(term => hit(title, term));
    const abstractCore = abstract ? core.filter(term => hit(abstract, term)) : [];
    let score = Math.min(titleCore.length * WEIGHTS.coreTitle, WEIGHTS.coreTitleCap) + Math.min(abstractCore.length * WEIGHTS.coreAbstract, WEIGHTS.coreAbstractCap);
    if (titleCore.length) reasons.push(`제목에 핵심 키워드 ${titleCore.length}개 일치`);
    if (abstract && abstractCore.length) reasons.push('초록에서 핵심 키워드 확인');
    let synonymTitle = 0;
    let synonymAbstract = 0;
    for (const group of groups) {
      if (group.some(term => hit(title, term))) synonymTitle += 1;
      else if (abstract && group.some(term => hit(abstract, term))) synonymAbstract += 1;
    }
    score += synonymTitle * WEIGHTS.synonymTitle + synonymAbstract * WEIGHTS.synonymAbstract;
    if (synonymTitle || synonymAbstract) reasons.push('동의어 묶음 일치');
    const preferredHits = preferred.filter(term => hit(title, term) || (abstract && hit(abstract, term)));
    score += Math.min(preferredHits.length * WEIGHTS.preferred, WEIGHTS.preferredCap);
    if (preferredHits.length) reasons.push('선호 키워드 일치');
    const found = [...new Set(paper.foundBy || [])];
    const bonus = Math.min(found.length, WEIGHTS.multiQueryCap) * WEIGHTS.multiQuery;
    if (found.length > 1) { score += bonus; reasons.push(`서로 다른 검색 문구 ${found.length}개에서 발견`); }
    if (!abstract) reasons.push('초록 없음: 관련성 판단 제한');
    if (!reasons.length) reasons.push('핵심 키워드 일치 없음');
    return { ...paper, relevance: { kind: 'rule', version: RANK_VERSION, score, excluded: false, limited: !abstract, reasons } };
  });
  ranked.sort((a, b) => Number(a.relevance.excluded) - Number(b.relevance.excluded) || b.relevance.score - a.relevance.score || String(a.id).localeCompare(String(b.id)));
  return { papers: ranked, version: RANK_VERSION };
}
