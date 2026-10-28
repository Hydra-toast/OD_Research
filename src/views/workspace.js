// 기본 작업 화면 전용 뷰 조각. 기본 화면(/)의 뷰 모듈은 변경하지 않는다.
import { h, tag, exampleTag, accessTag, originTag } from './common.js';
import { EXAMPLE_TOPICS, EXAMPLE_LABEL } from '../data/examples.js';
import { TOPIC_DEFS, ROLE_REASON, COMPARE_ITEMS, EMPTY_LABEL } from '../data/content.js';
import { EMPTY_REASONS } from '../schema.js';
import {
  suggestTopicForMaterial, buildCompareRows, rowCompareWarning,
  candidateEvidencePapers, claimLabels, nextQuestion, ORIGIN_LABEL,
} from '../logic.js';
import { meta, ranked, selectedPapers, workspaceComparePapers, paperById } from '../state/store.js';
import { recoveryHtml } from './saved.js';
import { labSection } from './explore.js';
import {
  fulltextLine, chatgptPanel, ftLabel, proxyPrefix,
} from './research.js';
import { listedItems, matchedItems, workspaceVisibleItems, EXAMPLE_CAP, LIST_CAP } from '../research/list.js';
import { applyRefine } from '../research/refine.js';
import { suggestKeywords } from '../research/keywords.js';
import { knowledgeEntries } from '../research/knowledge.js';
import { SUMMARY_PROMPT_VERSION, SHORTLIST_PROMPT_VERSION, parseShortlist } from '../research/summary.js';
import { folderState } from '../controller/folder-state.js';

const TASK_LABEL = {
  detail: '논문 상세',
  cluster: '연구군·읽기 순서',
  utilize: '활용',
};

const UTILIZE_SUB_LABEL = {
  compare: '논문 비교',
  claims: '발표문과 근거',
  ai: '목적별 외부 AI 도움',
  export: '내보내기',
};

/** @param {any} S */
export function workspaceTaskOf(S) {
  return S.pTask === 'detail' || S.pTask === 'utilize' ? S.pTask : 'cluster';
}

/** @param {any} S */
export function workspaceUtilizeSubOf(S) {
  return ['compare', 'claims', 'ai', 'export'].includes(S.pUtilizeSub) ? S.pUtilizeSub : 'compare';
}

/** 현재 논문 비교 전체 폭 화면인지 여부. @param {any} S */
export function isFullCompareView(S) {
  return S.status === 'ok' && workspaceTaskOf(S) === 'utilize' && workspaceUtilizeSubOf(S) === 'compare';
}

/** 수신함에 사용자 확인 요청이나 오류가 있는지 판별한다. @param {any} S */
export function inboxAlertInfo(S) {
  const box = S.inbox;
  if (!box) return null;
  const activeItems = (box.items || []).filter((/** @type {any} */ it) => it.status !== 'excluded');
  const reviewCount = activeItems.filter((/** @type {any} */ it) => it.status === 'review' || it.clientAction === 'review' || it.clientAction === 'replace').length;
  const errCount = activeItems.filter((/** @type {any} */ it) => it.status === 'failed' || it.status === 'over_limit').length;
  const offline = !!box.offline;
  const warn = box.warnings?.[0] || '';
  if (!offline && !reviewCount && !errCount && !warn) return null;
  const label = offline
    ? 'PDF 수신함 연결 오류'
    : reviewCount
      ? `PDF 수신함 확인 요청 ${reviewCount}건`
      : errCount
        ? `PDF 수신함 오류 ${errCount}건`
        : 'PDF 수신함 알림';
  return { offline, reviewCount, errCount, warn, label };
}

/** 검색 후 상단 작업 헤더. @param {any} S */
export function workspaceHeaderHtml(S) {
  const shown = S.status === 'ok' ? workspaceVisibleItems(S) : [];
  const got = S.selPapers.filter((/** @type {string} */ id) => ['extracted', 'scan_only'].includes(S.fulltext?.[id]?.status)).length;
  const cmpCount = (S.pCompareIds || []).filter((/** @type {string} */ id) => paperById(id, S)).length;
  const modeBadge = S.dataMode === 'real' ? tag('info', '실제 검색 자료') : exampleTag();
  return `<div class="pw-header-left">
      <div class="pw-topic-row">
        <span class="pw-topic-label">조사 주제</span>
        <strong class="pw-topic-title" title="${h(S.input)}">${h(S.input || '(주제 미입력)')}</strong>
        ${modeBadge}
      </div>
      <div class="pw-counts" role="status">
        <span>수집 <strong>${S.papers.length}</strong>편</span>
        <span aria-hidden="true">·</span>
        <span>목록 <strong>${shown.length}</strong>편</span>
        <span aria-hidden="true">·</span>
        <span>정리 선택 <strong>${S.selPapers.length}</strong>편</span>
        <span aria-hidden="true">·</span>
        <span>비교 <strong>${cmpCount}</strong>/4편</span>
        <span aria-hidden="true">·</span>
        <span>원문 <strong>${got}</strong>편</span>
      </div>
    </div>
    <div class="pw-header-right">
      <button type="button" class="btn small" data-pact="view-settings" data-fk="p-open-settings">설정·관리</button>
      <button type="button" class="btn small" data-pact="search-edit-toggle" aria-expanded="${!!S.pSearchEditOpen}" aria-controls="hero-section" data-fk="p-search-edit">${S.pSearchEditOpen ? '검색 수정 닫기' : '검색 수정'}</button>
      <button type="button" class="btn small pw-new-research" data-act="go-home" data-fk="p-new-research">새 조사</button>
    </div>`;
}

/** 1,120px 이하에서 표시되는 논문 목록 / 현재 작업 전환 바. @param {any} S */
export function workspaceMobileBarHtml(S) {
  const shownCount = S.status === 'ok' ? workspaceVisibleItems(S).length : 0;
  const task = workspaceTaskOf(S);
  const pane = isFullCompareView(S) ? 'work' : (S.pMobilePane === 'work' ? 'work' : 'list');
  return `<button type="button" role="tab" id="pmob-list" class="tab pw-mob-tab" data-pact="mobile-pane" data-pane="list" aria-controls="panel-explore" aria-selected="${pane === 'list'}" tabindex="${pane === 'list' ? '0' : '-1'}">논문 목록 (${shownCount})</button>
    <button type="button" role="tab" id="pmob-work" class="tab pw-mob-tab" data-pact="mobile-pane" data-pane="work" aria-controls="panel-prepare" aria-selected="${pane === 'work'}" tabindex="${pane === 'work' ? '0' : '-1'}">현재 작업 · ${h(TASK_LABEL[task])}</button>`;
}

