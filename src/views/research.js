// 세부 검색·선택·원문·총정리 화면 조각.
import { h } from './common.js';
import { suggestKeywords } from '../research/keywords.js';
import { applyRefine } from '../research/refine.js';
import { summaryPrompt } from '../research/summary.js';

const FT_LABEL = {
  extracted: '원문 텍스트 추출됨', scan_only: '스캔본 같아요(텍스트 없음)', encrypted: '암호가 걸린 PDF', damaged: 'PDF가 손상됐어요', not_pdf: 'PDF가 아니었어요(로그인·안내 페이지 등)',
  no_candidate: '공개 원문 주소를 찾지 못했어요', not_https: '안전하지 않은 주소라 받지 않았어요', blocked_host: '내부 주소라 받지 않았어요', too_large: '파일이 너무 커요(20MB 초과)',
  access_denied: '접근이 막혀 있어요', timeout: '시간이 초과됐어요', failed: '받지 못했어요', dns_failed: '주소를 찾지 못했어요', too_many_redirects: '이동이 너무 많아요',
};
export const ftLabel = (/** @type {string} */ s) => /** @type {any} */ (FT_LABEL)[s] || s;

export function proxyPrefix() {
  try { return (typeof localStorage !== 'undefined' && localStorage.getItem('rl.proxy')) || ''; } catch { return ''; }
}

/** 공개 원문 후보 주소. @param {any} p */
export function candidateUrls(p) {
  const f = p.fulltext || {};
  return [...new Set([f.pdfUrl, f.contentPdfUrl, ...(f.locationPdfUrls || [])].filter(Boolean))];
}

/** 카드 안의 원문 상태. @param {any} S @param {any} p */
export function fulltextLine(S, p) {
  if (S.dataMode !== 'real' || p.origin === 'user') return '';
  const st = S.fulltext?.[p.id];
  const cands = candidateUrls(p);
  const proxy = proxyPrefix();
  const lib = proxy && p.doi ? `<a class="btn small" href="${h(proxy + 'https://doi.org/' + p.doi)}" target="_blank" rel="noopener noreferrer">도서관으로 열기</a>` : '';
  const state = st
    ? (st.status === 'extracted' ? `✓ 원문 텍스트 ${st.pageCount}쪽 확보(${h(st.source || '')})${st.truncatedPages ? ' · 100쪽까지만' : ''}` : `원문: ${h(ftLabel(st.status))}`)
    : (cands.length ? `공개 원문 후보 ${cands.length}개(아직 받지 않음)` : '공개 원문 후보 없음 · 가진 PDF를 올릴 수 있어요');
  return `<p class="hint" data-ft-state="${h(p.id)}">${state}</p>
    <div class="row"><button class="btn small" data-ract="ft-fetch" data-id="${h(p.id)}" ${S.fulltextBusy ? 'disabled' : ''}>공개 원문 받기</button>
    ${lib}<label class="btn small">내 PDF 올리기<input type="file" accept="application/pdf" data-ract="ft-upload" data-id="${h(p.id)}" hidden></label></div>`;
}

