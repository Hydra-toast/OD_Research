// 화면 상태 한 곳. 객체 정체성을 유지한 채 내용을 교체해서 모든 모듈이 같은 S를 본다.
import { newScope, metaFor, rankPapers } from '../logic.js';
import { TOPIC_DEFS } from '../data/content.js';

/** @typedef {any} State */

export const fresh = () => ({
  /** idle | loading | ok | empty | error | corrupt | missing */
  status: 'idle', input: '', topicKey: /** @type {string|null} */ (null), papers: /** @type {any[]} */ ([]), warnings: /** @type {string[]} */ ([]),
  scope: newScope(), sort: 'relevance', showAll: false, branch: /** @type {string|null} */ (null),
  selPapers: /** @type {string[]} */ ([]), selDirs: /** @type {string[]} */ ([]), dirSnap: /** @type {Record<string,any>} */ ({}),
  lab: /** @type {any} */ (null), labOpen: false, adjustOpen: false, addOpen: false, addError: '',
  notes: /** @type {Record<string,string>} */ ({}), cellEdits: /** @type {Record<string,any>} */ ({}), claims: /** @type {Record<string,any>} */ ({}),
  questions: /** @type {string[]} */ ([]), compare: /** @type {string[]} */ ([]), tab: 'explore', projectId: /** @type {string|null} */ (null), name: '',
  versions: /** @type {any[]} */ ([]), revision: 0, userMeta: /** @type {Record<string,any>} */ ({}),
  editCell: /** @type {any} */ (null), editError: '', qClaim: /** @type {string|null} */ (null), qPick: /** @type {string|null} */ (null), qMsg: '',
  evOpen: /** @type {any} */ (null), saveMsg: '', saveErr: false, exportText: /** @type {string|null} */ (null),
  dataMode: 'example', queryPlan: /** @type {any} */ (null), cached: false, collectedAt: /** @type {string|null} */ (null),
  estimatedTotal: /** @type {number|null} */ (null), searchPage: 0, englishOverride: '', inputRevision: 0,
  searchError: '', forceExample: false, researchBrief: /** @type {any} */ (null), pendingReview: /** @type {any} */ (null),
  refine: /** @type {any} */ ({ include: [], exclude: [], released: [], rounds: [] }), refineMsg: '', refineBusy: false,
  summaries: /** @type {any[]} */ ([]), summaryDraft: '', summaryDraftIds: /** @type {string[]} */ ([]), summaryCtx: /** @type {any} */ (null), summaryPrompt: '', summaryRequest: '', summaryMsg: '',
  fulltext: /** @type {Record<string,any>} */ ({}), fulltextMsg: '', fulltextBusy: false, uploadTarget: /** @type {string|null} */ (null),
  analysis: /** @type {any} */ (null), corrupt: /** @type {any} */ (null), readOnly: false, notFoundId: /** @type {string|null} */ (null),
});

/** @type {State} */
export const S = fresh();

/** 상태를 비우고 keep 값만 유지. */
export function resetState(keep = {}) {
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, fresh(), keep);
  return S;
}
export function assignState(patch) { Object.assign(S, patch); }

export const newId = () => 'p-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
export const isValidProjectId = (/** @type {any} */ id) => typeof id === 'string' && /^[A-Za-z0-9-]{4,40}$/.test(id);

// ---- 파생 값 ----
export const meta = (s = S) => metaFor(s.topicKey, s.papers, s.userMeta);
export const scopeText = (s = S) => {
  const def = TOPIC_DEFS[s.topicKey];
  const parts = [def ? def.name : '입력한 주제'];
  if (s.scope.material) parts.push(`소재/대상: ${s.scope.material}${s.scope.materialOnly ? '(일치만 보기)' : ''}`);
  if (s.scope.boost.length) parts.push(`더 보기: ${s.scope.boost.join(', ')}`);
  if (s.scope.exclude.length) parts.push(`제외: ${s.scope.exclude.join(', ')}`);
  if (s.scope.emphasis.length) parts.push(`강조: ${s.scope.emphasis.join(', ')}`);
  parts.push(s.scope.focus === 'methods' ? '방법 비교 중심' : '연구 동향 중심');
  return parts.join(' · ');
};
export const ranked = (s = S) => rankPapers(s.papers, meta(s), s.scope, s.sort);
export const paperById = (/** @type {string} */ id, s = S) => s.papers.find((/** @type {any} */ p) => p.id === id);
export const claimByCid = (/** @type {string} */ cid, s = S) => Object.values(s.claims).find((/** @type {any} */ c) => c.id === cid);
export const selectedPapers = (s = S) => s.selPapers.map((/** @type {string} */ id) => paperById(id, s)).filter(Boolean);
