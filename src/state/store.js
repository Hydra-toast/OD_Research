// 화면 상태 한 곳. 객체 정체성을 유지한 채 내용을 교체해서 모든 모듈이 같은 S를 본다.
import { newScope, metaFor, rankPapers } from '../logic.js';
import { TOPIC_DEFS } from '../data/content.js';
import { emptyRefine } from '../research/refine.js';

/** @typedef {any} State */

let sessionSeq = 0;

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
  refine: emptyRefine(), refineMsg: '', refineBusy: false,
  summaries: /** @type {any[]} */ ([]), knowledgeImports: /** @type {any[]} */ ([]), summaryDraft: '', summaryDraftIds: /** @type {string[]} */ ([]), summaryCtx: /** @type {any} */ (null), summaryPrompt: '', summaryMode: 'attachments', summaryRequest: '', summaryMsg: '',
  chatgptPurpose: 'review', chatgptPrompt: '', chatgptMsg: '', chatgptPending: /** @type {any} */ (null), chatgptUndo: /** @type {any} */ (null), chatgptFocusId: '', chatgptNote: '', chatgptPack: /** @type {any} */ (null), chatgptPlan: /** @type {any} */ (null),
  aiDirections: /** @type {any[]} */ ([]), aiCompare: /** @type {any} */ (null), aiMemos: /** @type {any[]} */ ([]), reviewStaleAt: /** @type {string|null} */ (null),
  fulltext: /** @type {Record<string,any>} */ ({}), pdfFolder: '', fulltextMsg: '', fulltextBusy: false, fulltextActive: /** @type {string[]} */ ([]), fulltextProgress: /** @type {any} */ (null), selectMsg: '', uploadTarget: /** @type {string|null} */ (null),
  inbox: /** @type {any} */ (null),
  analysis: /** @type {any} */ (null), corrupt: /** @type {any} */ (null), readOnly: false, notFoundId: /** @type {string|null} */ (null),
  // 기본 작업 화면 전용 UI 상태 (저장본 스키마와 분리)
  pSessionKey: 's-' + (++sessionSeq),
  pTask: /** @type {'detail'|'cluster'|'utilize'} */ ('cluster'),
  pDetailId: /** @type {string|null} */ (null),
  pMobilePane: /** @type {'list'|'work'} */ ('list'),
  pView: /** @type {'main'|'saved'|'how'|'settings'} */ ('main'),
  pSearchEditOpen: false,
  pSearchSnapshot: /** @type {any} */ (null),
  pFilterOpen: false,
  pShowSelectedOnly: false,
  pCompareIds: /** @type {string[]} */ ([]),
  pCompareMsg: '',
  pUtilizeSub: /** @type {'compare'|'claims'|'ai'|'export'} */ ('compare'),
  pPrevTaskBeforeCompare: /** @type {'detail'|'cluster'|'utilize'|null} */ (null),
  pPrevMobilePaneBeforeCompare: /** @type {'list'|'work'|null} */ (null),
  pSummaryViewMode: /** @type {'read'|'edit'} */ ('read'),
  pSummaryImportOpen: false,
  pPromptPreviewOpen: false,
  pSettingsTab: /** @type {'inbox'|'lab'|'scope'|'versions'} */ ('inbox'),
  pListScrollTop: 0,
  pWorkScrollByTask: /** @type {Record<string,number>} */ ({ detail: 0, cluster: 0, utilize: 0 }),
  pFormDrafts: /** @type {Record<string,any>} */ ({}),
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
export const workspaceComparePapers = (s = S) => (s.pCompareIds || []).map((/** @type {string} */ id) => paperById(id, s)).filter(Boolean);
