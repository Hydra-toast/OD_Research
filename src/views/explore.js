// 탐색 화면.
import { h, tag, accessTag, originTag } from './common.js';
import { directionsHtml } from './directions.js';
import { EXAMPLE_TOPICS, EXAMPLE_LABEL } from '../data/examples.js';
import { TOPIC_DEFS, ROLE_LABEL, ROLE_REASON } from '../data/content.js';
import { suggestTopicForMaterial } from '../logic.js';
import { meta, ranked } from '../state/store.js';
import { recoveryHtml } from './saved.js';
import { refinePanel, selectBar, summarySection, fulltextLine } from './research.js';
import { applyRefine } from '../research/refine.js';

const VISIBLE_DEFAULT = 5;

/** @param {any} S */
export function exploreHtml(S) {
  if (S.status === 'corrupt' || S.status === 'missing') return recoveryHtml(S);
  if (S.status === 'loading') return `<p role="status">${S.forceExample || S.dataMode !== 'real' ? '예시 자료를 불러오는 중…' : 'OpenAlex·Crossref에서 논문 검색 중…'}</p>`;
  if (S.status === 'error') return `<div class="card"><h2 tabindex="-1">불러오지 못했어요</h2><p>${h(S.searchError || '논문을 불러오지 못했어요. 다시 시도해 주세요.')}</p><p>${S.dataMode === 'real' ? '실검색 실패를 예시 결과로 바꾸지 않았어요.' : '예시 공급자 오류입니다. 실제 검색으로 대체하지 않습니다.'}</p><button class="btn" data-act="retry">다시 시도</button></div>`;
  if (S.status === 'empty' && S.dataMode === 'real') return `<div class="card stack"><h2 tabindex="-1">검색 결과가 없어요</h2><p>“${h(S.queryPlan?.english || S.input)}”로 찾은 논문이 없어요. 검색어를 바꿔 다시 찾아보세요.</p>${S.warnings.map(w => `<p class="hint">${h(w)}</p>`).join('')}<button class="btn" data-act="retry">다시 시도</button></div>`;
  if (S.status === 'empty') return `<div class="card stack"><h2 tabindex="-1">이 주제의 실검색은 아직 연결되지 않았어요</h2><p>지금은 가상 예시 모드라 아래 반도체 예시만 볼 수 있어요. 입력하신 내용: “${h(S.input)}”</p><div class="chips">${Object.entries(EXAMPLE_TOPICS).map(([k, t]) => `<button class="chip" data-act="load-example" data-key="${k}">${h(t.name)} 예시로 보기</button>`).join('')}</div></div>`;
  if (S.status !== 'ok') return '';
  const m = meta(S), r = ranked(S), items = r.items, excluded = r.excluded, def = TOPIC_DEFS[S.topicKey];
  const inBranch = (/** @type {any} */ it) => !S.branch || m[it.paper.id]?.branches.includes(S.branch);
  const refineOk = new Set(applyRefine(S.papers, S.refine).visible.map((/** @type {any} */ p) => p.id));
  const list = items.filter(inBranch).filter((/** @type {any} */ it) => refineOk.has(it.paper.id));
  const visibleCap = S.dataMode === 'real' ? 50 : VISIBLE_DEFAULT;
  const shown = S.showAll ? list : list.slice(0, visibleCap);
  const stale = S.selPapers.filter((/** @type {string} */ id) => excluded.some((/** @type {any} */ p) => p.id === id));
  const suggest = r.materialMiss ? suggestTopicForMaterial(S.scope.material, S.topicKey) : null;
  const userCount = S.papers.filter((/** @type {any} */ p) => p.origin === 'user').length;
  return `<div class="explore">
    <section class="card area-scope stack" aria-labelledby="scope-h">
      <h2 id="scope-h" tabindex="-1">이런 내용을 중심으로 찾아봤어요</h2>
      <p class="orig"><span class="hint">내가 적은 내용</span><br>${h(S.input)}</p>
      ${S.queryPlan ? `<p><span class="hint">영문 검색어</span><br>${h(S.queryPlan.english || '사전에 해당하는 영문이 없어요')}</p>${S.queryPlan.untranslated?.length ? `<form data-act="english-query" class="stack"><p class="notice">사전에 없는 표현은 번역하지 않았어요: ${S.queryPlan.untranslated.map(h).join(', ')}</p><label>영문 검색어 직접 수정<input name="english" value="${h(S.queryPlan.english)}" data-fk="english-query"></label><button class="btn" type="submit">이 검색어로 다시 찾기</button></form>` : ''}` : ''}
      ${S.cached ? `<p class="hint">캐시된 결과예요. 수집 시점 ${h(S.collectedAt)}. 방금 검색한 최신 결과가 아니에요.</p>` : ''}
      <ul class="scope-list">
        <li>${h(def ? def.name : '검색 결과')} 관련 자료 ${S.papers.length}편${userCount ? `(사용자 추가 ${userCount}편 포함)` : (S.dataMode === 'real' ? '' : '(가상 예시)')}${S.estimatedTotal != null ? ` · 전체 추정 ${S.estimatedTotal}편` : ''} · 현재 ${items.length}편 표시</li>
        ${S.scope.material ? `<li>소재/대상: ${h(S.scope.material)}${S.scope.materialOnly && !r.materialMiss ? ' — 일치하는 논문만 보는 중' : ''}</li>` : ''}
        <li>${S.scope.focus === 'methods' ? '방법 비교 중심' : '연구 동향 중심'}</li>
      </ul>
      ${r.materialMiss ? `<p class="notice" role="status">${tag('warn', '일치 없음')} 소재/대상 “${h(S.scope.material)}”와 일치하는 논문이 수집한 자료에 없어요. 순서에는 반영하지 못했고 전체를 그대로 보여줘요.${suggest ? ` <button class="btn small" data-act="rebuild-topic" data-key="${suggest}" data-fk="rebuild">“${h(TOPIC_DEFS[suggest].name)}” 예시로 다시 구성(새 조사)</button>` : ''}</p>` : ''}
      <p class="hint">입력에서 정리한 조사 범위예요. 의도를 단정하지 않았어요.</p>
      ${termChips(S)}
      <div class="row"><button class="btn" data-act="adjust-toggle" aria-expanded="${S.adjustOpen}" aria-controls="adjust-form" data-fk="adjust">조정하기</button>
      <button class="btn" data-act="scope-reset" data-fk="reset">잘 모르겠어요. 우선 추천대로 볼게요</button></div>
      ${S.adjustOpen ? adjustForm(S) : ''}
      ${S.dataMode === 'real' ? S.warnings.map(w => `<p class="hint">${h(w)}</p>`).join('') : S.warnings.length ? `<p>${tag('example', EXAMPLE_LABEL)}</p>` : ''}
    </section>
    ${def ? `<section class="card area-branches" aria-labelledby="br-h">
      <h2 id="br-h" style="font-size:1.125rem">연구 갈래</h2>
      <p class="hint">수집한 자료 기준의 분류이며 분야 전체의 완전한 지도가 아니에요. 한 논문이 여러 갈래에 속할 수 있어요.</p>
      <button class="branch-btn" data-act="branch" data-id="" aria-pressed="${!S.branch}" data-fk="br-all">전체 (${items.length}편)</button>
      ${def.branches.map((/** @type {any} */ b) => { const n = items.filter((/** @type {any} */ it) => m[it.paper.id]?.branches.includes(b.id)).length;
        return `<button class="branch-btn" data-act="branch" data-id="${b.id}" aria-pressed="${S.branch === b.id}" data-fk="br-${b.id}"><strong>${h(b.label)}</strong> · ${n}편<br><span class="hint">${h(b.desc)}</span></button>`; }).join('')}
    </section>` : `<section class="card area-branches" aria-labelledby="br-h"><h2 id="br-h" style="font-size:1.125rem">연구 갈래</h2><p class="hint">실검색 결과는 예시 갈래로 나누지 않아요. 논문 목록으로 보세요.</p></section>`}
    <div class="area-main">
      ${directionsHtml(S)}
      <section aria-labelledby="pp-h" class="stack">
        <div class="toolbar"><h2 id="pp-h" style="font-size:1.25rem">먼저 읽을 논문 <span class="count">${list.length}</span></h2>
          <label>정렬 <select data-act="sort" data-fk="sort">${[['relevance', '관련성'], ['recent', '최신순'], ['citations', '인용순']].map(([v, l]) => `<option value="${v}" ${S.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <button class="btn" data-act="add-toggle" aria-expanded="${S.addOpen}" aria-controls="add-form" data-fk="add-toggle">${S.addOpen ? '논문 추가 닫기' : '논문 직접 추가'}</button></div>
        <p class="hint">${S.sort === 'relevance' ? '관련성: 아래 각 카드에 순서 근거를 적었어요.' : S.sort === 'recent' ? '최신순: 연도 값이 있는 순서. 연도 없는 항목은 뒤에 둬요.' : '인용순: 인용수가 확인된 항목만 앞에 둬요. 인용수가 미확인인 항목은 0이 아니라 뒤로 보내요. 인용수는 논문 품질 순위가 아니에요.'}</p>
        ${S.dataMode === 'real' ? refinePanel(S, items.length, list.length) : ''}
        ${selectBar(S, list.length)}
        ${S.dataMode === 'real' ? reviewBox(S) : ''}
        ${S.addOpen ? addForm(S, def) : ''}
        ${stale.length ? `<p class="notice" role="status">현재 범위에서 제외된 선택 논문이 ${stale.length}편 있어요. 선택과 메모는 그대로 보존했어요.</p>` : ''}
        ${excluded.length ? `<p class="hint">범위 조정으로 ${excluded.length}편을 제외했어요.</p>` : ''}
        ${list.length ? shown.map((/** @type {any} */ it) => paperCard(S, it)).join('') : '<p class="card">조건에 맞는 논문이 없어요. 제외 조건을 줄이거나 “우선 추천대로 볼게요”를 눌러보세요.</p>'}
        ${list.length > visibleCap ? `<button class="btn" data-act="more" data-fk="more">${S.showAll ? '접기' : `추가 결과 펼치기 (${list.length - visibleCap}편)`}</button>` : ''}
        ${S.dataMode === 'real' && S.estimatedTotal != null && S.papers.length < S.estimatedTotal ? `<button class="btn" data-act="more-remote" data-fk="more-remote">다음 50편 가져오기</button>` : ''}
      </section>
      ${summarySection(S)}
      <div class="sel-bar"><span role="status">선택 ${S.selPapers.length}편 · 방향 ${S.selDirs.length}개</span>
        <button class="btn primary" data-act="goto-prepare" data-fk="goto-prepare">선택한 자료로 랩미팅 준비</button></div>
    </div>
  </div>`;
}

/** 검색창 바로 아래에 두는 연구실 정보. @param {any} S */
export function labSection(S) {
  return `<h2 id="lab-h" style="font-size:1.125rem">우리 연구실 정보 <span class="hint">(선택)</span></h2>
    <p class="hint">${S.lab ? '입력한 정보를 바탕으로 방향 카드에 연결 항목을 표시해요.' : '연구실 정보 미입력 — 맞춤 적합성은 표시하지 않아요.'}</p>
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
    <p class="hint">모르는 항목은 비워도 돼요. 입력값은 이 브라우저에만 저장돼요. 계정에 가져가면 연구실 정보는 그 프로젝트 기록 안에만 저장되고, 로그인한 소유자만 볼 수 있어요. 외부 AI로 보내는 동의는 이 저장과 별개이며 아직 연결되어 있지 않아요. 실제 DOI 조회는 9단계, PDF 업로드는 12단계에서 연결될 예정이라 지금은 사용할 수 없어요.</p>
    ${f('papers', '기존 논문 2~5편 (제목, 직접 입력)', '제목을 쉼표로 구분')}${f('materials', '연구 대상·재료', '예: 금속산화물, 박막')}${f('processes', '공정', '예: 스핀 코팅')}${f('equipment', '장비 (연구실이 보유한 것만)', '예: 스핀 코터')}${f('measures', '측정 가능 항목', '예: 막 두께')}${f('goal', '이어서 발전시키고 싶은 결과', '')}${f('constraints', '알려진 제약', '')}
    <div class="row"><button class="btn primary" type="submit">저장</button><button type="button" class="btn" data-act="lab-example">예시 연구실 불러오기</button><button type="button" class="btn" data-act="lab-clear">지우기</button></div>
    <p class="hint">입력 출처: 사용자 입력${S.lab?.label ? ' / ' + h(S.lab.label) : ''}. 논문에 나온 장비를 연구실 보유로 자동 확정하지 않아요.</p></form>`;
}

/** @param {any} S @param {any} def */
function addForm(S, def) {
  return `<form id="add-form" class="card stack" data-act="add-paper" novalidate>
    <h3>논문 직접 추가</h3>
    <p class="hint">${tag('warn', '사용자 제공 자료 · 확인 전')} DOI가 있고 실검색이 켜져 있으면 서버에서 조회해요. 없으면 입력한 내용만 저장하고, 없는 서지 정보를 만들지 않아요.</p>
    ${S.addError ? `<p class="error" role="alert" id="add-error">${h(S.addError)}</p>` : ''}
    <label>제목 (필수)<input type="text" name="title" required data-fk="add-title" ${S.addError ? 'aria-describedby="add-error"' : ''}></label>
    <label>연도<input type="text" name="year" inputmode="numeric" placeholder="예: 2021"></label>
    <label>DOI (선택, 형식만 확인)<input type="text" name="doi" placeholder="10.1234/abcd"></label>
    <label>초록 (선택)<textarea name="abstract" rows="3"></textarea></label>
    ${def ? `<fieldset><legend>속한 갈래 (직접 고르기)</legend>${def.branches.map((/** @type {any} */ b) => `<label><input type="checkbox" name="branches" value="${b.id}"> ${h(b.label)}</label>`).join('')}</fieldset>` : '<p class="hint">이 검색에는 예시 갈래가 없어요.</p>'}
    <label>역할<select name="role"><option value="approach">주요 접근 연구</option><option value="review">입문 리뷰</option><option value="recent">최근 변화·한계</option></select></label>
    <label>태그 (쉼표 구분, 선택)<input type="text" name="tags" placeholder="예: 공정"></label>
    <div class="row"><button type="submit" class="btn primary">추가</button><button type="button" class="btn" data-act="add-toggle">취소</button></div></form>`;
}

/** @param {any} S */
function reviewBox(S) {
  const pending = S.pendingReview;
  const report = pending ? `<p class="notice">${h(pending.label || '')}</p>${pending.stale ? '<p class="notice">조사 기준 버전이 달라 재확인이 필요해요.</p>' : ''}${pending.unknown?.length ? `<p class="error">없는 ID: ${pending.unknown.map(h).join(', ')}</p>` : ''}${pending.duplicate?.length ? `<p class="error">중복 ID: ${pending.duplicate.map(h).join(', ')}</p>` : ''}<p class="hint">평가가 없는 논문 ${pending.missing?.length || 0}편. 적용 전에는 순서를 바꾸지 않아요.</p><button class="btn" type="button" data-act="review-apply">이 순서로 보기</button>` : '';
  return `<section class="card stack"><h3>개인 AI로 다시 보기 (선택)</h3><p class="hint">규칙 정렬과 별개예요. 사이트는 AI를 호출하지 않아요.</p><button class="btn" type="button" data-act="review-copy">선택 논문 검토 프롬프트 복사</button><form data-act="review-paste" class="stack"><label>검토 결과<textarea name="review" rows="4"></textarea></label><button class="btn" type="submit">결과 확인</button></form>${report}</section>`;
}

/** @param {any} S @param {any} it */
function paperCard(S, { paper: p, reasons }) {
  const m = meta(S)[p.id] ?? { role: 'approach', branches: [], tags: [] };
  const sel = S.selPapers.includes(p.id), user = p.origin === 'user', provider = p.origin === 'provider';
  const def = TOPIC_DEFS[S.topicKey] || null;
  const doiHref = typeof p.doi === 'string' && /^10\.\d{4,9}\/\S+$/i.test(p.doi) ? `https://doi.org/${h(p.doi)}` : '';
  return `<article class="card paper" aria-label="${h(p.title)}">
    <div class="paper-top">${provider ? tag('info', '검색 결과') : tag('ok', ROLE_LABEL[m.role])}${accessTag(p)}${originTag(p)}</div>
    <h3>${h(p.title)}</h3>
    <p class="meta">저자: ${provider ? h(p.authors?.slice(0, 3).join(', ') || '미상') : user ? '미입력' : '없음(가상)'} · 연도: ${p.year ?? '미상'}${p.year != null && !user && !provider ? '(가상 값)' : ''} · 학술지: ${provider ? h(p.venue || '미상') : user ? '미입력' : '없음(가상)'} · 인용수: ${p.citationCount ?? '미확인'}${p.citationCount != null && !provider ? '(가상 값)' : ''}${provider ? ` · 출처: ${h(p.source)}` : ''}${p.fieldSources?.venue ? ' · 학술지 출처 Crossref' : ''}</p>
    ${doiHref ? `<p class="meta">DOI: <a href="${doiHref}" target="_blank" rel="noopener noreferrer">${h(p.doi)}</a></p>` : ''}
    ${provider ? `${p.link ? `<p class="meta"><a href="${h(p.link)}" target="_blank" rel="noopener noreferrer">공개 주소 보기</a></p>` : ''}${fulltextLine(S, p)}` : ''}
    ${p.foundBy?.length ? `<p class="hint">발견한 검색 문구: ${p.foundBy.map(h).join(' / ')}</p>` : ''}
    ${p.relevance?.reasons ? `<p class="hint">규칙 정렬: ${p.relevance.reasons.map(h).join(' · ')}</p>` : ''}
    ${p.externalReview ? `<p class="notice">외부 AI 평가 · 사용자 가져오기 · 정확성 미검증 · ${h(p.externalReview.judgment)} · ${h(p.externalReview.reason || '')}</p>` : ''}
    ${p.relevance?.excluded ? `<button class="btn small" data-act="unexclude" data-id="${p.id}">제외 해제</button>` : ''}
    <dl class="kv"><dt>읽을 이유</dt><dd>${provider ? '검색어와 수집 순서를 기준으로 한 규칙이에요. AI 추천이 아니에요.' : h(ROLE_REASON[m.role])} <span class="hint">(순서 근거: ${reasons.map(h).join('; ')})</span></dd>
      <dt>확인할 정보</dt><dd>사용한 재료·공정, 측정 방법, 결과가 성립한 조건</dd>
      <dt>근거 범위</dt><dd>${p.access === 'fulltext' ? '원문' : p.access === 'abstract' ? '초록만 확보 — 절·그림·페이지 위치는 제공하지 않아요' : '서지정보만 확보 — 초록이 없어 방향 후보 계산에 포함되지 않아요'}</dd>
      <dt>읽기 안내</dt><dd>원문에서 제조 방법과 측정 조건을 확인해 보세요. (일반 안내)</dd>
      <dt>원문 링크</dt><dd>${p.link ? `<a href="${h(p.link)}" target="_blank" rel="noopener">원문 또는 공개 페이지(다운로드하지 않음)</a>` : user ? '없음 — 사용자가 입력한 자료(확인 전)' : provider ? '없음' : '없음 — 가상 예시 문서'}</dd></dl>
    ${m.branches.length ? `<p class="hint">속한 갈래: ${m.branches.map((/** @type {string} */ b) => h(def.branches.find((/** @type {any} */ x) => x.id === b)?.label)).join(', ')}</p>` : ''}
    <div class="row"><button class="btn" data-act="toggle-paper" data-id="${p.id}" aria-pressed="${sel}" data-fk="pp-${p.id}">${sel ? '✓ 준비 자료에 추가됨' : '준비 자료에 추가'}</button>
    <button class="btn" data-act="view-doc" data-id="${p.id}" data-fk="doc-${p.id}">${provider ? '초록 보기' : user ? '입력 내용 보기' : '예시 문서 보기'}</button></div></article>`;
}
