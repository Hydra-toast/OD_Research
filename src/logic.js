// 화면과 무관한 순수 로직: 범위·정렬·방향·연구실 연결·비교 셀·주장·내보내기.
import { TOPIC_DEFS, ROLE_LABEL, ROLE_REASON, COMPARE_ITEMS, EMPTY_LABEL } from './data/content.js';
import { dedupePapers, validatePaper, EMPTY_REASONS } from './schema.js';

export const MIN_PAPERS_FOR_DIRECTIONS = 8;
export const MIN_PAPERS_PER_DIRECTION = 2;
export const EX_LABEL = '가상 예시 · 실제 논문 아님';
export const ORIGIN_LABEL = { example: '가상 예시', user: '사용자 제공 자료 · 확인 전', provider: '검색 공급자' };
export const ACCESS_LABEL = { metadata: '서지정보만 확보', abstract: '초록 확보', fulltext: '원문 확보' };

export const newScope = () => ({ exclude: [], boost: [], emphasis: [], material: '', materialOnly: false, focus: 'trend' });

export function parseTerms(s) { return String(s || '').split(/[,\n]/).map(x => x.trim()).filter(Boolean); }
const words = s => String(s || '').split(/[,\s]+/).map(x => x.trim()).filter(Boolean);
const lc = s => String(s).toLowerCase();
const has = (list, term) => list.some(x => lc(x).includes(lc(term)));

/** 논문 id → 분류 메타. 예시 논문은 예시 순서의 명세, 사용자 논문은 userMeta를 쓴다. */
export function metaFor(topicKey, papers, userMeta = {}) {
  const def = TOPIC_DEFS[topicKey];
  const m = {};
  let exIdx = 0;
  for (const p of papers) {
    if (p.origin === 'example') { const s = def?.specs[exIdx++]; if (s) m[p.id] = s; }
    else if (userMeta[p.id]) m[p.id] = userMeta[p.id];
  }
  return m;
}

/** 소재/대상 문구가 다른 예시 주제에 해당하면 그 주제 키를 제안한다. */
export function suggestTopicForMaterial(material, currentKey) {
  const ws = words(material).map(lc);
  if (!ws.length) return null;
  for (const [k, d] of Object.entries(TOPIC_DEFS)) {
    if (k === currentKey) continue;
    if (d.keywords.some(kw => ws.some(w => w.includes(kw) || kw.includes(w)))) return k;
  }
  return null;
}

/** 범위 적용·정렬. 제외된 항목은 별도로 돌려준다. 인용수 null은 0으로 바꾸지 않는다. */
export function rankPapers(papers, meta, scope, sort = 'relevance') {
  const terms = words(scope.material);
  const matchesMaterial = p => terms.some(t => has(meta[p.id]?.tags ?? [], t) || lc(p.title).includes(lc(t)));
  const materialMiss = terms.length > 0 && !papers.some(matchesMaterial);
  const excluded = [], kept = [];
  papers.forEach((p, idx) => {
    const tags = meta[p.id]?.tags ?? [];
    if (scope.exclude.some(t => has(tags, t) || lc(p.title).includes(lc(t)))) { excluded.push(p); return; }
    if (scope.materialOnly && terms.length && !materialMiss && !matchesMaterial(p)) { excluded.push(p); return; }
    const reasons = [];
    let score = 100 - idx;
    for (const t of scope.boost) if (has(tags, t)) { score += 20; reasons.push(`"${t}" 더 보기와 일치`); }
    for (const t of scope.emphasis) if (has(tags, t)) { score += 10; reasons.push(`강조 표현 "${t}"과 일치`); }
    if (terms.length && matchesMaterial(p)) { score += 25; reasons.push(`소재/대상 "${scope.material}"와 일치`); }
    const role = meta[p.id]?.role;
    if (scope.focus === 'methods' && role === 'approach') { score += 15; reasons.push('방법 비교 중심 설정과 일치'); }
    if (scope.focus === 'trend' && role === 'recent') { score += 15; reasons.push('연구 동향 중심 설정과 일치'); }
    if (!reasons.length) reasons.push('기본 순서(수집 순서)');
    kept.push({ paper: p, score, reasons });
  });
  const nullLast = (a, b, dir) => (a == null ? 1 : b == null ? -1 : dir * (a - b));
  if (sort === 'recent') kept.sort((a, b) => nullLast(a.paper.year, b.paper.year, -1));
  else if (sort === 'citations') kept.sort((a, b) => nullLast(a.paper.citationCount, b.paper.citationCount, -1));
  else kept.sort((a, b) => b.score - a.score);
  return { items: kept, excluded, materialTerms: terms, materialMiss };
}

