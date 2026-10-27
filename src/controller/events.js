// 이벤트 연결: 클릭·제출·변경·키보드를 상태 변경과 렌더로 이어준다.
import { S, scopeText, claimByCid, selectedPapers, paperById, meta } from '../state/store.js';
import { EXAMPLE_LAB } from '../data/content.js';
import {
  newScope, parseTerms, buildCompareRows, editCell, makeClaim, editClaimText, confirmClaim, makeUserPaper, candidateEvidencePapers,
  addEvidence, buildSummaryMd, buildGuideMd,
} from '../logic.js';
import { toRecord } from '../state/record.js';
import { repo } from './deps.js';
import { $, render, renderEvidence, renderSaved, focusFk, isWorkspaceLayout } from './render.js';
import { scheduleSave, doSave, cancelSave } from './persist.js';
import { refreshAnalysis } from './analysis.js';
import { setUrl } from './router.js';
import { search, searchExample, openProject, goHome } from './session.js';
import { runtime } from './runtime.js';
import { parseReview, reviewPrompt } from '../research/import.js';
import { deleteFulltexts } from '../repository/idb.js';

const toggle = (/** @type {string[]} */ arr, /** @type {string} */ id) => (arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);
const pushVersion = (/** @type {string} */ label) => S.versions.push({ at: new Date().toISOString(), label, scope: scopeText(S) });
const touch = () => { scheduleSave(); render(); };
/** 범위·논문 구성이 바뀌어 방향을 다시 계산해야 하는 변경 */
const touchAnalysis = () => { scheduleSave(); refreshAnalysis(); render(); };
const addTerms = (/** @type {'exclude'|'boost'|'emphasis'} */ kind, /** @type {any} */ raw) => { for (const t of parseTerms(raw)) if (!S.scope[kind].includes(t)) S.scope[kind].push(t); };

function exportCtx() {
  const papers = selectedPapers(S);
  return {
    project: toRecord(S, scopeText(S)), directions: S.selDirs.map((/** @type {string} */ id) => S.dirSnap[id]).filter(Boolean), papers,
    rows: buildCompareRows(papers, meta(S), S.cellEdits), allPapers: S.papers,
    claims: S.selDirs.map((/** @type {string} */ id) => S.claims[id]).filter(Boolean), notesByPaper: S.notes, lab: S.lab, questions: S.questions,
  };
}
async function doExport(/** @type {string} */ kind, /** @type {string} */ mode) {
  const text = kind === 'summary' ? buildSummaryMd(exportCtx()) : buildGuideMd(exportCtx());
  const st = $('#export-status');
  if (mode === 'download') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    a.download = kind === 'summary' ? 'research-landscape-summary.md' : 'research-landscape-guide.md';
    document.body.append(a); a.click(); a.remove();
    if (st) st.textContent = '파일을 만들었어요.';
    return;
  }
  try { await navigator.clipboard.writeText(text); S.exportText = null; if (st) st.textContent = '복사했어요.'; }
  catch { S.exportText = text; render(); if ($('#export-status')) $('#export-status').textContent = '자동 복사에 실패했어요. 아래 텍스트를 직접 선택해 복사하세요.'; $('#export-fallback')?.focus(); $('#export-fallback')?.select(); }
}

function openEvidence(/** @type {any} */ ev, /** @type {string} */ key) { S.evOpen = { ...ev, key }; renderEvidence(); $('#ev-close').focus(); }
function closeEvidence() {
  const key = S.evOpen?.key; S.evOpen = null; renderEvidence();
  if (key) focusFk(key);
}

function setTab(/** @type {'explore'|'prepare'} */ tab) {
  S.tab = tab;
  if (isWorkspaceLayout()) {
    S.pView = 'main'; S.pTask = tab === 'prepare' ? 'utilize' : 'cluster';
    S.pMobilePane = tab === 'prepare' ? 'work' : 'list';
  }
  setUrl('push'); render();
}

