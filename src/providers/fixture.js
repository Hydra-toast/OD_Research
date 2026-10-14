import { ProviderError } from './contracts.js';
import { assertModeConsistent } from '../schema.js';

/** @typedef {import('./contracts.js').PaperProvider} PaperProvider */
/** @typedef {import('../schema.js').Paper} Paper */

export const SCENARIOS = ['ok', 'empty', 'rate_limited', 'no_abstract', 'no_fulltext', 'extraction_failed', 'partial', 'save_failed', 'slow'];

/** @param {string} id @param {Partial<Paper>} [o] @returns {Paper} */
export function fixturePaper(id, o = {}) {
  return {
    id, doi: null, providerId: id, title: `고정 응답 논문 ${id}`, authors: [], year: null, venue: null,
    citationCount: null, abstract: '고정 응답 테스트용 초록', access: 'abstract', origin: 'provider',
    collectedAt: '2026-10-14T00:00:00+09:00', source: 'fixture', ...o,
  };
}

/**
 * 테스트 전용 공급자. 시나리오는 명시적으로만 선택한다.
 * @param {string} scenario @param {{delayMs?:number}} [opts] @returns {PaperProvider}
 */
export function createFixtureProvider(scenario, opts = {}) {
  if (!SCENARIOS.includes(scenario)) throw new Error(`알 수 없는 시나리오: ${scenario}`);
  return {
    mode: 'fixture',
    async search(_q, o) {
      if (scenario === 'slow') await new Promise((r, rej) => {
        const t = setTimeout(r, opts.delayMs ?? 50);
        o?.signal?.addEventListener('abort', () => { clearTimeout(t); rej(new ProviderError('timeout', '취소됨')); });
      });
      if (scenario === 'rate_limited') throw new ProviderError('rate_limited', '호출 제한', { retryAfterSec: 2 });
      /** @type {Paper[]} */
      let papers = scenario === 'empty' ? [] : [fixturePaper('fx:1'), fixturePaper('fx:2'), fixturePaper('fx:3')];
      const warnings = [];
      if (scenario === 'no_abstract') papers = [fixturePaper('fx:1', { abstract: null, access: 'metadata' })];
      if (scenario === 'no_fulltext') warnings.push('원문 미확보');
      if (scenario === 'extraction_failed') warnings.push('추출 실패');
      if (scenario === 'partial') warnings.push('일부 논문만 성공');
      assertModeConsistent('fixture', papers);
      return {
        papers, estimatedTotal: papers.length, collectedAt: new Date().toISOString(),
        partial: scenario === 'partial', warnings,
      };
    },
    async resolve(id) { return id.startsWith('fx:') ? fixturePaper(id) : null; },
  };
}

/** 저장 실패를 재현하는 저장소. @returns {import('./contracts.js').ProjectRepository} */
export function createFailingRepository() {
  const fail = async () => { throw new ProviderError('save_failed', '저장 실패'); };
  return { load: async () => null, list: async () => [], save: fail, delete: fail };
}
