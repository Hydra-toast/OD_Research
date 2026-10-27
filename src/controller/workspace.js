// 기본 작업 화면 전용 이벤트·전환·스크롤 제어.
import { S, paperById } from '../state/store.js';
import { $, cssEsc, render, renderSaved, isWorkspaceLayout } from './render.js';
import { scheduleSave } from './persist.js';
import { workspaceTaskOf, workspaceUtilizeSubOf } from '../views/workspace.js';
import { listedItems } from '../research/list.js';
import { bulkToggle, buildPrompt } from './research.js';

const TASKS = /** @type {const} */ (['detail', 'cluster', 'utilize']);
const UTIL_SUBS = /** @type {const} */ (['compare', 'claims', 'ai', 'export']);
const SET_TABS = /** @type {const} */ (['inbox', 'lab', 'scope', 'versions']);

function saveCurrentScrolls() {
  const listEl = $('#panel-explore .pw-list-scroll');
  if (listEl && listEl.offsetParent !== null) S.pListScrollTop = listEl.scrollTop;
  const workEl = $('#ppanel-work');
  if (workEl && workEl.offsetParent !== null) {
    S.pWorkScrollByTask ??= { detail: 0, cluster: 0, utilize: 0 };
    S.pWorkScrollByTask[workspaceTaskOf(S)] = workEl.scrollTop;
  }
}

function openSearchEdit() {
  const briefEl = /** @type {HTMLTextAreaElement|null} */ ($('#brief'));
  const fieldEl = /** @type {HTMLInputElement|null} */ ($('#brief-field'));
  const condEl = /** @type {HTMLInputElement|null} */ ($('#brief-conditions'));
  if (briefEl && !briefEl.value.trim() && S.input) briefEl.value = S.input;
  S.pSearchSnapshot = {
    brief: briefEl ? briefEl.value : S.input,
    field: fieldEl ? fieldEl.value : '',
    conditions: condEl ? condEl.value : '',
  };
  S.pSearchEditOpen = true;
  render();
  $('#brief')?.focus();
}

function cancelSearchEdit() {
  const snap = S.pSearchSnapshot;
  const briefEl = /** @type {HTMLTextAreaElement|null} */ ($('#brief'));
  const fieldEl = /** @type {HTMLInputElement|null} */ ($('#brief-field'));
  const condEl = /** @type {HTMLInputElement|null} */ ($('#brief-conditions'));
  if (briefEl) briefEl.value = snap ? snap.brief : S.input;
  if (fieldEl && snap) fieldEl.value = snap.field;
  if (condEl && snap) condEl.value = snap.conditions;
  const plan = $('#brief-plan');
  if (plan) plan.hidden = true;
  const err = $('#brief-error');
  if (err) err.hidden = true;
  S.pSearchEditOpen = false;
  render();
  $('[data-fk="p-search-edit"]')?.focus();
}

/** 우측 작업 패널 내부의 특정 요소를 스크롤 컨테이너 안에서 보이게 한다. @param {string} selector @param {string} [focusSel] */
function scrollWorkTo(selector, focusSel) {
  const workEl = $('#ppanel-work');
  const target = $(selector);
  if (workEl && target) {
    const top = target.getBoundingClientRect().top - workEl.getBoundingClientRect().top + workEl.scrollTop - 12;
    workEl.scrollTop = Math.max(0, top);
    S.pWorkScrollByTask ??= { detail: 0, cluster: 0, utilize: 0 };
    S.pWorkScrollByTask[workspaceTaskOf(S)] = workEl.scrollTop;
  }
  const focusEl = focusSel ? $(focusSel) : target;
  focusEl?.focus?.({ preventScroll: true });
}

function toggleComparePaper(/** @type {string} */ pid) {
  if (!pid || !paperById(pid, S)) return;
  S.pCompareIds ??= [];
  if (S.pCompareIds.includes(pid)) {
    S.pCompareIds = S.pCompareIds.filter((/** @type {string} */ x) => x !== pid);
    S.pCompareMsg = '';
    scheduleSave();
    render();
    return;
  }
  if (S.pCompareIds.length >= 4) {
    S.pCompareMsg = '비교 대상은 최대 4편까지 고를 수 있어요. 기존 비교 논문을 먼저 해제한 뒤 다른 논문으로 교체해 주세요.';
    render();
    return;
  }
  S.pCompareIds = [...S.pCompareIds, pid];
  S.pCompareMsg = '';
  scheduleSave();
  render();
}