function qAct(/** @type {string} */ kind, /** @type {string} */ claimId) {
  const c = claimByCid(claimId); if (!c) return;
  S.qMsg = '';
  if (kind === 'revise') { render(); focusFk(`ct-${claimId}`); return; }
  if (kind === 'evidence') {
    const cands = candidateEvidencePapers(c, S.dirSnap[c.directionId], selectedPapers(S));
    if (!cands.length) {
      S.qPick = null;
      S.qMsg = '연결할 수 있는 다른 근거가 없어요. 이 방향에 논문이 더 있어야 하거나, 초록이 있는 논문을 선택하거나 직접 추가해 보세요.';
      render(); focusFk(`qe-${claimId}`); return;
    }
    S.qPick = claimId; render();
    $('[data-act="ev-pick"]')?.focus();
    return;
  }
  if (kind === 'ask') S.questions.push(`${c.text}에 적용 조건을 더 확인해야 하나요?`);
  if (kind === 'unknown') S.questions.push(`원문에서 확인 필요: ${c.text}`);
  S.qClaim = null; S.qPick = null; touch();
}

async function rawExport(/** @type {string} */ id) {
  const raw = await repo.load(id);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(raw ?? null, null, 2)], { type: 'application/json' }));
  a.download = `research-landscape-raw-${id}.json`;
  document.body.append(a); a.click(); a.remove();
}