/** 왼쪽 패널: 논문 목록 (체크박스·[P#]·제목 2줄·저자/연도·원문 상태·독립 비교 선택). @param {any} S */
export function workspaceListHtml(S) {
  if (S.status === 'corrupt' || S.status === 'missing') return `<div class="pw-list-scroll">${recoveryHtml(S)}</div>`;
  if (S.status === 'loading') return `<div class="pw-list-scroll"><p class="card" role="status">${S.forceExample || S.dataMode !== 'real' ? '예시 자료를 불러오는 중…' : 'OpenAlex·Crossref에서 논문 검색 중…'}</p></div>`;
  if (S.status === 'error') {
    return `<div class="pw-list-scroll"><div class="card stack"><h2 tabindex="-1">불러오지 못했어요</h2><p>${h(S.searchError || '논문을 불러오지 못했어요. 다시 시도해 주세요.')}</p><p>${S.dataMode === 'real' ? '실검색 실패를 예시 결과로 바꾸지 않았어요.' : '예시 공급자 오류입니다. 실제 검색으로 대체하지 않습니다.'}</p><div class="row"><button class="btn" data-act="retry">다시 시도</button></div></div></div>`;
  }
  if (S.status === 'empty' && S.dataMode === 'real') {
    return `<div class="pw-list-scroll"><div class="card stack"><h2 tabindex="-1">검색 결과가 없어요</h2><p>“${h(S.queryPlan?.english || S.input)}”로 찾은 논문이 없어요. 검색어를 바꿔 다시 찾아보세요.</p>${S.warnings.map((/** @type {string} */ w) => `<p class="hint">${h(w)}</p>`).join('')}<div class="row"><button class="btn" data-act="retry">다시 시도</button></div></div></div>`;
  }
  if (S.status === 'empty') {
    return `<div class="pw-list-scroll"><div class="card stack"><h2 tabindex="-1">이 주제의 실검색은 아직 연결되지 않았어요</h2><p>지금은 가상 예시 모드라 아래 반도체 예시만 볼 수 있어요. 입력하신 내용: “${h(S.input)}”</p><div class="chips">${Object.entries(EXAMPLE_TOPICS).map(([k, t]) => `<button class="chip" data-act="load-example" data-key="${k}">${h(t.name)} 예시로 보기</button>`).join('')}</div></div></div>`;
  }
  if (S.status !== 'ok') return '';

  const r = ranked(S);
  const excluded = r.excluded;
  const matched = matchedItems(S);
  const baseShown = listedItems(S);
  const shown = workspaceVisibleItems(S);
  const stale = S.selPapers.filter((/** @type {string} */ id) => excluded.some((/** @type {any} */ p) => p.id === id));
  const rf = applyRefine(S.papers, S.refine);
  const sortLine = S.sort === 'citations' ? '인용순: 인용수가 미확인인 항목은 0이 아니라 뒤로 보내요.' : S.sort === 'recent' ? '최신순: 연도가 없는 논문은 뒤로 보내요.' : '';
  const activeId = S.pDetailId && shown.some((/** @type {any} */ it) => it.paper.id === S.pDetailId)
    ? S.pDetailId
    : (shown[0]?.paper?.id ?? null);
  const cmpCount = (S.pCompareIds || []).filter((/** @type {string} */ id) => paperById(id, S)).length;
  const shownIds = shown.map((/** @type {any} */ it) => it.paper.id);
  const allShownSelected = shownIds.length > 0 && shownIds.every((/** @type {string} */ id) => S.selPapers.includes(id));

  return `<div class="pw-list-top">
      <div class="pw-list-head">
        <h2 id="pp-h" style="font-size:1.25rem">논문 목록 (${shown.length}편)</h2>
        <span class="hint" data-p-outside-count>선택된 논문 <strong>${S.selPapers.length}</strong>편 · 비교 <strong>${cmpCount}</strong>/4편${S.dataMode === 'real' ? ` · 조건 일치 ${rf.visible.length}편` : ''}</span>
      </div>
      <p class="hint">제목을 눌러 초록을 확인하고 읽을 핵심 논문을 3~5편 추려 원문을 등록하세요.</p>
      <div class="toolbar pw-list-toolbar">
        <label class="pw-inline-label">정렬 <select data-act="sort" data-fk="sort">${[['relevance', '관련성'], ['recent', '최신순'], ['citations', '인용순']].map(([v, l]) => `<option value="${v}" ${S.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <button class="btn small" type="button" data-ract="select-toggle" data-fk="p-select-toggle" ${shownIds.length ? '' : 'disabled'}>${allShownSelected ? '선택 해제' : '모두 선택'}</button>
        <button class="btn small${S.pShowSelectedOnly ? ' primary' : ''}" type="button" data-pact="toggle-selected-only" aria-pressed="${!!S.pShowSelectedOnly}" data-fk="p-selected-only">선택 논문만</button>
        <button class="btn small${S.addOpen ? ' primary' : ''}" type="button" data-act="add-toggle" aria-expanded="${S.addOpen}" aria-controls="add-form" data-fk="add-toggle">논문 직접 추가</button>
        ${S.dataMode === 'real' ? `<button class="btn small${S.pFilterOpen ? ' primary' : ''}" type="button" data-pact="filter-toggle" aria-expanded="${!!S.pFilterOpen}" data-fk="p-filter-toggle">거르기</button>` : ''}
      </div>
      ${S.pCompareMsg ? `<p class="notice pw-compare-notice" role="status">${h(S.pCompareMsg)} <button type="button" class="btn small" data-pact="dismiss-compare-msg">확인</button></p>` : ''}
    </div>
    <div class="pw-list-scroll" tabindex="0" role="region" aria-label="논문 목록 스크롤 영역">
      ${sortLine ? `<p class="hint">${sortLine}</p>` : ''}
      ${S.dataMode === 'real' && S.pFilterOpen ? workspaceRefinePanel(S) : ''}
      ${S.addOpen ? addForm(S) : ''}
      ${stale.length ? `<p class="notice" role="status">제외된 선택 논문 ${stale.length}편은 그대로 두었어요.</p>` : ''}
      ${excluded.length ? `<p class="hint">범위 조정으로 ${excluded.length}편을 제외했어요.</p>` : ''}
      ${shown.length
        ? shown.map((/** @type {any} */ it, /** @type {number} */ i) => {
            const baseIdx = baseShown.findIndex((/** @type {any} */ b) => b.paper.id === it.paper.id);
            const pNum = baseIdx >= 0 ? baseIdx + 1 : i + 1;
            return workspacePaperRow(S, it, pNum, activeId);
          }).join('')
        : `<p class="card">${S.pShowSelectedOnly ? '현재 선택된 논문이 없어요. ‘선택 논문만’을 다시 눌러 전체 목록에서 논문을 골라 주세요.' : '조건에 맞는 논문이 없어요. 거르기 조건을 줄이거나 설정·관리에서 범위를 초기화해 보세요.'}</p>`}
      ${!S.pShowSelectedOnly && S.dataMode !== 'real' && matched.length > EXAMPLE_CAP ? `<button class="btn" type="button" data-act="more" data-fk="more">${S.showAll ? '접기' : `추가 결과 펼치기 (${matched.length - EXAMPLE_CAP}편)`}</button>` : ''}
      ${S.dataMode === 'real' && S.estimatedTotal != null && S.papers.length < S.estimatedTotal ? `<button class="btn" type="button" data-act="more-remote" data-fk="more-remote">다음 50편 수집</button>` : ''}
    </div>`;
}

/** 작업 전용 거르기 패널 (검색·거르기 기록은 설정·관리로 분리). @param {any} S */
function workspaceRefinePanel(S) {
  const rf = applyRefine(S.papers, S.refine);
  const known = [...S.refine.include, ...S.refine.exclude, ...(S.researchBrief?.searchCriteria?.core || [])];
  const kws = suggestKeywords(S.papers, { known, limit: 8 });
  const top = Math.min(LIST_CAP, rf.visible.length);
  return `<section class="card stack" aria-labelledby="rf-h"><h3 id="rf-h" style="font-size:1.0625rem">목록 거르기 (선택 논문은 유지됨)</h3>
    <p class="hint">수집 ${S.papers.length}편 → 조건 일치 ${rf.visible.length}편 → 목록 최대 ${top}편 · 거르기를 적용해도 기존 선택(${S.selPapers.length}편)은 바뀌지 않아요.</p>
    <form data-rform="refine" class="stack">
      <div class="filter-grid">
        <label>포함할 단어<textarea name="include" rows="1" data-fk="rf-include" placeholder="쉼표로 구분">${h(S.refine.include.join(', '))}</textarea></label>
        <label>제외할 단어<textarea name="exclude" rows="1" data-fk="rf-exclude" placeholder="쉼표로 구분">${h(S.refine.exclude.join(', '))}</textarea></label>
        <label>연도부터<input type="text" name="yearFrom" inputmode="numeric" value="${S.refine.yearFrom ?? ''}" placeholder="2020"></label>
        <label>연도까지<input type="text" name="yearTo" inputmode="numeric" value="${S.refine.yearTo ?? ''}" placeholder="2026"></label>
      </div>
      <label class="check"><input type="checkbox" name="requireAbstract" ${S.refine.requireAbstract ? 'checked' : ''}> 초록 있는 논문만</label>
      <div class="row">
        <button class="btn primary" type="submit">적용</button>
        <button class="btn" type="button" data-ract="refine-search" ${S.refineBusy || S.dataMode !== 'real' ? 'disabled' : ''}>${S.refineBusy ? '찾는 중…' : '이 단어로 더 찾기'}</button>
        <button class="btn" type="button" data-ract="refine-clear">조건 지우기</button>
        <button class="btn small" type="button" data-pact="open-settings-tab" data-tab="scope">검색·거르기 기록 (${(S.refine.rounds || []).length})</button>
      </div>
    </form>
    <p role="status" class="hint">${h(S.refineMsg || '')}</p>
    ${kws.length ? `<div class="chips">${kws.map(k => `<button type="button" class="chip" data-ract="kw-include" data-term="${h(k.term)}">${h(k.term)} <span class="hint">${k.docCount}</span></button><button class="btn small" type="button" data-ract="kw-exclude" data-term="${h(k.term)}" aria-label="${h(k.term)} 제외">−</button>`).join('')}</div>` : ''}
  </section>`;
}

/** 목록의 개별 논문 행: 체크박스·[P#]·제목(최대 2줄, 원본 보존)·저자/연도·원문 상태·독립 비교 토글. @param {any} S @param {any} it @param {number} n @param {string|null} activeId */
function workspacePaperRow(S, { paper: p }, n, activeId) {
  const sel = S.selPapers.includes(p.id);
  const inCompare = (S.pCompareIds || []).includes(p.id);
  const user = p.origin === 'user';
  const provider = p.origin === 'provider';
  const author = provider
    ? (p.authors?.[0] ? `${p.authors[0]}${p.authors.length > 1 ? ' 외' : ''}` : '저자 미상')
    : user ? '저자 미입력' : '저자 없음(가상)';
  const yearText = `${p.year ?? '연도 미상'}${p.year != null && !user && !provider ? '(가상 값)' : ''}`;
  const got = ['extracted', 'scan_only'].includes(S.fulltext?.[p.id]?.status);
  const isCurrent = activeId === p.id;
  return `<article class="card paper paper-row pw-paper-row${got ? ' paper-got' : ''}${isCurrent ? ' is-current-paper' : ''}" data-paper-id="${h(p.id)}" aria-label="${h(p.title)}">
    <div class="pw-row-top">
      <button class="pick-btn" type="button" data-act="toggle-paper" data-id="${h(p.id)}" aria-pressed="${sel}" aria-label="${sel ? '정리 대상에 선택됨' : '정리 대상에 추가'}" data-fk="pp-${h(p.id)}"></button>
      <span class="pw-pcode">${paperRefLabel(S, p.id)}</span>
      <h3 class="pw-row-h3">
        <button type="button" class="pw-title-btn" data-pact="open-detail" data-id="${h(p.id)}" data-fk="pt-${h(p.id)}" aria-current="${isCurrent && S.pTask === 'detail' ? 'true' : 'false'}">${h(p.title)}</button>
      </h3>
    </div>
    <div class="pw-row-bottom">
      <p class="meta pw-author-year">${h(author)} · ${h(yearText)}</p>
      <div class="pw-row-actions">
        <span class="paper-end">${workspaceFtStatus(S, p)}</span>
        <button type="button" class="btn small pw-compare-btn${inCompare ? ' primary' : ''}" data-pact="toggle-compare-paper" data-id="${h(p.id)}" aria-pressed="${inCompare}" aria-label="${inCompare ? '비교 대상에서 해제' : '비교 대상에 추가'}" data-fk="pcmp-${h(p.id)}">${inCompare ? '비교 ✓' : '비교 +'}</button>
      </div>
    </div>
    ${p.relevance?.excluded ? `<div class="row"><button class="btn small" type="button" data-act="unexclude" data-id="${h(p.id)}">제외 해제</button></div>` : ''}
  </article>`;
}

/** 목록 행의 원문 상태 표시. @param {any} S @param {any} p */
function workspaceFtStatus(S, p) {
  if (p.origin === 'example') return `${exampleTag()} ${accessTag(p)}`;
  if (p.origin === 'user') return `${originTag(p)} ${accessTag(p)}`;
  if ((S.fulltextActive || []).includes(p.id)) {
    return `<span class="spin" role="img" aria-label="받는 중"></span> ${tag('info', '원문 받는 중')}`;
  }
  const st = S.fulltext?.[p.id]?.status;
  if (st === 'extracted') return `<span class="ft-mark ok" aria-label="원문 확보">✓</span> ${tag('ok', '원문 확보')}`;
  if (st === 'scan_only') return tag('warn', '스캔본 확보');
  if (st) return tag('warn', ftLabel(st));
  return `<span class="ft-mark" aria-label="원문 미시도">–</span> ${accessTag(p)}`;
}

/** 오른쪽 패널 전체 (상단 작업 탭 + 빠른 접근점 + 단일 스크롤 본문). @param {any} S */
export function workspaceWorkHtml(S) {
  const task = workspaceTaskOf(S);
  const cmpCount = (S.pCompareIds || []).filter((/** @type {string} */ id) => paperById(id, S)).length;
  const fullCompare = isFullCompareView(S);
  const busy = !!S.fulltextBusy;
  const prog = S.fulltextProgress;
  const done = prog?.done || 0;
  const total = prog?.total || S.selPapers.length || 1;
  const got = S.selPapers.filter((/** @type {string} */ id) => ['extracted', 'scan_only'].includes(S.fulltext?.[id]?.status)).length;

  let bodyHtml = '';
  if (S.status === 'corrupt' || S.status === 'missing') {
    bodyHtml = recoveryHtml(S);
  } else if (S.status !== 'ok') {
    bodyHtml = `<div class="card stack"><h2 tabindex="-1">논문을 먼저 찾아주세요</h2><p>주제를 검색하거나 예시 자료를 불러오면 연구군·읽기 순서 정리, 논문 상세, 활용 작업을 진행할 수 있어요.</p></div>`;
  } else if (task === 'detail') {
    bodyHtml = workspaceDetailHtml(S);
  } else if (task === 'utilize') {
    bodyHtml = workspaceUtilizeHtml(S);
  } else {
    bodyHtml = workspaceClusterHtml(S);
  }

  return `<div class="pw-work-top">
      <div class="pw-work-top-row">
        <div class="pw-work-nav-group">
          ${fullCompare ? `<button type="button" class="btn small pw-back-compare-btn" data-pact="exit-full-compare" data-fk="exit-full-compare">← 이전 작업·목록으로 돌아가기</button>` : ''}
          <div role="tablist" aria-label="현재 작업" class="tabs pw-work-tabs">
            <button role="tab" type="button" id="ptab-detail" class="tab" data-pact="task-tab" data-task="detail" aria-controls="ppanel-work" aria-selected="${task === 'detail'}" tabindex="${task === 'detail' ? '0' : '-1'}" data-fk="ptab-detail">논문 상세</button>
            <button role="tab" type="button" id="ptab-cluster" class="tab" data-pact="task-tab" data-task="cluster" aria-controls="ppanel-work" aria-selected="${task === 'cluster'}" tabindex="${task === 'cluster' ? '0' : '-1'}" data-fk="ptab-cluster">연구군·읽기 순서</button>
            <button role="tab" type="button" id="ptab-utilize" class="tab" data-pact="task-tab" data-task="utilize" aria-controls="ppanel-work" aria-selected="${task === 'utilize'}" tabindex="${task === 'utilize' ? '0' : '-1'}" data-fk="ptab-utilize">활용 <span id="sel-count" class="count">${cmpCount}</span></button>
          </div>
        </div>
        <div class="pw-quick-bar" role="group" aria-label="주요 작업 빠른 접근">
          <button type="button" class="btn small" data-pact="quick-prompt" data-fk="q-prompt" title="제목·초록을 AI에 전달할 프롬프트를 복사합니다. PDF는 필요하지 않습니다." ${S.selPapers.length ? '' : 'disabled'}>정리 프롬프트 복사</button>
          <button type="button" class="btn small" data-pact="quick-import" data-fk="q-import">결과 가져오기</button>
          <button type="button" class="btn small${busy ? ' primary' : ''}" data-pact="quick-fulltext" data-fk="q-fulltext">${busy ? `받기 취소 (${done}/${total})` : `선택 원문 받기 (${S.selPapers.length}편)`}</button>
          <span class="hint">1단계 · 제목·초록 포함 · PDF 불필요</span>
        </div>
      </div>
      ${busy || S.fulltextMsg || S.summaryMsg ? `<div class="pw-top-status" role="status" aria-live="polite">
        ${busy ? `<span class="spin" aria-hidden="true"></span> <progress value="${done}" max="${total}"></progress> <span>원문 받는 중 ${done}/${total} (확보 ${got} · 실패 ${prog?.fail || 0})</span>` : ''}
        ${!busy && S.fulltextMsg ? `<span>원문: ${h(S.fulltextMsg)}</span>` : ''}
        ${S.summaryMsg ? `<span>정리: ${h(S.summaryMsg)}</span>` : ''}
      </div>` : ''}
    </div>
    <div id="ppanel-work" class="pw-work-scroll" role="tabpanel" aria-labelledby="ptab-${task}" tabindex="0">
      ${bodyHtml}
    </div>`;
}

/** 오른쪽 작업 1: 논문 상세 (전체 제목·서지·초록·DOI/출처·개별 원문 작업·단일 논문 메모). @param {any} S */
export function workspaceDetailHtml(S) {
  const shown = listedItems(S);
  const targetId = S.pDetailId && S.papers.some((/** @type {any} */ x) => x.id === S.pDetailId)
    ? S.pDetailId
    : (shown[0]?.paper?.id ?? S.papers[0]?.id ?? null);
  const p = targetId ? paperById(targetId, S) : null;
  if (!p) {
    return `<div class="card stack">
      <div class="pw-mobile-only"><button type="button" class="btn small" data-pact="back-to-list">← 논문 목록으로</button></div>
      <h2 id="p-detail-title" tabindex="-1">선택한 논문이 없어요</h2>
      <p>왼쪽 목록에서 논문 제목을 누르면 해당 논문의 전체 제목, 서지, 초록 전문, 원문 받기, 메모를 여기에 표시합니다.</p>
    </div>`;
  }
  const shownIdx = shown.findIndex((/** @type {any} */ it) => it.paper.id === p.id);
  const allIdx = S.papers.findIndex((/** @type {any} */ x) => x.id === p.id);
  const pNum = shownIdx >= 0 ? shownIdx + 1 : (allIdx >= 0 ? allIdx + 1 : 1);
  const itemObj = shown[shownIdx] || ranked(S).items.find((/** @type {any} */ it) => it.paper.id === p.id) || { paper: p, reasons: ['수집 순서'] };
  const reasons = itemObj.reasons || [];
  const m = meta(S)[p.id] ?? { role: 'approach', branches: [], tags: [] };
  const sel = S.selPapers.includes(p.id);
  const inCompare = (S.pCompareIds || []).includes(p.id);
  const user = p.origin === 'user';
  const provider = p.origin === 'provider';
  const doiHref = typeof p.doi === 'string' && /^10\.\d{4,9}\/\S+$/i.test(p.doi) ? `https://doi.org/${h(p.doi)}` : '';
  const authors = provider
    ? (p.authors?.length ? p.authors.join(', ') : '저자 미상')
    : user ? '저자 미입력' : '저자 없음(가상)';
  const venue = provider ? (p.venue || '학술지 미상') : user ? '학술지 미입력' : '학술지 없음(가상)';
  const yearText = `${p.year ?? '연도 미상'}${p.year != null && !user && !provider ? ' (가상 값)' : ''}`;
  const citationsText = p.citationCount != null ? `${p.citationCount}회${p.origin === 'example' ? ' (가상 값)' : ''}` : '미확인';

  return `<div class="stack pw-detail-view">
    <section class="card stack">
      <div class="pw-detail-top">
        <div class="labels">
          <span class="pw-pcode">${paperRefLabel(S, p.id)}</span>
          ${originTag(p)}
          ${accessTag(p)}
        </div>
        <div class="row" style="margin:0">
          <button type="button" class="btn small pw-mobile-only" data-pact="back-to-list" data-fk="back-to-list">← 논문 목록으로</button>
          <button type="button" class="btn${sel ? ' primary' : ''}" data-act="toggle-paper" data-id="${h(p.id)}" aria-pressed="${sel}" data-fk="detail-toggle-${h(p.id)}">${sel ? '정리 대상에 선택됨' : '정리 대상에 추가'}</button>
          <button type="button" class="btn${inCompare ? ' primary' : ''}" data-pact="toggle-compare-paper" data-id="${h(p.id)}" aria-pressed="${inCompare}" data-fk="detail-cmp-${h(p.id)}">${inCompare ? '비교 대상에 포함됨' : '비교 대상에 추가'}</button>
          <button type="button" class="btn small" data-act="view-doc" data-id="${h(p.id)}" data-fk="doc-${h(p.id)}">문서·근거 정보</button>
        </div>
      </div>
      ${S.pCompareMsg ? `<p class="notice" role="status">${h(S.pCompareMsg)}</p>` : ''}
      <h2 id="p-detail-title" class="pw-detail-h2" tabindex="-1">${h(p.title)}</h2>
      <dl class="kv">
        <dt>저자</dt><dd>${h(authors)}</dd>
        <dt>연도</dt><dd>${h(yearText)}</dd>
        <dt>학술지</dt><dd>${h(venue)}</dd>
        <dt>인용수</dt><dd>${h(citationsText)}</dd>
        <dt>DOI</dt><dd>${doiHref ? `<a href="${doiHref}" target="_blank" rel="noopener noreferrer">${h(p.doi)}</a>` : (p.doi ? h(p.doi) : '없음')}</dd>
        <dt>출처</dt><dd>${h(p.source || '미상')}${p.link ? ` · <a href="${h(p.link)}" target="_blank" rel="noopener noreferrer">공개 주소 열기</a>` : ''}</dd>
      </dl>
      ${p.externalReview ? `<p class="hint">AI 분류: ${h(p.externalReview.judgment)}</p>` : ''}
      <p class="hint">${provider ? (p.relevance?.reasons?.length ? `규칙 정렬: ${p.relevance.reasons.slice(0, 3).map(h).join(' · ')} (검색어 일치 순서이며 AI 추천이 아닙니다.)` : '검색어 일치 순서이며 AI 추천이 아닙니다.') : `${h(ROLE_REASON[m.role])} ${reasons.map(h).join('; ')}`}</p>
    </section>

    <section class="card stack" aria-labelledby="p-ft-h">
      <h3 id="p-ft-h">개별 원문 작업</h3>
      <p class="hint">원문 사이트에서 직접 받은 PDF는 선택한 조사 폴더에 넣어 연결하거나 내 PDF 올리기로 등록할 수 있습니다.</p>
      ${provider ? fulltextLine(S, p) : `<p class="hint">${user ? '사용자가 직접 입력한 자료입니다(내용 확인 전).' : '가상 예시 문서예요. 실제 논문이 아니어서 원문 다운로드 대상이 아닙니다.'}</p>`}
    </section>

    <section class="card stack" aria-labelledby="p-abs-h">
      <h3 id="p-abs-h">초록 전문</h3>
      <p class="hint">초록을 확인해 읽을 논문인지 판단할 수 있습니다.</p>
      ${p.abstract ? `<blockquote>${h(p.abstract)}</blockquote>` : '<p class="notice">초록이 없어요(서지정보만 확보).</p>'}
      <p class="hint">초록만 확보한 자료에서는 본문 절·그림·페이지 위치를 생성하지 않습니다.</p>
    </section>

    <section class="card stack" aria-labelledby="p-note-h">
      <h3 id="p-note-h">논문 메모</h3>
      <label for="p-detail-note">${h(p.title)} 메모</label>
      <textarea id="p-detail-note" data-act="note" data-id="${h(p.id)}" data-fk="note-${h(p.id)}" rows="4" placeholder="핵심 수치, 실험 조건, 우리 연구실과의 연결점을 적어 두세요.">${h(S.notes[p.id] ?? '')}</textarea>
      <p class="hint">이 논문 한 편의 메모만 표시하며, 입력 내용은 자동 저장되어 활용·Markdown 내보내기에 반영됩니다.</p>
    </section>
  </div>`;
}

/** 오른쪽 작업 2 (기본): 연구군·읽기 순서 통합 작업 (자료 범위 + 선택적 정리 초점 + 프롬프트 확인·수정 + 결과 가져오기 + 최신 정리본 표시). @param {any} S */
export function workspaceClusterHtml(S) {
  const selPapers = selectedPapers(S);
  const sel = selPapers.length;
  let extracted = 0, scanOnly = 0, abstractOnly = 0, metaOnly = 0;
  for (const p of selPapers) {
    const st = S.fulltext?.[p.id]?.status;
    if (st === 'extracted') extracted++;
    else if (st === 'scan_only') scanOnly++;
    else if (String(p.abstract || '').trim()) abstractOnly++;
    else metaOnly++;
  }
  const missingFt = sel - extracted;
  const p = S.fulltextProgress;
  const busy = !!S.fulltextBusy;
  const done = p?.done || 0;
  const total = p?.total || sel || 1;
  const ver = S.summaries || [];
  const latest = ver.length ? ver[ver.length - 1] : null;
  const importDraft = S.pFormDrafts?.['summary-import:md'] ?? '';
  const knowledgeCount = knowledgeEntries(S).length;

  return `<div class="stack pw-cluster-view">
    ${S.dataMode === 'real' && S.queryPlan?.untranslated?.length ? `<section class="card stack"><form data-act="english-query" class="stack"><p class="notice">사전에 없는 표현: ${S.queryPlan.untranslated.map(h).join(', ')}</p><label>영문 검색어 직접 지정<input type="text" name="english" value="${h(S.queryPlan.english)}" data-fk="english-query"></label><div class="row"><button class="btn primary" type="submit">이 검색어로 다시 찾기</button></div></form></section>` : ''}

    <section class="card stack" aria-labelledby="sm-h">
      <div class="pw-section-head">
        <h2 id="sm-h" style="font-size:1.25rem" tabindex="-1">1단계 · 읽을 논문 3~5편 추천</h2>
        ${S.dataMode !== 'real' ? exampleTag() : ''}
      </div>


      <div class="stack">
        <p class="meta topic-line" title="${h(S.input || '')}">조사 주제(자동 반영) · <strong>${h(S.input || '지정 안 함')}</strong></p>
        <label class="focus-label" for="summary-focus">이번 정리에서 무엇을 알고 싶나요? (선택)</label>
        <textarea id="summary-focus" data-ract="summary-request" data-fk="summary-focus" rows="2" placeholder="비워 두어도 기본 연구군·입문 읽기 순서 지시를 만듭니다. 예: 공정 변수와 결함 관계를 다룬 방법 위주로 처음 읽을 2~3편과 이유">${h(S.summaryRequest || '')}</textarea>
      </div>

      <p class="hint">선택한 논문의 제목·초록과 조사 주제·정리 초점이 Gemini에 전송됩니다. PDF는 전송하지 않습니다. 무료 등급의 입력은 Google 제품 개선에 사용될 수 있습니다.</p>

      <div class="row">
        <button class="btn primary" type="button" data-ract="gemini-shortlist" ${sel && !S.shortlistBusy ? '' : 'disabled'}>${S.shortlistBusy ? '추천 논문을 고르는 중…' : 'Gemini로 추천 논문 고르기'}</button>
        <button class="btn" type="button" data-ract="summary-make" data-fk="summary-make" ${sel ? '' : 'disabled'}>${sel}편으로 정리 프롬프트 복사</button>
      </div>

      <details class="pw-subdetails" ${S.pPromptPreviewOpen || S.summaryPrompt ? 'open' : ''} data-pact-details="prompt-preview">
        <summary>전달 방식과 미리보기</summary>
        <div class="stack">
          ${S.summaryPrompt
            ? `<label>생성된 프롬프트 확인·수정 (자동 복사 실패 시 직접 선택해 복사)<textarea rows="6" data-ract="summary-prompt-edit" data-fk="summary-prompt-edit">${h(S.summaryPrompt)}</textarea></label>
              <div class="row"><button class="btn" type="button" data-ract="summary-copy">다시 복사</button><button class="btn" type="button" data-ract="summary-prompt-dl">지시서 .md 저장</button></div>
              <p class="hint">${S.summaryPrompt.length.toLocaleString()}자 · 생성된 지시서의 자료 범위를 확인하세요. 1단계는 초록만, 상세 정리는 아래에서 선택한 방식으로 전달합니다.</p>`
            : '<p class="hint">‘정리 프롬프트 복사’를 누르면 생성과 복사가 한 번에 실행되고 여기에 미리보기가 열립니다.</p>'}
        </div>
      </details>

      <details class="pw-subdetails" id="sm-import-details" ${!latest || S.pSummaryImportOpen || importDraft.trim() ? 'open' : ''} data-pact-details="summary-import">
        <summary id="sm-import-h" tabindex="-1">결과 가져오기 (.md 파일 또는 붙여넣기)</summary>
        <form data-rform="summary-import" class="stack">
          <p class="hint">1단계 결과는 추천 논문만 자동 선택하고 원문 확보로 이동합니다. AI 답변 전체 또는 ‘선택 논문: [P번호], [P번호]’ 줄을 붙여 넣으세요.</p>
          <label>.md 내용 붙여넣기<textarea name="md" rows="4" data-fk="summary-import-md" placeholder="AI 추천 결과 또는 선택 논문 줄을 붙여 넣으세요.">${h(importDraft)}</textarea></label>
          <label>또는 .md 파일 선택<input type="file" name="file" accept=".md,text/markdown,text/plain"></label>
          <div class="row"><button class="btn primary" type="submit" data-import-purpose="shortlist">추천 논문 선택하고 다음 단계로</button><button class="btn" type="submit" data-import-purpose="detail">선택 변경 없이 상세 정리본만 저장</button></div>
        </form>
      </details>
      <p role="status" class="pw-summary-status">${h(S.summaryMsg || '')}</p>
    </section>

    ${latest ? workspaceLatestSummaryCard(S, latest, ver.length) : `<section class="card stack" aria-labelledby="sm-latest-h">
      <div class="pw-section-head">
        <h2 id="sm-latest-h" style="font-size:1.125rem" tabindex="-1">최신 정리본</h2>
      </div>
      <p class="hint">아직 저장된 정리본이 없어요. 결과를 가져오면 여기에 최신 연구군 표와 입문 읽기 순서가 바로 표시됩니다. (실제 결과를 가져오기 전에는 임의의 예시 연구군을 만들지 않습니다.)</p>
    </section>`}
    <section class="card stack">
      <div class="pw-scope-box stack" id="bulk-h" tabindex="-1" aria-label="추천 논문 원문 확보 및 PDF 등록">
        <h2 style="font-size:1.125rem">2단계 · 추천 논문 원문 확보 및 PDF 등록</h2>
        <p class="hint">초록과 정리본으로 읽을 논문을 3~5편 추린 뒤 필요한 원문만 받거나, 직접 받은 PDF를 논문 상세 또는 선택한 폴더에서 연결하세요.</p>
        <div class="pw-scope-counts">
          <strong>정리 대상 ${sel}편</strong>
          <span aria-hidden="true">·</span>
          <span>원문 텍스트 추출 <strong>${extracted}</strong>편</span>
          ${scanOnly ? `<span aria-hidden="true">·</span><span>스캔본 PDF <strong>${scanOnly}</strong>편</span>` : ''}
          <span aria-hidden="true">·</span>
          <span>초록만 <strong>${abstractOnly}</strong>편</span>
          <span aria-hidden="true">·</span>
          <span>메타데이터만 <strong>${metaOnly}</strong>편</span>
        </div>
        ${sel === 0
          ? '<p class="notice" role="status">왼쪽 논문 목록에서 정리할 논문을 1편 이상 선택해 주세요.</p>'
          : missingFt > 0
            ? `<p class="hint">원문 텍스트가 아직 없는 ${missingFt}편은 초록·서지정보 범위로 안내됩니다. 원문이 부족해도 프롬프트 복사와 정리 진행을 막지 않아요.</p>`
            : '<p class="hint">선택한 모든 논문의 원문 텍스트가 확보되어 있습니다.</p>'}
        <p class="hint">설정·관리에서 이 PC의 저장 폴더를 선택하면 조사별 폴더에 PDF를 저장합니다. 선택하지 않으면 브라우저 다운로드를 요청합니다.</p>
        <p class="hint">새 PDF 파일은 브라우저에 보관하지 않습니다. 추출한 본문 텍스트는 조사에 저장되며, AI 첨부와 AI 독해·사용자 원문 확인은 별도입니다.</p>
        ${S.dataMode === 'real' ? `<div class="row">
          <button class="btn" type="button" data-ract="ft-bulk" data-fk="ft-bulk" ${sel || busy ? '' : 'disabled'}>${busy ? '받기 취소' : `${sel}편 원문 모두 받기`}</button>
          ${busy ? '<span class="spin" role="status" aria-label="받는 중"></span>' : ''}
        </div>
        ${busy ? `<progress value="${done}" max="${total}"></progress>` : ''}
        <p role="status" class="hint">${busy ? '받는 중 ' : ''}${p ? `${done}/${total} · 확보 ${extracted + scanOnly} · 실패 ${p.fail || 0}` : ''}${S.fulltextMsg ? ` ${h(S.fulltextMsg)}` : ''}</p>` : `<p class="hint">${exampleTag()} 가상 예시 자료(${S.papers.length}편 중 정리 대상 ${sel}편)는 초록 기준으로 동작하며 실제 원문 PDF를 다운로드하지 않아요.</p>`}
      </div>
      <p class="hint">원문 확보 후에는 논문별 문제·방법·결과·의미와 논문 간 비교를 정리해, 다른 사람에게 설명할 수 있는 자료를 만듭니다.</p>
      <p class="hint">상세 정리 프롬프트를 복사한 뒤 선택한 논문의 PDF를 사용하는 AI에 첨부하세요.</p>
      <button class="btn primary" type="button" data-ract="summary-make" data-summary-scope="fulltext" data-summary-mode="attachments" data-fk="summary-detail-make" ${sel ? '' : 'disabled'}>PDF 첨부용 상세 정리 프롬프트 복사</button>
      <section class="pw-ai-context stack" aria-labelledby="ai-context-h">
        <h3 id="ai-context-h">지식 지도 · AI와 연구 이어가기</h3>
        <p>지식 지도는 여러 논문의 연구군과 관계를 이해하며 쌓아가는 연구 맥락입니다. 프롬프트와 PDF를 <strong>같은 AI 대화</strong>에 전달한 뒤, 그 대화에서 연구군·논문·후속 질문을 이어서 탐색하세요.</p>
        <p class="hint">같은 대화에서도 AI가 이전 자료를 모두 볼 수 있는지는 서비스와 대화 길이에 따라 달라요. 확인할 수 없는 자료는 다시 전달해 주세요.</p>
        <details class="pw-subdetails" data-pact-details="knowledge-handoff" ${S.pKnowledgeHandoffOpen ? 'open' : ''}>
          <summary>새 AI 대화나 다른 모델에서 이어가려면</summary>
          <p class="hint">기존 AI 대화에 아래 요청을 붙여 넣어 ‘연구 맥락 노트’를 만드세요. AI의 답변을 복사하거나 파일로 저장해 새 대화에 전달하고, 필요한 원문 PDF도 다시 첨부하세요.</p>
          <button class="btn small" type="button" data-ract="knowledge-handoff">AI에 맥락 정리 요청 복사</button>
          <p class="hint" role="status" data-knowledge-handoff-status>${h(S.knowledgeMsg || '')}</p>
          ${S.knowledgeTransferFallback ? `<label>맥락 정리 요청 직접 복사<textarea rows="6" readonly>${h(S.knowledgeTransferFallback)}</textarea></label>` : ''}
        </details>
        <details class="pw-subdetails" data-pact-details="knowledge-backup" ${S.pKnowledgeBackupOpen ? 'open' : ''}>
          <summary>온닷에 저장한 정리 활용하기</summary>
          <p class="hint" data-knowledge-status>이 조사와 연결된 상세 정리 ${knowledgeCount}건 · 온닷에 저장된 결과만 포함됩니다.</p>
          <p class="hint">웹페이지에 가져온 상세 정리를 파일로 내보내 AI 대화에 전달할 수 있어요. 다른 조사에서 만든 온닷 파일도 불러올 수 있습니다. 같은 AI 대화에서 이어갈 때는 파일이 필수가 아닙니다.</p>
          <p class="hint" role="status">${h(S.knowledgeBackupMsg || '')}</p>
          <div class="row">
            <button class="btn small" type="button" data-ract="knowledge-download" ${knowledgeCount ? '' : 'disabled'}>저장된 정리 파일 받기</button>
            <button class="btn small" type="button" data-ract="knowledge-copy" ${knowledgeCount ? '' : 'disabled'}>저장된 정리 복사</button>
            <button class="btn small" type="button" data-ract="knowledge-pick">온닷 정리 파일 불러오기</button>
            <input type="file" data-ract="knowledge-import" aria-label="이전 지식 지도 파일" accept=".md,text/markdown,text/plain" hidden>
            ${S.knowledgeImports?.length ? '<button class="btn small" type="button" data-ract="knowledge-clear">불러온 정리 연결 해제</button>' : ''}
          </div>
        </details>
      </section>
      <details class="pw-subdetails">
        <summary>PDF를 첨부할 수 없을 때</summary>
        <p class="hint">초록과 확보된 본문 발췌를 프롬프트에 포함합니다. 논문당 본문은 최대 12,000자이며 그림·표나 뒷부분이 빠질 수 있습니다.</p>
        <button class="btn" type="button" data-ract="summary-make" data-summary-scope="fulltext" data-summary-mode="text" data-fk="summary-detail-text" ${sel ? '' : 'disabled'}>초록·본문 발췌로 프롬프트 복사</button>
      </details>

    </section>
  </div>`;
}

/** 최신 정리본 읽기/편집 분리 카드. @param {any} S @param {any} latest @param {number} totalCount */
function workspaceLatestSummaryCard(S, latest, totalCount) {
  if (latest.promptVersion === SHORTLIST_PROMPT_VERSION && S.pSummaryViewMode !== 'edit') {
    const picked = parseShortlist(latest.md, latest.paperIds, S.papers.map(p => p.id));
    return `<section class="card stack" aria-labelledby="sm-latest-h">
      <h2 id="sm-latest-h" style="font-size:1.125rem" tabindex="-1">1단계 추천 논문 ${picked.ids.length}편</h2>
      <p class="hint">${latest.provider === 'gemini-api' ? '추천 이유는 원래 결과를 저장해 확인할 수 있습니다.' : '추천 이유는 AI 대화에서 확인하세요.'} 아래 논문을 바탕으로 원문 확보를 진행할 수 있습니다. 현재 선택은 왼쪽 목록에서 조정할 수 있습니다.</p>
      <div class="row">${picked.ids.map(id => `<button type="button" class="btn small" data-pact="open-detail" data-id="${h(id)}">[P${latest.paperIds.indexOf(id) + 1}] ${h(paperById(id, S)?.title || id)}</button>`).join('')}</div>
      <div class="row"><button type="button" class="btn small" data-ract="summary-dl" data-id="${h(latest.id)}">원래 결과 .md 저장</button><button type="button" class="btn small" data-pact="open-settings-tab" data-tab="versions">저장한 정리 기록 (${totalCount}개)</button></div>
    </section>`;
  }
  const isEdit = S.pSummaryViewMode === 'edit';
  const c = latest.checks || {};
  const draftIds = (S.summaryDraftIds?.length ? S.summaryDraftIds : latest.paperIds) || [];
  return `<section class="card stack pw-latest-summary" aria-labelledby="sm-latest-h">
    <div class="pw-section-head">
      <div>
        <h2 id="sm-latest-h" style="font-size:1.25rem" tabindex="-1">${isEdit ? '불러온 정리본 편집' : `최신 정리본 (${h(latest.at.slice(0, 16).replace('T', ' '))})`}</h2>
        ${isEdit ? '<p class="meta">수정 후 새 버전으로 저장할 수 있어요.</p>' : `<p class="meta">${latest.source === 'user' ? tag('info', '사용자 수정본') : tag('info', 'AI 정리본')} · 대상 논문 ${latest.paperIds.length}편 · 출처 표시 ${c.refCount ?? 0}곳 · 표 ${c.tables ?? 0}개</p>`}
      </div>
      <div class="row" style="margin:0">
        <button type="button" class="btn small${!isEdit ? ' primary' : ''}" data-pact="summary-view-mode" data-mode="read" data-fk="sm-mode-read">읽기 표시</button>
        <button type="button" class="btn small${isEdit ? ' primary' : ''}" data-pact="summary-view-mode" data-mode="edit" data-fk="sm-mode-edit">편집하기</button>
        ${isEdit ? '' : `<button type="button" class="btn small" data-ract="summary-dl" data-id="${h(latest.id)}">.md 저장</button>
        <button type="button" class="btn small" data-ract="summary-develop" data-id="${h(latest.id)}">이 내용으로 AI에 다시 요청</button>`}
        <button type="button" class="btn small" data-pact="open-settings-tab" data-tab="versions" data-fk="sm-open-versions">저장한 정리 기록 (${totalCount}개)</button>
      </div>
    </div>
    ${isEdit
      ? `<div class="stack" data-summary-edit>
          <label>정리본 편집 (저장 시 이전 버전을 덮어쓰지 않고 새 버전으로 추가합니다)<textarea rows="10" data-ract="summary-draft" data-fk="summary-draft">${h(S.summaryDraft || latest.md)}</textarea></label>
          <div class="row">
            <button class="btn primary" type="button" data-ract="summary-save-draft">새 버전으로 저장</button>
            <button class="btn" type="button" data-ract="summary-dl" data-id="__draft">.md로 저장</button>
            <button class="btn" type="button" data-pact="summary-view-mode" data-mode="read">읽기 표시로 전환</button>
          </div>
          <p class="hint">${draftIds.map((/** @type {string} */ id, /** @type {number} */ i) => `P${i + 1}=${h(id)}`).join(' · ')}</p>
        </div>`
      : `<div class="pw-summary-read stack" data-summary-read>${renderSafeSummaryMd(S, latest)}</div>`}
  </section>`;
}

/** HTML 실행 없이 안전하게 Markdown 구조와 [P#] 논문 참조 버튼을 렌더링한다. @param {any} S @param {any} ver */
export function renderSafeSummaryMd(S, ver) {
  const raw = String(ver?.md || '');
  const paperIds = Array.isArray(ver?.paperIds) && ver.paperIds.length ? ver.paperIds : S.selPapers;

  /** @param {string} escapedLine */
  const linkifyRefs = (escapedLine) => escapedLine.replace(/\[P(\d+)([^\]]*)\]/g, (_m, numStr, rest) => {
    const idx = Number(numStr) - 1;
    const pid = paperIds[idx];
    const p = pid ? paperById(pid, S) : null;
    if (p) {
      return `<button type="button" class="pw-pref-chip" data-pact="open-detail" data-id="${h(p.id)}" title="${h(p.title)}">[P${numStr}${rest}]</button>`;
    }
    return `<span class="tag warn">[P${numStr}${rest}]</span>`;
  });

  const lines = raw.split(/\r?\n/);
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { i++; continue; }

    if (trimmed.startsWith('```')) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(h(lines[i]));
        i++;
      }
      if (i < lines.length) i++;
      blocks.push(`<pre class="pw-md-code"><code>${codeLines.join('\n')}</code></pre>`);
      continue;
    }

    if (trimmed.startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const parseCells = (/** @type {string} */ row) => row.trim().replace(/^\||\|$/g, '').split('|').map(c => linkifyRefs(h(c.trim())));
      const headers = parseCells(lines[i]);
      i += 2;
      const bodyRows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        bodyRows.push(parseCells(lines[i]));
        i++;
      }
      blocks.push(`<div class="scroll-x"><table><thead><tr>${headers.map(c => `<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>${bodyRows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      const level = Math.min(4, headingMatch[1].length + 1);
      blocks.push(`<h${level} class="pw-md-h">${linkifyRefs(h(headingMatch[2]))}</h${level}>`);
      i++;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(`<li>${linkifyRefs(h(lines[i].trim().replace(/^[-*]\s+/, '')))}</li>`);
        i++;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(`<li>${linkifyRefs(h(lines[i].trim().replace(/^\d+\.\s+/, '')))}</li>`);
        i++;
      }
      blocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    const paraLines = [];
    while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith('#') && !lines[i].trim().startsWith('```') && !lines[i].trim().startsWith('|') && !/^[-*]\s+/.test(lines[i].trim()) && !/^\d+\.\s+/.test(lines[i].trim())) {
      paraLines.push(linkifyRefs(h(lines[i].trim())));
      i++;
    }
    // 표 구분선 없는 |행, 공백 없는 #행도 소비해야 무한 루프가 되지 않는다.
    if (!paraLines.length) { paraLines.push(linkifyRefs(h(lines[i]))); i++; }
    blocks.push(`<p>${paraLines.join('<br>')}</p>`);
  }
  return blocks.join('\n') || `<p>${linkifyRefs(h(raw))}</p>`;
}