export function initWorkspace() {
  if (!isWorkspaceLayout()) return;

  // 입력 시점에 초안을 보관한다. 렌더 직전 DOM을 읽으면 새 결과를 옛 값으로 덮어쓸 수 있다.
  const rememberForm = (e) => {
    const t = /** @type {any} */ (e.target);
    if (!t?.name || t.type === 'file') return;
    S.pFormDrafts ??= {};
    if (t.name === 'answer' && t.closest('form[data-rform="gpt-import"]')) S.pFormDrafts['gpt-import:answer'] = t.value;
    for (const sel of ['#adjust-form', '#add-form', 'form[data-rform="refine"]']) {
      if (!t.closest(sel)) continue;
      S.pFormDrafts[`${sel}:${t.name}:${t.type === 'radio' ? t.value : ''}`] = ['checkbox', 'radio'].includes(t.type) ? t.checked : t.value;
    }
  };
  document.addEventListener('input', rememberForm);
  document.addEventListener('change', rememberForm);

  // 내부 스크롤 컨테이너의 스크롤 위치를 실시간으로 기록한다.
  document.addEventListener('scroll', (e) => {
    const t = /** @type {HTMLElement|null} */ (e.target);
    if (!t) return;
    if (t.classList?.contains('pw-list-scroll')) {
      S.pListScrollTop = t.scrollTop;
    } else if (t.id === 'ppanel-work') {
      S.pWorkScrollByTask ??= { detail: 0, cluster: 0, utilize: 0 };
      S.pWorkScrollByTask[workspaceTaskOf(S)] = t.scrollTop;
    }
  }, true);

  // details 열림 상태를 동기화해 재렌더 시 접히지 않게 보존한다.
  document.addEventListener('toggle', (e) => {
    const t = /** @type {HTMLDetailsElement|null} */ (e.target);
    const kind = t?.dataset?.pactDetails;
    if (!kind) return;
    if (kind === 'prompt-preview') S.pPromptPreviewOpen = t.open;
    if (kind === 'summary-import') S.pSummaryImportOpen = t.open;
  }, true);

  document.addEventListener('click', async (e) => {
    const t = /** @type {any} */ (e.target)?.closest?.('[data-pact]');
    if (!t) return;
    const act = t.dataset.pact;

    switch (act) {
      case 'view-main':
        e.preventDefault();
        S.pView = 'main';
        render();
        break;
      case 'view-settings':
        e.preventDefault();
        saveCurrentScrolls();
        S.pView = 'settings';
        render();
        $('#settings-title')?.focus?.();
        break;
      case 'open-inbox-alert':
        e.preventDefault();
        saveCurrentScrolls();
        S.pView = 'settings';
        S.pSettingsTab = 'inbox';
        render();
        ($('#inbox-h') || $('#settings-title'))?.focus?.();
        break;
      case 'open-settings-tab': {
        e.preventDefault();
        saveCurrentScrolls();
        const tab = t.dataset.tab;
        if (SET_TABS.includes(tab)) S.pSettingsTab = tab;
        S.pView = 'settings';
        render();
        $(`#pset-${S.pSettingsTab}`)?.focus?.({ preventScroll: true });
        break;
      }
      case 'settings-tab': {
        const tab = t.dataset.tab;
        if (SET_TABS.includes(tab)) S.pSettingsTab = tab;
        render();
        $(`#pset-${S.pSettingsTab}`)?.focus?.({ preventScroll: true });
        break;
      }
      case 'view-saved':
        e.preventDefault();
        saveCurrentScrolls();
        S.pView = 'saved';
        await renderSaved();
        render();
        $('#saved-title')?.focus?.();
        break;
      case 'view-how':
        e.preventDefault();
        saveCurrentScrolls();
        S.pView = 'how';
        render();
        $('#how-title')?.focus?.();
        break;
      case 'search-edit-toggle':
        if (S.pSearchEditOpen) cancelSearchEdit();
        else openSearchEdit();
        break;
      case 'search-edit-cancel':
        cancelSearchEdit();
        break;
      case 'filter-toggle':
        S.pFilterOpen = !S.pFilterOpen;
        render();
        break;
      case 'toggle-selected-only':
        S.pShowSelectedOnly = !S.pShowSelectedOnly;
        render();
        $('[data-fk="p-selected-only"]')?.focus?.({ preventScroll: true });
        break;
      case 'toggle-compare-paper':
        toggleComparePaper(t.dataset.id);
        break;
      case 'clear-compare-papers':
        S.pCompareIds = [];
        S.pCompareMsg = '';
        scheduleSave();
        render();
        break;
      case 'dismiss-compare-msg':
        S.pCompareMsg = '';
        render();
        break;
      case 'open-detail': {
        saveCurrentScrolls();
        const pid = t.dataset.id;
        if (pid) S.pDetailId = pid;
        S.pTask = 'detail';
        S.pWorkScrollByTask ??= { detail: 0, cluster: 0, utilize: 0 };
        S.pWorkScrollByTask.detail = 0;
        S.pMobilePane = 'work';
        render();
        $('#p-detail-title')?.focus?.({ preventScroll: true });
        break;
      }
      case 'task-tab': {
        saveCurrentScrolls();
        const prevTask = workspaceTaskOf(S);
        const nextTask = t.dataset.task;
        if (TASKS.includes(nextTask)) {
          if (nextTask === 'utilize' && prevTask !== 'utilize') {
            S.pPrevTaskBeforeCompare = prevTask;
            S.pPrevMobilePaneBeforeCompare = S.pMobilePane || 'list';
          }
          S.pTask = nextTask;
          if (nextTask === 'detail' && !S.pDetailId) {
            S.pDetailId = listedItems(S)[0]?.paper?.id || S.papers[0]?.id || null;
          }
        }
        S.pMobilePane = 'work';
        render();
        $(`#ptab-${workspaceTaskOf(S)}`)?.focus?.({ preventScroll: true });
        break;
      }
      case 'utilize-sub': {
        saveCurrentScrolls();
        const sub = t.dataset.sub;
        if (UTIL_SUBS.includes(sub)) {
          if (sub === 'compare' && workspaceTaskOf(S) !== 'utilize') {
            S.pPrevTaskBeforeCompare = workspaceTaskOf(S);
          }
          S.pTask = 'utilize';
          S.pUtilizeSub = sub;
        }
        S.pMobilePane = 'work';
        render();
        $(`#pusub-${workspaceUtilizeSubOf(S)}`)?.focus?.({ preventScroll: true });
        break;
      }
      case 'exit-full-compare': {
        saveCurrentScrolls();
        const restoreTask = S.pPrevTaskBeforeCompare && S.pPrevTaskBeforeCompare !== 'utilize'
          ? S.pPrevTaskBeforeCompare
          : 'cluster';
        S.pTask = restoreTask;
        S.pMobilePane = S.pPrevMobilePaneBeforeCompare || 'list';
        render();
        const listEl = $('#panel-explore .pw-list-scroll');
        if (listEl) listEl.scrollTop = S.pListScrollTop || 0;
        $(`#ptab-${restoreTask}`)?.focus?.({ preventScroll: true });
        break;
      }
      case 'summary-view-mode': {
        S.pSummaryViewMode = t.dataset.mode === 'edit' ? 'edit' : 'read';
        if (S.pSummaryViewMode === 'edit' && !S.summaryDraft && S.summaries?.length) {
          const latest = S.summaries[S.summaries.length - 1];
          S.summaryDraft = latest.md;
          S.summaryDraftIds = latest.paperIds;
        }
        render();
        break;
      }
      case 'mobile-pane': {
        saveCurrentScrolls();
        const pane = t.dataset.pane === 'work' ? 'work' : 'list';
        if (pane === 'list' && workspaceTaskOf(S) === 'utilize' && workspaceUtilizeSubOf(S) === 'compare') {
          S.pTask = S.pPrevTaskBeforeCompare && S.pPrevTaskBeforeCompare !== 'utilize' ? S.pPrevTaskBeforeCompare : 'cluster';
        }
        S.pMobilePane = pane;
        render();
        if (pane === 'list') {
          const listEl = $('#panel-explore .pw-list-scroll');
          if (listEl) listEl.scrollTop = S.pListScrollTop || 0;
        }
        $(`#pmob-${pane}`)?.focus?.({ preventScroll: true });
        break;
      }
      case 'back-to-list': {
        saveCurrentScrolls();
        S.pMobilePane = 'list';
        render();
        const listEl = $('#panel-explore .pw-list-scroll');
        if (listEl) listEl.scrollTop = S.pListScrollTop || 0;
        const pid = S.pDetailId;
        const rowBtn = pid ? $(`[data-fk="pt-${cssEsc(pid)}"]`) : $('#pmob-list');
        rowBtn?.focus?.({ preventScroll: true });
        break;
      }
      case 'quick-fulltext': {
        saveCurrentScrolls();
        S.pView = 'main';
        S.pTask = 'cluster';
        S.pMobilePane = 'work';
        render();
        if (S.dataMode === 'real' && (S.selPapers.length > 0 || S.fulltextBusy)) {
          await bulkToggle();
        }
        scrollWorkTo('#bulk-h', '[data-ract="ft-bulk"]');
        break;
      }
      case 'quick-prompt': {
        saveCurrentScrolls();
        S.pView = 'main';
        S.pTask = 'cluster';
        S.pMobilePane = 'work';
        render();
        if (S.selPapers.length > 0) {
          await buildPrompt(S.selPapers, '');
        }
        scrollWorkTo('#sm-h', '#summary-focus');
        break;
      }
      case 'quick-import': {
        saveCurrentScrolls();
        S.pView = 'main';
        S.pTask = 'cluster';
        S.pSummaryImportOpen = true;
        S.pMobilePane = 'work';
        render();
        scrollWorkTo('#sm-import-h', 'form[data-rform="summary-import"] textarea[name="md"]');
        break;
      }
    }
  });

  // 키보드 방향키로 작업 탭·하위 탭·설정 탭·모바일 영역 탭 전환
  document.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const t = /** @type {HTMLElement|null} */ (e.target);
    if (!t) return;

    const workTablist = t.closest('.pw-work-tabs');
    if (workTablist) {
      e.preventDefault();
      saveCurrentScrolls();
      const cur = workspaceTaskOf(S);
      const idx = TASKS.indexOf(cur);
      const nextIdx = e.key === 'Home' ? 0
        : e.key === 'End' ? TASKS.length - 1
        : e.key === 'ArrowRight' ? (idx + 1) % TASKS.length
        : (idx - 1 + TASKS.length) % TASKS.length;
      const nextTask = TASKS[nextIdx];
      if (nextTask === 'utilize' && cur !== 'utilize') {
        S.pPrevTaskBeforeCompare = cur;
      }
      S.pTask = nextTask;
      if (nextTask === 'detail' && !S.pDetailId) {
        S.pDetailId = listedItems(S)[0]?.paper?.id || S.papers[0]?.id || null;
      }
      S.pMobilePane = 'work';
      render();
      $(`#ptab-${nextTask}`)?.focus?.({ preventScroll: true });
      return;
    }

    const subTablist = t.closest('.pw-subtabs');
    if (subTablist && S.pView === 'main') {
      e.preventDefault();
      saveCurrentScrolls();
      const cur = workspaceUtilizeSubOf(S);
      const idx = UTIL_SUBS.indexOf(cur);
      const nextIdx = e.key === 'Home' ? 0
        : e.key === 'End' ? UTIL_SUBS.length - 1
        : e.key === 'ArrowRight' ? (idx + 1) % UTIL_SUBS.length
        : (idx - 1 + UTIL_SUBS.length) % UTIL_SUBS.length;
      const nextSub = UTIL_SUBS[nextIdx];
      S.pUtilizeSub = nextSub;
      render();
      $(`#pusub-${nextSub}`)?.focus?.({ preventScroll: true });
      return;
    }
    if (subTablist && S.pView === 'settings') {
      e.preventDefault();
      const cur = SET_TABS.includes(S.pSettingsTab) ? S.pSettingsTab : 'inbox';
      const idx = SET_TABS.indexOf(cur);
      const nextIdx = e.key === 'Home' ? 0
        : e.key === 'End' ? SET_TABS.length - 1
        : e.key === 'ArrowRight' ? (idx + 1) % SET_TABS.length
        : (idx - 1 + SET_TABS.length) % SET_TABS.length;
      const nextTab = SET_TABS[nextIdx];
      S.pSettingsTab = nextTab;
      render();
      $(`#pset-${nextTab}`)?.focus?.({ preventScroll: true });
      return;
    }

    const mobTablist = t.closest('#pw-mobile-bar');
    if (mobTablist) {
      e.preventDefault();
      saveCurrentScrolls();
      const nextPane = S.pMobilePane === 'work' ? 'list' : 'work';
      if (nextPane === 'list' && workspaceTaskOf(S) === 'utilize' && workspaceUtilizeSubOf(S) === 'compare') {
        S.pTask = S.pPrevTaskBeforeCompare && S.pPrevTaskBeforeCompare !== 'utilize' ? S.pPrevTaskBeforeCompare : 'cluster';
      }
      S.pMobilePane = nextPane;
      render();
      if (nextPane === 'list') {
        const listEl = $('#panel-explore .pw-list-scroll');
        if (listEl) listEl.scrollTop = S.pListScrollTop || 0;
      }
      $(`#pmob-${nextPane}`)?.focus?.({ preventScroll: true });
    }
  });
}
