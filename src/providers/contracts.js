// 공급자 공통 계약. P0는 예시/고정 응답 공급자만 구현한다.
/** @typedef {import('../schema.js').Paper} Paper */
/** @typedef {import('../schema.js').Project} Project */
/** @typedef {import('../schema.js').DataMode} DataMode */

/**
 * @typedef {Object} SearchResult
 * @property {Paper[]} papers
 * @property {number|null} estimatedTotal  전체 검색 추정 수(수집 수와 구분)
 * @property {string} collectedAt
 * @property {boolean} partial
 * @property {string[]} warnings
 */
/**
 * @typedef {Object} PaperProvider
 * @property {DataMode} mode
 * @property {(query:string, opts?:{signal?:AbortSignal}) => Promise<SearchResult>} search
 * @property {(idOrDoi:string) => Promise<Paper|null>} resolve
 */
/**
 * @typedef {Object} AnalysisInput
 * @property {string|null} topicKey
 * @property {Paper[]} papers
 * @property {any} scope
 * @property {Record<string, any>=} userMeta
 * @typedef {Object} AnalysisResult
 * @property {'ok'|'partial'|'failed'} status
 * @property {any[]} directions
 * @property {number} count
 * @property {string} reason
 * @property {string[]} notices
 * @property {string=} error
 * @typedef {Object} AnalysisProvider
 * @property {DataMode} mode
 * @property {(input: AnalysisInput) => Promise<AnalysisResult>} analyze
 */
/**
 * @typedef {Object} ProjectRepository
 * @property {(id:string) => Promise<Project|null>} load
 * @property {(p:Project) => Promise<void>} save
 * @property {() => Promise<Project[]>} list
 * @property {(id:string) => Promise<void>} delete
 */

/** 구조화된 공급자 오류. 실패를 다른 모드로 바꾸지 않는다. */
export class ProviderError extends Error {
  /** @param {'rate_limited'|'timeout'|'save_failed'|'not_found'|'bad_mode'} code @param {string} message @param {{retryAfterSec?:number}} [extra] */
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.retryAfterSec = extra.retryAfterSec ?? null;
  }
}