/** 오른쪽 작업 3: 활용 (하위 탭 4개 중 한 번에 하나만 표시: 논문 비교 / 발표문과 근거 / 목적별 외부 AI 도움 / 내보내기). @param {any} S */
export function workspaceUtilizeHtml(S) {
  const sub = workspaceUtilizeSubOf(S);
  const cmpPapers = workspaceComparePapers(S);
  const claims = S.selDirs.map((/** @type {string} */ id) => S.claims[id]).filter(Boolean);
  const subs = [
    ['compare', `${UTILIZE_SUB_LABEL.compare} (${cmpPapers.length}/4)`],
    ['claims', `${UTILIZE_SUB_LABEL.claims} (${claims.length})`],
    ['ai', UTILIZE_SUB_LABEL.ai],
    ['export', UTILIZE_SUB_LABEL.export],
  ];

  let contentHtml = '';
  if (sub === 'compare') contentHtml = workspaceCompareSubView(S, cmpPapers);
  else if (sub === 'claims') contentHtml = workspaceClaimsSubView(S, claims);
  else if (sub === 'ai') contentHtml = `<section class="card stack">${chatgptPanel(S)}</section>`;
  else contentHtml = workspaceExportSubView(S);

  return `<div class="stack pw-utilize-view">
    <div role="tablist" aria-label="활용 세부 작업" class="tabs pw-subtabs">
      ${subs.map(([k, label]) => `<button role="tab" type="button" id="pusub-${k}" class="tab pw-subtab" data-pact="utilize-sub" data-sub="${k}" aria-selected="${sub === k}" tabindex="${sub === k ? '0' : '-1'}" data-fk="pusub-${k}">${h(label)}</button>`).join('')}
    </div>
    <div class="pw-subview-body stack" role="tabpanel" aria-labelledby="pusub-${sub}">
      ${contentHtml}
    </div>
  </div>`;
}

