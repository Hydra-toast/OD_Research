// 저장 레코드 ↔ 화면 상태 변환·검증·이전 버전 이전. 순수 함수만 둔다.
import { EXAMPLE_TOPICS } from '../data/examples.js';
import { TOPIC_DEFS } from '../data/content.js';
import {
  validatePaper, validateEvidence, validateClaim, validateProject, validateCell, validateLabProfile,
  validateDirection, validateSelection, validateAnalysisVersion, EMPTY_REASONS,
} from '../schema.js';

export const SCHEMA_VERSION = 2;
export const EXAMPLE_DATA_VERSION = 'example-v1';

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

/** 화면 상태 → 저장 레코드. */
export function toRecord(S, scopeText) {
  return {
    id: S.projectId, name: S.name, originalInput: S.input, scope: scopeText, exclusions: S.scope.exclude,
    queries: [S.input], dataMode: S.dataMode || 'example', topicKey: S.topicKey, scopeState: S.scope, sort: S.sort, lab: S.lab,
    selPapers: S.selPapers, selDirs: S.selDirs, dirSnap: S.dirSnap, notes: S.notes, cellEdits: S.cellEdits,
    claims: S.claims, questions: S.questions, versions: S.versions, revision: S.revision,
    papers: S.papers, userMeta: S.userMeta, exampleDataVersion: EXAMPLE_DATA_VERSION,
    queryPlan: S.queryPlan, collectedAt: S.collectedAt, estimatedTotal: S.estimatedTotal, searchPage: S.searchPage, searchWarnings: S.warnings,
    researchBrief: S.researchBrief ?? null,
    refine: S.refine ?? { include: [], exclude: [], released: [], rounds: [] }, summaries: S.summaries ?? [], fulltext: S.fulltext ?? {}, summaryCtx: S.summaryCtx ?? null,
    aiDirections: S.aiDirections ?? [], aiCompare: S.aiCompare ?? null, aiMemos: S.aiMemos ?? [], chatgptPlan: S.chatgptPlan ?? null, chatgptNote: S.chatgptNote ?? '', reviewStaleAt: S.reviewStaleAt ?? null,
  };
}

/** 저장 레코드 → 화면 상태에 덮어쓸 값. 검증을 통과한 레코드만 넣을 것. */
export function fromRecord(r) {
  return {
    projectId: r.id, name: r.name, input: r.originalInput, topicKey: r.topicKey, scope: r.scopeState, sort: r.sort ?? 'relevance',
    lab: r.lab ?? null, selPapers: r.selPapers, selDirs: r.selDirs, dirSnap: r.dirSnap, notes: r.notes, cellEdits: r.cellEdits,
    claims: r.claims, questions: r.questions, versions: r.versions, revision: r.revision ?? 0,
    papers: r.papers, userMeta: r.userMeta ?? {}, warnings: [], dataMode: r.dataMode || 'example',
    queryPlan: r.queryPlan ?? null, collectedAt: r.collectedAt ?? null, estimatedTotal: r.estimatedTotal ?? null, searchPage: r.searchPage ?? 0,
    researchBrief: r.researchBrief ?? null,
    refine: isObj(r.refine) ? { include: [], exclude: [], released: [], rounds: [], ...r.refine } : { include: [], exclude: [], released: [], rounds: [] },
    summaries: Array.isArray(r.summaries) ? r.summaries : [], fulltext: isObj(r.fulltext) ? r.fulltext : {}, summaryCtx: isObj(r.summaryCtx) ? r.summaryCtx : null,
    aiDirections: Array.isArray(r.aiDirections) ? r.aiDirections : [], aiCompare: isObj(r.aiCompare) ? r.aiCompare : null, aiMemos: Array.isArray(r.aiMemos) ? r.aiMemos : [], chatgptPlan: isObj(r.chatgptPlan) ? r.chatgptPlan : null, chatgptNote: typeof r.chatgptNote === 'string' ? r.chatgptNote : '', reviewStaleAt: typeof r.reviewStaleAt === 'string' ? r.reviewStaleAt : null,
  };
}

