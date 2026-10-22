// 세부 검색·선택·원문·총정리 화면 조각.
import { h } from './common.js';
import { suggestKeywords } from '../research/keywords.js';
import { applyRefine } from '../research/refine.js';
import { summaryPrompt } from '../research/summary.js';
import { PURPOSES } from '../research/handoff.js';

const FT_LABEL = {
  invalid_doi: 'DOI가 없거나 형식이 맞지 않아요', challenge_required: '로봇 확인이 필요해 자동으로 받지 못했어요', not_found: '해당 원문을 찾지 못했어요', doi_mismatch: '페이지의 DOI가 달라 받지 않았어요', busy: '다른 Sci-Hub 다운로드가 진행 중이에요',
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
  const receiving = (S.fulltextActive || []).includes(p.id);
  const cands = candidateUrls(p);
  const proxy = proxyPrefix();
  const lib = proxy && p.doi ? `<a class="btn small" href="${h(proxy + 'https://doi.org/' + p.doi)}" target="_blank" rel="noopener noreferrer">도서관으로 열기</a>` : '';
  const state = receiving ? '원문 받는 중…'
    : st ? (st.status === 'extracted' ? `✓ 원문 텍스트 ${st.pageCount}쪽 확보(${h(st.source || '')})${st.truncatedPages ? ' · 100쪽까지만' : ''}` : `원문: ${h(ftLabel(st.status))}`)
    : (cands.length ? `공개 원문 후보 ${cands.length}개(아직 받지 않음)` : '공개 원문 후보 없음 · 가진 PDF를 올릴 수 있어요');
  return `<p class="hint" data-ft-state="${h(p.id)}">${state}${st?.lastError ? ` · 최근 시도: ${h(ftLabel(st.lastError))}(기존 자료 유지)` : ''}</p>
    <div class="row"><button class="btn small" data-ract="ft-fetch" data-id="${h(p.id)}" ${S.fulltextBusy ? 'disabled' : ''}>${receiving ? '받는 중…' : '공개 원문 받기'}</button>
    <button class="btn small" data-ract="ft-scihub" data-id="${h(p.id)}" ${S.fulltextBusy || !p.doi ? 'disabled' : ''}>Sci-Hub 원문 받기</button>
    ${st?.pdfAvailable ? `<button class="btn small" data-ract="ft-download" data-id="${h(p.id)}">보관 PDF 저장</button>` : ''}
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
    <button class="btn" type="button" data-ract="select-top">조건에 맞는 상위 30편만 고르기</button>
    <button class="btn" type="button" data-ract="select-none">선택 모두 해제</button><span role="status" class="hint">선택 ${S.selPapers.length}편</span></div>
    ${S.selectMsg ? `<p class="hint">${h(S.selectMsg)}</p>` : ''}`;
}