/** 활용 하위 1: 논문 비교 (정리 대상과 독립된 2~4편 선택, 작업 공간 전체 폭 사용). @param {any} S @param {any[]} cmpPapers */
function workspaceCompareSubView(S, cmpPapers) {
  const baseShown = listedItems(S);
  const candidatePool = baseShown.length ? baseShown.map((/** @type {any} */ it) => it.paper) : S.papers.slice(0, 30);
  const rows = cmpPapers.length >= 2 ? buildCompareRows(cmpPapers, meta(S), S.cellEdits) : [];
  const origins = new Set(cmpPapers.map((/** @type {any} */ p) => p.origin));
  const notedCount = cmpPapers.filter((/** @type {any} */ p) => String(S.notes[p.id] ?? '').trim()).length;

  return `<section class="card stack" aria-labelledby="cmp-h">
    <div class="pw-section-head">
      <div>
        <h2 id="cmp-h" style="font-size:1.25rem" tabindex="-1">논문 비교 (${cmpPapers.length}/4편 선택)</h2>
        <p class="hint">정리 대상(${S.selPapers.length}편)과 독립된 비교 전용 선택입니다. 30편 전체가 자동으로 표에 들어가지 않으며, 직접 고른 2~4편만 나란히 비교합니다.${notedCount ? ` (비교 논문 중 메모 작성됨 ${notedCount}편)` : ''}</p>
      </div>
      <div class="row" style="margin:0">
        ${cmpPapers.length ? `<button type="button" class="btn small" data-pact="clear-compare-papers" data-fk="clear-compare">비교 선택 비우기</button>` : ''}
        <button type="button" class="btn small" data-pact="exit-full-compare" data-fk="exit-full-compare-card">← 이전 작업·목록으로 돌아가기</button>
      </div>
    </div>

    ${S.pCompareMsg ? `<p class="notice pw-compare-notice" role="status">${h(S.pCompareMsg)} <button type="button" class="btn small" data-pact="dismiss-compare-msg">확인</button></p>` : ''}
    ${origins.has('user') ? `<p class="notice">${tag('warn', ORIGIN_LABEL.user)} 비교 대상에 사용자가 직접 넣은 자료가 있어요${origins.has('example') ? '. 가상 예시와 섞여 있으니 구분해서 봐주세요' : ''}.</p>` : ''}

    <div class="pw-compare-picker stack" role="group" aria-label="비교할 논문 2~4편 선택">
      <span class="pw-picker-label">비교할 논문 고르기 (2~4편 선택 · 4편 초과 시 기존 논문을 먼저 해제 후 교체):</span>
      <div class="chips">
        ${candidatePool.slice(0, 12).map((/** @type {any} */ p, /** @type {number} */ idx) => {
          const on = (S.pCompareIds || []).includes(p.id);
          return `<button type="button" class="chip pw-cmp-chip${on ? ' is-picked' : ''}" data-pact="toggle-compare-paper" data-id="${h(p.id)}" aria-pressed="${on}" data-fk="cmp-chip-${h(p.id)}">${on ? '✓ ' : '+ '}${paperRefLabel(S, p.id)} ${h(String(p.title || p.id).slice(0, 38))}${String(p.title || '').length > 38 ? '…' : ''}</button>`;
        }).join('')}
      </div>
    </div>

    ${cmpPapers.length >= 2 && cmpPapers.length <= 4
      ? `${compareTable(S, rows)}
         <p class="hint">빈칸은 추정으로 채우지 않아요. 수치에는 단위·측정 조건·근거를 연결해야 하며, 초록만 확보한 자료는 위치를 제공하지 않아요. 단위나 조건이 다른 수치는 직접 비교하지 않아요.</p>`
      : `<div class="card pw-compare-empty" data-compare-empty>
          <p><strong>${cmpPapers.length === 0 ? '아직 비교할 논문을 고르지 않았어요.' : `현재 1편(${h(cmpPapers[0].title)})만 선택되어 있어요.`}</strong></p>
          <p class="hint">위 논문 버튼이나 왼쪽 논문 목록의 ‘비교 +’ 버튼을 눌러 <strong>2~4편</strong>을 선택하면 비교표가 표시됩니다.</p>
        </div>`}
  </section>`;
}