/** @param {any} S @param {number} total @param {number} shownCount */
export function refinePanel(S, total, shownCount) {
  const rf = applyRefine(S.papers, S.refine);
  const known = [...S.refine.include, ...S.refine.exclude, ...(S.researchBrief?.searchCriteria?.core || [])];
  const kws = suggestKeywords(S.papers, { known });
  const rounds = S.refine.rounds || [];
  return `<section class="card stack" aria-labelledby="rf-h"><h3 id="rf-h">세부 검색</h3>
    <p class="hint">단어를 적어 지금 모은 논문을 걸러내거나, 같은 단어로 더 찾아 합칠 수 있어요. 여러 번 반복해도 돼요. 논문은 지우지 않고 숨기기만 해요.</p>
    <form data-rform="refine" class="stack">
      <label>반드시 포함할 단어 (쉼표로 구분, 제목이나 초록에 모두 있어야 해요)<textarea name="include" rows="1" data-fk="rf-include">${h(S.refine.include.join(', '))}</textarea></label>
      <label>제외할 단어 (하나라도 있으면 숨겨요)<textarea name="exclude" rows="1" data-fk="rf-exclude">${h(S.refine.exclude.join(', '))}</textarea></label>
      <div class="row"><button class="btn primary" type="submit">지금 결과에서 거르기</button>
      <button class="btn" type="button" data-ract="refine-search" ${S.refineBusy || S.dataMode !== 'real' ? 'disabled' : ''}>${S.refineBusy ? '찾는 중…' : '이 단어로 더 찾기 (OpenAlex)'}</button>
      <button class="btn" type="button" data-ract="refine-clear">조건 지우기</button></div>
    </form>
    <p role="status" class="hint">${h(S.refineMsg || '')}</p>
    <p>현재 ${total}편 중 ${shownCount}편 표시${rf.hidden.length ? ` · ${rf.hidden.length}편 숨김` : ''}</p>
    ${kws.length ? `<div><p class="hint">자주 나온 표현 (빈도 기반 · 의미 판단 아님). 눌러서 넣어 보세요.</p><div class="chips">${kws.map(k => `<span class="chip">${h(k.term)} <span class="hint">${k.docCount}편</span> <button class="btn small" type="button" data-ract="kw-include" data-term="${h(k.term)}" aria-label="${h(k.term)} 포함에 넣기">포함</button><button class="btn small" type="button" data-ract="kw-exclude" data-term="${h(k.term)}" aria-label="${h(k.term)} 제외에 넣기">제외</button></span>`).join('')}</div></div>` : ''}
    ${rf.hidden.length ? `<details><summary>숨긴 논문 ${rf.hidden.length}편 보기</summary><ul>${rf.hidden.slice(0, 100).map(x => `<li>${h(x.paper.title || x.paper.id)} <span class="hint">${x.reasons.map(h).join(' · ')}</span>${x.canRelease ? ` <button class="btn small" type="button" data-ract="refine-release" data-id="${h(x.paper.id)}">제외 해제</button>` : ''}</li>`).join('')}</ul></details>` : ''}
    ${rounds.length ? `<details><summary>세부 검색 기록 ${rounds.length}회</summary><ol>${rounds.map((r) => `<li>${h(r.mode === 'search' ? '더 찾기' : '거르기')} · 포함 ${h(r.include.join(', ') || '없음')} · 제외 ${h(r.exclude.join(', ') || '없음')}${r.mode === 'search' ? ` · 새 논문 ${r.added}편` : ''} · 결과 ${r.matched}편 <button class="btn small" type="button" data-ract="refine-reapply" data-id="${h(r.id)}">이 조건 다시 적용</button></li>`).join('')}</ol></details>` : ''}
  </section>`;
}

/** @param {any} S @param {number} visibleCount */
export function selectBar(S, visibleCount) {
  return `<div class="row"><button class="btn" type="button" data-ract="select-visible">보이는 ${visibleCount}편 모두 선택</button>
    <button class="btn" type="button" data-ract="select-none">선택 모두 해제</button><span role="status" class="hint">선택 ${S.selPapers.length}편</span></div>`;
}