/** 방향 후보. 초록 이상 8편 미만이면 만들지 않고, 방향별 2편 미만이면 숨긴다. */
export function buildDirections(topicKey, papers, scope, userMeta = {}) {
  const def = TOPIC_DEFS[topicKey];
  const unique = dedupePapers(papers).filter(p => p.access !== 'metadata');
  if (!def || unique.length < MIN_PAPERS_FOR_DIRECTIONS) {
    return { available: false, count: unique.length, directions: [], reason: `초록 이상을 확보한 논문이 ${unique.length}편이라 방향 후보를 만들지 않았어요. (운영 기준 ${MIN_PAPERS_FOR_DIRECTIONS}편 이상, 과학적 충분성을 뜻하지 않음)` };
  }
  const meta = metaFor(topicKey, papers, userMeta);
  const { items } = rankPapers(unique, meta, scope);
  const live = new Set(items.map(i => i.paper.id));
  const roleOrder = { review: 0, approach: 1, recent: 2 };
  const directions = def.branches.map(b => {
    const list = unique.filter(p => live.has(p.id) && meta[p.id]?.branches.includes(b.id));
    const sorted = [...list].sort((x, y) => (roleOrder[meta[x.id].role] ?? 9) - (roleOrder[meta[y.id].role] ?? 9));
    const readNext = sorted.slice(0, 3);
    const times = list.map(p => p.collectedAt).sort();
    return {
      ...b, papers: list, readNext,
      readNextWhy: readNext.map(p => ({ paper: p, why: ROLE_REASON[meta[p.id].role] })),
      representative: list.filter(p => meta[p.id].role !== 'recent').slice(0, 3),
      recent: list.filter(p => meta[p.id].role === 'recent').slice(0, 2),
      observation: { inScope: list.length, total: unique.length, collectedAt: times[times.length - 1] ?? null },
    };
  }).filter(d => d.papers.length >= MIN_PAPERS_PER_DIRECTION);
  return { available: true, count: unique.length, directions, reason: '' };
}

/** 연구실 연결: 재료 유사성·공정 유사성·실험 가능성(장비)을 따로 낸다. */
export function labConnection(direction, lab) {
  const filled = lab && ['materials', 'processes', 'equipment', 'measures'].some(k => (lab[k] || '').trim());
  if (!filled) return { status: 'none', common: [], materialCommon: [], processCommon: [], needs: [], weak: [] };
  const match = (tag, terms) => terms.some(x => lc(x).includes(lc(tag)) || lc(tag).includes(lc(x)));
  const materialCommon = (direction.materialTags ?? []).filter(t => match(t, parseTerms(lab.materials)));
  const processCommon = (direction.processTags ?? []).filter(t => match(t, [...parseTerms(lab.processes), ...parseTerms(lab.measures)]));
  const common = [...materialCommon, ...processCommon];
  const equip = parseTerms(lab.equipment).concat(parseTerms(lab.measures));
  const needs = direction.needs.map(n => ({ name: n, status: has(equip, n) ? '연구실 입력에 있음(실제 보유 확인 필요)' : '확인 필요' }));
  return { status: 'lab', common, materialCommon, processCommon, needs, weak: direction.tags.filter(t => !common.includes(t)) };
}

export function createLatest() {
  let n = 0;
  return { next: () => ++n, isLatest: id => id === n };
}

// ---- 사용자 직접 추가 논문 ----
const DOI_RE = /^10\.\d{4,9}\/\S+$/;
/** 사용자가 입력한 논문. 조회하지 않고, 초록이 있어야 abstract 접근으로 본다. */
export function makeUserPaper(input, now = new Date().toISOString(), rand = () => Math.random().toString(36).slice(2, 10)) {
  const title = String(input.title || '').trim();
  if (!title) throw new Error('제목을 적어주세요.');
  const doi = String(input.doi || '').trim();
  if (doi && !DOI_RE.test(doi)) throw new Error('DOI 형식이 올바르지 않아요. (예: 10.1234/abcd) 조회는 하지 않아요.');
  const abstract = String(input.abstract || '').trim() || null;
  const year = input.year === '' || input.year == null ? null : Number(input.year);
  if (year != null && !(Number.isInteger(year) && year > 1900 && year < 2100)) throw new Error('연도를 확인해 주세요.');
  /** @type {import('./schema.js').Paper} */
  const paper = {
    id: `user:${rand()}`, doi: doi || null, providerId: null, title, authors: [], year, venue: null, citationCount: null,
    abstract, access: abstract ? 'abstract' : 'metadata', origin: 'user', collectedAt: now, source: '사용자 입력',
  };
  const errs = validatePaper(paper, 'example');
  if (errs.length) throw new Error(errs.join(', '));
  const meta = { role: ['review', 'approach', 'recent'].includes(input.role) ? input.role : 'approach', branches: input.branches ?? [], tags: parseTerms(input.tags) };
  return { paper, meta };
}