/** 활용 하위 2: 발표문과 근거 + 아직 확인할 사항. @param {any} S @param {any[]} claims */
function workspaceClaimsSubView(S, claims) {
  const open = claims.filter((/** @type {any} */ c) => !c.state.userConfirmed);
  const dirs = S.analysis?.directions || [];
  return `<div class="stack">
    <section class="card stack">
      <h2 style="font-size:1.25rem" tabindex="-1">발표할 문장과 근거</h2>
      <p class="notice">${tag('info', '발표 준비')} ${S.dataMode === 'real' ? '발표할 문장과 근거를 정리하세요.' : '가상 예시의 발표 문장과 근거입니다.'}</p>
      ${dirs.length ? `<div class="stack"><span class="hint">발표에 포함할 연구 방향 선택:</span><div class="chips">${dirs.map((/** @type {any} */ d) => {
        const picked = S.selDirs.includes(d.id);
        return `<button type="button" class="chip${picked ? ' is-picked' : ''}" data-act="toggle-dir" data-id="${h(d.id)}" aria-pressed="${picked}">${picked ? '✓ ' : '+ '}${h(d.title || d.question || d.id)}</button>`;
      }).join('')}</div></div>` : ''}
      ${claims.map((/** @type {any} */ c) => claimCard(S, c)).join('') || '<p class="card">선택한 연구 방향이 없어요. 위 방향 버튼을 누르거나 논문 비교와 메모로 발표 문장을 준비하세요.</p>'}
    </section>

    <section class="card stack">
      <h2 style="font-size:1.25rem">아직 확인할 사항</h2>
      <ul>${open.map((/** @type {any} */ c) => `<li>${h(c.text)} — ${claimLabels(c).join(' / ')}</li>`).join('') || '<li>미확인 문장 없음</li>'}${S.questions.map((/** @type {string} */ q) => `<li>나중에 확인: ${h(q)}</li>`).join('')}</ul>
    </section>
  </div>`;
}