/** 구버전 셀 `{value, history:[{value}]}` → `{cell, history:[{cell}]}`. 값이 비어 있으면 사유를 비워 두지 않는다. */
function legacyCell(value, emptyReason) {
  const v = typeof value === 'string' ? value.trim() : '';
  return {
    value: v, unit: '', condition: '', evidenceId: null, source: 'user',
    emptyReason: v ? undefined : (EMPTY_REASONS.includes(emptyReason) ? emptyReason : 'not_found_in_sources'),
  };
}
function migrateHistoryItem(h) {
  if (!isObj(h)) return h;
  if (isObj(h.cell)) return h;
  return { at: typeof h.at === 'string' ? h.at : '', by: 'user', cell: legacyCell(h.value, h.emptyReason) };
}
function migrateCellEdit(ed) {
  if (!isObj(ed)) return ed;
  const history = (Array.isArray(ed.history) ? ed.history : []).map(migrateHistoryItem);
  if (isObj(ed.cell)) return { ...ed, history };
  if (typeof ed.value === 'string' || Array.isArray(ed.history)) return { cell: legacyCell(ed.value, ed.emptyReason), history };
  return ed;
}

/** v0/v1을 현재 버전으로. 원본 객체는 바꾸지 않는다. 못 고치면 null. */
export function migrateRecord(rec) {
  if (!isObj(rec)) return null;
  const v = rec.schemaVersion ?? 0;
  if (v > SCHEMA_VERSION) return rec; // 미래 버전은 건드리지 않는다
  const r = /** @type {any} */ (structuredClone(rec));
  if (!Array.isArray(r.papers)) {
    if (r.dataMode === 'real') return null; // 실제 조사를 예시 문헌으로 복원하지 않는다.
    const t = EXAMPLE_TOPICS[r.topicKey];
    if (!t) return null; // 주제를 알 수 없으면 복원 불가
    r.papers = structuredClone(t.papers);
  }
  if (isObj(r.cellEdits)) for (const k of Object.keys(r.cellEdits)) r.cellEdits[k] = migrateCellEdit(r.cellEdits[k]);
  if (isObj(r.claims)) for (const c of Object.values(r.claims)) {
    if (!isObj(c)) continue;
    if (typeof c.condition !== 'string') c.condition = '';
    if (typeof c.interpretation !== 'string') c.interpretation = '';
  }
  r.userMeta ??= {};
  r.exampleDataVersion ??= EXAMPLE_DATA_VERSION;
  r.schemaVersion = SCHEMA_VERSION;
  return r;
}

/**
 * 레코드 검증. 중첩·참조 무결성까지 본다.
 * @returns {{ok:boolean, errors:string[], readOnly:boolean, record:any}}
 */
export function validateRecord(rec) {
  try { return validateRecordBody(rec); }
  catch (err) { return { ok: false, errors: [`검증 중 오류: ${/** @type {any} */ (err)?.message ?? err}`], readOnly: false, record: rec }; }
}

/** 목록의 한 줄. 검증이 예외를 던져도 그 항목만 손상으로 표시한다. */
export function storedEntry(r) {
  try {
    const v = validateRecord(r);
    if (v.ok) return v.record;
    return { id: r?.id ?? '?', name: r?.name ?? null, corrupt: true, readOnly: v.readOnly, errors: v.errors, raw: r };
  } catch (err) {
    return { id: r?.id ?? '?', name: r?.name ?? null, corrupt: true, readOnly: false, errors: [`검증 오류: ${/** @type {any} */ (err)?.message ?? err}`], raw: r };
  }
}

