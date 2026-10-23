// 탐색 화면.
import { h, tag, originTag } from './common.js';
import { EXAMPLE_TOPICS, EXAMPLE_LABEL } from '../data/examples.js';
import { TOPIC_DEFS, ROLE_REASON } from '../data/content.js';
import { suggestTopicForMaterial } from '../logic.js';
import { meta, ranked } from '../state/store.js';
import { recoveryHtml } from './saved.js';
import { refinePanel, selectBar, summarySection, fulltextLine, chatgptPanel, bulkBar, inboxPanel, ftLabel } from './research.js';
import { listedItems, matchedItems, EXAMPLE_CAP } from '../research/list.js';

/** @param {any} S */
export function exploreHtml(S) {
  if (S.status === 'corrupt' || S.status === 'missing') return recoveryHtml(S);
  if (S.status === 'loading') return `<p role="status">${S.forceExample || S.dataMode !== 'real' ? '예시 자료를 불러오는 중…' : 'OpenAlex·Crossref에서 논문 검색 중…'}</p>`;
  if (S.status === 'error') return `<div class="card"><h2 tabindex="-1">불러오지 못했어요</h2><p>${h(S.searchError || '논문을 불러오지 못했어요. 다시 시도해 주세요.')}</p><p>${S.dataMode === 'real' ? '실검색 실패를 예시 결과로 바꾸지 않았어요.' : '예시 공급자 오류입니다. 실제 검색으로 대체하지 않습니다.'}</p><button class="btn" data-act="retry">다시 시도</button></div>`;
  if (S.status === 'empty' && S.dataMode === 'real') return `<div class="card stack"><h2 tabindex="-1">검색 결과가 없어요</h2><p>“${h(S.queryPlan?.english || S.input)}”로 찾은 논문이 없어요. 검색어를 바꿔 다시 찾아보세요.</p>${S.warnings.map(w => `<p class="hint">${h(w)}</p>`).join('')}<button class="btn" data-act="retry">다시 시도</button></div>`;
  if (S.status === 'empty') return `<div class="card stack"><h2 tabindex="-1">이 주제의 실검색은 아직 연결되지 않았어요</h2><p>지금은 가상 예시 모드라 아래 반도체 예시만 볼 수 있어요. 입력하신 내용: “${h(S.input)}”</p><div class="chips">${Object.entries(EXAMPLE_TOPICS).map(([k, t]) => `<button class="chip" data-act="load-example" data-key="${k}">${h(t.name)} 예시로 보기</button>`).join('')}</div></div>`;
  if (S.status !== 'ok') return '';
  const r = ranked(S), excluded = r.excluded, def = TOPIC_DEFS[S.topicKey];
  const matched = matchedItems(S);
  const shown = listedItems(S);
  const stale = S.selPapers.filter((/** @type {string} */ id) => excluded.some((/** @type {any} */ p) => p.id === id));
  const suggest = r.materialMiss ? suggestTopicForMaterial(S.scope.material, S.topicKey) : null;
  const userCount = S.papers.filter((/** @type {any} */ p) => p.origin === 'user').length;
  const got = S.selPapers.filter((/** @type {string} */ id) => ['extracted', 'scan_only'].includes(S.fulltext?.[id]?.status)).length;
  const sortLine = S.sort === 'citations' ? '인용순: 인용수가 미확인인 항목은 0이 아니라 뒤로 보내요.' : S.sort === 'recent' ? '최신순: 연도가 없는 논문은 뒤로 보내요.' : '';
  return `<div class="explore">
    <section class="card area-scope stack" aria-labelledby="scope-h">
      <h2 id="scope-h" tabindex="-1">이런 내용을 중심으로 찾아봤어요</h2>
      <p class="orig">${h(S.input)}</p>
      ${S.dataMode === 'real' && S.queryPlan?.english ? `<p class="meta">영문 검색어 · ${h(S.queryPlan.english)}</p>` : ''}
      ${S.dataMode === 'real' && S.queryPlan?.untranslated?.length ? `<form data-act="english-query" class="stack"><p class="notice">사전에 없는 표현: ${S.queryPlan.untranslated.map(h).join(', ')}</p><label>영문 검색어<input type="text" name="english" value="${h(S.queryPlan.english)}" data-fk="english-query"></label><button class="btn" type="submit">이 검색어로 다시 찾기</button></form>` : ''}
      <ul class="scope-list">
        <li>${h(def ? def.name : '검색 결과')} ${S.papers.length}편${userCount ? `(사용자 추가 ${userCount}편)` : (S.dataMode === 'real' ? '' : '(가상 예시)')}${S.estimatedTotal != null ? ` · 추정 ${S.estimatedTotal}편` : ''}</li>
        ${S.scope.material ? `<li>소재/대상: ${h(S.scope.material)}${S.scope.materialOnly && !r.materialMiss ? ' — 일치하는 논문만 보는 중' : ''}</li>` : ''}
      </ul>
      ${r.materialMiss ? `<p class="notice" role="status">${tag('warn', '일치 없음')} 소재/대상 “${h(S.scope.material)}”와 일치하는 논문이 수집한 자료에 없어요. 순서에는 반영하지 못했고 전체를 그대로 보여줘요.${suggest ? ` <button class="btn small" data-act="rebuild-topic" data-key="${suggest}" data-fk="rebuild">“${h(TOPIC_DEFS[suggest].name)}” 예시로 다시 구성(새 조사)</button>` : ''}</p>` : ''}
      ${termChips(S)}
      <div class="row"><button class="btn" data-act="adjust-toggle" aria-expanded="${S.adjustOpen}" aria-controls="adjust-form" data-fk="adjust">조정하기</button>
      <button class="btn" data-act="scope-reset" data-fk="reset">우선 추천대로 볼게요</button></div>
      ${S.adjustOpen ? adjustForm(S) : ''}
      ${S.dataMode === 'real' && S.warnings.length ? `<p class="hint">${h(S.warnings[0])}</p>` : S.warnings.length ? `<p>${tag('example', EXAMPLE_LABEL)}</p>` : ''}
    </section>
    ${S.dataMode === 'real' ? refinePanel(S) : ''}
    <section aria-labelledby="pp-h" class="stack area-main">
      <div class="toolbar"><h2 id="pp-h" style="font-size:1.25rem">2. 논문 ${shown.length}편</h2>
        <label>정렬 <select data-act="sort" data-fk="sort">${[['relevance', '관련성'], ['recent', '최신순'], ['citations', '인용순']].map(([v, l]) => `<option value="${v}" ${S.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        ${selectBar(S)}
        <button class="btn" data-act="add-toggle" aria-expanded="${S.addOpen}" aria-controls="add-form" data-fk="add-toggle">${S.addOpen ? '닫기' : '논문 직접 추가'}</button></div>
      ${sortLine ? `<p class="hint">${sortLine}</p>` : ''}
      ${S.addOpen ? addForm(S) : ''}
      ${stale.length ? `<p class="notice" role="status">제외된 선택 논문 ${stale.length}편은 그대로 두었어요.</p>` : ''}
      ${excluded.length ? `<p class="hint">범위 조정으로 ${excluded.length}편을 제외했어요.</p>` : ''}
      ${shown.length ? shown.map((/** @type {any} */ it, /** @type {number} */ i) => paperCard(S, it, i + 1)).join('') : '<p class="card">조건에 맞는 논문이 없어요. 제외 조건을 줄이거나 “우선 추천대로 볼게요”를 눌러보세요.</p>'}
      ${S.dataMode !== 'real' && matched.length > EXAMPLE_CAP ? `<button class="btn" data-act="more" data-fk="more">${S.showAll ? '접기' : `추가 결과 펼치기 (${matched.length - EXAMPLE_CAP}편)`}</button>` : ''}
    </section>
    ${bulkBar(S)}
    ${inboxPanel(S)}
    ${summarySection(S)}
    ${S.dataMode === 'real' ? `<details class="card"><summary>ChatGPT 다른 도움 (선택)</summary>${chatgptPanel(S)}</details>` : ''}
    <div class="sel-bar"><span role="status">선택 ${S.selPapers.length}편${S.dataMode === 'real' ? ` · 원문 ${got}/${S.selPapers.length}` : ''}</span>
      <button class="btn primary" data-act="goto-prepare" data-fk="goto-prepare">선택한 자료로 랩미팅 준비</button></div>
  </div>`;
}

/** 검색창 바로 아래에 두는 연구실 정보. @param {any} S */
export function labSection(S) {
  return `<h2 id="lab-h" style="font-size:1.125rem">우리 연구실 정보</h2>
    <p class="hint">${S.lab ? '입력한 연구실 정보를 이 조사에 저장했습니다.' : '비워 두면 연구실 맞춤은 표시하지 않습니다.'}</p>
    <button class="btn" data-act="lab-toggle" aria-expanded="${S.labOpen}" data-fk="lab-toggle">${S.labOpen ? '닫기' : '연구실 정보 입력'}</button>
    ${S.labOpen ? labForm(S) : ''}`;
}

/** @param {any} S */
function termChips(S) {
  const all = [...S.scope.exclude.map((/** @type {string} */ t) => ['exclude', t, '제외']), ...S.scope.boost.map((/** @type {string} */ t) => ['boost', t, '더 보기']), ...S.scope.emphasis.map((/** @type {string} */ t) => ['emphasis', t, '강조'])];
  if (!all.length) return '';
  return `<div class="chips">${all.map(([k, t, l]) => `<span class="tag ok"><span class="ico" aria-hidden="true">✓</span>${l}: ${h(t)} <button class="btn small" data-act="term-remove" data-kind="${k}" data-term="${h(t)}" aria-label="${l} ${h(t)} 지우기">×</button></span>`).join('')}</div>`;
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
function labForm(S) {
  const L = S.lab ?? {};
  const f = (/** @type {string} */ n, /** @type {string} */ l, /** @type {string} */ ph) => `<label>${l}<input type="text" name="${n}" value="${h(L[n] ?? '')}" placeholder="${ph}"></label>`;
  return `<form class="stack" data-act="lab-save">
    <p class="hint">모르는 항목은 비워도 됩니다. 이 브라우저에만 저장됩니다.</p>
    ${f('papers', '기존 논문 2~5편 (제목, 직접 입력)', '제목을 쉼표로 구분')}${f('materials', '연구 대상·재료', '예: 금속산화물, 박막')}${f('processes', '공정', '예: 스핀 코팅')}${f('equipment', '장비 (연구실이 보유한 것만)', '예: 스핀 코터')}${f('measures', '측정 가능 항목', '예: 막 두께')}${f('goal', '이어서 발전시키고 싶은 결과', '')}${f('constraints', '알려진 제약', '')}
    <div class="row"><button class="btn primary" type="submit">저장</button><button type="button" class="btn" data-act="lab-example">예시 연구실 불러오기</button><button type="button" class="btn" data-act="lab-clear">지우기</button></div>
    </form>`;
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

/** @param {any} S @param {any} p */
function ftMark(S, p) {
  if (S.dataMode !== 'real' || p.origin === 'user') return '';
  if ((S.fulltextActive || []).includes(p.id)) return '<span class="spin" role="img" aria-label="받는 중"></span>';
  const st = S.fulltext?.[p.id]?.status;
  if (st === 'extracted' || st === 'scan_only') return '<span class="ft-mark ok" aria-label="원문 확보">✓</span>';
  if (st) return `<span class="ft-mark warn" aria-label="${h(ftLabel(st))}">!</span>`;
  return '<span class="ft-mark" aria-label="원문 미시도">–</span>';
}

/** @param {any} S @param {any} it @param {number} n */
function paperCard(S, { paper: p, reasons }, n) {
  const m = meta(S)[p.id] ?? { role: 'approach', branches: [], tags: [] };
  const sel = S.selPapers.includes(p.id), user = p.origin === 'user', provider = p.origin === 'provider';
  const doiHref = typeof p.doi === 'string' && /^10\.\d{4,9}\/\S+$/i.test(p.doi) ? `https://doi.org/${h(p.doi)}` : '';
  const author = provider ? (p.authors?.[0] ? `${p.authors[0]}${p.authors.length > 1 ? ' 외' : ''}` : '저자 미상') : user ? '저자 미입력' : '저자 없음(가상)';
  const venue = provider ? (p.venue || '학술지 미상') : user ? '학술지 미입력' : '학술지 없음(가상)';
  const trust = user || p.origin === 'example' ? originTag(p) : '';
  const got = ['extracted', 'scan_only'].includes(S.fulltext?.[p.id]?.status);
  return `<article class="card paper paper-row${got ? ' paper-got' : ''}" aria-label="${h(p.title)}">
    <div class="paper-line">
      <button class="pick-btn" type="button" data-act="toggle-paper" data-id="${p.id}" aria-pressed="${sel}" aria-label="${sel ? '준비 자료에 추가됨' : '준비 자료에 추가'}" data-fk="pp-${p.id}"></button>
      <span class="num">${n}.</span>
      <h3>${h(p.title)}</h3>
      <span class="paper-end">${trust}${ftMark(S, p)}</span>
      <p class="meta" title="${h(author)} · ${p.year ?? '연도 미상'} · ${h(venue)}">${h(author)} · ${p.year ?? '연도 미상'}${p.year != null && !user && !provider ? '(가상 값)' : ''} · ${h(venue)}</p>
    </div>
    ${p.externalReview ? `<p class="notice">${tag('warn', '정확성 미검증')} ${h(p.externalReview.judgment)}</p>` : ''}
    ${p.relevance?.excluded ? `<button class="btn small" data-act="unexclude" data-id="${p.id}">제외 해제</button>` : ''}
    <details class="paper-more"><summary>자세히</summary>
      ${provider ? fulltextLine(S, p) : ''}
      <button class="btn" data-act="view-doc" data-id="${p.id}" data-fk="doc-${p.id}">${provider ? '초록 보기' : user ? '입력 내용 보기' : '예시 문서 보기'}</button>
      ${doiHref ? `<p class="meta">DOI: <a href="${doiHref}" target="_blank" rel="noopener noreferrer">${h(p.doi)}</a></p>` : ''}
      ${p.link ? `<p class="meta"><a href="${h(p.link)}" target="_blank" rel="noopener noreferrer">공개 주소 보기</a></p>` : ''}
      ${provider && p.source ? `<p class="meta">출처: ${h(p.source)}</p>` : ''}
      ${p.relevance?.reasons?.length ? `<p class="hint">규칙 정렬: ${p.relevance.reasons.slice(0, 2).map(h).join(' · ')}</p>` : ''}
      <p class="hint">${provider ? '검색어 일치 순서이며 AI 추천이 아닙니다.' : h(ROLE_REASON[m.role])} ${reasons.map(h).join('; ')}</p>
    </details>
  </article>`;
}