/** 활용 하위 4: 내보내기. @param {any} S */
function workspaceExportSubView(S) {
  return `<section class="card stack">
    <h2 style="font-size:1.25rem" tabindex="-1">내보내기</h2>
    <p class="hint">선택한 논문(${S.selPapers.length}편)·메모·수정한 비교값·출처·자료 범위·미확인·예시 표시가 파일에도 남아요. 실제 PPT는 만들지 않아요.</p>
    <div class="row">
      <button class="btn primary" type="button" data-act="export" data-kind="summary" data-mode="copy">한 페이지 요약 복사</button>
      <button class="btn" type="button" data-act="export" data-kind="summary" data-mode="download">요약 Markdown 받기</button>
      <button class="btn" type="button" data-act="export" data-kind="guide" data-mode="copy">발표 가이드 복사</button>
      <button class="btn" type="button" data-act="export" data-kind="guide" data-mode="download">가이드 Markdown 받기</button>
    </div>
    <p id="export-status" role="status" class="hint"></p>
    <details><summary>랩미팅 피드백으로 새 버전</summary>
      <form data-act="feedback-save" class="stack"><label>피드백<select name="kind"><option value="no_equipment">장비 없음</option><option value="weak_link">기존 연구와 연결 약함</option><option value="compare_other">다른 소재 비교</option><option value="need_recent">최근 논문 보강</option><option value="free">자유 입력</option></select></label><div class="row"><button class="btn" type="submit">피드백 반영</button></div></form>
      <p class="hint">선택과 메모는 지우지 않아요. ${h(S.feedbackNote || '')}</p>
    </details>
    <div class="row"><button class="btn" type="button" data-act="print">인쇄용 요약 보기</button></div>
    ${S.exportText ? `<label>복사용 텍스트(직접 선택해 복사하세요)<textarea class="fallback" readonly id="export-fallback">${h(S.exportText)}</textarea></label>` : ''}
  </section>`;
}

