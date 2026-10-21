// 세부 검색·선택·공개 원문·총정리 동작. 사이트는 AI를 호출하지 않는다.
import { S, ranked, meta, paperById } from '../state/store.js';
import { $, render } from './render.js';
import { scheduleSave } from './persist.js';
import { refineSearch } from './session.js';
import { applyRefine, splitTerms } from '../research/refine.js';
import { ruleRank, RANK_VERSION } from '../research/rank.js';
import { suggestKeywords } from '../research/keywords.js';
import { summaryPrompt, checkSummaryMd, SUMMARY_PROMPT_VERSION } from '../research/summary.js';
import { candidateUrls } from '../views/research.js';
import { saveFulltext, loadFulltext } from '../repository/idb.js';

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
  const entry = { status: r.status, pageCount: r.pageCount || 0, source: r.source || '', license: r.license || null, sha256: r.sha256 || null, extractor: r.extractor || null, truncatedPages: !!r.truncatedPages, at: new Date().toISOString() };
  if ((r.status === 'extracted' || r.status === 'scan_only') && r.pages?.length && S.projectId) await saveFulltext(S.projectId, paper.id, r.pages);
  else if (r.status === 'extracted' && !S.projectId) entry.status = 'failed';
  S.fulltext[paper.id] = entry;
}

async function fetchOne(/** @type {any} */ paper) {
  const res = await fetch('/api/fulltext/fetch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ doi: paper.doi || '', urls: candidateUrls(paper), license: paper.fulltext?.license || null }) });
  const body = await res.json().catch(() => ({}));
  await storeResult(paper, res.ok ? body : { status: 'failed' });
  return S.fulltext[paper.id].status;
}

async function fetchMany(/** @type {any[]} */ papers) {
  S.fulltextBusy = true; S.fulltextMsg = `${papers.length}편 받는 중…`; render();
  const counts = { ok: 0, none: 0, fail: 0 };
  const queue = [...papers];
  const worker = async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      let st = 'failed';
      try { st = await fetchOne(p); } catch { await storeResult(p, { status: 'failed' }); }
      if (st === 'extracted') counts.ok++; else if (st === 'no_candidate' || st === 'not_pdf') counts.none++; else counts.fail++;
    }
  };
  await Promise.all([worker(), worker()]);
  S.fulltextBusy = false;
  S.fulltextMsg = `확보 ${counts.ok} / 공개본 없음 ${counts.none} / 실패·기타 ${counts.fail}. 확보하지 못한 논문은 초록만으로 정리하거나 PDF를 올려 주세요.`;
  touch();
}

async function uploadFiles(/** @type {FileList|File[]} */ files, /** @type {string|undefined} */ targetId) {
  S.fulltextBusy = true; S.fulltextMsg = `PDF ${files.length}개 처리 중…`; render();
  const lines = [];
  for (const file of files) {
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
  try { await navigator.clipboard.writeText(S.summaryPrompt); S.summaryMsg = `프롬프트를 복사했어요(논문 ${papers.length}편). 내가 쓰는 AI에 붙여 넣으세요. 논문 번호 P1~P${papers.length}가 정리본과 연결돼요.`; }
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

export function initResearch() {
  document.addEventListener('click', async (e) => {
    const t = /** @type {any} */ (e.target)?.closest?.('[data-ract]');
    if (!t || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
    const id = t.dataset.id;
    switch (t.dataset.ract) {
      case 'select-visible': S.selPapers = [...new Set([...S.selPapers, ...visibleIds()])]; touch(); break;
      case 'select-none': S.selPapers = []; touch(); break;
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
      S.summaryMsg = `가져왔어요(외부 AI 초안 · 정확성 미검증). 출처 표시 ${c.refCount}곳, 표 ${c.tables}개, 그림 ${c.mermaid}개.${c.invalidRefs.length ? ` 없는 논문 번호: ${c.invalidRefs.join(', ')}.` : ''}${c.unsourcedParagraphs ? ` 출처 표시가 없는 문단이 약 ${c.unsourcedParagraphs}개 있어요(추정).` : ''}`;
      touch();
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
  });
  void $;
}