// ---- 비교 표 ----
const blank = { value: '', unit: '', condition: '', evidenceId: null };
const ex = value => ({ ...blank, value, source: 'example', emptyReason: undefined });
const empty = reason => ({ ...blank, value: '', source: 'example', emptyReason: reason });

export const isNumeric = v => /\d/.test(String(v ?? ''));
export function cellFlags(c) {
  const f = [];
  if (c.source === 'user' && c.value && isNumeric(c.value)) {
    if (!c.unit) f.push('단위 없음');
    if (!c.condition) f.push('측정 조건 없음');
    if (!c.evidenceId) f.push('근거 미연결');
  }
  return f;
}

export function buildCompareRows(papers, meta, edits = {}) {
  return papers.map((p, i) => {
    const role = meta[p.id]?.role, tags = meta[p.id]?.tags ?? [];
    const base = {
      '연구 목적': ex(`[가상 예시] ${ROLE_LABEL[role] ?? '자료'} 관점의 목적 요약`),
      '주요 접근법': ex(`[가상 예시] ${tags.join(' · ')}`),
      '재료·공정': i % 2 === 0 ? ex(`[가상 예시] ${tags[0] ?? ''}`) : empty('fulltext_unavailable'),
      '주요 결과': empty('fulltext_unavailable'),
      '결과가 성립한 조건': empty('fulltext_unavailable'),
      '저자가 밝힌 한계': empty(role === 'review' ? 'not_applicable' : 'not_found_in_sources'),
      '이번 조사와의 연결': ex(`[가상 예시] ${(meta[p.id]?.branches ?? []).length}개 갈래와 관련`),
    };
    const cells = {};
    for (const item of COMPARE_ITEMS) {
      const e = edits[`${p.id}|${item}`];
      const cur = e ? e.cell : base[item];
      cells[item] = { ...cur, original: base[item], edits: e?.history ?? [], edited: !!e, flags: cellFlags(cur) };
    }
    return { paper: p, cells };
  });
}

/** 한 항목(행)에서 숫자 셀 둘 이상의 단위·조건이 다르거나 비어 있으면 직접 비교를 제한한다. */
export function rowCompareWarning(rows, item) {
  const nums = rows.map(r => ({ title: r.paper.title, c: r.cells[item] })).filter(x => x.c.source === 'user' && x.c.value && isNumeric(x.c.value));
  if (nums.length < 2) return null;
  const units = new Set(nums.map(x => String(x.c.unit ?? '').trim().toLowerCase()));
  const conds = new Set(nums.map(x => String(x.c.condition ?? '').trim().toLowerCase()));
  const reasons = [];
  if (units.size > 1 || units.has('')) reasons.push('단위가 서로 다르거나 비어 있음');
  if (conds.size > 1 || conds.has('')) reasons.push('측정 조건이 서로 다르거나 비어 있음');
  return reasons.length ? `조건이 달라 직접 비교하기 어려워요: ${reasons.join(', ')}` : null;
}

export function validateCellEdit(cell) {
  const value = String(cell.value ?? '').trim();
  if (!value && !EMPTY_REASONS.includes(cell.emptyReason)) return ['값을 비우려면 빈값 사유를 선택해야 해요.'];
  return [];
}

export function editCell(edits, paperId, item, cell, now = new Date().toISOString()) {
  const errs = validateCellEdit(cell);
  if (errs.length) throw new Error(errs[0]);
  const value = String(cell.value ?? '').trim();
  const norm = {
    value, unit: String(cell.unit ?? '').trim(), condition: String(cell.condition ?? '').trim(), evidenceId: cell.evidenceId || null,
    emptyReason: value ? undefined : cell.emptyReason, source: 'user',
  };
  const key = `${paperId}|${item}`;
  return { ...edits, [key]: { cell: norm, history: [...(edits[key]?.history ?? []), { at: now, by: 'user', cell: norm }] } };
}