/** @param {any} S */
export function summarySection(S) {
  if (S.dataMode !== 'real') return '';
  const sel = S.selPapers.length;
  const ver = S.summaries || [];
  const draftIds = S.summaryDraftIds || [];
  const versions = ver.length ? `<ol>${ver.map((/** @type {any} */ v) => `<li>${h(v.at.slice(0, 16).replace('T', ' '))} · ${v.source === 'user' ? '내가 고침' : '외부 AI 초안 · 정확성 미검증'} · 논문 ${v.paperIds.length}편 · 출처 표시 ${v.checks.refCount}곳 · 표 ${v.checks.tables} · 그림 ${v.checks.mermaid}${v.checks.invalidRefs.length ? ` · <span class="error">없는 번호 ${v.checks.invalidRefs.map(h).join(', ')}</span>` : ''}${v.checks.unsourcedParagraphs ? ` · 출처 없는 문단 ${v.checks.unsourcedParagraphs}개(추정)` : ''}
      <button class="btn small" type="button" data-ract="summary-load" data-id="${h(v.id)}">불러오기</button>
      <button class="btn small" type="button" data-ract="summary-dl" data-id="${h(v.id)}">.md 저장</button>
      <button class="btn small" type="button" data-ract="summary-develop" data-id="${h(v.id)}">더 발전시키는 프롬프트</button></li>`).join('')}</ol>` : '<p class="hint">아직 저장한 정리본이 없어요.</p>';
  return `<section class="card stack" aria-labelledby="sm-h"><h2 id="sm-h" style="font-size:1.25rem">선택한 논문 총정리</h2>
    <p class="hint">사이트는 AI를 호출하지 않아요. 아래 프롬프트를 내가 쓰는 AI에 붙여 넣고, 돌아온 .md를 다시 가져오세요. 형식 검사는 내용이 맞다는 뜻이 아니에요.</p>
    <h3>1. 원문 확보 (선택)</h3>
    <p class="hint">공개된 원문만 받아요(OpenAlex·Unpaywall에 공개 주소가 있는 경우). 받지 못한 논문은 초록만으로 정리하거나, 가진 PDF를 올려 주세요.</p>
    <div class="row"><button class="btn" type="button" data-ract="ft-fetch-all" ${sel && !S.fulltextBusy ? '' : 'disabled'}>${S.fulltextBusy ? '받는 중…' : `선택 논문 ${sel}편 공개 원문 받기`}</button>
    <label class="btn">PDF 여러 개 올리기(DOI로 자동 연결)<input type="file" accept="application/pdf" multiple data-ract="ft-upload" hidden></label></div>
    <label>도서관 프록시 주소 앞부분(선택, https로 시작. 예: 기관이 알려준 로그인 주소 끝의 url= 까지)<input data-ract="proxy-set" value="${h(proxyPrefix())}" placeholder="https://..."></label>
    <p role="status" class="hint">${h(S.fulltextMsg || '')}</p>
    <h3>2. 프롬프트 만들기</h3>
    <label>추가로 요청할 내용 (선택)<textarea data-ract="summary-request" rows="2">${h(S.summaryRequest || '')}</textarea></label>
    <div class="row"><button class="btn primary" type="button" data-ract="summary-make" ${sel ? '' : 'disabled'}>선택 ${sel}편으로 총정리 프롬프트 만들고 복사</button></div>
    ${S.summaryPrompt ? `<label>프롬프트 미리보기(고쳐서 복사할 수 있어요)<textarea rows="8" data-ract="summary-prompt-edit">${h(S.summaryPrompt)}</textarea></label><div class="row"><button class="btn" type="button" data-ract="summary-copy">다시 복사</button></div>` : ''}
    <h3>3. 돌아온 .md 가져오기</h3>
    <form data-rform="summary-import" class="stack"><label>.md 내용 붙여넣기<textarea name="md" rows="5"></textarea></label>
      <label>또는 .md 파일 열기<input type="file" name="file" accept=".md,text/markdown,text/plain"></label>
      <button class="btn" type="submit">가져오고 형식 검사</button></form>
    <p role="status" class="hint">${h(S.summaryMsg || '')}</p>
    <h3>저장한 정리본 (이 브라우저)</h3>${versions}
    ${S.summaryDraft ? `<label>불러온 정리본 (고쳐서 새 버전으로 저장할 수 있어요)<textarea rows="10" data-ract="summary-draft">${h(S.summaryDraft)}</textarea></label>
      <div class="row"><button class="btn" type="button" data-ract="summary-save-draft">새 버전으로 저장</button><button class="btn" type="button" data-ract="summary-dl" data-id="__draft">.md로 저장</button></div>
      <p class="hint">논문 번호 기준: ${draftIds.map((/** @type {string} */ id, /** @type {number} */ i) => `P${i + 1}=${h(id)}`).join(' · ')}</p>` : ''}
  </section>`;
}

export { summaryPrompt };