function validateRecordBody(rec) {
  if (!isObj(rec)) return { ok: false, errors: ['레코드가 객체가 아님'], readOnly: false, record: null };
  if ((rec.schemaVersion ?? 0) > SCHEMA_VERSION) {
    return { ok: false, errors: [`더 새로운 저장 형식(v${rec.schemaVersion})이라 읽기 전용으로만 열 수 있어요`], readOnly: true, record: rec };
  }
  const r = migrateRecord(rec);
  if (!r) return { ok: false, errors: ['주제 정보를 알 수 없어 복원할 수 없음'], readOnly: false, record: rec };
  const e = [...validateProject(r)];
  if (r.dataMode !== 'real' && !TOPIC_DEFS[r.topicKey]) e.push(`알 수 없는 주제: ${r.topicKey}`);
  const papers = Array.isArray(r.papers) ? r.papers : (e.push('papers 배열 필요'), []);
  const ids = new Set();
  papers.forEach((p, i) => {
    const pe = validatePaper(p, r.dataMode);
    pe.forEach(x => e.push(`papers[${i}]: ${x}`));
    if (p?.id) { if (ids.has(p.id)) e.push(`papers[${i}]: id 중복 ${p.id}`); ids.add(p.id); }
  });
  for (const k of ['notes', 'cellEdits', 'claims', 'dirSnap', 'userMeta']) if (!isObj(r[k])) e.push(`${k}: 객체 필요`);
  for (const k of ['selPapers', 'selDirs', 'questions', 'versions']) if (!Array.isArray(r[k])) e.push(`${k}: 배열 필요`);
  if (!isObj(r.scopeState)) e.push('scopeState: 객체 필요');
  else for (const k of ['exclude', 'boost', 'emphasis']) {
    if (!Array.isArray(r.scopeState[k])) e.push(`scopeState.${k}: 배열 필요`);
    else if (!r.scopeState[k].every((/** @type {any} */ x) => typeof x === 'string')) e.push(`scopeState.${k}: 문자열 요소 필요`);
  }
  validateLabProfile(r.lab).forEach(x => e.push(x));
  if (!e.length) {
    validateSelection({ paperIds: r.selPapers, directionIds: r.selDirs }).forEach(x => e.push(x));
    r.selPapers.forEach(id => { if (!ids.has(id)) e.push(`선택한 논문이 없음: ${id}`); });
    r.versions.forEach((v, i) => validateAnalysisVersion(v).forEach(x => e.push(`versions[${i}]: ${x}`)));
    for (const [id, d] of Object.entries(r.dirSnap)) {
      validateDirection(d).forEach(x => e.push(`dirSnap.${id}: ${x}`));
      for (const field of ['papers', 'readNext', 'representative', 'recent']) {
        if (!Array.isArray(d?.[field])) continue;
        d[field].forEach((/** @type {any} */ p) => { if (!ids.has(p?.id)) e.push(`dirSnap.${id}.${field}: 논문 참조 없음 ${p?.id}`); });
      }
    }
    r.selDirs.forEach(id => {
      if (!r.dirSnap[id]) e.push(`선택한 방향 스냅샷 없음: ${id}`);
      if (!r.claims[id]) e.push(`선택한 방향의 문장 없음: ${id}`);
    });
    for (const [id, c] of Object.entries(r.claims)) {
      if (!isObj(c) || !Array.isArray(c.evidence) || !Array.isArray(c.evidenceIds) || !Array.isArray(c.history)) { e.push(`claims.${id}: 구조 오류`); continue; }
      validateClaim(c, c.evidence).forEach(x => e.push(`claims.${id}: ${x}`));
      c.evidence.forEach(ev => validateEvidence(ev, papers).forEach(x => e.push(`claims.${id}.${ev?.id}: ${x}`)));
    }
    const evPaper = new Map();
    for (const c of Object.values(r.claims)) {
      if (!isObj(c) || !Array.isArray(c.evidence)) continue;
      for (const ev of c.evidence) if (isObj(ev) && typeof ev.id === 'string') evPaper.set(ev.id, ev.paperId);
    }
    for (const [k, ed] of Object.entries(r.cellEdits)) {
      const pid = k.split('|')[0];
      if (!ids.has(pid)) e.push(`cellEdits.${k}: 논문 없음`);
      if (!isObj(ed?.cell) || !Array.isArray(ed?.history)) { e.push(`cellEdits.${k}: 구조 오류`); continue; }
      validateCell(ed.cell).forEach(x => e.push(`cellEdits.${k}: ${x}`));
      if (typeof ed.cell.unit !== 'string' || typeof ed.cell.condition !== 'string') e.push(`cellEdits.${k}: 단위·조건은 문자열`);
      if (ed.cell.emptyReason && !EMPTY_REASONS.includes(ed.cell.emptyReason)) e.push(`cellEdits.${k}: emptyReason 값 오류`);
      if (ed.cell.evidenceId) {
        if (!evPaper.has(ed.cell.evidenceId)) e.push(`cellEdits.${k}: 근거 없음 ${ed.cell.evidenceId}`);
        else if (evPaper.get(ed.cell.evidenceId) !== pid) e.push(`cellEdits.${k}: 근거 논문 불일치`);
      }
      if (ed.history.some((/** @type {any} */ h) => !isObj(h) || !isObj(h.cell) || typeof h.cell.value !== 'string')) e.push(`cellEdits.${k}: history 구조 오류`);
    }
    for (const id of Object.keys(r.notes)) if (!ids.has(id)) e.push(`notes.${id}: 논문 없음`);
  }
  return { ok: e.length === 0, errors: e, readOnly: false, record: r };
}
