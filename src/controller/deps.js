// 외부 의존(공급자·저장소)과 테스트 훅. 실제 외부 호출은 없다(예시/고정 응답만).
import { createExampleProvider } from '../providers/example.js';
import { createIdbRepository } from '../repository/idb.js';
import { createExampleAnalysis, createFixtureAnalysis } from '../providers/analysis.js';

/** 브라우저 검증용 훅. 사용자 화면에는 노출되지 않는다.
 * @type {{failNextSave:boolean, searchDelays:number[], analysisScenario:string|null, saveDelayMs:number|null}} */
export const hooks = { failNextSave: false, searchDelays: [], analysisScenario: null, saveDelayMs: null };
if (typeof window !== 'undefined') /** @type {any} */ (window).__rl = hooks;

export const repo = createIdbRepository();

const base = createExampleProvider();
/** 검색 응답을 지연시킬 수 있는 예시 공급자(지연 역전 검증용). */
export const provider = {
  mode: base.mode,
  /** @param {string} q */
  async search(q) {
    const ms = hooks.searchDelays.shift();
    const r = await base.search(q);
    if (ms) await new Promise(res => setTimeout(res, ms));
    return r;
  },
  resolve: base.resolve,
};

export function analysisProvider() {
  return hooks.analysisScenario ? createFixtureAnalysis(/** @type {any} */ (hooks.analysisScenario)) : createExampleAnalysis();
}
