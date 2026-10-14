import { EXAMPLE_TOPICS } from '../data/examples.js';
import { assertModeConsistent } from '../schema.js';

/** @typedef {import('./contracts.js').PaperProvider} PaperProvider */

/** @param {string} q */
function pickTopic(q) {
  const s = q.toLowerCase();
  if (/euv|포토레지스트|photoresist/.test(s)) return 'euv';
  if (/ald|원자층|high-?k|고유전/.test(s)) return 'ald';
  if (/hbm/.test(s)) return 'hbm';
  return null; // 범위 밖: 예시로 억지 연결하지 않는다.
}

/** @returns {PaperProvider} */
export function createExampleProvider() {
  return {
    mode: 'example',
    async search(query) {
      const key = pickTopic(query);
      const papers = key ? EXAMPLE_TOPICS[/** @type {'euv'|'ald'|'hbm'} */ (key)].papers : [];
      assertModeConsistent('example', papers);
      return {
        papers, estimatedTotal: papers.length, collectedAt: new Date().toISOString(), partial: false,
        warnings: key ? ['가상 예시 · 실제 논문 아님'] : ['이 주제의 실검색은 아직 연결되지 않았어요'],
      };
    },
    async resolve(id) {
      for (const t of Object.values(EXAMPLE_TOPICS)) {
        const hit = t.papers.find(p => p.id === id);
        if (hit) return hit;
      }
      return null;
    },
  };
}