/** 선택한 논문별 원문 확보 상태. 확보/초록만/실패를 나눠 보여준다. @param {any} S */
function statusTable(S) {
  const papers = S.selPapers.map((/** @type {string} */ id) => S.papers.find((/** @type {any} */ p) => p.id === id)).filter(Boolean);
  if (!papers.length) return '';
  const kind = (/** @type {any} */ p) => {
    if ((S.fulltextActive || []).includes(p.id)) return ['진행', '받는 중', 'info'];
    const st = S.fulltext?.[p.id];
    if (!st) return ['대기', '아직 받지 않음(초록만 사용)', 'warn'];
    if (st.status === 'extracted') return ['확보', `원문 ${st.pageCount}쪽`, 'ok'];
    return ['안됨', ftLabel(st.status), 'warn'];
  };
  const rows = papers.map((/** @type {any} */ p) => ({ p, k: kind(p) }));
  const count = (/** @type {string} */ n) => rows.filter((/** @type {any} */ r) => r.k[0] === n).length;
  const order = { 확보: 0, 진행: 1, 안됨: 2, 대기: 3 };
  rows.sort((/** @type {any} */ a, /** @type {any} */ b) => /** @type {any} */ (order)[a.k[0]] - /** @type {any} */ (order)[b.k[0]]);
  return `<p><strong>확보 ${count('확보')}</strong> · 안됨 ${count('안됨')} · 아직 안 받음 ${count('대기')}${count('진행') ? ` · 받는 중 ${count('진행')}` : ''}</p>
    <details open><summary>선택한 ${papers.length}편의 원문 상태</summary><ul class="ft-list">${rows.map((/** @type {any} */ r) => `<li><span class="tag ${r.k[2]}"><span class="ico" aria-hidden="true">${r.k[0] === '확보' ? '✓' : r.k[0] === '안됨' ? '!' : 'i'}</span>${r.k[0]}</span> ${h(String(r.p.title || r.p.id).slice(0, 80))} <span class="hint">— ${h(r.k[1])}</span></li>`).join('')}</ul></details>`;
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
  return `<section class="card stack" aria-labelledby="sm-h"><h2 id="sm-h" style="font-size:1.25rem">연구군과 읽기 순서</h2>
    <p class="hint">선택한 논문 자료와 분석 지침을 내 ChatGPT 대화에 붙여 넣으세요. 연구군별 차이, 먼저 읽을 논문과 이유, 관심사별 읽기 경로를 요청해요. 자료가 부족한 부분은 확인 필요로 남겨요.</p>
    <p class="hint">이 사이트는 ChatGPT를 호출하지 않아요. 돌아온 .md는 원하면 가져와 보관할 수 있어요. 형식 검사는 내용이 맞다는 뜻이 아니에요.</p>
    <h3>1. 원문 확보 (선택)</h3>
    <p class="hint">공개 원문은 OpenAlex·Unpaywall 주소에서 받아요. Sci-Hub는 논문 카드에서 한 편씩 별도로 요청할 수 있어요. 받은 PDF와 본문은 이 브라우저에 보관하며, 받지 못한 논문은 가진 PDF를 올릴 수 있어요.</p>
    <p class="hint">조사당 PDF 최대 5개·총 100MB, 파일당 20MB까지 보관해요. 조사 백업에는 PDF가 포함되지 않으므로 필요한 원본은 “보관 PDF 저장”으로 따로 저장하세요.</p>
    <div class="row"><button class="btn" type="button" data-ract="ft-fetch-all" ${sel && !S.fulltextBusy ? '' : 'disabled'}>${S.fulltextBusy ? '받는 중…' : `선택 논문 ${sel}편 공개 원문 받기`}</button>
    <label class="btn">PDF 여러 개 올리기(DOI로 자동 연결)<input type="file" accept="application/pdf" multiple data-ract="ft-upload" hidden></label></div>
    <label>도서관 프록시 주소 앞부분(선택, https로 시작. 예: 기관이 알려준 로그인 주소 끝의 url= 까지)<input data-ract="proxy-set" value="${h(proxyPrefix())}" placeholder="https://..."></label>
    <p role="status" class="hint">${h(S.fulltextMsg || '')}</p>
    ${statusTable(S)}
    <h3>2. 연구군·읽기 순서 프롬프트 만들기</h3>
    <label>관심사나 추가 요청 (선택)<textarea data-ract="summary-request" rows="2" placeholder="예: 처음 공부하는 주제예요. 접근법별 차이를 이해하고 싶어요.">${h(S.summaryRequest || '')}</textarea></label>
    <div class="row"><button class="btn primary" type="button" data-ract="summary-make" ${sel ? '' : 'disabled'}>선택 ${sel}편으로 연구군·읽기 순서 프롬프트를 만들어 ChatGPT용으로 복사</button></div>
    ${S.summaryPrompt ? `<label>프롬프트 미리보기(고쳐서 복사할 수 있어요)<textarea rows="8" data-ract="summary-prompt-edit">${h(S.summaryPrompt)}</textarea></label><div class="row"><button class="btn" type="button" data-ract="summary-copy">다시 복사</button></div>` : ''}
    <h3>3. 돌아온 .md 가져오기 (선택)</h3>
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

/** 내 ChatGPT에 복사할 목적별 묶음. 전송 버튼은 없다. @param {any} S */
export function chatgptPanel(S) {
  if (S.dataMode !== 'real') {
    return `<section class="card stack" aria-labelledby="gpt-h"><h2 id="gpt-h" style="font-size:1.25rem">내 ChatGPT에 맡기기</h2><p class="hint">예시 자료는 실제 논문이 아니어서 ChatGPT용 묶음을 만들지 않아요. 실제 검색 뒤에 사용할 수 있어요. 이 사이트는 ChatGPT 계정에 접속하지 않아요.</p></section>`;
  }
  const purpose = PURPOSES.find(p => p.id === S.chatgptPurpose) || PURPOSES[0];
  const pending = S.chatgptPending;
  const papers = S.chatgptPurpose === 'read' ? (S.selPapers.length ? S.papers.filter((/** @type {any} */ p) => S.selPapers.includes(p.id)) : S.papers).slice(0, 40) : [];
  const focus = papers.length ? `<label>읽을 논문<select data-ract="gpt-focus">${papers.map((/** @type {any} */ p) => `<option value="${h(p.id)}" ${p.id === S.chatgptFocusId ? 'selected' : ''}>${h(String(p.title || p.id).slice(0, 80))}</option>`).join('')}</select></label>` : '';
  const note = S.chatgptPurpose === 'feedback' ? `<label>반영할 피드백<textarea data-ract="gpt-note" rows="3" placeholder="미팅에서 들은 수정 요청">${h(S.chatgptNote || '')}</textarea></label>` : '';
  const pack = S.chatgptPack;
  const range = pack ? `<p class="hint">마지막 묶음: ${h(pack.note || '')} · ${pack.includedIds?.length || 0}편 포함${pack.omitted ? ` · ${pack.omitted}편 빠짐` : ''} · 기준 ${h(String(pack.basisVersion || '').slice(0, 80))}</p>` : '';
  const preview = pending ? `<div class="notice"><p>${h(pending.message || '')}</p>${pending.stale ? '<p>자료 기준이 달라 적용하지 않아요.</p>' : ''}${pending.unknown?.length ? `<p class="error">없는 ID: ${pending.unknown.map(h).join(', ')}</p>` : ''}${pending.preview?.length ? `<ul>${pending.preview.slice(0, 12).map((/** @type {string} */ line) => `<li>${h(line)}</li>`).join('')}</ul>` : ''}${pending.payload && !pending.stale ? '<button class="btn" type="button" data-ract="gpt-apply">확인 후 적용</button>' : ''}${pending.repairPrompt ? `<label>ChatGPT에 다시 붙일 보완 요청<textarea rows="6" readonly>${h(pending.repairPrompt)}</textarea></label>` : ''}</div>` : '';
  const directions = (S.aiDirections || []).length ? `<details open><summary>가져온 연구 방향 ${S.aiDirections.length}개 · 외부 초안 · 정확성 미검증</summary><ul>${S.aiDirections.map((/** @type {any} */ d) => `<li>${h(d.question)} <span class="hint">논문 ${d.paperIds.length}편${d.weak ? ' · 근거 부족' : ''} · ${h(d.reason || '')}</span></li>`).join('')}</ul></details>` : '';
  const compare = S.aiCompare?.rows?.length ? `<details><summary>가져온 비교 초안 · 확인된 수치가 아님</summary><ul>${S.aiCompare.rows.map((/** @type {any} */ r) => `<li>${h(r.item)} · ${r.cells.length}칸</li>`).join('')}</ul></details>` : '';
  const memos = (S.aiMemos || []).length ? `<details><summary>ChatGPT 메모 ${S.aiMemos.length}개</summary><ul>${S.aiMemos.slice(-5).map((/** @type {any} */ m) => `<li>${h(m.purpose)} · ${h(m.at.slice(0, 16).replace('T', ' '))} · ${h(m.text.slice(0, 120))}</li>`).join('')}</ul></details>` : '';
  const plan = S.chatgptPlan?.queries?.length ? `<details open><summary>가져온 검색 문구 ${S.chatgptPlan.queries.length}개 · 아직 검색하지 않음</summary><ul>${S.chatgptPlan.queries.map((/** @type {any} */ q) => `<li>${h(q.text)} <span class="hint">${h(q.purpose || '')}</span></li>`).join('')}</ul><button class="btn small" type="button" data-ract="gpt-copy-queries">검색 문구 복사</button></details>` : '';
  return `<section class="card stack" aria-labelledby="gpt-h"><h2 id="gpt-h" style="font-size:1.25rem">내 ChatGPT에 맡기기</h2>
    <p class="hint">복사한 내용을 본인 ChatGPT 대화에 붙여 넣으세요. 이 사이트는 ChatGPT에 로그인하거나 API로 보내지 않아요. 답변은 확인한 뒤에만 반영되고, 직접 고쳐 적어도 됩니다.</p>
    <label>목적<select data-ract="gpt-purpose">${PURPOSES.map(p => `<option value="${p.id}" ${p.id === purpose.id ? 'selected' : ''}>${h(p.title)}</option>`).join('')}</select></label>
    <p class="hint">${h(purpose.blurb)} 교환 형식 ${h(purpose.schema)}.</p>
    ${focus}${note}${range}
    <div class="row"><button class="btn primary" type="button" data-ract="gpt-build">ChatGPT에 붙일 내용 만들고 복사</button>${S.chatgptPrompt ? '<button class="btn" type="button" data-ract="gpt-copy">다시 복사</button><button class="btn" type="button" data-ract="gpt-dl">.md로 저장</button>' : ''}${S.chatgptUndo ? '<button class="btn" type="button" data-ract="gpt-undo">마지막 적용 되돌리기</button>' : ''}</div>
    ${S.chatgptPrompt ? `<label>미리보기(고쳐서 복사할 수 있어요)<textarea rows="8" data-ract="gpt-prompt">${h(S.chatgptPrompt)}</textarea></label>` : ''}
    <form data-rform="gpt-import" class="stack"><label>ChatGPT 답변 붙여넣기<textarea name="answer" rows="5" placeholder="JSON 또는 글"></textarea></label><button class="btn" type="submit">답변 확인</button></form>
    <p role="status" class="hint">${h(S.chatgptMsg || '')}</p>
    ${preview}${directions}${compare}${memos}${plan}
    <p class="hint">연구군·읽기 순서는 아래 섹션에서 같은 방식으로 ChatGPT에 복사합니다.</p>
  </section>`;
}

export { summaryPrompt };
