// 세부 검색·선택·공개 원문·총정리 동작. 사이트는 AI를 호출하지 않는다.
import { S, ranked, meta, paperById, scopeText } from '../state/store.js';
import { $, render } from './render.js';
import { scheduleSave } from './persist.js';
import { refineSearch } from './session.js';
import { applyRefine, splitTerms } from '../research/refine.js';
import { ruleRank, RANK_VERSION } from '../research/rank.js';
import { suggestKeywords } from '../research/keywords.js';
import { summaryPrompt, checkSummaryMd, SUMMARY_PROMPT_VERSION } from '../research/summary.js';
import { buildHandoff, parseHandoff, pickPapers, basisVersion } from '../research/handoff.js';
import { candidateUrls, ftLabel } from '../views/research.js';
import { saveFulltext, loadFulltext, loadFulltextPdf } from '../repository/idb.js';

const touch = () => { scheduleSave(); render(); };

function visibleIds() {
  const ok = new Set(applyRefine(S.papers, S.refine).visible.map((/** @type {any} */ p) => p.id));
  const m = meta(S);
  return ranked(S).items.filter((/** @type {any} */ it) => (!S.branch || m[it.paper.id]?.branches.includes(S.branch)) && ok.has(it.paper.id)).map((/** @type {any} */ it) => it.paper.id);
}

/** 입력칸에 적은 값을 먼저 상태에 반영(다시 그리면 사라지지 않게). */
function readRefineInputs() {
  const f = document.querySelector('[data-rform="refine"]');
  if (!f) return;
  S.refine.include = splitTerms(/** @type {any} */ (f.querySelector('[name=include]'))?.value);
  S.refine.exclude = splitTerms(/** @type {any} */ (f.querySelector('[name=exclude]'))?.value);
}

/** 포함어를 핵심어로 반영해 정렬 근거와 일치시킨다. */
function syncCriteria() {
  if (S.dataMode !== 'real') return;
  const criteria = { ...(S.researchBrief?.searchCriteria || {}) };
  criteria.core = [...new Set([...(criteria.core || []), ...S.refine.include])];
  S.papers = ruleRank(S.papers, criteria).papers;
  S.researchBrief = { ...(S.researchBrief || {}), searchCriteria: criteria, rankVersion: RANK_VERSION };
}

function applyFilterRound() {
  readRefineInputs();
  syncCriteria();
  S.refine.released = [];
  const matched = applyRefine(S.papers, S.refine).visible.length;
  S.refine.rounds.push({ id: `r${S.refine.rounds.length + 1}`, at: new Date().toISOString(), mode: 'filter', include: [...S.refine.include], exclude: [...S.refine.exclude], queries: [], added: 0, matched });
  S.refineMsg = `${matched}편이 조건에 맞아요. 숨긴 논문은 지우지 않았어요.`;
  touch();
}

// ---- 원문 ----
const doiKey = (/** @type {any} */ d) => String(d || '').toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '');

async function storeResult(/** @type {any} */ paper, /** @type {any} */ r) {
  const old = S.fulltext[paper.id];
  if (!['extracted', 'scan_only'].includes(r.status) && ['extracted', 'scan_only'].includes(old?.status)) {
    S.fulltext[paper.id] = { ...old, lastError: r.status }; return;
  }
  const pdf = r.pdfBase64 ? new Blob([Uint8Array.from(atob(r.pdfBase64), c => c.charCodeAt(0))], { type: 'application/pdf' }) : null;
  const entry = { status: r.status, pageCount: r.pageCount || 0, source: r.source || '', license: r.license || null, sha256: r.sha256 || null, extractor: r.extractor || null, truncatedPages: !!r.truncatedPages, at: new Date().toISOString(), pdfAvailable: !!pdf, pdfBytes: r.pdfBytes || 0, sourceUrl: r.sourceUrl || null, requestedDoi: r.requestedDoi || null, doiVerified: r.doiVerified ?? null };
  if ((r.status === 'extracted' || r.status === 'scan_only') && r.pages?.length && S.projectId) await saveFulltext(S.projectId, paper.id, r.pages, pdf);
  else if (r.status === 'extracted' && !S.projectId) entry.status = 'failed';
  S.fulltext[paper.id] = entry;
}

