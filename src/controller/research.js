// 세부 검색·선택·공개 원문·총정리 동작. 사이트는 AI를 호출하지 않는다.
import { S, paperById, scopeText } from '../state/store.js';
import { $, render, isWorkspaceLayout } from './render.js';
import { scheduleSave } from './persist.js';
import { refineSearch } from './session.js';
import { applyRefine, splitTerms, yearOrNull } from '../research/refine.js';
import { autoSelectListed, listedItems, workspaceVisibleItems } from '../research/list.js';
import { runBulk } from '../research/bulk.js';
import { ruleRank, RANK_VERSION } from '../research/rank.js';
import { suggestKeywords } from '../research/keywords.js';
import { summaryPrompt, checkSummaryMd, SUMMARY_PROMPT_VERSION, SHORTLIST_PROMPT_VERSION, parseShortlist } from '../research/summary.js';
import { buildHandoff, parseHandoff, pickPapers, basisVersion } from '../research/handoff.js';
import { candidateUrls, ftLabel, openAlexPdfPath } from '../views/research.js';
import { saveFulltext, loadFulltext, loadFulltextPdf } from '../repository/idb.js';
import { savePdfToFolder } from './folder.js';
import { knowledgeEntries, knowledgeDocument, parseKnowledge, mergeKnowledge, KNOWLEDGE_MAX_BYTES, CONVERSATION_HANDOFF_PROMPT } from '../research/knowledge.js';

const touch = () => { scheduleSave(); render(); };

function shownIds() {
  const items = isWorkspaceLayout() ? workspaceVisibleItems(S) : listedItems(S);
  return items.map((/** @type {any} */ it) => it.paper.id);
}

/** 입력칸에 적은 값을 먼저 상태에 반영(다시 그리면 사라지지 않게). */
function readRefineInputs() {
  const f = document.querySelector('[data-rform="refine"]');
  if (!f) return;
  S.refine.include = splitTerms(/** @type {any} */ (f.querySelector('[name=include]'))?.value);
  S.refine.exclude = splitTerms(/** @type {any} */ (f.querySelector('[name=exclude]'))?.value);
  S.refine.yearFrom = yearOrNull(/** @type {any} */ (f.querySelector('[name=yearFrom]'))?.value);
  S.refine.yearTo = yearOrNull(/** @type {any} */ (f.querySelector('[name=yearTo]'))?.value);
  S.refine.requireAbstract = !!/** @type {any} */ (f.querySelector('[name=requireAbstract]'))?.checked;
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
  S.refine.rounds.push({ id: `r${S.refine.rounds.length + 1}`, at: new Date().toISOString(), mode: 'filter', include: [...S.refine.include], exclude: [...S.refine.exclude], yearFrom: S.refine.yearFrom, yearTo: S.refine.yearTo, requireAbstract: S.refine.requireAbstract, queries: [], added: 0, matched });
  if (!isWorkspaceLayout()) {
    autoSelectListed(S);
    S.refineMsg = `조건에 맞는 논문 ${matched}편 중 ${S.selPapers.length}편을 골랐어요.`;
  } else {
    S.refineMsg = `조건에 맞는 논문 ${matched}편을 표시해요. 기존 선택 ${S.selPapers.length}편은 그대로 유지했어요.`;
  }
  touch();
}

// ---- 원문 ----
const doiKey = (/** @type {any} */ d) => String(d || '').toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '');

export async function applyStoredPdf(/** @type {any} */ paper, /** @type {any} */ r) {
  await storeResult(paper, r);
  if (paper?.id && !S.selPapers.includes(paper.id)) S.selPapers = [...S.selPapers, paper.id];
  touch();
}