// ---- 주장 ----
const noLoc = () => ({ page: null, section: null, figure: null, table: null });
export function makeEvidence(directionId, idx, paper) {
  return { id: `ev:${directionId}:${paper.id}`, paperId: paper.id, documentVersion: paper.origin === 'user' ? 'user-v1' : 'example-v1', excerpt: paper.abstract, location: noLoc() };
}
export function makeClaim(direction) {
  const evidence = direction.papers.filter(p => p.abstract).slice(0, 3).map((p, i) => makeEvidence(direction.id, i, p));
  return {
    id: `claim:${direction.id}`, directionId: direction.id,
    text: `${direction.label}은(는) 수집한 자료에서 검토할 수 있는 연구 방향이다.`,
    condition: '', interpretation: '', evidenceIds: evidence.map(e => e.id), evidence,
    state: { sourceLinked: true, aiInterpreted: false, userConfirmed: false, needsCheck: true }, note: '', history: [],
  };
}
/** 추가로 연결할 수 있는 근거 후보: 방향 논문 + 선택한 논문 중 아직 연결되지 않은 초록 보유 논문 */
export function candidateEvidencePapers(claim, direction, selectedPapers) {
  const linked = new Set(claim.evidence.map(e => e.paperId));
  return dedupePapers([...(direction?.papers ?? []), ...selectedPapers]).filter(p => p.abstract && !linked.has(p.id));
}
export function addEvidence(claim, paper) {
  const ev = makeEvidence(claim.directionId, claim.evidence.length, paper);
  return { ...claim, evidence: [...claim.evidence, ev], evidenceIds: [...claim.evidenceIds, ev.id] };
}
/** 문장 수정: 근거 연결은 보존, 사용자 확인 해제, 추가 확인 필요로 되돌림. */
export function editClaimText(claim, text, now = new Date().toISOString()) {
  if (text === claim.text) return claim;
  return { ...claim, text, history: [...claim.history, { at: now, text: claim.text }], state: { ...claim.state, userConfirmed: false, needsCheck: true } };
}
export function confirmClaim(claim) {
  if (!claim.state.sourceLinked) return claim;
  return { ...claim, state: { ...claim.state, userConfirmed: true, needsCheck: false } };
}
export function claimLabels(claim) {
  const s = claim.state, out = [];
  out.push(s.sourceLinked ? '출처 발췌 연결' : '출처 연결 없음');
  if (s.aiInterpreted) out.push('AI 해석');
  out.push(s.userConfirmed ? '사용자 확인' : '미확인');
  if (s.needsCheck) out.push('추가 확인 필요');
  return out;
}
export function nextQuestion(claim, hasLab) {
  if (!claim.evidenceIds.length) return { id: 'no-evidence', text: '이 문장을 뒷받침하는 논문 근거는 무엇인가요?' };
  if (!String(claim.condition ?? '').trim()) return { id: 'no-condition', text: '이 결과가 성립한 조건(재료·공정·측정 방법)을 원문에서 찾았나요?' };
  if (/우리\s*(랩|연구실)/.test(claim.text) && !hasLab) return { id: 'lab-info', text: '이 결과가 우리 랩에도 적용된다고 말하려면 어떤 조건을 더 확인해야 할까요?' };
  return null;
}

