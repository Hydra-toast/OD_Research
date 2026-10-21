// 엔티티 타입(JSDoc)과 런타임 검증.

/** @typedef {'metadata'|'abstract'|'fulltext'} AccessLevel */
/** @typedef {'provider'|'user'|'example'} SourceOrigin */
/** @typedef {'example'|'fixture'|'real'} DataMode */
/** @typedef {'not_found_in_sources'|'fulltext_unavailable'|'extraction_failed'|'not_applicable'} EmptyReason */

/**
 * @typedef {Object} Paper
 * @property {string} id
 * @property {string|null} doi
 * @property {string|null} providerId
 * @property {string} title
 * @property {string[]} authors
 * @property {number|null} year
 * @property {string|null} venue
 * @property {number|null} citationCount
 * @property {string|null} abstract
 * @property {AccessLevel} access
 * @property {SourceOrigin} origin
 * @property {string} collectedAt
 * @property {string} source
 * @property {Record<string,string>=} fieldSources
 * @property {Record<string,any>=} fulltext
 */
/**
 * @typedef {Object} Project
 * @property {string} id
 * @property {string} originalInput
 * @property {string} scope
 * @property {string[]} exclusions
 * @property {string[]} queries
 * @property {DataMode} dataMode
 */
/**
 * @typedef {Object} Evidence
 * @property {string} id
 * @property {string} paperId
 * @property {string} documentVersion
 * @property {string} excerpt
 * @property {{page:number|null, section:string|null, figure:string|null, table:string|null}} location
 */
/**
 * @typedef {Object} Claim
 * @property {string} id
 * @property {string} text
 * @property {string} condition
 * @property {string} interpretation
 * @property {string[]} evidenceIds
 * @property {{sourceLinked:boolean, aiInterpreted:boolean, userConfirmed:boolean, needsCheck:boolean}} state
 * @property {{at:string, text:string}[]} history
 */

export const ACCESS_LEVELS = ['metadata', 'abstract', 'fulltext'];
export const ORIGINS = ['provider', 'user', 'example'];
export const DATA_MODES = ['example', 'fixture', 'real'];
export const EMPTY_REASONS = ['not_found_in_sources', 'fulltext_unavailable', 'extraction_failed', 'not_applicable'];

/** @param {unknown} v */
const isStr = v => typeof v === 'string' && v.length > 0;
/** @param {unknown} v */
const isNullableNum = v => v === null || (typeof v === 'number' && Number.isFinite(v));

/**
 * ID 접두사 규칙: example:=가상 예시, fx:=고정 응답, user:=사용자 제공, oa:=OpenAlex, cr:=Crossref.
 * user:는 모든 모드에서 허용. 실제 모드는 example:·fx:를 거부한다. 예전 s2: 저장분은 지우지 않는다.
 * @param {string} id @param {DataMode} mode
 */
export function idMatchesMode(id, mode) {
  if (id.startsWith('user:')) return true;
  if (mode === 'example') return id.startsWith('example:');
  if (mode === 'fixture') return id.startsWith('fx:');
  return !id.startsWith('example:') && !id.startsWith('fx:');
}

/** @param {any} p @param {DataMode} [mode] @returns {string[]} 오류 목록 */
export function validatePaper(p, mode) {
  const e = [];
  if (!p || typeof p !== 'object') return ['paper: 객체 아님'];
  if (!isStr(p.id)) e.push('id 필요');
  if (!isStr(p.title)) e.push('title 필요');
  if (!Array.isArray(p.authors)) e.push('authors 배열 필요');
  if (!isNullableNum(p.year)) e.push('year 숫자 또는 null');
  if (!isNullableNum(p.citationCount)) e.push('citationCount 숫자 또는 null');
  if (!ACCESS_LEVELS.includes(p.access)) e.push('access 값 오류');
  if (!ORIGINS.includes(p.origin)) e.push('origin 값 오류');
  if (!isStr(p.collectedAt) || !isStr(p.source)) e.push('수집 시점·출처 필요');
  if (p.access === 'metadata' && p.abstract) e.push('metadata 접근인데 abstract 존재');
  if (p.access !== 'metadata' && !p.abstract) e.push('abstract 이상 접근인데 abstract 없음');
  if (p.origin === 'example') {
    if (!String(p.id).startsWith('example:')) e.push('예시는 example: ID 필요');
    if (p.doi) e.push('예시에 DOI 금지');
  } else if (p.origin === 'user') {
    if (!String(p.id).startsWith('user:')) e.push('사용자 자료는 user: ID 필요');
  } else {
    if (String(p.id).startsWith('example:')) e.push('실자료에 example: ID 금지');
    if (String(p.id).startsWith('user:')) e.push('공급자 자료에 user: ID 금지');
  }
  if (mode && isStr(p.id) && !idMatchesMode(p.id, mode)) e.push('모드와 ID 불일치');
  return e;
}

/** @param {any} ev @param {Paper[]} papers */
export function validateEvidence(ev, papers) {
  const e = [];
  if (!ev || typeof ev !== 'object') return ['evidence 객체 아님'];
  const paper = Array.isArray(papers) ? papers.find(p => p?.id === ev.paperId) : undefined;
  if (!paper) return ['paperId가 존재하지 않음'];
  if (!isStr(ev.excerpt)) e.push('excerpt 필요');
  if (!ev.location || typeof ev.location !== 'object' || Array.isArray(ev.location)) e.push('location 객체 필요');
  else {
    const loc = ev.location;
    const hasLoc = loc.page != null || loc.section != null || loc.figure != null || loc.table != null;
    // 초록만 있으면 위치를 만들 수 없다.
    if (paper.access !== 'fulltext' && hasLoc) e.push('원문 없이 위치 생성 금지');
  }
  return e;
}

