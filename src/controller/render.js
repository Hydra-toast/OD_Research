// DOM 반영. 뷰 함수가 만든 HTML을 꽂고 포커스를 복원한다.
import { S } from '../state/store.js';
import {
  workspaceHeaderHtml, workspaceMobileBarHtml, workspaceListHtml, workspaceWorkHtml, workspaceSettingsHtml,
  workspaceTaskOf, isFullCompareView,
} from '../views/workspace.js';
import { evidenceHtml } from '../views/evidence.js';
import { savedListHtml } from '../views/saved.js';
import { repo } from './deps.js';

export const $ = /** @type {(s:string)=>any} */ (s => document.querySelector(s));
export const cssEsc = (/** @type {string} */ s) => CSS.escape(s);
export const focusFk = (/** @type {string} */ k) => $(`[data-fk="${cssEsc(k)}"]`)?.focus?.();

export const isWorkspaceLayout = () => document.body?.dataset?.layout === 'workspace';

/** @type {HTMLInputElement|null} */
let importFileInput = null;

export function showWorkspace(on = true) {
  const ws = $('#workspace');
  if (ws) ws.hidden = !on;
  if (isWorkspaceLayout()) {
    if (on) S.pView = 'main';
    syncWorkspaceSections(on);
  } else {
    document.body.classList.toggle('has-workspace', on);
  }
}

/** 작업 화면에서 메인(입력/작업)·설정·관리·저장한 조사·사용 안내 화면 분리 표시. @param {boolean} [wsActive] */
export function syncWorkspaceSections(wsActive = S.status !== 'idle') {
  if (!isWorkspaceLayout()) return;
  const view = ['saved', 'how', 'settings'].includes(S.pView) ? S.pView : 'main';
  const hero = $('#hero-section') || $('.hero');
  const ws = $('#workspace');
  const settings = $('#settings-section');
  const saved = $('#saved');
  const how = $('#how-section');
  const cancelBtn = $('#brief-cancel');
  const foot = $('.foot');

  const inWorkspace = view === 'main' && wsActive;
  document.body.classList.toggle('has-workspace', inWorkspace);
  document.body.classList.toggle('has-search-edit', inWorkspace && !!S.pSearchEditOpen);

  if (hero) hero.hidden = view !== 'main' || (wsActive && !S.pSearchEditOpen);
  if (cancelBtn) cancelBtn.hidden = !(wsActive && S.pSearchEditOpen);
  if (ws) ws.hidden = !inWorkspace;
  if (settings) settings.hidden = view !== 'settings';
  if (saved) saved.hidden = view !== 'saved';
  if (how) how.hidden = view !== 'how';
  if (foot) foot.hidden = inWorkspace;

  for (const [id, v] of [['#nav-workspace-main', 'main'], ['#nav-settings', 'settings'], ['#nav-saved', 'saved'], ['#nav-how', 'how']]) {
    const el = $(id);
    if (!el) continue;
    if (view === v) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  }
}

/** 작업 재렌더 전 스크롤·작성 중인 입력·포커스를 캡처한다. 다른 조사로 전환된 경우에는 이전 DOM 값을 새 조사 상태에 섞지 않는다. @param {boolean} sameSession */
function captureWorkspaceState(sameSession) {
  if (!sameSession) importFileInput = null;
  if (sameSession) {
    const file = /** @type {HTMLInputElement|null} */ ($('form[data-rform="summary-import"] input[type="file"]'));
    if (file) importFileInput = file.files?.length ? file : null;
    const listEl = $('#panel-explore .pw-list-scroll');
    if (listEl && listEl.offsetParent !== null) S.pListScrollTop = listEl.scrollTop;
    const workEl = $('#ppanel-work');
    const curTask = /** @type {any} */ (workEl)?.dataset?.renderedTask || workspaceTaskOf(S);
    if (workEl && workEl.offsetParent !== null) {
      S.pWorkScrollByTask ??= { detail: 0, cluster: 0, utilize: 0 };
      S.pWorkScrollByTask[curTask] = workEl.scrollTop;
    }


  }

  const ae = /** @type {any} */ (document.activeElement);
  const inManaged = sameSession && ae && ($('#workspace')?.contains(ae) || $('#hero-section')?.contains(ae) || $('#settings-section')?.contains(ae));
  return {
    fk: sameSession ? (ae?.dataset?.fk || null) : null,
    id: sameSession ? (ae?.id || null) : null,
    name: inManaged ? (ae?.getAttribute?.('name') || null) : null,
    formSel: inManaged ? (ae?.closest?.('form')?.getAttribute?.('id') ? '#' + ae.closest('form').id : (ae?.closest?.('form')?.getAttribute?.('data-rform') ? `form[data-rform="${ae.closest('form').getAttribute('data-rform')}"]` : null)) : null,
    selStart: sameSession && typeof ae?.selectionStart === 'number' ? ae.selectionStart : null,
    selEnd: sameSession && typeof ae?.selectionEnd === 'number' ? ae.selectionEnd : null,
  };
}