// ---- 내보내기 ----
const esc = s => String(s ?? '').replace(/\r?\n/g, ' ').replace(/([\\`*_{}\[\]<>#|])/g, '\\$1');
const clip = (s, n = 90) => { const t = String(s ?? '').replace(/\s+/g, ' '); return t.length > n ? t.slice(0, n) + '…' : t; };

function locText(loc) {
  const parts = Object.entries(loc ?? {}).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`);
  return parts.length ? parts.join(', ') : '위치 없음(초록만 확보)';
}
function headerNotes(ctx) {
  const L = [];
  const origins = new Set([...ctx.papers, ...ctx.directions.flatMap(d => d.papers)].map(p => p.origin));
  if (ctx.project.dataMode === 'example') L.push(`> ${EX_LABEL} — 가상 예시 자료는 화면 동작을 보여주는 용도이며 실제 연구 근거가 아닙니다.`);
  if (origins.has('user')) L.push(`> 사용자 제공 자료가 포함되어 있습니다(${origins.has('example') ? '가상 예시와 섞여 있음; ' : ''}내용 확인 전).`);
  return L.length ? [...L, ''] : [];
}
function selectedPapersSection(ctx) {
  const L = [`## 선택한 논문 (${ctx.papers.length}편)`];
  if (!ctx.papers.length) L.push('- 선택한 논문이 없습니다.');
  for (const p of ctx.papers) {
    L.push(`- ${esc(p.title)} [${ACCESS_LABEL[p.access]} · ${ORIGIN_LABEL[p.origin]}]`);
    if (ctx.notesByPaper[p.id]) L.push(`  - 메모: ${esc(ctx.notesByPaper[p.id])}`);
    const row = ctx.rows?.find(r => r.paper.id === p.id);
    for (const [item, c] of Object.entries(row?.cells ?? {})) {
      if (!c.edited) continue;
      const val = c.value ? `${esc(c.value)}${c.unit ? ' ' + esc(c.unit) : ''}${c.condition ? ` (조건: ${esc(c.condition)})` : ''}${c.evidenceId ? ` [근거 ${esc(c.evidenceId)}]` : ' [근거 미연결]'}` : EMPTY_LABEL[c.emptyReason];
      L.push(`  - 사용자 수정 · ${item}: ${val} (수정 ${c.edits.length}건; 원래 값: ${c.original.value ? esc(c.original.value) : EMPTY_LABEL[c.original.emptyReason]})`);
      if (c.flags.length) L.push(`    - 확인 필요: ${c.flags.join(', ')}`);
    }
  }
  return L;
}
function claimsSection(ctx) {
  const L = ['## 발표할 문장과 근거'];
  if (!ctx.claims.length) L.push('- 선택한 방향이 없어 발표 문장이 없습니다.');
  for (const c of ctx.claims) {
    L.push(`### ${esc(c.text)}`, `- 상태: ${claimLabels(c).join(' / ')}`, `- 적용 조건: ${c.condition ? esc(c.condition) : '미입력(확인 필요)'}`, `- 내 해석: ${c.interpretation ? esc(c.interpretation) : '미입력'}`);
    L.push(`- 연결된 근거 ${c.evidence.length}건:`);
    for (const e of c.evidence) { const p = ctx.allPapers?.find(x => x.id === e.paperId) ?? ctx.papers.find(x => x.id === e.paperId); L.push(`  - ${esc(p?.title ?? e.paperId)} — “${esc(clip(e.excerpt))}” (${locText(e.location)})`); }
    if (c.history.length) L.push(`- 문장 수정 ${c.history.length}회`);
    L.push('');
  }
  return L;
}

export function buildSummaryMd(ctx) {
  const { project, directions, notesByPaper, lab } = ctx;
  const L = [...headerNotes(ctx)];
  L.push('# 한 페이지 연구 방향 요약', '', '## 조사 질문', esc(project.originalInput), '', `조사 범위: ${esc(project.scope)}`, '');
  L.push(...selectedPapersSection(ctx), '');
  L.push('## 선택한 방향');
  if (!directions.length) L.push('- 선택한 방향이 없습니다.');
  for (const d of directions) {
    L.push(`### ${esc(d.label)}`, `- 검토할 질문: ${esc(d.question)}`);
    L.push(`- 핵심 근거(자료 범위: ${[...new Set(d.papers.map(p => ACCESS_LABEL[p.access]))].join(', ')}):`);
    for (const p of d.papers.slice(0, 3)) L.push(`  - ${esc(p.title)} [${ORIGIN_LABEL[p.origin]}]`);
    const conn = labConnection(d, lab);
    L.push(`- 연구실과의 연결: ${conn.status === 'none' ? '연구실 정보 미입력(맞춤 연결 없음)' : `재료 ${conn.materialCommon.map(esc).join(', ') || '공통 없음'} / 공정 ${conn.processCommon.map(esc).join(', ') || '공통 없음'}`}`);
    L.push(`- 미확인: ${conn.needs.length ? conn.needs.map(n => `${esc(n.name)}(${n.status})`).join(', ') : '장비·조건은 연구실 정보 입력 후 확인'}; 수치·조건은 원문 확인 필요`, '');
  }
  L.push(...claimsSection(ctx));
  L.push('## 교수님께 확인할 질문');
  if (!ctx.questions.length) L.push('- 없음');
  for (const q of ctx.questions) L.push(`- ${esc(q)}`);
  L.push('', '## 미확인 사항');
  const open = ctx.claims.filter(c => !c.state.userConfirmed);
  L.push(open.length ? open.map(c => `- ${esc(c.text)} (${claimLabels(c).join(' / ')})`).join('\n') : '- 미확인 문장 없음(사용자 확인 기준; 원문 대조는 별도)');
  L.push('', '## 다음에 읽을 논문');
  const next = directions.flatMap(d => d.readNext).filter((p, i, a) => a.findIndex(q => q.id === p.id) === i);
  if (!next.length) L.push('- 방향을 선택하지 않아 제안 없음');
  for (const p of next) L.push(`- ${esc(p.title)}${notesByPaper[p.id] ? ' — 메모: ' + esc(notesByPaper[p.id]) : ''}`);
  L.push('', '> AI 해석이 포함되어 있을 수 있어요. 발표에 사용할 조건과 수치는 연결된 원문에서 확인하세요.');
  return L.join('\n') + '\n';
}

export function buildGuideMd(ctx) {
  const { project, directions, claims } = ctx;
  const L = [...headerNotes(ctx)];
  L.push('# 발표 가이드 (외부 PPT 도구용)', '', '실제 PPT는 생성하지 않습니다. 슬라이드별 내용만 정리했습니다.', '');
  let n = 1;
  L.push(`## 슬라이드 ${n++}. 조사 질문과 범위`, `- 핵심 문장: ${esc(project.originalInput)}`, '- 사용할 자료: 없음', '- 근거: 해당 없음', '- 한계: 범위는 수집한 자료 기준이며 분야 전체를 포괄하지 않음', '');
  if (ctx.papers.length) {
    L.push(`## 슬라이드 ${n++}. 선택 논문 비교`, '- 핵심 문장: 선택한 논문을 같은 항목으로 비교한 결과', '- 사용할 표·그림: 논문 비교표(준비 화면)');
    L.push(`- 근거 논문과 위치: ${ctx.papers.map(p => `${esc(p.title)}(${ACCESS_LABEL[p.access]}; 위치 정보 없음)`).join(', ')}`);
    for (const p of ctx.papers) {
      if (ctx.notesByPaper?.[p.id]) L.push(`- 메모 (${esc(p.title)}): ${esc(ctx.notesByPaper[p.id])}`);
      const row = ctx.rows?.find(r => r.paper.id === p.id);
      for (const [item, c] of Object.entries(row?.cells ?? {})) {
        if (!c.edited) continue;
        const val = c.value ? `${esc(c.value)}${c.unit ? ' ' + esc(c.unit) : ''}${c.condition ? ` (조건: ${esc(c.condition)})` : ''}${c.evidenceId ? ` [근거 ${esc(c.evidenceId)}]` : ' [근거 미연결]'}` : EMPTY_LABEL[c.emptyReason];
        L.push(`- 사용자 수정 · ${esc(p.title)} · ${item}: ${val}`);
      }
    }
    const flags = (ctx.rows ?? []).flatMap(r => Object.entries(r.cells).filter(([, c]) => c.edited && c.flags.length).map(([item, c]) => `${esc(r.paper.title)}·${item}: ${c.flags.join('/')}`));
    L.push(`- 설명의 한계: 초록 기반이면 수치·조건은 원문 확인 필요${flags.length ? '; 미연결 항목 ' + flags.join(', ') : ''}`, '');
  }
  for (const d of directions) {
    const c = claims.find(x => x.directionId === d.id);
    L.push(`## 슬라이드 ${n++}. ${esc(d.label)}`, `- 핵심 문장: ${esc(c?.text ?? d.question)}`, `- 적용 조건: ${c?.condition ? esc(c.condition) : '미입력(확인 필요)'}`, '- 사용할 표·그림: 논문 비교표(준비 화면)');
    L.push(`- 근거 논문과 위치: ${(c?.evidence ?? []).map(e => { const p = d.papers.find(x => x.id === e.paperId); return `${esc(p?.title ?? e.paperId)}(${locText(e.location)})`; }).join(', ') || '연결된 근거 없음'}`);
    L.push(`- 설명의 한계: ${c ? claimLabels(c).join(' / ') : '미확인'}${project.dataMode === 'example' ? '; ' + EX_LABEL : ''}`, '');
  }
  L.push(`## 슬라이드 ${n++}. 확인할 사항`, `- 핵심 문장: 아직 확인하지 못한 항목 정리`, ...(ctx.questions.length ? ctx.questions.map(q => `- 교수님께 확인: ${esc(q)}`) : ['- 교수님께 확인할 질문 없음']), '');
  return L.join('\n') + '\n';
}

export { COMPARE_ITEMS, EMPTY_LABEL };