/** 설정·관리 전용 화면 (#settings-section).
 * PC 연결·PDF 수신함, 우리 연구실 정보, 조사 기준·범위 조정 및 검색·거르기 기록, 이전 정리본 관리를 작업 화면에서 분리해 다룬다.
 * @param {any} S */
export function workspaceSettingsHtml(S) {
  const tab = ['inbox', 'lab', 'scope', 'versions'].includes(S.pSettingsTab) ? S.pSettingsTab : 'inbox';
  const verCount = (S.summaries || []).length;
  const roundCount = (S.refine?.rounds || []).length;
  const tabs = [
    ['inbox', 'PDF 저장 폴더'],
    ['lab', '우리 연구실 정보'],
    ['scope', `조사 기준·범위·검색 기록 (${roundCount})`],
    ['versions', `정리 기록 (${verCount})`],
  ];

  let body = '';
  if (tab === 'inbox') {
    body = `<div class="stack">
      <section class="card stack"><h3>PDF 저장 폴더</h3><p class="hint">선택한 폴더 안에 날짜와 조사 주제로 된 폴더를 만듭니다. 기존 조사 폴더는 직접 선택해 확인할 수 있습니다. Chrome 또는 Edge에서 폴더 접근을 허용해 주세요. 다시 접속하면 선택을 다시 해야 합니다.</p><div class="row"><button class="btn" type="button" data-ract="folder-select">저장 폴더 선택</button><button class="btn" type="button" data-ract="folder-scan" ${folderState.busy ? 'disabled' : ''}>${folderState.busy ? '확인 중…' : '선택한 폴더의 PDF 확인'}</button></div><p class="hint" role="status" id="folder-status">${h(folderState.projectId && folderState.projectId !== S.projectId ? '현재 조사에 사용할 폴더를 선택해 주세요.' : folderState.message)}</p>${(folderState.projectId === S.projectId ? folderState.items : []).map((/** @type {any} */ item, /** @type {number} */ i) => `<div class="card stack"><strong>${h(item.name)}</strong><span>${h(item.status)}</span>${!item.paperId && item.pages.length ? `<label>연결할 논문<select data-folder-pick="${i}"><option value="">논문 선택</option>${(S.papers || []).map((/** @type {any} */ p) => `<option value="${h(p.id)}">${h(p.title)}</option>`).join('')}</select></label><button class="btn small" type="button" data-ract="folder-link" data-index="${i}">이 논문에 연결</button>` : ''}</div>`).join('')}</section>
      <section class="card stack">
        <h3>도서관 프록시 설정</h3>
        <label>도서관 주소 앞부분<input type="text" data-ract="proxy-set" value="${h(proxyPrefix())}" placeholder="https://"></label>
        <p class="hint">입력해 두면 논문 상세의 개별 원문 작업에서 ‘도서관으로 열기’ 링크를 함께 제공합니다.</p>
      </section>
    </div>`;
  } else if (tab === 'lab') {
    body = `<div class="card stack">${labSection(S)}</div>`;
  } else if (tab === 'scope') {
    const r = S.status === 'ok' ? ranked(S) : { excluded: [], materialMiss: false };
    const def = TOPIC_DEFS[S.topicKey];
    const suggest = r.materialMiss ? suggestTopicForMaterial(S.scope.material, S.topicKey) : null;
    const rf = applyRefine(S.papers || [], S.refine);
    const rounds = S.refine?.rounds || [];
    const queries = S.researchBrief?.queries || S.chatgptPlan?.queries || [];
    body = `<div class="stack">
      <section class="card stack" aria-labelledby="scope-h">
        <h3 id="scope-h">조사 기준·범위 조정</h3>
        <p class="orig">${h(S.input || '(현재 열린 조사가 없어요)')}</p>
        ${S.dataMode === 'real' && S.queryPlan?.english ? `<p class="meta">영문 검색어 · ${h(S.queryPlan.english)}</p>` : ''}
        <p class="hint">${h(def ? def.name : '검색 결과')} ${S.papers.length}편${S.estimatedTotal != null ? ` · 추정 ${S.estimatedTotal}편` : ''}</p>
        ${r.materialMiss ? `<p class="notice" role="status">${tag('warn', '일치 없음')} 소재/대상 “${h(S.scope.material)}”와 일치하는 논문이 수집한 자료에 없어요.${suggest ? ` <button class="btn small" data-act="rebuild-topic" data-key="${suggest}" data-fk="rebuild">“${h(TOPIC_DEFS[suggest].name)}” 예시로 다시 구성(새 조사)</button>` : ''}</p>` : ''}
        ${termChips(S)}
        <div class="row">
          <button class="btn" type="button" data-act="scope-reset" data-fk="reset">우선 추천대로 볼게요 (범위 초기화)</button>
        </div>
        ${adjustForm(S)}
        ${S.dataMode === 'real' && S.warnings.length ? `<p class="hint">${h(S.warnings[0])}</p>` : S.warnings.length ? `<p>${tag('example', EXAMPLE_LABEL)}</p>` : ''}
      </section>

      <section class="card stack">
        <h3>검색 문구·거르기 기록</h3>
        ${queries.length ? `<div class="stack"><p class="meta">기록된 검색 문구 (${queries.length}개)</p><ul>${queries.map((/** @type {any} */ q) => `<li><strong>${h(q.text)}</strong> <span class="hint">${h(q.purpose || '')}</span></li>`).join('')}</ul></div>` : ''}
        ${rounds.length
          ? `<ol>${rounds.map((/** @type {any} */ rd) => `<li>${h(rd.mode === 'search' ? '더 찾기' : '거르기')} · 포함 ${h((rd.include || []).join(', ') || '없음')} · 제외 ${h((rd.exclude || []).join(', ') || '없음')}${rd.mode === 'search' ? ` · 새 논문 ${rd.added}편` : ''} · 결과 ${rd.matched ?? 0}편 <button class="btn small" type="button" data-ract="refine-reapply" data-id="${h(rd.id)}">이 조건 다시 적용</button></li>`).join('')}</ol>`
          : '<p class="hint">아직 실행한 거르기·추가 검색 기록이 없어요.</p>'}
        ${rf.hidden.length ? `<details><summary>거르기로 숨긴 논문 ${rf.hidden.length}편</summary><ul>${rf.hidden.slice(0, 30).map((/** @type {any} */ x) => `<li>${h(x.paper.title || x.paper.id)} <span class="hint">${x.reasons.map(h).join(' · ')}</span>${x.canRelease ? ` <button class="btn small" type="button" data-ract="refine-release" data-id="${h(x.paper.id)}">제외 해제</button>` : ''}</li>`).join('')}</ul></details>` : ''}
      </section>
    </div>`;
  } else {
    const ver = S.summaries || [];
    const draftIds = S.summaryDraftIds || [];
    body = `<section class="card stack">
      <h3>이 조사에서 저장한 정리 (${ver.length}개)</h3>
      <p class="hint">AI 결과를 가져오거나 정리본을 수정해 저장하면 여기에 쌓입니다. 이전 내용은 그대로 남아요.</p>
      <p class="hint">열어서 수정하거나 파일로 저장할 수 있어요. 다시 AI에 정리를 요청할 때는 프롬프트와 필요한 파일을 직접 전달합니다.</p>
      ${ver.length ? `<ol class="stack">${ver.map((/** @type {any} */ v, /** @type {number} */ idx) => `<li class="card paper-row">
        <div class="pw-section-head">
          <span><strong>${v.promptVersion === SHORTLIST_PROMPT_VERSION ? '1단계 추천' : v.source === 'user' ? '직접 수정한 정리' : v.promptVersion === SUMMARY_PROMPT_VERSION ? '상세 정리' : '이전 정리'}</strong> · ${h(v.at.slice(0, 16).replace('T', ' '))} · 기록 #${idx + 1} · 대상 논문 ${v.paperIds.length}편</span>
          <div class="row" style="margin:0">
            <button class="btn small" type="button" data-ract="summary-load" data-id="${h(v.id)}">열어서 수정</button>
            <button class="btn small" type="button" data-ract="summary-dl" data-id="${h(v.id)}">파일로 저장 (.md)</button>
            <button class="btn small" type="button" data-ract="summary-develop" data-id="${h(v.id)}">이 내용으로 AI에 다시 요청</button>
          </div>
        </div>
      </li>`).join('')}</ol>` : '<p>아직 저장한 정리본이 없어요.</p>'}
      ${S.summaryDraft ? `<div class="stack"><label>현재 불러온 정리본 초안<textarea rows="8" data-ract="summary-draft">${h(S.summaryDraft)}</textarea></label>
        <div class="row"><button class="btn primary" type="button" data-ract="summary-save-draft">새 버전으로 저장</button><button class="btn" type="button" data-ract="summary-dl" data-id="__draft">.md로 저장</button></div>
        <p class="hint">${draftIds.map((/** @type {string} */ id, /** @type {number} */ i) => `P${i + 1}=${h(id)}`).join(' · ')}</p></div>` : ''}
    </section>`;
  }

  return `<div class="pw-subpage-head">
      <h2 id="settings-title" tabindex="-1">설정·관리</h2>
      <button type="button" class="btn" data-pact="view-main" data-fk="settings-back">← 작업 화면으로 돌아가기</button>
    </div>
    <p class="hint">PDF 저장 폴더, 연구실 정보, 조사 기준과 검색 기록, 저장한 정리를 관리합니다.</p>
    <div role="tablist" aria-label="설정·관리 항목" class="tabs pw-subtabs">
      ${tabs.map(([k, label]) => `<button role="tab" type="button" id="pset-${k}" class="tab pw-subtab" data-pact="settings-tab" data-tab="${k}" aria-selected="${tab === k}" tabindex="${tab === k ? '0' : '-1'}" data-fk="pset-${k}">${h(label)}</button>`).join('')}
    </div>
    <div class="pw-settings-body stack" role="tabpanel" aria-labelledby="pset-${tab}">
      ${body}
    </div>`;
}