/** 작업 재렌더 후 입력 초안·스크롤·포커스를 복원한다. @param {any} snap */
function restoreWorkspaceState(snap) {
  const file = $('form[data-rform="summary-import"] input[type="file"]');
  if (file && importFileInput) file.replaceWith(importFileInput);
  const drafts = S.pFormDrafts || {};
  const gptAnsEl = /** @type {HTMLTextAreaElement|null} */ ($('form[data-rform="gpt-import"] textarea[name="answer"]'));
  if (gptAnsEl && typeof drafts['gpt-import:answer'] === 'string') gptAnsEl.value = drafts['gpt-import:answer'];

  for (const formSel of ['#adjust-form', '#add-form', 'form[data-rform="refine"]']) {
    const form = $(formSel);
    if (!form) continue;
    form.querySelectorAll('input, textarea, select').forEach((/** @type {any} */ inp) => {
      if (!inp.name || inp.type === 'file') return;
      const key = `${formSel}:${inp.name}:${inp.type === 'radio' ? inp.value : ''}`;
      if (!(key in drafts)) return;
      if (inp.type === 'checkbox' || inp.type === 'radio') inp.checked = !!drafts[key];
      else inp.value = String(drafts[key] ?? '');
    });
  }

  const listEl = $('#panel-explore .pw-list-scroll');
  if (listEl) listEl.scrollTop = S.pListScrollTop || 0;
  const workEl = $('#ppanel-work');
  const task = workspaceTaskOf(S);
  if (workEl) {
    workEl.dataset.renderedTask = task;
    workEl.scrollTop = S.pWorkScrollByTask?.[task] || 0;
  }

  let target = null;
  if (snap?.fk) target = $(`[data-fk="${cssEsc(snap.fk)}"]`);
  else if (snap?.id) target = document.getElementById(snap.id);
  else if (snap?.formSel && snap?.name) target = $(`${snap.formSel} [name="${cssEsc(snap.name)}"]`);
  if (target && typeof target.focus === 'function') {
    target.focus({ preventScroll: true });
    if (snap.selStart != null && typeof target.setSelectionRange === 'function') {
      try { target.setSelectionRange(snap.selStart, snap.selEnd ?? snap.selStart); } catch { /* 선택 미지원 요소 */ }
    }
  }
}

export function render() { renderWorkspace(); }

function renderWorkspace() {
  const ws = $('#workspace');
  const sameSession = !!(ws && ws.dataset.sessionKey && ws.dataset.sessionKey === S.pSessionKey && S.status === 'ok');
  const snap = captureWorkspaceState(sameSession);
  if (ws) ws.dataset.sessionKey = S.status === 'ok' ? (S.pSessionKey || '') : '';

  const wsActive = S.status !== 'idle';
  syncWorkspaceSections(wsActive);

  const settingsEl = $('#settings-section');
  if (settingsEl) settingsEl.innerHTML = S.pView === 'settings' ? workspaceSettingsHtml(S) : '';

  const hdr = $('#pw-header-content');
  if (hdr) hdr.innerHTML = workspaceHeaderHtml(S);

  const mobBar = $('#pw-mobile-bar');
  if (mobBar) mobBar.innerHTML = workspaceMobileBarHtml(S);

  const fullCompare = isFullCompareView(S);
  const wsPanels = $('#ws-panels');
  const pane = fullCompare ? 'work' : (S.pMobilePane === 'work' ? 'work' : 'list');
  if (wsPanels) {
    wsPanels.classList.add('is-workspace');
    wsPanels.dataset.mobilePane = pane;
    wsPanels.dataset.fullCompare = fullCompare ? 'true' : 'false';
  }

  const exPanel = $('#panel-explore');
  const prPanel = $('#panel-prepare');
  if (exPanel) {
    exPanel.hidden = fullCompare;
    exPanel.innerHTML = S.pView === 'main' ? workspaceListHtml(S) : '';
  }
  if (prPanel) {
    prPanel.hidden = false;
    prPanel.innerHTML = S.pView === 'main' ? workspaceWorkHtml(S) : '';
  }

  renderEvidence();
  restoreWorkspaceState(snap);
}

export function renderEvidence() {
  const el = $('#evidence-panel');
  const html = evidenceHtml(S);
  el.hidden = html == null;
  if (html != null) $('#ev-body').innerHTML = html;
}

export function setSave(/** @type {string} */ msg, /** @type {boolean} */ err) {
  S.saveMsg = msg; S.saveErr = err;
  const el = $('#save-state');
  if (!el) return;
  el.className = 'save-state' + (err ? ' err' : '');
  el.replaceChildren(document.createTextNode(msg));
  if (err) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn small'; b.dataset.act = 'retry-save'; b.textContent = '다시 저장';
    el.append(' ', b);
  }
}

export async function renderSaved() {
  const box = $('#saved-list');
  if (!box) return;
  try { box.innerHTML = savedListHtml(await repo.list()); }
  catch { box.innerHTML = '<p class="error">저장소를 읽지 못했어요. 브라우저의 저장 설정을 확인해 주세요.</p>'; }
}
