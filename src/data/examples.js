// 가상 예시 자료. 실제 논문·DOI·저자·학술지가 아니다.
/** @typedef {import('../schema.js').Paper} Paper */

const AT = '2026-10-14T00:00:00+09:00';
const LABEL = '가상 예시 · 실제 논문 아님';

/** @param {string} topic @param {number} n */
function makePapers(topic, n) {
  /** @type {Paper[]} */
  const out = [];
  for (let i = 0; i < n; i++) {
    const letter = String.fromCharCode(65 + i);
    out.push({
      id: `example:${topic}-${letter.toLowerCase()}`,
      doi: null,
      providerId: null,
      title: `예시 논문 ${letter} (${topic.toUpperCase()})`,
      authors: [],
      year: 2018 + ((i * 3) % 7), // 가상 값(정렬 시연용)
      venue: null,
      citationCount: i % 3 === 2 ? null : (i + 1) * 7, // 가상 값. null은 미확인
      abstract: `[${LABEL}] ${topic.toUpperCase()} 주제를 설명하기 위해 직접 작성한 가상 초록 ${letter}.`,
      access: 'abstract',
      origin: 'example',
      collectedAt: AT,
      source: LABEL,
    });
  }
  return out;
}

export const EXAMPLE_LABEL = LABEL;
export const EXAMPLE_TOPICS = {
  euv: { name: 'EUV 포토레지스트', input: 'EUV 포토레지스트에서 최근 어떤 연구가 진행되는지 알아보고 싶어요.', papers: makePapers('euv', 8) },
  ald: { name: 'ALD', input: 'ALD 공정으로 High-k 박막을 만드는 연구를 알아보고 싶어요.', papers: makePapers('ald', 8) },
  hbm: { name: 'HBM', input: 'HBM 패키징 연구 흐름을 알아보고 싶어요.', papers: makePapers('hbm', 3) }, // 자료 부족 사례
};