async function fetchOne(/** @type {any} */ paper) {
  const res = await fetch('/api/fulltext/fetch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ doi: paper.doi || '', urls: candidateUrls(paper), license: paper.fulltext?.license || null }) });
  const body = await res.json().catch(() => ({}));
  await storeResult(paper, res.ok ? body : { status: 'failed' });
  return S.fulltext[paper.id].status;
}

async function fetchScihub(paper) {
  if (S.fulltextBusy) return;
  const projectId = S.projectId;
  S.fulltextBusy = true; S.fulltextActive = [paper.id];
  S.fulltextMsg = 'Sci-Hub에서 선택한 논문 1편을 확인하고 있어요.'; render();
  try {
    const res = await fetch('/api/fulltext/scihub', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ doi: paper.doi }) });
    const r = await res.json();
    if (S.projectId !== projectId) return;
    const status = r.status || 'failed';
    await storeResult(paper, { ...r, status });
    S.fulltextMsg = status === 'extracted' ? `Sci-Hub 원문 ${r.pageCount}쪽과 PDF를 보관했어요.${r.doiVerified ? ' 본문 DOI 일치 확인.' : ' 본문 DOI는 직접 확인해 주세요.'}`
      : status === 'scan_only' ? 'PDF는 보관했지만 추출할 텍스트가 없어요. OCR은 지원하지 않아요.'
      : `Sci-Hub: ${ftLabel(status)}. 기존에 확보한 자료는 유지했어요.`;
  } catch {
    if (S.projectId === projectId) S.fulltextMsg = '다운로드 또는 브라우저 저장에 실패했어요. 기존 자료는 유지했어요.';
  } finally { if (S.projectId === projectId) { S.fulltextBusy = false; S.fulltextActive = []; touch(); } }
}