function downloadPdfBlob(/** @type {Blob} */ pdf, /** @type {any} */ paper) {
  const url = URL.createObjectURL(pdf), a = document.createElement('a');
  a.href = url; a.download = `paper-${String(paper?.doi || paper?.id || 'paper').replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function storeResult(/** @type {any} */ paper, /** @type {any} */ r, downloadPdf = false, /** @type {Blob|null} */ pdfBlob = null) {
  const old = S.fulltext[paper.id];
  if (!['extracted', 'scan_only'].includes(r.status) && ['extracted', 'scan_only'].includes(old?.status)) {
    S.fulltext[paper.id] = { ...old, lastError: r.status }; return;
  }
  if (downloadPdf && (pdfBlob || r.pdfBase64) && ['extracted', 'scan_only'].includes(r.status)) {
    const pdf = pdfBlob || new Blob([Uint8Array.from(atob(r.pdfBase64), c => c.charCodeAt(0))], { type: 'application/pdf' });
    try { if (!(await savePdfToFolder(pdf, paper))) downloadPdfBlob(pdf, paper); }
    catch { downloadPdfBlob(pdf, paper); S.fulltextMsg = '선택한 폴더에 저장하지 못해 브라우저 다운로드를 요청했습니다.'; }
  }
  // 예전에 보관한 PDF는 덮어쓰지 않으며 새 PDF는 브라우저 DB에 넣지 않는다.
  const legacyPdf = S.projectId ? await loadFulltextPdf(S.projectId, paper.id) : null;
  const entry = { status: r.status, pageCount: r.pageCount || 0, source: r.source || '', license: r.license || null, sha256: r.sha256 || null, extractor: r.extractor || null, truncatedPages: !!r.truncatedPages, at: new Date().toISOString(), pdfAvailable: !!legacyPdf, pdfBytes: r.pdfBytes || 0, sourceUrl: r.sourceUrl || null, requestedDoi: r.requestedDoi || null, doiVerified: r.doiVerified ?? null, localFile: typeof r.localFile === 'string' ? r.localFile : null };
  if ((r.status === 'extracted' || r.status === 'scan_only') && r.pages?.length && S.projectId) {
    try { await saveFulltext(S.projectId, paper.id, r.pages, legacyPdf); }
    catch (e) {
      if (/** @type {any} */ (e)?.code === 'quota') { S.fulltext[paper.id] = { ...entry, status: 'quota', pdfAvailable: false, lastError: 'quota' }; return; }
      throw e;
    }
  } else if (r.status === 'extracted' && !S.projectId) entry.status = 'failed';
  S.fulltext[paper.id] = entry;
}

function downloadFields() {
  return { projectId: S.projectId, saveLocal: false };
}

async function requestOpen(/** @type {any} */ paper, /** @type {AbortSignal} */ signal) {
  const projectId = S.projectId;
  const openAlexPath = candidateUrls(paper).map(openAlexPdfPath).find(Boolean);
  if (openAlexPath) {
    try {
      const res = await fetch(openAlexPath, { signal });
      if (signal.aborted || S.projectId !== projectId) return 'aborted';
      if (res.ok && (res.headers.get('content-type') || '').toLowerCase().includes('application/pdf')) {
        const announced = Number(res.headers.get('content-length') || 0);
        if (announced > 20 * 1024 * 1024) { await storeResult(paper, { status: 'too_large' }); return 'too_large'; }
        const pdf = await res.blob();
        if (signal.aborted || S.projectId !== projectId) return 'aborted';
        if (pdf.size > 20 * 1024 * 1024) { await storeResult(paper, { status: 'too_large' }); return 'too_large'; }
        const pdfModuleUrl = new URL('../vendor/pdf.min.mjs', import.meta.url).href;
        const pdfjs = await import(pdfModuleUrl);
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
        const task = pdfjs.getDocument({ data: new Uint8Array(await pdf.arrayBuffer()), isEvalSupported: false });
        const pages = [];
        let pageCount = 0;
        try {
          const doc = await task.promise;
          pageCount = doc.numPages;
          for (let n = 1; n <= Math.min(pageCount, 100); n++) {
            if (signal.aborted || S.projectId !== projectId) return 'aborted';
            const page = await doc.getPage(n), content = await page.getTextContent();
            pages.push({ page: n, text: content.items.map((/** @type {any} */ x) => x.str || '').join(' ').replace(/\s+/g, ' ').trim() });
            page.cleanup();
          }
        } finally { await task.destroy(); }
        if (signal.aborted || S.projectId !== projectId) return 'aborted';
        const status = pages.reduce((n, p) => n + p.text.length, 0) < 20 ? 'scan_only' : 'extracted';
        await storeResult(paper, { status, pages, pageCount, truncatedPages: pageCount > 100, source: 'OpenAlex', extractor: 'pdfjs-dist', pdfBytes: pdf.size }, true, pdf);
        return S.fulltext[paper.id]?.status || status;
      }
    } catch (e) {
      if (signal.aborted || S.projectId !== projectId || /** @type {any} */ (e)?.name === 'AbortError') return 'aborted';
    }
  }
  const res = await fetch('/api/fulltext/fetch', { method: 'POST', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ doi: paper.doi || '', urls: candidateUrls(paper), license: paper.fulltext?.license || null, ...downloadFields() }) });
  if (signal.aborted || S.projectId !== projectId) return 'aborted';
  const body = await res.json().catch(() => ({}));
  await storeResult(paper, res.ok ? body : { status: 'failed' }, true);
  return S.fulltext[paper.id]?.status || 'failed';
}

async function requestScihub(/** @type {any} */ paper, /** @type {AbortSignal} */ signal) {
  const projectId = S.projectId;
  const res = await fetch('/api/fulltext/scihub', { method: 'POST', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ doi: paper.doi, ...downloadFields() }) });
  if (signal.aborted || S.projectId !== projectId) return 'aborted';
  const r = await res.json().catch(() => ({ status: 'failed' }));
  const status = r.status || 'failed';
  await storeResult(paper, { ...r, status }, true);
  return S.fulltext[paper.id]?.status || status;
}

/** @type {AbortController|null} */
let bulkCtrl = null;

function tally(/** @type {any[]} */ papers) {
  let ok = 0, fail = 0;
  for (const p of papers) {
    const st = S.fulltext[p.id]?.status;
    if (st === 'extracted' || st === 'scan_only') ok++;
    else if (st) fail++;
  }
  return { ok, fail };
}

export async function bulkToggle() {
  if (S.fulltextBusy) { bulkCtrl?.abort(); return; }
  const papers = S.selPapers.map((/** @type {string} */ id) => paperById(id)).filter(Boolean);
  if (!papers.length) return;
  const projectId = S.projectId;
  const ctrl = new AbortController();
  bulkCtrl = ctrl;
  S.fulltextBusy = true;
  S.fulltextProgress = { done: 0, total: papers.length, ok: 0, fail: 0 };
  S.fulltextMsg = '';
  render();
  try {
    const result = await runBulk({
      papers,
      hasText: () => false,
      signal: ctrl.signal,
      fetchOpen: requestOpen,
      fetchScihub: (/** @type {any} */ p, /** @type {AbortSignal} */ signal) => p.doi ? requestScihub(p, signal) : Promise.resolve('invalid_doi'),
      mark: async (/** @type {any} */ p, /** @type {string} */ status) => { if (S.projectId === projectId) await storeResult(p, { status }); },
      onProgress: (/** @type {any} */ s) => {
        if (S.projectId !== projectId) return;
        const n = tally(papers);
        S.fulltextActive = s.active;
        S.fulltextProgress = { done: s.done, total: s.total, ok: n.ok, fail: n.fail };
        render();
      },
    });
    if (S.projectId !== projectId) return;
    const n = tally(papers);
    S.fulltextProgress = { ...(S.fulltextProgress || {}), done: result.cancelled ? (S.fulltextProgress?.done || 0) : papers.length, total: papers.length, ok: n.ok, fail: n.fail };
    S.fulltextMsg = result.cancelled ? '받기를 취소했어요. 그때까지 받은 원문은 유지했어요.'
      : result.challenge ? `확보 ${n.ok}편. Sci-Hub 로봇 확인이 필요해 나머지는 멈추고 표시만 했어요.`
      : `원문 확인 ${n.ok}편 · 실패 ${n.fail}편. 다운로드 목록에서 저장 여부를 확인하세요.`;
  } catch {
    if (S.projectId === projectId) S.fulltextMsg = '받기를 마치지 못했어요. 이미 받은 원문은 유지했어요.';
  } finally {
    if (S.projectId === projectId) { S.fulltextBusy = false; S.fulltextActive = []; touch(); }
    if (bulkCtrl === ctrl) bulkCtrl = null;
  }
}

async function fetchScihub(paper) {
  if (S.fulltextBusy) return;
  const projectId = S.projectId;
  S.fulltextBusy = true; S.fulltextActive = [paper.id];
  S.fulltextMsg = 'Sci-Hub에서 선택한 논문 1편을 확인하고 있어요.'; render();
  try {
    const res = await fetch('/api/fulltext/scihub', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ doi: paper.doi, ...downloadFields() }) });
    const r = await res.json();
    if (S.projectId !== projectId) return;
    const status = r.status || 'failed';
    await storeResult(paper, { ...r, status }, true);
    S.fulltextMsg = status === 'extracted' ? `Sci-Hub 원문 ${r.pageCount}쪽을 추출하고 PDF 다운로드를 요청했어요. 다운로드 목록을 확인하세요.${r.doiVerified ? ' 본문 DOI 일치 확인.' : ' 본문 DOI는 직접 확인해 주세요.'}`
      : status === 'scan_only' ? 'PDF 다운로드를 요청했지만 추출할 텍스트가 없어요. 다운로드 목록을 확인하세요. OCR은 지원하지 않아요.'
      : `Sci-Hub: ${ftLabel(status)}. 기존에 확보한 자료는 유지했어요.`;
  } catch {
    if (S.projectId === projectId) S.fulltextMsg = '다운로드 또는 브라우저 저장에 실패했어요. 기존 자료는 유지했어요.';
  } finally { if (S.projectId === projectId) { S.fulltextBusy = false; S.fulltextActive = []; touch(); } }
}

async function downloadStoredPdf(id) {
  try {
    const blob = await loadFulltextPdf(S.projectId, id);
    if (!blob) { S.fulltextMsg = '보관 PDF가 없어요. 원문을 다시 받아 주세요.'; render(); return; }
    downloadPdfBlob(blob, paperById(id));
  } catch { S.fulltextMsg = '보관 PDF를 읽지 못했어요.'; render(); }
}

async function fetchMany(/** @type {any[]} */ papers) {
  if (!papers.length || S.fulltextBusy) return;
  const ctrl = new AbortController();
  bulkCtrl = ctrl;
  S.fulltextBusy = true;
  const counts = { ok: 0, none: 0, fail: 0 };
  let done = 0;
  const active = new Set();
  const report = () => {
    S.fulltextActive = [...active].map((/** @type {any} */ p) => p.id);
    S.fulltextProgress = { done, total: papers.length, ok: counts.ok, fail: counts.fail + counts.none };
    render();
  };
  const queue = [...papers];
  const worker = async () => {
    for (let p = queue.shift(); p && !ctrl.signal.aborted; p = queue.shift()) {
      active.add(p); report();
      let st = 'failed';
      try { st = await requestOpen(p, ctrl.signal); }
      catch (e) { if (ctrl.signal.aborted || /** @type {any} */ (e)?.name === 'AbortError') { active.delete(p); return; } await storeResult(p, { status: 'failed' }); }
      active.delete(p); done++;
      if (st === 'extracted' || st === 'scan_only') counts.ok++; else if (st === 'no_candidate' || st === 'not_pdf') counts.none++; else counts.fail++;
      report();
    }
  };
  await Promise.all([worker(), worker()]);
  S.fulltextBusy = false; S.fulltextActive = [];
  S.fulltextMsg = ctrl.signal.aborted ? '받기를 취소했어요. 그때까지 받은 원문은 유지했어요.' : `원문 확인 ${counts.ok} / 공개본 없음 ${counts.none} / 실패·기타 ${counts.fail}. 다운로드 목록에서 저장 여부를 확인하세요.`;
  if (bulkCtrl === ctrl) bulkCtrl = null;
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
export async function buildPrompt(/** @type {string[]} */ ids, /** @type {string} */ previousMd, abstractsOnly = false, /** @type {string|undefined} */ modeOverride = undefined) {
  const projectId = S.projectId;
  const papers = ids.map(id => paperById(id)).filter(Boolean);
  const pagesById = /** @type {Record<string, any[]>} */ ({});
  const mode = modeOverride || S.summaryMode;
  for (const p of papers) if (!abstractsOnly && mode === 'text' && S.fulltext[p.id]?.status === 'extracted' && S.projectId) pagesById[p.id] = (await loadFulltext(S.projectId, p.id)) || [];
  if (S.projectId !== projectId) return;
  const knowledge = knowledgeEntries(S);
  const keywords = suggestKeywords(S.papers, { known: [], limit: 10 }).map(k => k.term);
  S.summaryPrompt = summaryPrompt({ mode: abstractsOnly ? 'abstracts' : mode, topic: S.input, papers, fulltext: abstractsOnly ? {} : S.fulltext, pagesById, keywords, request: S.summaryRequest, previousMd, knowledgeCount: knowledge.length });
  S.summaryCtx = { paperIds: papers.map(p => p.id), promptVersion: abstractsOnly ? SHORTLIST_PROMPT_VERSION : SUMMARY_PROMPT_VERSION, at: new Date().toISOString() };
  try { await navigator.clipboard.writeText(S.summaryPrompt); S.summaryMsg = `프롬프트를 복사했어요(논문 ${papers.length}편). 이어서 탐색할 때는 이전에 쓰던 AI 대화에 붙여 넣으세요. ${abstractsOnly ? '제목·초록으로 선별합니다. PDF 첨부는 필요 없습니다.' : mode === 'text' ? '초록과 확보된 본문 발췌를 포함했어요.' : '선택한 PDF를 직접 첨부한 뒤 ‘정리 시작’이라고 입력하세요.'}${previousMd && mode !== 'text' ? ' 이전 정리본도 .md 저장 후 첨부하세요.' : ''}`; }
  catch { S.pPromptPreviewOpen = true; S.summaryMsg = '자동 복사에 실패했어요. 아래 미리보기에서 직접 복사하세요.'; }
  touch();
}

function download(/** @type {string} */ name, /** @type {string} */ text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

function addVersion(/** @type {string} */ md, /** @type {string[]} */ ids, /** @type {'external'|'user'} */ source) {
  const paperRefs = ids.map(id => { const p = paperById(id); return { id, title: p?.title || '제목 확인 필요', doi: p?.doi || '' }; });
  S.summaries.push({ id: `s${S.summaries.length + 1}-${Date.now().toString(36)}`, at: new Date().toISOString(), md, paperIds: ids, paperRefs, promptVersion: SUMMARY_PROMPT_VERSION, source, checks: checkSummaryMd(md, ids.length) });
  S.summaryDraft = md; S.summaryDraftIds = ids;
  S.summaryDraftPromptVersion = SUMMARY_PROMPT_VERSION;
}

async function runGeminiShortlist() {
  if (S.shortlistBusy) return;
  const projectId = S.projectId;
  const ids = [...S.selPapers];
  const papers = ids.map(id => paperById(id));
  if (!ids.length || ids.length > 30 || papers.some(p => !p)) { S.summaryMsg = '추천할 논문을 1~30편 선택해 주세요.'; render(); return; }
  const input = { topic: S.input || '', focus: S.summaryRequest || '', papers: papers.map(p => ({ title: p.title || '', abstract: p.abstract || '' })) };
  const snapshot = JSON.stringify(input);
  S.shortlistBusy = true; S.summaryMsg = 'Gemini가 제목과 초록으로 논문을 고르고 있어요.'; render();
  try {
    const response = await fetch('/api/research/gemini-shortlist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || 'Gemini 추천에 실패했어요.');
    if (S.projectId !== projectId || JSON.stringify(S.selPapers) !== JSON.stringify(ids) || JSON.stringify({ topic: S.input || '', focus: S.summaryRequest || '', papers: ids.map(id => { const p = paperById(id); return { title: p?.title || '', abstract: p?.abstract || '' }; }) }) !== snapshot) throw new Error('추천을 기다리는 동안 조사 또는 선택한 논문이 바뀌었어요. 다시 추천해 주세요.');
    if (!Array.isArray(data.recommendations) || !data.recommendations.length) throw new Error('제공된 초록에서 추천할 논문을 찾지 못했어요. 선택을 바꾸거나 직접 확인해 주세요.');
    const safeLine = (/** @type {any} */ v) => String(v || '').replace(/\s+/g, ' ').replace(/\[P\d+\]/gi, '').trim();
    const rows = data.recommendations.map((/** @type {any} */ row, /** @type {number} */ i) => `${i + 1}. [P${row.number}] ${safeLine(papers[row.number - 1]?.title)}\n추천 이유: ${safeLine(row.reason)}`);
    const md = `${safeLine(data.overview)}\n\n${rows.join('\n\n')}\n\n초록 기준 잠정 추천이며 원문 확인이 필요합니다.\n\n선택 논문: ${data.recommendations.map((/** @type {any} */ row) => `[P${row.number}]`).join(', ')}`;
    const picked = parseShortlist(md, ids, S.papers.map(p => p.id));
    if (!picked.ok || picked.ids.length !== data.recommendations.length || data.recommendations.some((/** @type {any} */ row) => !Number.isInteger(row.number) || !papers[row.number - 1]?.abstract)) throw new Error('추천 결과를 확인하지 못했어요. 기존 선택은 유지됩니다.');
    addVersion(md, ids, 'external');
    const latest = S.summaries[S.summaries.length - 1];
    latest.promptVersion = SHORTLIST_PROMPT_VERSION; latest.provider = 'gemini-api';
    S.summaryDraftPromptVersion = SHORTLIST_PROMPT_VERSION;
    S.summaryCtx = { paperIds: ids, promptVersion: SHORTLIST_PROMPT_VERSION, at: new Date().toISOString() };
    S.selPapers = [...picked.ids]; S.pShowSelectedOnly = true; S.pListScrollTop = 0;
    S.pView = 'main'; S.pTask = 'cluster'; S.pMobilePane = 'work'; S.pSummaryViewMode = 'read';
    S.summaryMsg = `추천 논문 ${picked.ids.length}편을 선택했어요. 아래에서 원문을 확보하세요.`;
    touch();
    const { scrollWorkTo } = await import('./workspace.js');
    scrollWorkTo('#bulk-h', '#bulk-h');
  } catch (error) {
    if (S.projectId === projectId) { S.summaryMsg = `${/** @type {Error} */ (error).message || 'Gemini 추천에 실패했어요.'} 기존 선택은 유지됩니다.`; render(); }
  } finally { if (S.projectId === projectId) { S.shortlistBusy = false; render(); } }
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
    S.chatgptMsg = 'ChatGPT 평가를 보기 순서에 반영했어요.';
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
    S.chatgptMsg = 'ChatGPT 답변을 메모로 저장했어요.';
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
      case 'select-toggle': {
        const ids = shownIds();
        const all = ids.length > 0 && ids.every((/** @type {string} */ x) => S.selPapers.includes(x));
        S.selPapers = all ? S.selPapers.filter((/** @type {string} */ x) => !ids.includes(x)) : [...new Set([...S.selPapers, ...ids])];
        S.selectMsg = '';
        touch(); break; }
      case 'refine-search': readRefineInputs(); await refineSearch(); break;
      case 'refine-clear':
        for (const key of Object.keys(S.pFormDrafts || {})) if (key.startsWith('form[data-rform="refine"]:')) delete S.pFormDrafts[key];
        S.refine.include = []; S.refine.exclude = []; S.refine.released = []; S.refine.yearFrom = null; S.refine.yearTo = null; S.refine.requireAbstract = false;
        if (!isWorkspaceLayout()) autoSelectListed(S);
        S.refineMsg = isWorkspaceLayout() ? `조건을 지웠어요. 기존 선택 ${S.selPapers.length}편은 그대로 유지했어요.` : '조건을 지웠어요.';
        touch(); break;
      case 'refine-release': S.refine.released = [...new Set([...S.refine.released, id])]; touch(); break;
      case 'refine-reapply': {
        const r = S.refine.rounds.find((/** @type {any} */ x) => x.id === id);
        if (r) {
          for (const key of Object.keys(S.pFormDrafts || {})) if (key.startsWith('form[data-rform="refine"]:')) delete S.pFormDrafts[key];
          S.refine.include = [...r.include]; S.refine.exclude = [...r.exclude]; S.refine.yearFrom = r.yearFrom ?? null; S.refine.yearTo = r.yearTo ?? null; S.refine.requireAbstract = !!r.requireAbstract; S.refine.released = [];
          if (!isWorkspaceLayout()) autoSelectListed(S);
          S.refineMsg = isWorkspaceLayout() ? `이전 조건을 다시 적용했어요. 기존 선택 ${S.selPapers.length}편은 유지했어요.` : '이전 조건을 다시 적용했어요.';
          if (isWorkspaceLayout()) S.pView = 'main';
          touch();
        }
        break; }
      case 'kw-include': case 'kw-exclude': {
        readRefineInputs();
        const key = t.dataset.ract === 'kw-include' ? 'include' : 'exclude';
        if (!S.refine[key].includes(t.dataset.term)) S.refine[key].push(t.dataset.term);
        render(); break; }
      case 'ft-fetch': { const p = paperById(id); if (p) await fetchMany([p]); break; }
      case 'ft-scihub': { const p = paperById(id); if (p) await fetchScihub(p); break; }
      case 'ft-download': await downloadStoredPdf(id); break;
      case 'ft-bulk': case 'ft-fetch-all': await bulkToggle(); break;
      case 'gemini-shortlist': await runGeminiShortlist(); break;
      case 'summary-make': await buildPrompt(S.selPapers, '', isWorkspaceLayout() && t.dataset.summaryScope !== 'fulltext', t.dataset.summaryMode); break;
      case 'summary-prompt-dl': if (S.summaryPrompt) download('ai-instructions.md', S.summaryPrompt); break;
      case 'knowledge-download': { const entries = knowledgeEntries(S); if (entries.length) download('research-knowledge.md', knowledgeDocument(entries)); break; }
      case 'knowledge-handoff':
        try { await navigator.clipboard.writeText(CONVERSATION_HANDOFF_PROMPT); S.knowledgeMsg = '복사했어요. 지금까지 연구한 AI 대화에 붙여 넣으세요.'; S.knowledgeTransferFallback = ''; }
        catch { S.knowledgeMsg = '자동 복사하지 못했어요. 아래 문구를 직접 복사하세요.'; S.knowledgeTransferFallback = CONVERSATION_HANDOFF_PROMPT; }
        render(); break;
      case 'knowledge-pick': /** @type {HTMLInputElement|null} */ (document.querySelector('[data-ract="knowledge-import"]'))?.click(); break;
      case 'knowledge-copy': {
        const entries = knowledgeEntries(S); if (!entries.length) break;
        try { await navigator.clipboard.writeText(knowledgeDocument(entries)); S.knowledgeBackupMsg = '저장된 정리를 복사했어요. AI 대화에 붙여 넣으세요.'; }
        catch { S.knowledgeBackupMsg = '복사하지 못했어요. 저장된 정리 파일 받기를 이용해 주세요.'; }
        render(); break;
      }
      case 'knowledge-clear': S.knowledgeImports = []; S.summaryPrompt = ''; S.knowledgeBackupMsg = '불러온 정리의 연결을 해제했어요. 이 조사 정리본과 원래 파일은 유지됩니다.'; touch(); break;
      case 'summary-copy': try { await navigator.clipboard.writeText(S.summaryPrompt); S.summaryMsg = '복사했어요.'; } catch { S.pPromptPreviewOpen = true; S.summaryMsg = '복사에 실패했어요. 미리보기에서 직접 복사하세요.'; } render(); break;
      case 'summary-load': {
        const v = S.summaries.find((/** @type {any} */ x) => x.id === id);
        if (v) {
          S.summaryDraft = v.md;
          S.summaryDraftIds = v.paperIds;
          S.summaryDraftPromptVersion = v.promptVersion || '';
          if (isWorkspaceLayout()) {
            S.pSummaryViewMode = 'edit';
            S.pView = 'main';
            S.pTask = 'cluster';
            S.summaryMsg = `${v.at.slice(0, 16).replace('T', ' ')} 정리본을 편집창에 불러왔어요.`;
          }
          render();
        }
        break; }
      case 'summary-dl': { const v = id === '__draft' ? { md: S.summaryDraft } : S.summaries.find((/** @type {any} */ x) => x.id === id); if (v) download('research-summary.md', v.md); break; }
      case 'summary-save-draft':
        if (S.summaryDraft.trim()) {
          const draftVersion = S.summaryDraftPromptVersion;
          addVersion(S.summaryDraft, S.summaryDraftIds.length ? S.summaryDraftIds : S.selPapers, 'user');
          if (draftVersion === SHORTLIST_PROMPT_VERSION) {
            S.summaries[S.summaries.length - 1].promptVersion = SHORTLIST_PROMPT_VERSION;
            S.summaryDraftPromptVersion = SHORTLIST_PROMPT_VERSION;
          }
          if (isWorkspaceLayout()) S.pSummaryViewMode = 'read';
          S.summaryMsg = '새 버전으로 저장했어요.';
          touch();
        }
        break;
      case 'summary-develop': {
        const v = S.summaries.find((/** @type {any} */ x) => x.id === id); if (!v) break;
        const keep = v.paperIds.filter((/** @type {string} */ x) => paperById(x));
        const extra = S.selPapers.filter((/** @type {string} */ x) => !keep.includes(x));
        if (isWorkspaceLayout()) { S.pView = 'main'; S.pTask = 'cluster'; }
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
      const rawPaste = String(f.querySelector('[name=md]')?.value || '');
      let md = rawPaste;
      const file = f.querySelector('[name=file]')?.files?.[0];
      if (file) {
        try { md = await file.text(); }
        catch {
          S.pFormDrafts ??= {};
          S.pFormDrafts['summary-import:md'] = rawPaste;
          S.summaryMsg = '파일을 읽지 못했어요. 입력한 원문과 기존 정리 결과는 그대로 보존했어요.';
          render();
          return;
        }
      }
      if (!md.trim() || md.includes('\0')) {
        S.pFormDrafts ??= {};
        S.pFormDrafts['summary-import:md'] = rawPaste;
        S.summaryMsg = md.includes('\0')
          ? '텍스트(.md) 형식이 아닌 파일이에요. 입력한 원문과 기존 정리 결과는 그대로 보존했어요.'
          : '가져올 .md 내용이 없어요. 기존 정리 결과는 그대로 보존했어요.';
        render();
        return;
      }
      const ids = S.summaryCtx?.paperIds?.length ? S.summaryCtx.paperIds : S.selPapers;
      const checks = checkSummaryMd(md, ids.length);
      if (isWorkspaceLayout() && checks.invalidRefs.length > 0) {
        S.pFormDrafts ??= {};
        S.pFormDrafts['summary-import:md'] = md;
        S.pSummaryImportOpen = true;
        S.summaryMsg = `가져오지 못했어요: 대상 논문(${ids.length}편) 범위를 벗어난 참조(${checks.invalidRefs.join(', ')})가 있어요. 입력한 원문과 기존 정리 결과는 덮어쓰지 않고 보존했어요.`;
        render();
        return;
      }
      // 가져오기 목적은 버튼으로 정한다. 구버전 저장본·새로고침으로
      // 프롬프트 버전/문자열이 달라도 1단계 자동 선택을 건너뛰지 않는다.
      const shortlistMode = isWorkspaceLayout() && /** @type {HTMLElement|null} */ (e.submitter)?.dataset.importPurpose !== 'detail';
      const picked = shortlistMode ? parseShortlist(md, ids, S.papers.map(p => p.id)) : null;
      if (picked && !picked.ok) {
        S.pFormDrafts ??= {};
        S.pFormDrafts['summary-import:md'] = md;
        S.pSummaryImportOpen = true;
        S.summaryMsg = `${picked.message} 기존 선택과 정리본은 그대로 유지했어요.`;
        render();
        return;
      }
      addVersion(md, [...ids], 'external');
      if (picked?.ok) {
        S.summaries[S.summaries.length - 1].promptVersion = SHORTLIST_PROMPT_VERSION;
        S.summaryDraftPromptVersion = SHORTLIST_PROMPT_VERSION;
        S.selPapers = [...picked.ids];
        S.pShowSelectedOnly = true;
        S.pListScrollTop = 0;
        S.pView = 'main'; S.pTask = 'cluster'; S.pMobilePane = 'work';
      }
      f.reset();
      if (S.pFormDrafts) delete S.pFormDrafts['summary-import:md'];
      if (isWorkspaceLayout()) {
        S.pSummaryViewMode = 'read';
        S.pSummaryImportOpen = false;
      }
      const c = S.summaries[S.summaries.length - 1].checks;
      S.summaryMsg = `AI 정리본을 가져왔어요. 출처 표시 ${c.refCount}곳, 표 ${c.tables}개, 그림 ${c.mermaid}개.${c.invalidRefs.length ? ` 없는 논문 번호: ${c.invalidRefs.join(', ')}.` : ''}${c.unsourcedParagraphs ? ` 출처 표시가 없는 문단이 약 ${c.unsourcedParagraphs}개 있어요(추정).` : ''}`;
      touch();
      if (picked?.ok) {
        S.summaryMsg = `추천 논문 ${picked.ids.length}편만 선택했어요. 아래에서 원문을 확보하세요.`;
        render();
        const { scrollWorkTo } = await import('./workspace.js');
        scrollWorkTo('#bulk-h', '#bulk-h');
      }
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
    else if (a === 'knowledge-import') {
      const file = t.files?.[0], projectId = S.projectId; t.value = '';
      if (!file) return;
      try {
        if (file.size > KNOWLEDGE_MAX_BYTES) throw new Error('지식 지도 파일은 2MB 이하로 나누어 주세요.');
        const entries = parseKnowledge(await file.text());
        if (S.projectId !== projectId) return;
        const merged = mergeKnowledge(S.knowledgeImports || [], entries);
        if (new TextEncoder().encode(knowledgeDocument(merged)).length > KNOWLEDGE_MAX_BYTES) throw new Error('불러올 지도 합계가 2MB를 넘어요. 다른 조사에서 나누어 활용해 주세요.');
        S.knowledgeImports = merged; S.summaryPrompt = '';
        S.knowledgeBackupMsg = '정리 파일을 연결했어요. AI에 전달하려면 저장된 정리를 받거나 복사하세요.';
        touch();
      } catch (err) { if (S.projectId === projectId) { S.knowledgeBackupMsg = /** @type {Error} */ (err).message; render(); } }
    }
    else if (a === 'summary-mode') { S.summaryMode = t.value === 'text' ? 'text' : 'attachments'; S.summaryPrompt = ''; S.summaryMsg = '방식을 바꿨어요. 프롬프트를 다시 만드세요.'; render(); }
    else if (a === 'summary-request') { S.summaryRequest = t.value; if (isWorkspaceLayout()) scheduleSave(); }
    else if (a === 'summary-prompt-edit') { S.summaryPrompt = t.value; if (isWorkspaceLayout()) scheduleSave(); }
    else if (a === 'summary-draft') { S.summaryDraft = t.value; if (isWorkspaceLayout()) scheduleSave(); }
    else if (a === 'gpt-purpose') { S.chatgptPurpose = t.value; S.chatgptPending = null; S.chatgptMsg = '목적을 바꿨어요. 프롬프트를 다시 만든 뒤 ChatGPT에 붙여 넣으세요.'; render(); }
    else if (a === 'gpt-focus') S.chatgptFocusId = t.value;
    else if (a === 'gpt-note') { S.chatgptNote = t.value; if (isWorkspaceLayout()) scheduleSave(); }
    else if (a === 'gpt-prompt') S.chatgptPrompt = t.value;
  });

  document.addEventListener('input', (e) => {
    const t = /** @type {any} */ (e.target);
    if (!t) return;
    const a = t.dataset?.ract;
    if (a === 'summary-request') { S.summaryRequest = t.value; if (isWorkspaceLayout()) scheduleSave(); }
    else if (a === 'summary-prompt-edit') { S.summaryPrompt = t.value; if (isWorkspaceLayout()) scheduleSave(); }
    else if (a === 'summary-draft') { S.summaryDraft = t.value; if (isWorkspaceLayout()) scheduleSave(); }
    else if (a === 'gpt-note') { S.chatgptNote = t.value; if (isWorkspaceLayout()) scheduleSave(); }
    else if (a === 'gpt-prompt') S.chatgptPrompt = t.value;
    else if (isWorkspaceLayout() && t.name === 'md' && t.closest?.('form[data-rform="summary-import"]')) {
      S.pFormDrafts ??= {};
      S.pFormDrafts['summary-import:md'] = t.value;
      scheduleSave();
    }
  });
  void $;
}