/** @param {any} c @param {any[]} evidence */
export function validateClaim(c, evidence) {
  const e = [];
  if (!isStr(c?.text)) e.push('text 필요');
  if (c?.condition != null && typeof c.condition !== 'string') e.push('condition 문자열 필요');
  if (c?.interpretation != null && typeof c.interpretation !== 'string') e.push('interpretation 문자열 필요');
  const list = Array.isArray(evidence) ? evidence : [];
  const ids = new Set();
  list.forEach((x, i) => {
    if (!x || typeof x !== 'object' || !isStr(x.id)) e.push(`evidence[${i}] 오류`);
    else ids.add(x.id);
  });
  for (const id of c?.evidenceIds ?? []) if (!ids.has(id)) e.push(`evidenceId 없음: ${id}`);
  const s = c?.state;
  if (!s || ['sourceLinked', 'aiInterpreted', 'userConfirmed', 'needsCheck'].some(k => typeof s[k] !== 'boolean')) e.push('state 4항목 필요');
  else if (s.sourceLinked && !(c.evidenceIds?.length)) e.push('sourceLinked인데 evidenceIds 없음');
  return e;
}

/** @param {any} p */
export function validateProject(p) {
  const e = [];
  if (!isStr(p?.id)) e.push('id 필요');
  if (!isStr(p?.originalInput)) e.push('originalInput 필요');
  if (!DATA_MODES.includes(p?.dataMode)) e.push('dataMode 값 오류');
  if (!Array.isArray(p?.queries) || !Array.isArray(p?.exclusions)) e.push('queries/exclusions 배열 필요');
  return e;
}

/** 비교 셀: 값이 비면 이유가 필수. @param {any} cell */
export function validateCell(cell) {
  if (cell?.value != null && cell.value !== '') return [];
  return EMPTY_REASONS.includes(cell?.emptyReason) ? [] : ['빈 값에는 emptyReason 필요'];
}

/** id/DOI/providerId로만 중복 정리. 제목이 같다는 이유로 합치지 않는다. @param {Paper[]} papers */
export function dedupePapers(papers) {
  /** @type {Paper[]} */
  const out = [];
  for (const p of papers) {
    const dup = out.find(q =>
      p.id === q.id ||
      (p.doi && q.doi && p.doi.toLowerCase() === q.doi.toLowerCase()) ||
      (p.providerId && q.providerId && p.providerId === q.providerId));
    if (!dup) out.push(p);
  }
  return out;
}

/** 모드 혼합 차단 @param {DataMode} mode @param {Paper[]} papers */
export function assertModeConsistent(mode, papers) {
  const bad = papers.filter(p => !idMatchesMode(p.id, mode));
  if (bad.length) throw new Error(`모드 혼합: ${mode} 모드에 ${bad.map(p => p.id).join(', ')}`);
}

// ---- 나머지 엔티티 검증 (레코드 검증·공급자 결과 검증에서 사용) ----
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const strArr = v => Array.isArray(v) && v.every(x => typeof x === 'string');

/** @param {any} lab null 허용(미입력) */
export function validateLabProfile(lab) {
  if (lab == null) return [];
  if (!isObj(lab)) return ['lab: 객체 아님'];
  const e = [];
  for (const [k, v] of Object.entries(lab)) if (typeof v !== 'string') e.push(`lab.${k} 문자열 필요`);
  return e;
}
/** @param {any} d */
export function validateSourceDocument(d) {
  const e = [];
  if (!isStr(d?.id) || !isStr(d?.paperId)) e.push('id/paperId 필요');
  if (!ACCESS_LEVELS.includes(d?.access)) e.push('access 값 오류');
  if (!ORIGINS.includes(d?.origin)) e.push('origin 값 오류');
  if (!['none', 'ok', 'failed', 'scan_only', 'encrypted'].includes(d?.extraction)) e.push('extraction 값 오류');
  return e;
}
/** @param {any} d */
export function validateDirection(d) {
  const e = [];
  if (!isStr(d?.id) || !isStr(d?.label)) e.push('direction id/label 필요');
  if (!Array.isArray(d?.papers)) e.push('direction.papers 배열 필요');
  if (!Array.isArray(d?.readNext)) e.push('direction.readNext 배열 필요');
  return e;
}
/** @param {any} s */
export function validateSelection(s) {
  const e = [];
  if (!strArr(s?.paperIds)) e.push('selection.paperIds 문자열 배열 필요');
  if (!strArr(s?.directionIds)) e.push('selection.directionIds 문자열 배열 필요');
  return e;
}
/** @param {any} f */
export function validateFeedback(f) {
  const e = [];
  if (!isStr(f?.at)) e.push('feedback.at 필요');
  if (!['no_equipment', 'weak_link', 'compare_other', 'need_recent', 'free'].includes(f?.kind)) e.push('feedback.kind 값 오류');
  return e;
}
/** @param {any} v */
export function validateAnalysisVersion(v) {
  const e = [];
  if (!isStr(v?.at) || !isStr(v?.label)) e.push('version at/label 필요');
  if (typeof v?.scope !== 'string') e.push('version.scope 문자열 필요');
  return e;
}
/** @param {any} j */
export function validateJob(j) {
  const e = [];
  if (!isStr(j?.id)) e.push('job.id 필요');
  if (!['queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled'].includes(j?.status)) e.push('job.status 값 오류');
  return e;
}