async function downloadStoredPdf(id) {
  try {
    const blob = await loadFulltextPdf(S.projectId, id);
    if (!blob) { S.fulltextMsg = '보관 PDF가 없어요. 원문을 다시 받아 주세요.'; render(); return; }
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `paper-${String(paperById(id)?.doi || id).replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch { S.fulltextMsg = '보관 PDF를 읽지 못했어요.'; render(); }
}

async function fetchMany(/** @type {any[]} */ papers) {
  if (!papers.length) return;
  S.fulltextBusy = true;
  const counts = { ok: 0, none: 0, fail: 0 };
  let done = 0;
  const active = new Set();
  const report = () => {
    const names = [...active].map((/** @type {any} */ p) => String(p.title || p.id).slice(0, 42));
    S.fulltextActive = [...active].map((/** @type {any} */ p) => p.id);
    S.fulltextMsg = `${done}/${papers.length}편 확인 · 확보 ${counts.ok} · 공개본 없음 ${counts.none} · 실패 ${counts.fail}${names.length ? ` · 받는 중: ${names.join(' / ')}` : ''}`;
    render();
  };
  const queue = [...papers];
  const worker = async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      active.add(p); report();
      let st = 'failed';
      try { st = await fetchOne(p); } catch { await storeResult(p, { status: 'failed' }); }
      active.delete(p); done++;
      if (st === 'extracted') counts.ok++; else if (st === 'no_candidate' || st === 'not_pdf') counts.none++; else counts.fail++;
      report();
    }
  };
  await Promise.all([worker(), worker()]);
  S.fulltextBusy = false; S.fulltextActive = [];
  S.fulltextMsg = `확보 ${counts.ok} / 공개본 없음 ${counts.none} / 실패·기타 ${counts.fail}. 확보하지 못한 논문은 초록만으로 정리하거나 PDF를 올려 주세요.`;
  touch();
}

async function uploadFiles(/** @type {FileList|File[]} */ files, /** @type {string|undefined} */ targetId) {
  S.fulltextBusy = true;
  const lines = [];
  let n = 0;
  for (const file of files) {
    n++;
    S.fulltextMsg = `${n}/${files.length}개 처리 중: ${file.name}`;
    render();
    try {
      const res = await fetch('/api/fulltext/upload?name=' + encodeURIComponent(file.name), { method: 'POST', headers: { 'content-type': 'application/pdf' }, body: file });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) { lines.push(`${file.name}: ${r.error?.message || '처리하지 못했어요'}`); continue; }
      const paper = targetId ? paperById(targetId) : S.papers.find((/** @type {any} */ p) => r.doiFound && p.doi && doiKey(p.doi) === doiKey(r.doiFound));
      if (!paper) { lines.push(`${file.name}: 어느 논문인지 알 수 없어요(DOI를 찾지 못함). 논문 카드의 “내 PDF 올리기”로 직접 연결해 주세요.`); continue; }
      await storeResult(paper, { ...r, source: '내가 올린 PDF' });
      lines.push(`${file.name}: ${paper.title.slice(0, 40)} ← ${r.status}`);
    } catch { lines.push(`${file.name}: 업로드에 실패했어요.`); }
  }
  S.fulltextBusy = false; S.fulltextMsg = lines.join(' / '); touch();
}

// ---- 총정리 ----
async function buildPrompt(/** @type {string[]} */ ids, /** @type {string} */ previousMd) {
  const papers = ids.map(id => paperById(id)).filter(Boolean);
  const pagesById = /** @type {Record<string, any[]>} */ ({});
  for (const p of papers) if (S.fulltext[p.id]?.status === 'extracted' && S.projectId) pagesById[p.id] = (await loadFulltext(S.projectId, p.id)) || [];
  const keywords = suggestKeywords(S.papers, { known: [], limit: 10 }).map(k => k.term);
  S.summaryPrompt = summaryPrompt({ topic: S.input, papers, fulltext: S.fulltext, pagesById, keywords, request: S.summaryRequest, previousMd });
  S.summaryCtx = { paperIds: papers.map(p => p.id), promptVersion: SUMMARY_PROMPT_VERSION, at: new Date().toISOString() };
  try { await navigator.clipboard.writeText(S.summaryPrompt); S.summaryMsg = `프롬프트를 복사했어요(논문 ${papers.length}편). ChatGPT 대화에 붙여 넣으세요. 이 사이트는 전송하지 않았어요. 논문 번호 P1~P${papers.length}가 정리본과 연결돼요.`; }
  catch { S.summaryMsg = '자동 복사에 실패했어요. 아래 미리보기에서 직접 복사하세요.'; }
  touch();
}

function download(/** @type {string} */ name, /** @type {string} */ text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  a.download = name;
  document.body.append(a); a.click(); a.remove();
}

function addVersion(/** @type {string} */ md, /** @type {string[]} */ ids, /** @type {'external'|'user'} */ source) {
  S.summaries.push({ id: `s${S.summaries.length + 1}-${Date.now().toString(36)}`, at: new Date().toISOString(), md, paperIds: ids, promptVersion: SUMMARY_PROMPT_VERSION, source, checks: checkSummaryMd(md, ids.length) });
  S.summaryDraft = md; S.summaryDraftIds = ids;
}

function handoffContext(/** @type {string} */ purpose) {
  return {
    speech: S.input, field: '', conditions: '', criteria: S.researchBrief?.searchCriteria || {},
    rankVersion: S.researchBrief?.rankVersion || 'rule-v1', papers: S.papers,
    selectedIds: purpose === 'read' ? [] : S.selPapers,
    focusId: purpose === 'read' ? (S.chatgptFocusId || S.selPapers[0] || S.papers[0]?.id || '') : '',
    lab: S.lab, note: S.chatgptNote, warnings: S.warnings, fulltext: S.fulltext,
    claims: Object.values(S.claims || {}), notes: S.notes, pagesById: {},
  };
}

async function buildGpt() {
  const purpose = S.chatgptPurpose || 'review';
  const ctx = handoffContext(purpose);
  if (['read', 'compare', 'direction'].includes(purpose) && S.projectId) {
    const ids = purpose === 'read' ? [ctx.focusId].filter(Boolean) : (S.selPapers.length ? S.selPapers : S.papers.map((/** @type {any} */ p) => p.id)).slice(0, 40);
    for (const id of ids) if (S.fulltext[id]?.status === 'extracted') ctx.pagesById[id] = (await loadFulltext(S.projectId, id)) || [];
  }
  const pack = buildHandoff(purpose, ctx);
  S.chatgptPrompt = pack.prompt;
  S.chatgptPack = { basisVersion: pack.basisVersion, includedIds: pack.includedIds, omitted: pack.omitted, note: pack.note, schema: pack.schema };
  S.chatgptPending = null;
  try {
    await navigator.clipboard.writeText(pack.prompt);
    S.chatgptMsg = `ChatGPT에 붙일 내용을 복사했어요. ${pack.note} ${pack.includedIds.length}편${pack.omitted ? `, 빠짐 ${pack.omitted}편` : ''}. 글자 수 ${pack.prompt.length}. 이 사이트는 전송하지 않았어요.`;
  } catch { S.chatgptMsg = '복사에 실패했어요. 미리보기에서 직접 복사해 ChatGPT에 붙여 넣으세요.'; }
  touch();
}

function applyGpt() {
  const pending = S.chatgptPending;
  if (!pending?.ok || pending.stale || !pending.payload) { S.chatgptMsg = '적용할 수 있는 확인된 답변이 없어요.'; render(); return; }
  const now = new Date().toISOString();
  if (pending.purpose === 'review') {
    const prev = S.papers.map((/** @type {any} */ p) => ({ ...p, externalReview: p.externalReview ? { ...p.externalReview } : undefined }));
    const order = { direct: 0, adjacent: 1, unclear: 2 };
    const byId = new Map(pending.payload.accepted.map((/** @type {any} */ r) => [r.id, r]));
    S.papers = S.papers.map((/** @type {any} */ p) => byId.has(p.id) ? { ...p, externalReview: { ...byId.get(p.id), label: pending.payload.label, model: pending.payload.model || null, at: now, criterionVersion: S.chatgptPack?.basisVersion || null } } : p);
    S.papers.sort((a, b) => (order[a.externalReview?.judgment] ?? 9) - (order[b.externalReview?.judgment] ?? 9) || String(a.id).localeCompare(String(b.id)));
    S.chatgptUndo = { kind: 'review', papers: prev };
    S.chatgptMsg = 'ChatGPT 평가를 보기 순서에 반영했어요. 규칙 점수와는 별개이고, 정확성은 확인하지 않았어요.';
  } else if (pending.purpose === 'direction') {
    S.chatgptUndo = { kind: 'direction', prev: S.aiDirections };
    S.aiDirections = pending.payload.directions;
    S.chatgptMsg = `연구 방향 ${S.aiDirections.length}개를 저장했어요. 예시 방향 카드는 만들지 않았어요.`;
  } else if (pending.purpose === 'compare') {
    S.chatgptUndo = { kind: 'compare', prev: S.aiCompare };
    S.aiCompare = { rows: pending.payload.rows, model: pending.payload.model, at: now, source: 'external' };
    S.chatgptMsg = '비교 초안을 저장했어요. 비교표의 확인된 값은 바꾸지 않았어요.';
  } else if (pending.purpose === 'read' || pending.purpose === 'meeting') {
    S.chatgptUndo = { kind: 'memo', prev: S.aiMemos };
    S.aiMemos = [...S.aiMemos, { purpose: pending.purpose, text: pending.payload.text, at: now, paperIds: [...(S.chatgptPack?.includedIds || [])] }].slice(-20);
    S.chatgptMsg = 'ChatGPT 답변을 메모로 저장했어요. 사실 여부는 확인하지 않았어요.';
  } else if (pending.purpose === 'repair') {
    S.chatgptUndo = { kind: 'brief', prev: S.researchBrief, plan: S.chatgptPlan };
    S.chatgptPlan = { at: now, purpose: 'repair', queries: pending.payload.queries, source: 'external' };
    S.researchBrief = { ...(S.researchBrief || {}), queries: pending.payload.queries, searchCriteria: pending.payload.criteria || S.researchBrief?.searchCriteria, rankVersion: S.researchBrief?.rankVersion || 'rule-v1' };
    S.chatgptMsg = '검색 문구를 조사 기록에 넣었어요. 논문 목록은 그대로이고 검색은 실행하지 않았어요.';
  } else if (pending.purpose === 'feedback') {
    S.chatgptUndo = { kind: 'feedback', plan: S.chatgptPlan, staleAt: S.reviewStaleAt, versionCount: S.versions.length, brief: S.researchBrief };
    S.chatgptPlan = { at: now, purpose: 'feedback', queries: pending.payload.queries, changes: pending.payload.changes, keep: pending.payload.keep, source: 'external' };
    S.reviewStaleAt = now;
    S.versions.push({ at: now, label: 'ChatGPT 피드백 기록(검색·평가 자동 갱신 없음)', scope: scopeText(S) });
    S.chatgptMsg = '피드백을 기록했어요. 선택·메모는 유지했고, 이전 ChatGPT 평가는 재확인이 필요해요. 검색은 실행하지 않았어요.';
  }
  S.chatgptPending = null;
  touch();
}

function undoGpt() {
  const u = S.chatgptUndo;
  if (!u) return;
  if (u.kind === 'review') S.papers = u.papers;
  if (u.kind === 'direction') S.aiDirections = u.prev;
  if (u.kind === 'compare') S.aiCompare = u.prev;
  if (u.kind === 'memo') S.aiMemos = u.prev;
  if (u.kind === 'brief') { S.researchBrief = u.prev; S.chatgptPlan = u.plan; }
  if (u.kind === 'feedback') { S.chatgptPlan = u.plan; S.reviewStaleAt = u.staleAt; S.versions = S.versions.slice(0, u.versionCount); S.researchBrief = u.brief; }
  S.chatgptUndo = null;
  S.chatgptMsg = '마지막 적용을 되돌렸어요.';
  touch();
}

export function initResearch() {
  document.addEventListener('click', async (e) => {
    const t = /** @type {any} */ (e.target)?.closest?.('[data-ract]');
    if (!t || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
    const id = t.dataset.id;
    switch (t.dataset.ract) {
      case 'select-visible': S.selPapers = [...new Set([...S.selPapers, ...visibleIds()])]; touch(); break;
      case 'select-none': S.selPapers = []; S.selectMsg = ''; touch(); break;
      case 'select-top': {
        const byId = new Map(S.papers.map((/** @type {any} */ p) => [p.id, p]));
        const pool = visibleIds().map((/** @type {string} */ x) => byId.get(x)).filter((/** @type {any} */ p) => p && !p.relevance?.excluded);
        pool.sort((/** @type {any} */ a, /** @type {any} */ b) => (b.relevance?.score ?? 0) - (a.relevance?.score ?? 0) || String(a.id).localeCompare(String(b.id)));
        const top = pool.slice(0, 30);
        S.selPapers = top.map((/** @type {any} */ p) => p.id);
        const withAbs = top.filter((/** @type {any} */ p) => p.abstract).length;
        S.selectMsg = `보이는 ${pool.length}편 중 규칙 점수가 높은 ${top.length}편을 골랐어요(제목·초록의 핵심·포함 단어 일치, 여러 검색 문구에서 발견된 수 기준. 의미 판단이 아니에요). 초록이 있는 논문 ${withAbs}편. 아래 목록에서 빼거나 더할 수 있어요.`;
        touch(); break; }
      case 'refine-search': readRefineInputs(); await refineSearch(); break;
      case 'refine-clear': S.refine.include = []; S.refine.exclude = []; S.refine.released = []; S.refineMsg = '조건을 지웠어요. 모든 논문이 다시 보여요.'; touch(); break;
      case 'refine-release': S.refine.released = [...new Set([...S.refine.released, id])]; touch(); break;
      case 'refine-reapply': { const r = S.refine.rounds.find((/** @type {any} */ x) => x.id === id); if (r) { S.refine.include = [...r.include]; S.refine.exclude = [...r.exclude]; S.refine.released = []; S.refineMsg = '이전 조건을 다시 적용했어요.'; touch(); } break; }
      case 'kw-include': case 'kw-exclude': {
        readRefineInputs();
        const key = t.dataset.ract === 'kw-include' ? 'include' : 'exclude';
        if (!S.refine[key].includes(t.dataset.term)) S.refine[key].push(t.dataset.term);
        render(); break; }
      case 'ft-fetch': { const p = paperById(id); if (p) await fetchMany([p]); break; }
      case 'ft-scihub': { const p = paperById(id); if (p) await fetchScihub(p); break; }
      case 'ft-download': await downloadStoredPdf(id); break;
      case 'ft-fetch-all': await fetchMany(S.selPapers.map((/** @type {string} */ x) => paperById(x)).filter(Boolean)); break;
      case 'summary-make': await buildPrompt(S.selPapers, ''); break;
      case 'summary-copy': try { await navigator.clipboard.writeText(S.summaryPrompt); S.summaryMsg = '복사했어요.'; } catch { S.summaryMsg = '복사에 실패했어요. 미리보기에서 직접 복사하세요.'; } render(); break;
      case 'summary-load': { const v = S.summaries.find((/** @type {any} */ x) => x.id === id); if (v) { S.summaryDraft = v.md; S.summaryDraftIds = v.paperIds; render(); } break; }
      case 'summary-dl': { const v = id === '__draft' ? { md: S.summaryDraft } : S.summaries.find((/** @type {any} */ x) => x.id === id); if (v) download('research-summary.md', v.md); break; }
      case 'summary-save-draft': if (S.summaryDraft.trim()) { addVersion(S.summaryDraft, S.summaryDraftIds.length ? S.summaryDraftIds : S.selPapers, 'user'); S.summaryMsg = '새 버전으로 저장했어요.'; touch(); } break;
      case 'summary-develop': {
        const v = S.summaries.find((/** @type {any} */ x) => x.id === id); if (!v) break;
        const keep = v.paperIds.filter((/** @type {string} */ x) => paperById(x));
        const extra = S.selPapers.filter((/** @type {string} */ x) => !keep.includes(x));
        await buildPrompt([...keep, ...extra], v.md);
        break; }
      case 'gpt-build': await buildGpt(); break;
      case 'gpt-copy': try { await navigator.clipboard.writeText(S.chatgptPrompt); S.chatgptMsg = '복사했어요. ChatGPT 대화에 붙여 넣으세요.'; } catch { S.chatgptMsg = '복사에 실패했어요. 미리보기에서 직접 복사하세요.'; } render(); break;
      case 'gpt-dl': if (S.chatgptPrompt) download('chatgpt-prompt.md', S.chatgptPrompt); break;
      case 'gpt-apply': applyGpt(); break;
      case 'gpt-undo': undoGpt(); break;
      case 'gpt-copy-queries': {
        const text = (S.chatgptPlan?.queries || []).map((/** @type {any} */ q) => q.text).join('\n');
        try { await navigator.clipboard.writeText(text); S.chatgptMsg = '검색 문구를 복사했어요. 검색은 실행하지 않았어요.'; } catch { S.chatgptMsg = text; }
        render(); break; }
    }
  });

  document.addEventListener('submit', async (e) => {
    const f = /** @type {any} */ (e.target)?.closest?.('form[data-rform]'); if (!f) return;
    e.preventDefault();
    if (f.dataset.rform === 'refine') applyFilterRound();
    if (f.dataset.rform === 'summary-import') {
      let md = String(f.querySelector('[name=md]')?.value || '');
      const file = f.querySelector('[name=file]')?.files?.[0];
      if (file) md = await file.text();
      if (!md.trim()) { S.summaryMsg = '가져올 .md 내용이 없어요.'; render(); return; }
      const ids = S.summaryCtx?.paperIds?.length ? S.summaryCtx.paperIds : S.selPapers;
      addVersion(md, [...ids], 'external');
      const c = S.summaries[S.summaries.length - 1].checks;
      S.summaryMsg = `가져왔어요(ChatGPT 초안 · 정확성 미검증). 출처 표시 ${c.refCount}곳, 표 ${c.tables}개, 그림 ${c.mermaid}개.${c.invalidRefs.length ? ` 없는 논문 번호: ${c.invalidRefs.join(', ')}.` : ''}${c.unsourcedParagraphs ? ` 출처 표시가 없는 문단이 약 ${c.unsourcedParagraphs}개 있어요(추정).` : ''}`;
      touch();
    }
    if (f.dataset.rform === 'gpt-import') {
      const purpose = S.chatgptPurpose || 'review';
      const ctx = handoffContext(purpose);
      S.chatgptPending = parseHandoff(purpose, String(f.querySelector('[name=answer]')?.value || ''), ctx, S.chatgptPack?.basisVersion || '');
      const picked = pickPapers(S.papers, ctx.selectedIds, ctx.focusId);
      const current = basisVersion(ctx.rankVersion, picked.rows);
      if (S.chatgptPack?.basisVersion && current !== S.chatgptPack.basisVersion) {
        S.chatgptPending.stale = true;
        S.chatgptPending.payload = null;
        S.chatgptPending.message = '논문을 고른 뒤라 자료 기준이 달라졌어요. 프롬프트를 다시 만들어 ChatGPT에 붙여 넣으세요.';
      }
      S.chatgptMsg = S.chatgptPending.message || '';
      render();
    }
  });

  document.addEventListener('change', async (e) => {
    const t = /** @type {any} */ (e.target);
    const a = t?.dataset?.ract; if (!a) return;
    if (a === 'ft-upload') { const files = [...(t.files || [])]; t.value = ''; if (files.length) await uploadFiles(files, t.dataset.id); }
    else if (a === 'proxy-set') {
      const v = String(t.value || '').trim();
      try { if (!v) localStorage.removeItem('rl.proxy'); else if (v.startsWith('https://')) localStorage.setItem('rl.proxy', v); else { S.fulltextMsg = '프록시 주소는 https://로 시작해야 해요.'; } } catch { /* 저장 불가 */ }
      render();
    }
    else if (a === 'summary-request') S.summaryRequest = t.value;
    else if (a === 'summary-prompt-edit') S.summaryPrompt = t.value;
    else if (a === 'summary-draft') S.summaryDraft = t.value;
    else if (a === 'gpt-purpose') { S.chatgptPurpose = t.value; S.chatgptPending = null; S.chatgptMsg = '목적을 바꿨어요. 프롬프트를 다시 만든 뒤 ChatGPT에 붙여 넣으세요.'; render(); }
    else if (a === 'gpt-focus') S.chatgptFocusId = t.value;
    else if (a === 'gpt-note') S.chatgptNote = t.value;
    else if (a === 'gpt-prompt') S.chatgptPrompt = t.value;
  });
  void $;
}