/** @param {any} S */
function termChips(S) {
  const all = [...S.scope.exclude.map((/** @type {string} */ t) => ['exclude', t, '제외']), ...S.scope.boost.map((/** @type {string} */ t) => ['boost', t, '더 보기']), ...S.scope.emphasis.map((/** @type {string} */ t) => ['emphasis', t, '강조'])];
  if (!all.length) return '';
  return `<div class="chips">${all.map(([k, t, l]) => `<span class="tag ok"><span class="ico" aria-hidden="true">✓</span>${l}: ${h(t)} <button class="btn small" type="button" data-act="term-remove" data-kind="${k}" data-term="${h(t)}" aria-label="${l} ${h(t)} 지우기">×</button></span>`).join('')}</div>`;
}

/** @param {any} S */
function adjustForm(S) {
  return `<form id="adjust-form" class="stack" data-act="scope-apply">
    <label>이 내용 제외 <input type="text" name="exclude" placeholder="예: 확률적 결함" data-fk="f-ex"></label>
    <label>이 내용 더 보기 <input type="text" name="boost" placeholder="예: 금속산화물" data-fk="f-bo"></label>
    <label>소재 또는 대상 수정 <input type="text" name="material" value="${h(S.scope.material)}" placeholder="예: 금속산화물" data-fk="f-ma"></label>
    <label><input type="checkbox" name="materialOnly" ${S.scope.materialOnly ? 'checked' : ''}> 소재와 일치하는 것만 보기</label>
    <label>강조할 표현 추가 <input type="text" name="emphasis" placeholder="예: LER" data-fk="f-em"></label>
    <fieldset><legend>보는 방식</legend>
      <label><input type="radio" name="focus" value="trend" ${S.scope.focus === 'trend' ? 'checked' : ''}> 연구 동향 중심</label>
      <label><input type="radio" name="focus" value="methods" ${S.scope.focus === 'methods' ? 'checked' : ''}> 방법 비교 중심</label></fieldset>
    <p class="hint">쉼표로 여러 개를 적을 수 있어요. 선택한 논문과 메모는 유지돼요.</p>
    <div class="row"><button type="submit" class="btn primary">조정 내용 반영</button></div></form>`;
}

/** @param {any} S */
function addForm(S) {
  return `<form id="add-form" class="card stack" data-act="add-paper" novalidate>
    <h3>논문 직접 추가</h3>
    <p>${tag('warn', '사용자 제공 자료 · 확인 전')} DOI가 있으면 조회하고, 없으면 입력한 내용만 저장합니다.</p>
    ${S.addError ? `<p class="error" role="alert" id="add-error">${h(S.addError)}</p>` : ''}
    <label>제목 (필수)<input type="text" name="title" required data-fk="add-title" ${S.addError ? 'aria-describedby="add-error"' : ''}></label>
    <label>연도<input type="text" name="year" inputmode="numeric" placeholder="예: 2021"></label>
    <label>DOI (선택, 형식만 확인)<input type="text" name="doi" placeholder="10.1234/abcd"></label>
    <label>초록 (선택)<textarea name="abstract" rows="3"></textarea></label>
    <label>역할<select name="role"><option value="approach">주요 접근 연구</option><option value="review">입문 리뷰</option><option value="recent">최근 변화·한계</option></select></label>
    <label>태그 (쉼표 구분, 선택)<input type="text" name="tags" placeholder="예: 공정"></label>
    <div class="row"><button type="submit" class="btn primary">추가</button><button type="button" class="btn" data-act="add-toggle">취소</button></div></form>`;
}

/** @param {any} S @param {any[]} rows */
function compareTable(S, rows) {
  const head = rows.map(r => `<th scope="col"><button type="button" class="pw-th-link" data-pact="open-detail" data-id="${h(r.paper.id)}">${h(r.paper.title)}</button><br>${originTag(r.paper)} <button type="button" class="btn small" data-pact="toggle-compare-paper" data-id="${h(r.paper.id)}" aria-label="${h(r.paper.title)} 비교 해제">비교 해제</button></th>`).join('');
  const body = COMPARE_ITEMS.map((/** @type {string} */ item) => {
    const warn = rowCompareWarning(rows, item);
    return `<tr><th scope="row">${item}${warn ? `<br><span class="tag warn"><span class="ico" aria-hidden="true">!</span>직접 비교 제한</span> <span class="hint">${h(warn)}</span>` : ''}</th>${rows.map(r => cellHtml(S, r.paper, item, r.cells[item])).join('')}</tr>`;
  }).join('');
  return `<div class="scroll-x" tabindex="0" role="region" aria-label="논문 비교 표(가로 스크롤)"><table><thead><tr><th scope="col">항목</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/** @param {any} S @param {any} paper @param {string} item @param {any} c */
function cellHtml(S, paper, item, c) {
  const pid = paper.id;
  if (S.editCell && S.editCell.pid === pid && S.editCell.item === item) {
    const evs = Object.values(S.claims).flatMap((/** @type {any} */ cl) => cl.evidence).filter((/** @type {any} */ e) => e.paperId === pid);
    return `<td><form data-act="cell-save" class="stack" novalidate>
      <label>${h(item)} 값<input type="text" name="value" value="${h(c.value ?? '')}" data-fk="cell-input"></label>
      <label>단위<input type="text" name="unit" value="${h(c.unit ?? '')}"></label>
      <label>측정 조건<input type="text" name="condition" value="${h(c.condition ?? '')}"></label>
      <label>근거<select name="evidenceId"><option value="">연결 안 함</option>${evs.map((/** @type {any} */ e) => `<option value="${h(e.id)}" ${c.evidenceId === e.id ? 'selected' : ''}>${h(e.id)}</option>`).join('')}</select></label>
      <label>값을 비울 때의 사유<select name="emptyReason"><option value="">(값을 채우면 선택 안 해도 돼요)</option>${EMPTY_REASONS.map(k => `<option value="${k}" ${c.emptyReason === k ? 'selected' : ''}>${EMPTY_LABEL[k]}</option>`).join('')}</select></label>
      ${S.editError ? `<p class="error" role="alert">${h(S.editError)}</p>` : ''}
      <div class="row"><button class="btn small primary" type="submit">저장</button><button class="btn small" type="button" data-act="cell-cancel">취소</button></div></form></td>`;
  }
  const val = c.value ? `${h(c.value)}${c.unit ? ' ' + h(c.unit) : ''}${c.condition ? `<br><span class="hint">조건: ${h(c.condition)}</span>` : ''}` : `<span class="empty-cell">${EMPTY_LABEL[c.emptyReason] ?? '빈 값'}</span>`;
  const flags = c.flags.length ? `<br>${tag('warn', '확인 필요: ' + c.flags.join(', '))}` : '';
  const hist = c.edited ? `<br><span class="hint">사용자 수정 ${c.edits.length}건 · 원래 값: ${c.original.value ? h(c.original.value) : EMPTY_LABEL[c.original.emptyReason]}</span>` : '';
  return `<td>${val}${flags}${hist}<br><button class="btn small" data-act="cell-edit" data-pid="${h(pid)}" data-item="${item}" aria-label="${h(item)} 수정" data-fk="ce-${pid}-${item}">수정</button></td>`;
}

/** @param {any} S @param {any} c */
function claimCard(S, c) {
  const q = S.qClaim === c.id ? nextQuestion(c, !!S.lab) : null;
  const dir = S.dirSnap[c.directionId];
  const cands = S.qPick === c.id ? candidateEvidencePapers(c, dir, selectedPapers(S)) : [];
  return `<article class="card claim" aria-label="발표 문장">
    <div class="labels">${claimLabels(c).map((/** @type {string} */ l) => tag(l === '추가 확인 필요' || l === '미확인' ? 'warn' : 'ok', l)).join('')}${exampleTag()}</div>
    <label>말하려는 내용<textarea data-act="claim-text" data-id="${c.id}" data-fk="ct-${c.id}">${h(c.text)}</textarea></label>
    <label>적용 조건<input type="text" data-act="claim-cond" data-id="${c.id}" value="${h(c.condition)}" data-fk="cc-${c.id}"></label>
    <label>내 해석<input type="text" data-act="claim-interp" data-id="${c.id}" value="${h(c.interpretation)}" data-fk="ci-${c.id}"></label>
    <p class="hint">연결된 근거 ${c.evidenceIds.length}건${c.history.length ? ` · 문장 수정 ${c.history.length}회(이전 문장 보존)` : ''}</p>
    <div class="row"><button class="btn" type="button" data-act="claim-ev" data-id="${c.id}" data-fk="ev-${c.id}">근거 보기</button>
    <button class="btn" type="button" data-act="claim-recheck" data-id="${c.id}" data-fk="rc-${c.id}">근거 다시 확인</button>
    <button class="btn" type="button" data-act="claim-confirm" data-id="${c.id}" data-fk="cf-${c.id}">내가 확인했어요</button>
    <button class="btn" type="button" data-act="claim-q" data-id="${c.id}" data-fk="cq-${c.id}">근거 함께 살펴보기</button></div>
    ${S.qClaim === c.id ? (q ? `<div class="q-box" role="group" aria-label="확인 질문"><p><strong>${h(q.text)}</strong></p><div class="row">
      <button class="btn small" type="button" data-act="q-act" data-kind="revise" data-id="${c.id}">주장 범위 수정</button>
      <button class="btn small" type="button" data-act="q-act" data-kind="evidence" data-id="${c.id}" data-fk="qe-${c.id}">근거 추가</button>
      <button class="btn small" type="button" data-act="q-act" data-kind="ask" data-id="${c.id}">나중에 확인할 질문으로 남기기</button>
      <button class="btn small" type="button" data-act="q-act" data-kind="unknown" data-id="${c.id}">모르겠어요 / 원문에서 못 찾았어요</button></div>
      ${S.qMsg ? `<p class="notice" role="status">${h(S.qMsg)}</p>` : ''}
      ${S.qPick === c.id && cands.length ? `<div role="group" aria-label="추가할 근거 고르기"><p class="hint">추가할 논문을 고르세요(초록 기준 근거, 위치 없음).</p>${cands.map((/** @type {any} */ p) => `<button class="btn small" type="button" data-act="ev-pick" data-id="${c.id}" data-pid="${h(p.id)}">${h(p.title)} ${accessTag(p)}</button>`).join(' ')}</div>` : ''}</div>`
      : '<p class="q-box">지금 더 물어볼 질문이 없어요. 그래도 원문 확인은 필요해요.</p>') : ''}</article>`;
}

/** 현재 전달 묶음의 참조 번호. 정렬 행 번호와 구분한다. @param {any} S @param {string} id */
export function paperRefLabel(S, id) {
  const ids = S.summaryCtx?.paperIds?.length ? S.summaryCtx.paperIds : S.selPapers;
  const i = (ids || []).indexOf(id);
  return i >= 0 ? `[P${i + 1}]` : '';
}
