// 탐색 화면.
import { h, tag, accessTag, originTag } from './common.js';
import { directionsHtml } from './directions.js';
import { EXAMPLE_TOPICS, EXAMPLE_LABEL } from '../data/examples.js';
import { TOPIC_DEFS, ROLE_LABEL, ROLE_REASON } from '../data/content.js';
import { suggestTopicForMaterial } from '../logic.js';
import { meta, ranked } from '../state/store.js';
import { recoveryHtml } from './saved.js';

const VISIBLE_DEFAULT = 5;

/** @param {any} S */
export function exploreHtml(S) {
  if (S.status === 'corrupt' || S.status === 'missing') return recoveryHtml(S);
  if (S.status === 'loading') return `<p role="status">논문 검색 중… (예시 자료를 불러오는 작업)</p>`;
  if (S.status === 'error') return `<div class="card"><h2 tabindex="-1">불러오지 못했어요</h2><p>예시 공급자 오류입니다. 다시 시도해 주세요. 실제 검색으로 대체하지 않습니다.</p><button class="btn" data-act="retry">다시 시도</button></div>`;
  if (S.status === 'empty') return `<div class="card stack"><h2 tabindex="-1">이 주제의 실검색은 아직 연결되지 않았어요</h2><p>지금은 가상 예시 모드라 아래 반도체 예시만 볼 수 있어요. 입력하신 내용: “${h(S.input)}”</p><div class="chips">${Object.entries(EXAMPLE_TOPICS).map(([k, t]) => `<button class="chip" data-act="load-example" data-key="${k}">${h(t.name)} 예시로 보기</button>`).join('')}</div></div>`;
  if (S.status !== 'ok') return '';
  const m = meta(S), r = ranked(S), items = r.items, excluded = r.excluded, def = TOPIC_DEFS[S.topicKey];
  const inBranch = (/** @type {any} */ it) => !S.branch || m[it.paper.id]?.branches.includes(S.branch);
  const list = items.filter(inBranch);
  const shown = S.showAll ? list : list.slice(0, VISIBLE_DEFAULT);
  const stale = S.selPapers.filter((/** @type {string} */ id) => excluded.some((/** @type {any} */ p) => p.id === id));
  const suggest = r.materialMiss ? suggestTopicForMaterial(S.scope.material, S.topicKey) : null;
  const userCount = S.papers.filter((/** @type {any} */ p) => p.origin === 'user').length;
  return `<div class="explore">
    <section class="card area-scope stack" aria-labelledby="scope-h">
      <h2 id="scope-h" tabindex="-1">이런 내용을 중심으로 찾아봤어요</h2>
      <p class="orig"><span class="hint">내가 적은 내용</span><br>${h(S.input)}</p>
      <ul class="scope-list">
        <li>${h(def.name)} 관련 자료 ${S.papers.length}편${userCount ? `(사용자 추가 ${userCount}편 포함)` : '(가상 예시)'} · 현재 ${items.length}편 표시</li>
        ${S.scope.material ? `<li>소재/대상: ${h(S.scope.material)}${S.scope.materialOnly && !r.materialMiss ? ' — 일치하는 논문만 보는 중' : ''}</li>` : ''}
        <li>${S.scope.focus === 'methods' ? '방법 비교 중심' : '연구 동향 중심'}</li>
      </ul>
      ${r.materialMiss ? `<p class="notice" role="status">${tag('warn', '일치 없음')} 소재/대상 “${h(S.scope.material)}”와 일치하는 논문이 수집한 자료에 없어요. 순서에는 반영하지 못했고 전체를 그대로 보여줘요.${suggest ? ` <button class="btn small" data-act="rebuild-topic" data-key="${suggest}" data-fk="rebuild">“${h(TOPIC_DEFS[suggest].name)}” 예시로 다시 구성(새 조사)</button>` : ''}</p>` : ''}
      <p class="hint">교수님의 의도를 단정한 것이 아니라 입력에서 정리한 조사 범위예요.</p>
      ${termChips(S)}
      <div class="row"><button class="btn" data-act="adjust-toggle" aria-expanded="${S.adjustOpen}" aria-controls="adjust-form" data-fk="adjust">조정하기</button>
      <button class="btn" data-act="scope-reset" data-fk="reset">잘 모르겠어요. 우선 추천대로 볼게요</button></div>
      ${S.adjustOpen ? adjustForm(S) : ''}
      ${S.warnings.length ? `<p>${tag('example', EXAMPLE_LABEL)}</p>` : ''}
    </section>
    <section class="card area-branches" aria-labelledby="br-h">
      <h2 id="br-h" style="font-size:1.125rem">연구 갈래</h2>
      <p class="hint">수집한 자료 기준의 분류이며 분야 전체의 완전한 지도가 아니에요. 한 논문이 여러 갈래에 속할 수 있어요.</p>
      <button class="branch-btn" data-act="branch" data-id="" aria-pressed="${!S.branch}" data-fk="br-all">전체 (${items.length}편)</button>
      ${def.branches.map((/** @type {any} */ b) => { const n = items.filter((/** @type {any} */ it) => m[it.paper.id]?.branches.includes(b.id)).length;
        return `<button class="branch-btn" data-act="branch" data-id="${b.id}" aria-pressed="${S.branch === b.id}" data-fk="br-${b.id}"><strong>${h(b.label)}</strong> · ${n}편<br><span class="hint">${h(b.desc)}</span></button>`; }).join('')}
    </section>
    <section class="card area-lab stack" aria-labelledby="lab-h">
      <h2 id="lab-h" style="font-size:1.125rem">우리 연구실 정보 <span class="hint">(선택)</span></h2>
      <p class="hint">${S.lab ? '입력한 정보를 바탕으로 방향 카드에 연결 항목을 표시해요.' : '연구실 정보 미입력 — 맞춤 적합성은 표시하지 않아요.'}</p>
      <button class="btn" data-act="lab-toggle" aria-expanded="${S.labOpen}" data-fk="lab-toggle">${S.labOpen ? '닫기' : '연구실 정보 입력'}</button>
      ${S.labOpen ? labForm(S) : ''}
    </section>
    <div class="area-main">
      ${directionsHtml(S)}
      <section aria-labelledby="pp-h" class="stack">
        <div class="toolbar"><h2 id="pp-h" style="font-size:1.25rem">먼저 읽을 논문 <span class="count">${list.length}</span></h2>
          <label>정렬 <select data-act="sort" data-fk="sort">${[['relevance', '관련성'], ['recent', '최신순'], ['citations', '인용순']].map(([v, l]) => `<option value="${v}" ${S.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <button class="btn" data-act="add-toggle" aria-expanded="${S.addOpen}" aria-controls="add-form" data-fk="add-toggle">${S.addOpen ? '논문 추가 닫기' : '논문 직접 추가'}</button></div>
        <p class="hint">${S.sort === 'relevance' ? '관련성: 아래 각 카드에 순서 근거를 적었어요.' : S.sort === 'recent' ? '최신순: 연도 값이 있는 순서. 연도 없는 항목은 뒤에 둬요.' : '인용순: 인용수가 확인된 항목만 앞에 둬요. 인용수가 미확인인 항목은 0이 아니라 뒤로 보내요. 인용수는 논문 품질 순위가 아니에요.'}</p>
        ${S.addOpen ? addForm(S, def) : ''}
        ${stale.length ? `<p class="notice" role="status">현재 범위에서 제외된 선택 논문이 ${stale.length}편 있어요. 선택과 메모는 그대로 보존했어요.</p>` : ''}
        ${excluded.length ? `<p class="hint">범위 조정으로 ${excluded.length}편을 제외했어요.</p>` : ''}
        ${list.length ? shown.map((/** @type {any} */ it) => paperCard(S, it)).join('') : '<p class="card">조건에 맞는 논문이 없어요. 제외 조건을 줄이거나 “우선 추천대로 볼게요”를 눌러보세요.</p>'}
        ${list.length > VISIBLE_DEFAULT ? `<button class="btn" data-act="more" data-fk="more">${S.showAll ? '접기' : `추가 결과 펼치기 (${list.length - VISIBLE_DEFAULT}편)`}</button>` : ''}
      </section>
      <div class="sel-bar"><span role="status">선택 ${S.selPapers.length}편 · 방향 ${S.selDirs.length}개</span>
        <button class="btn primary" data-act="goto-prepare" data-fk="goto-prepare">선택한 자료로 랩미팅 준비</button></div>
    </div>
  </div>`;
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
    <label>교수님이 강조한 표현 추가 <input type="text" name="emphasis" placeholder="예: LER" data-fk="f-em"></label>
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
    <p class="hint">${tag('warn', '사용자 제공 자료 · 확인 전')} 입력한 내용을 그대로 쓰며, DOI는 형식만 확인하고 <strong>조회하지 않아요</strong>(실제 조회는 9단계). 초록을 적어야 방향 후보 계산(초록 이상 8편)에 포함돼요.</p>
    ${S.addError ? `<p class="error" role="alert" id="add-error">${h(S.addError)}</p>` : ''}
    <label>제목 (필수)<input type="text" name="title" required data-fk="add-title" ${S.addError ? 'aria-describedby="add-error"' : ''}></label>
    <label>연도<input type="text" name="year" inputmode="numeric" placeholder="예: 2021"></label>
    <label>DOI (선택, 형식만 확인)<input type="text" name="doi" placeholder="10.1234/abcd"></label>
    <label>초록 (선택)<textarea name="abstract" rows="3"></textarea></label>
    <fieldset><legend>속한 갈래 (직접 고르기)</legend>${def.branches.map((/** @type {any} */ b) => `<label><input type="checkbox" name="branches" value="${b.id}"> ${h(b.label)}</label>`).join('')}</fieldset>
    <label>역할<select name="role"><option value="approach">주요 접근 연구</option><option value="review">입문 리뷰</option><option value="recent">최근 변화·한계</option></select></label>
    <label>태그 (쉼표 구분, 선택)<input type="text" name="tags" placeholder="예: ${h(def.branches[0].tags[0])}"></label>
    <div class="row"><button type="submit" class="btn primary">추가</button><button type="button" class="btn" data-act="add-toggle">취소</button></div></form>`;
}

/** @param {any} S @param {any} it */
function paperCard(S, { paper: p, reasons }) {
  const m = meta(S)[p.id] ?? { role: 'approach', branches: [], tags: [] };
  const sel = S.selPapers.includes(p.id), user = p.origin === 'user';
  const def = TOPIC_DEFS[S.topicKey];
  return `<article class="card paper" aria-label="${h(p.title)}">
    <div class="paper-top">${tag('ok', ROLE_LABEL[m.role])}${accessTag(p)}${originTag(p)}</div>
    <h3>${h(p.title)}</h3>
    <p class="meta">저자: ${user ? '미입력' : '없음(가상)'} · 연도: ${p.year ?? '미상'}${p.year != null && !user ? '(가상 값)' : ''} · 학술지: ${user ? '미입력' : '없음(가상)'} · 인용수: ${p.citationCount ?? '미확인'}${p.citationCount != null ? '(가상 값)' : ''}${p.doi ? ` · DOI: ${h(p.doi)}(조회하지 않음)` : ''}</p>
    <dl class="kv"><dt>읽을 이유</dt><dd>${h(ROLE_REASON[m.role])} <span class="hint">(순서 근거: ${reasons.map(h).join('; ')})</span></dd>
      <dt>확인할 정보</dt><dd>사용한 재료·공정, 측정 방법, 결과가 성립한 조건</dd>
      <dt>근거 범위</dt><dd>${p.access === 'fulltext' ? '원문' : p.access === 'abstract' ? '초록만 확보 — 절·그림·페이지 위치는 제공하지 않아요' : '서지정보만 확보 — 초록이 없어 방향 후보 계산에 포함되지 않아요'}</dd>
      <dt>읽기 안내</dt><dd>원문에서 제조 방법과 측정 조건을 확인해 보세요. (일반 안내)</dd>
      <dt>원문 링크</dt><dd>${user ? '없음 — 사용자가 입력한 자료(확인 전)' : '없음 — 가상 예시 문서'}</dd></dl>
    ${m.branches.length ? `<p class="hint">속한 갈래: ${m.branches.map((/** @type {string} */ b) => h(def.branches.find((/** @type {any} */ x) => x.id === b)?.label)).join(', ')}</p>` : ''}
    <div class="row"><button class="btn" data-act="toggle-paper" data-id="${p.id}" aria-pressed="${sel}" data-fk="pp-${p.id}">${sel ? '✓ 준비 자료에 추가됨' : '준비 자료에 추가'}</button>
    <button class="btn" data-act="view-doc" data-id="${p.id}" data-fk="doc-${p.id}">${user ? '입력 내용 보기' : '예시 문서 보기'}</button></div></article>`;
}