export function initEvents() {
  document.addEventListener('click', async e => {
    const t = /** @type {any} */ (e.target)?.closest?.('[data-act]');
    if (!t) return;
    const a = t.dataset.act, id = t.dataset.id;
    switch (a) {
      case 'retry': search(S.input, { example: S.forceExample }); break;
      case 'load-example': case 'rebuild-topic': searchExample(t.dataset.key); break;
      case 'adjust-toggle': S.adjustOpen = !S.adjustOpen; render(); $('#adjust-form input')?.focus(); break;
      case 'add-toggle': S.addOpen = !S.addOpen; S.addError = ''; render(); if (S.addOpen) focusFk('add-title'); else focusFk('add-toggle'); break;
      case 'scope-reset': S.scope = newScope(); S.branch = null; pushVersion('추천 기본값으로 보기'); touchAnalysis(); break;
      case 'term-remove': S.scope[t.dataset.kind] = S.scope[t.dataset.kind].filter((/** @type {string} */ x) => x !== t.dataset.term); pushVersion('범위 조건 삭제'); touchAnalysis(); break;
      case 'branch': S.branch = id || null; render(); break;
      case 'more': S.showAll = !S.showAll; render(); break;
      case 'print': window.print(); break;
      case 'more-remote': S.searchPage = (S.searchPage || 0) + 1; search(S.input, { keepPage: true, english: S.englishOverride }); break;
      case 'toggle-paper': S.selPapers = toggle(S.selPapers, id); touch(); break;
      case 'toggle-dir': {
        if (S.selDirs.includes(id)) S.selDirs = S.selDirs.filter((/** @type {string} */ x) => x !== id);
        else { const d = S.analysis?.directions.find((/** @type {any} */ x) => x.id === id); if (d) { S.selDirs.push(id); S.dirSnap[id] = d; S.claims[id] ??= makeClaim(d); } }
        touch(); break; }
      case 'toggle-compare': S.compare = S.compare.includes(id) ? S.compare.filter((/** @type {string} */ x) => x !== id) : [...S.compare, id].slice(-3); render(); break;
      case 'goto-prepare': setTab('prepare'); $('#panel-prepare h2')?.focus(); break;
      case 'goto-explore': setTab('explore'); break;
      case 'go-home': goHome(); $('#brief').focus(); break;
      case 'lab-toggle': S.labOpen = !S.labOpen; render(); break;
      case 'lab-example': S.lab = { ...EXAMPLE_LAB, papers: '' }; touch(); break;
      case 'lab-clear': S.lab = null; touch(); break;
      case 'view-doc': openEvidence({ paperId: id }, t.dataset.fk); break;
      case 'unexclude': {
        const paper = S.papers.find((/** @type {any} */ p) => p.id === id);
        if (paper?.relevance) { paper.relevance.excluded = false; paper.relevance.reasons = ['사용자가 제외를 해제함']; }
        S.papers.sort((a, b) => Number(!!a.relevance?.excluded) - Number(!!b.relevance?.excluded) || (b.relevance?.score || 0) - (a.relevance?.score || 0) || String(a.id).localeCompare(String(b.id)));
        touch(); break; }
      case 'review-copy': {
        const chosen = S.papers.filter((/** @type {any} */ p) => !S.selPapers.length || S.selPapers.includes(p.id));
        const text = reviewPrompt(chosen, S.researchBrief?.searchCriteria || {}, S.researchBrief?.rankVersion || 'rule-v1').join('\n\n');
        try { await navigator.clipboard.writeText(text); } catch { S.exportText = text; }
        render(); break; }
      case 'review-apply': {
        const review = S.pendingReview;
        if (!review?.accepted?.length) break;
        const order = { direct: 0, adjacent: 1, unclear: 2 };
        const byId = new Map(review.accepted.map((/** @type {any} */ r) => [r.id, r]));
        S.papers = S.papers.map((/** @type {any} */ p) => byId.has(p.id) ? { ...p, externalReview: { ...byId.get(p.id), label: review.label, model: review.model || null, at: review.at, criterionVersion: S.researchBrief?.rankVersion || null } } : p);
        S.papers.sort((a, b) => (order[a.externalReview?.judgment] ?? 9) - (order[b.externalReview?.judgment] ?? 9) || String(a.id).localeCompare(String(b.id)));
        S.pendingReview = null;
        touch(); break; }
      case 'cell-edit': S.editCell = { pid: t.dataset.pid, item: t.dataset.item }; S.editError = ''; render(); focusFk('cell-input'); break;
      case 'cell-cancel': { const k = S.editCell; S.editCell = null; S.editError = ''; render(); if (k) focusFk(`ce-${k.pid}-${k.item}`); break; }
      case 'claim-ev': case 'claim-recheck': openEvidence({ claimId: id }, t.dataset.fk); break; // 자동 재검증은 하지 않는다. 사용자가 직접 확인.
      case 'claim-confirm': { const cl = claimByCid(id); if (cl) S.claims[cl.directionId] = confirmClaim(cl); touch(); break; }
      case 'claim-q': S.qClaim = S.qClaim === id ? null : id; S.qPick = null; S.qMsg = ''; render(); break;
      case 'q-act': qAct(t.dataset.kind, id); break;
      case 'ev-pick': {
        const c = claimByCid(id), p = paperById(t.dataset.pid);
        if (c && p) { S.claims[c.directionId] = addEvidence(c, p); S.qClaim = null; S.qPick = null; S.qMsg = ''; touch(); focusFk(`cq-${id}`); }
        break; }
      case 'export': doExport(t.dataset.kind, t.dataset.mode); break;
      case 'retry-save': doSave(); break;
      case 'open-saved': openProject(id); break;
      case 'rename-saved': {
        const r = await repo.load(id); if (!r) break;
        const n = prompt('새 이름', r.name);
        if (n && n.trim()) { await repo.save({ ...r, name: n.trim() }); if (S.projectId === id) S.name = n.trim(); renderSaved(); }
        break; }
      case 'delete-saved': {
        if (!confirm(`"${t.dataset.name}" 조사를 삭제할까요?\n이 브라우저에 저장된 입력, 선택, 메모, 수정, 생성 자료가 모두 지워져요. 되돌릴 수 없어요.`)) break;
        const current = (S.projectId ?? S.corrupt?.id) === id;
        if (current) cancelSave();
        await repo.delete(id);
        await deleteFulltexts(id).catch(() => {});
        if (current) await goHome({ url: 'replace' });
        renderSaved(); break; }
      case 'raw-export': rawExport(id); break;
    }
  });

  document.addEventListener('submit', async e => {
    const f = /** @type {any} */ (e.target)?.closest?.('form[data-act]'); if (!f) return;
    e.preventDefault();
    const fd = new FormData(f);
    switch (f.dataset.act) {
      case 'feedback-save': {
        S.versions.push({ at: new Date().toISOString(), label: `피드백:${fd.get('kind')}`, scope: scopeText(S) });
        S.feedbackNote = '이전 선택과 메모는 유지했어요.';
        touch();
        break; }
      case 'english-query': {
        const english = String(fd.get('english') || '').trim();
        if (!english) break;
        S.englishOverride = english;
        search(S.input, { english });
        break; }
      case 'scope-apply':
        addTerms('exclude', fd.get('exclude')); addTerms('boost', fd.get('boost')); addTerms('emphasis', fd.get('emphasis'));
        S.scope.material = String(fd.get('material') || '').trim(); S.scope.materialOnly = fd.get('materialOnly') === 'on';
        S.scope.focus = fd.get('focus') || 'trend';
        S.adjustOpen = false; pushVersion('범위 조정'); touchAnalysis(); focusFk('adjust'); break;
      case 'lab-save': S.lab = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v).trim()])); S.labOpen = false; touch(); break;
      case 'review-paste': {
        const parsed = parseReview(String(fd.get('review') || ''), S.papers, S.researchBrief?.rankVersion || '');
        S.pendingReview = { ...parsed, at: new Date().toISOString() };
        render(); break; }
      case 'add-paper': {
        try {
          const doi = String(fd.get('doi') || '').trim();
          if (doi && S.papers.some((/** @type {any} */ p) => p.doi && p.doi.toLowerCase() === doi.toLowerCase())) throw new Error('같은 DOI의 논문이 이미 있어요.');
          if (runtime.search && doi) {
            const res = await fetch('/api/papers/resolve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ doi }) });
            const body = await res.json().catch(() => ({}));
            if (res.ok && body.paper) {
              S.papers = [...S.papers, body.paper];
              S.addOpen = false; S.addError = ''; pushVersion('DOI로 논문 추가'); touchAnalysis(); focusFk('add-toggle');
              break;
            }
            if (res.status !== 404) throw new Error(body.error?.message || 'DOI를 확인하지 못했어요. 예시 논문으로 바꾸지 않았어요.');
          }
          const { paper, meta: m } = makeUserPaper({ title: fd.get('title'), year: fd.get('year'), doi, abstract: fd.get('abstract'), role: fd.get('role'), tags: fd.get('tags'), branches: fd.getAll('branches') });
          S.papers = [...S.papers, paper]; S.userMeta = { ...S.userMeta, [paper.id]: m };
          S.addOpen = false; S.addError = ''; pushVersion('논문 직접 추가'); touchAnalysis(); focusFk('add-toggle');
        } catch (err) { S.addError = /** @type {any} */ (err).message; render(); focusFk('add-title'); }
        break; }
      case 'cell-save': {
        const { pid, item } = S.editCell ?? {};
        try {
          S.cellEdits = editCell(S.cellEdits, pid, item, { value: fd.get('value'), unit: fd.get('unit'), condition: fd.get('condition'), evidenceId: fd.get('evidenceId'), emptyReason: fd.get('emptyReason') });
          S.editCell = null; S.editError = ''; touch(); focusFk(`ce-${pid}-${item}`);
        } catch (err) { S.editError = /** @type {any} */ (err).message; render(); focusFk('cell-input'); }
        break; }
    }
  });

  document.addEventListener('change', e => {
    const t = /** @type {any} */ (e.target), a = t.dataset?.act; if (!a) return;
    if (a === 'sort') { S.sort = t.value; touch(); }
    else if (a === 'note') { S.notes[t.dataset.id] = t.value; scheduleSave(); }
    else if (a.startsWith('claim-')) {
      const key = String(t.dataset.id).replace('claim:', ''); let c = S.claims[key]; if (!c) return;
      if (a === 'claim-text') c = editClaimText(c, t.value);
      if (a === 'claim-cond') c = { ...c, condition: t.value };
      if (a === 'claim-interp') c = { ...c, interpretation: t.value };
      S.claims[key] = c; touch();
    }
  });

  document.addEventListener('input', e => {
    if (!isWorkspaceLayout()) return;
    const t = /** @type {any} */ (e.target);
    if (t?.dataset?.act === 'note' && t.dataset.id) {
      S.notes[t.dataset.id] = t.value;
      scheduleSave();
    }
  });

  $('#ev-close').addEventListener('click', closeEvidence);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.evOpen) closeEvidence(); });
  if (!isWorkspaceLayout()) {
    for (const tab of [$('#tab-explore'), $('#tab-prepare')]) tab?.addEventListener('click', () => setTab(tab.id === 'tab-prepare' ? 'prepare' : 'explore'));
    $('#workspace [role=tablist]')?.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      setTab(S.tab === 'explore' ? 'prepare' : 'explore'); $('#tab-' + S.tab)?.focus();
    });
  }
}
