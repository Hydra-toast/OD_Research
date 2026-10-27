// 세부 검색·선택·원문·총정리 화면 조각.
import { h } from './common.js';
import { suggestKeywords } from '../research/keywords.js';
import { applyRefine } from '../research/refine.js';
import { listedItems, LIST_CAP } from '../research/list.js';
import { pdfFolderName, savedPdfFolder } from '../research/pdf-folder.js';
import { isLocalApp } from '../controller/runtime.js';
import { summaryPrompt } from '../research/summary.js';
import { PURPOSES } from '../research/handoff.js';

const FT_LABEL = {
  invalid_doi: 'DOI가 없거나 형식이 맞지 않아요', challenge_required: '로봇 확인이 필요해 자동으로 받지 못했어요', not_found: '해당 원문을 찾지 못했어요', doi_mismatch: '페이지의 DOI가 달라 받지 않았어요', busy: '다른 Sci-Hub 다운로드가 진행 중이에요',
  extracted: '원문 텍스트 추출됨', scan_only: '스캔본 같아요(텍스트 없음)', encrypted: '암호가 걸린 PDF', damaged: 'PDF가 손상됐어요', not_pdf: 'PDF가 아니었어요(로그인·안내 페이지 등)',
    no_candidate: '공개 원문 주소를 찾지 못했어요', not_https: '안전하지 않은 주소라 받지 않았어요', blocked_host: '내부 주소라 받지 않았어요', too_large: '파일이 크기 제한을 넘었어요',
  access_denied: '접근이 막혀 있어요', timeout: '시간이 초과됐어요', failed: '받지 못했어요', dns_failed: '주소를 찾지 못했어요', too_many_redirects: '이동이 너무 많아요',
  quota: '브라우저 저장 공간 부족',
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

/** @param {any} value */
function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    // OpenAlex content API는 원문 다운로드에 키가 필요하므로 사용자에게 무인증 링크로 제시하지 않는다.
    return url.protocol === 'https:' && url.hostname.toLowerCase() !== 'content.openalex.org' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

/** 키를 브라우저에 내보내지 않고 OpenAlex 원문 경로의 논문 ID만 서버에 전달한다. @param {any} value */
function openAlexPdfPath(value) {
  try {
    const u = new URL(value);
    const match = u.protocol === 'https:' && u.hostname.toLowerCase() === 'content.openalex.org' && !u.username && !u.password && /^\/works\/(W\d{1,20})\.pdf$/.exec(u.pathname);
    return match ? `/api/openalex-pdf?work=${match[1]}` : '';
  } catch { return ''; }
}

/** 카드 안의 원문 상태. @param {any} S @param {any} p */
export function fulltextLine(S, p) {
  if (S.dataMode !== 'real' || p.origin === 'user') return '';
  const st = S.fulltext?.[p.id];
  const challenged = st?.status === 'challenge_required' || st?.lastError === 'challenge_required';
  const doi = String(p.doi || '').trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '');
  const validDoi = doi.length <= 300 && /^10\.\d{4,9}\/[^\s<>"#?]+$/i.test(doi);
  const manual = challenged ? `<div class="notice" data-ft-challenge="${h(p.id)}"><p>브라우저에서 로봇 확인을 직접 진행하세요. 받은 PDF는 선택한 조사 폴더에 넣고 폴더 확인으로 연결할 수 있어요.</p>
    <div class="row">${['https://sci-hub.st', 'https://sci-hub.ru', 'https://sci-hub.kr'].map(origin => `<a class="btn small" href="${h(origin + (validDoi ? '/' + encodeURI(doi) : '/'))}" target="_blank" rel="noopener noreferrer">${new URL(origin).hostname}에서 직접 확인</a>`).join('')}</div>
    <p class="hint">사이트에서 직접 확인해 주세요. 연결 가능 여부는 각 사이트의 응답에 따라 달라집니다.</p></div>` : '';
  const receiving = (S.fulltextActive || []).includes(p.id);
  const cands = candidateUrls(p);
  const publicUrl = cands.map(openAlexPdfPath).find(Boolean) || [...cands, p.fulltext?.landingPageUrl, p.link, validDoi ? `https://doi.org/${doi}` : ''].map(safeExternalUrl).find(Boolean) || '';
  const sciUrl = validDoi ? `https://sci-hub.kr/${encodeURI(doi)}` : '';
  const proxy = proxyPrefix();
  const lib = proxy && p.doi ? `<a class="btn small" href="${h(proxy + 'https://doi.org/' + p.doi)}" target="_blank" rel="noopener noreferrer">도서관으로 열기</a>` : '';
  const state = receiving ? '원문 받는 중'
    : st ? (st.status === 'extracted' ? `원문 텍스트 ${st.pageCount}쪽 확보` : ftLabel(st.status))
    : (cands.length ? '공개 원문 후보 있음' : '공개 원문 후보 없음');
  return `<p data-ft-state="${h(p.id)}">${h(state)}${st?.source === '로컬 폴더에서 가져온 PDF' ? ' · 로컬 폴더에서 가져온 PDF' : ''}${st?.lastError ? ` · 최근 시도: ${h(ftLabel(st.lastError))}(기존 자료 유지)` : ''}</p>
    <div class="row">${publicUrl ? `<a class="btn small" href="${h(publicUrl)}" target="_blank" rel="noopener noreferrer">${publicUrl.startsWith('/api/openalex-pdf') ? 'OpenAlex 원문 열기' : '공개 원문 사이트 열기'}</a>` : '<span class="hint">공개 원문 주소 없음</span>'}
    ${sciUrl ? `<a class="btn small" href="${h(sciUrl)}" target="_blank" rel="noopener noreferrer">Sci-Hub 사이트 열기</a>` : '<span class="hint">DOI가 없어 Sci-Hub 링크를 만들 수 없어요</span>'}
    ${st?.pdfAvailable ? `<button class="btn small" data-ract="ft-download" data-id="${h(p.id)}">이전에 보관한 PDF 다운로드</button>` : ''}
    ${lib}<label class="btn small">내 PDF 올리기<input type="file" accept="application/pdf" data-ract="ft-upload" data-id="${h(p.id)}" hidden></label></div>${manual}`;
}

/** @param {any} S */
export function refinePanel(S) {
  const rf = applyRefine(S.papers, S.refine);
  const shown = listedItems(S).length;
  const known = [...S.refine.include, ...S.refine.exclude, ...(S.researchBrief?.searchCriteria?.core || [])];
  const kws = suggestKeywords(S.papers, { known, limit: 8 });
  const rounds = S.refine.rounds || [];
  const top = Math.min(LIST_CAP, rf.visible.length);
  return `<section class="card stack" aria-labelledby="rf-h"><h2 id="rf-h" style="font-size:1.25rem">1. 거르기</h2>
    <p>수집 ${S.papers.length}편 → 조건 일치 ${rf.visible.length}편 → 상위 ${top}편</p>
    <form data-rform="refine" class="stack">
      <div class="filter-grid">
        <label>포함할 단어<textarea name="include" rows="1" data-fk="rf-include" placeholder="쉼표로 구분">${h(S.refine.include.join(', '))}</textarea></label>
        <label>제외할 단어<textarea name="exclude" rows="1" data-fk="rf-exclude" placeholder="쉼표로 구분">${h(S.refine.exclude.join(', '))}</textarea></label>
        <label>연도부터<input type="text" name="yearFrom" inputmode="numeric" value="${S.refine.yearFrom ?? ''}" placeholder="2020"></label>
        <label>연도까지<input type="text" name="yearTo" inputmode="numeric" value="${S.refine.yearTo ?? ''}" placeholder="2026"></label>
      </div>
      <label class="check"><input type="checkbox" name="requireAbstract" ${S.refine.requireAbstract ? 'checked' : ''}> 초록 있는 논문만</label>
      <div class="row"><button class="btn primary" type="submit">적용</button></div>
    </form>
    <p role="status">${h(S.refineMsg || '')}</p>
    ${kws.length ? `<div class="chips">${kws.map(k => `<button type="button" class="chip" data-ract="kw-include" data-term="${h(k.term)}">${h(k.term)} <span class="hint">${k.docCount}</span></button><button class="btn small" type="button" data-ract="kw-exclude" data-term="${h(k.term)}" aria-label="${h(k.term)} 제외">−</button>`).join('')}</div>` : ''}
    <details><summary>더 찾기·기록</summary>
      <div class="row"><button class="btn" type="button" data-ract="refine-search" ${S.refineBusy || S.dataMode !== 'real' ? 'disabled' : ''}>${S.refineBusy ? '찾는 중…' : '이 단어로 더 찾기'}</button>
      <button class="btn" type="button" data-ract="refine-clear">조건 지우기</button>
      ${S.estimatedTotal != null && S.papers.length < S.estimatedTotal ? `<button class="btn" data-act="more-remote" data-fk="more-remote">다음 50편 수집</button>` : ''}</div>
      ${rf.hidden.length ? `<p>숨긴 논문 ${rf.hidden.length}편</p><ul>${rf.hidden.slice(0, 30).map(x => `<li>${h(x.paper.title || x.paper.id)} <span class="hint">${x.reasons.map(h).join(' · ')}</span>${x.canRelease ? ` <button class="btn small" type="button" data-ract="refine-release" data-id="${h(x.paper.id)}">제외 해제</button>` : ''}</li>`).join('')}</ul>` : ''}
      ${rounds.length ? `<ol>${rounds.map((r) => `<li>${h(r.mode === 'search' ? '더 찾기' : '거르기')} · 포함 ${h((r.include || []).join(', ') || '없음')} · 제외 ${h((r.exclude || []).join(', ') || '없음')}${r.mode === 'search' ? ` · 새 논문 ${r.added}편` : ''} · 결과 ${r.matched ?? shown}편 <button class="btn small" type="button" data-ract="refine-reapply" data-id="${h(r.id)}">이 조건 다시 적용</button></li>`).join('')}</ol>` : ''}
      <p class="hint">논문은 지우지 않고 숨깁니다. 자주 나온 단어는 빈도이며 의미 판단이 아닙니다.</p>
    </details>
  </section>`;
}

/** @param {any} S */
export function selectBar(S) {
  const ids = listedItems(S).map((/** @type {any} */ it) => it.paper.id);
  const all = ids.length > 0 && ids.every((/** @type {string} */ id) => S.selPapers.includes(id));
  return `<button class="btn" type="button" data-ract="select-toggle">${all ? '선택 해제' : '모두 선택'}</button>`;
}

/** 목록 위의 원문 일괄 받기. @param {any} S */
export function bulkBar(S) {
  if (S.dataMode !== 'real') return '';
  const n = S.selPapers.length;
  const got = S.selPapers.filter((/** @type {string} */ id) => ['extracted', 'scan_only'].includes(S.fulltext?.[id]?.status)).length;
  const p = S.fulltextProgress;
  const busy = !!S.fulltextBusy;
  const done = p?.done || 0;
  const total = p?.total || n || 1;
  const folder = savedPdfFolder(S) || pdfFolderName(S.input || S.name || '');
  return `<section class="card stack" aria-labelledby="bulk-h"><h2 id="bulk-h" style="font-size:1.25rem">3. 원문 받기</h2>
    <div class="row"><button class="btn primary" type="button" data-ract="ft-bulk" ${n || busy ? '' : 'disabled'}>${busy ? '받기 취소' : `${n}편 원문 모두 받기`}</button>
    ${busy ? '<span class="spin" role="status" aria-label="받는 중"></span>' : ''}</div>
    ${busy ? `<progress value="${done}" max="${total}"></progress>` : ''}
    <p role="status">${busy ? '받는 중 ' : ''}${p ? `${done}/${total} · 확보 ${got} · 실패 ${p.fail || 0}` : ''}${S.fulltextMsg ? ` ${h(S.fulltextMsg)}` : ''}</p>
    <p class="meta">PDF 폴더 · data/inbox-pdfs/${h(folder)}</p>
    <details><summary>안내</summary><p class="hint">폴더 이름은 날짜와 주제 앞부분입니다. 받기를 누를 때 만들어집니다. 공개 원문을 먼저 받고, 없으면 Sci-Hub로 이어서 받습니다.</p></details>
  </section>`;
}

const INBOX_LABEL = { waiting: '감지됨', inspecting: '검사·추출 중', ready: '자동 연결됨', review: '연결 확인 필요', done: '저장 완료', failed: '가져오지 못함', over_limit: '용량 한도 초과', excluded: '제외' };

/** @param {any} S */
export function inboxPanel(S) {
  if (!isLocalApp() && (!S.inbox || S.inbox.offline)) return '<section class="card stack"><h3>PC PDF 자동 가져오기</h3><p>PC에서 연결 서버를 실행한 뒤 연결 코드를 입력하세요. 브라우저가 로컬 네트워크 접근을 물으면 허용하세요.</p><label>PC 연결 코드<input type="password" data-pc-code autocomplete="off"></label><button class="btn" data-ract="inbox-connect">이 PC 연결</button></section>';
  const box = S.inbox || { enabled: false, dir: '', pending: 0, items: [], offline: false };
  const target = box.targetProjectId || '';
  const here = S.projectId && target === S.projectId;
  const items = box.items || [];
  return `<section class="card stack" aria-labelledby="inbox-h"><h3 id="inbox-h">다운로드 폴더에서 자동 가져오기</h3>
    ${box.offline ? '<p class="error">PC 수신함에 연결하지 못했습니다. 로컬 서버 실행과 연결 코드, 브라우저의 로컬 네트워크 권한을 확인하세요.</p>' : ''}
    <p role="status">${box.enabled ? '폴더 감시가 켜져 있습니다.' : '폴더 감시는 꺼져 있습니다.'} 로컬 서버가 실행 중이어야 새 PDF를 발견합니다. 대기 ${box.pending || 0}건.${box.warnings?.[0] ? ` ${h(box.warnings[0])}` : ''}</p>
    <p class="meta">수신 폴더 ${h(box.dir || '')}</p>
    <div class="row">
      <button class="btn" type="button" data-ract="inbox-toggle">${box.enabled ? '자동 가져오기 끄기' : '자동 가져오기 켜기'}</button>
      <button class="btn" type="button" data-ract="inbox-copy">경로 복사</button>
      <button class="btn" type="button" data-ract="inbox-bind" ${S.projectId ? '' : 'disabled'}>현재 조사에 연결</button>
    </div>
    <p class="hint">${box.enabled ? '브라우저에서 이 폴더에 PDF를 저장하세요. 파일명이 저자명연도.pdf이면 그 저자·연도로 자동 연결합니다.' : '기본은 꺼져 있습니다.'} ${target ? `연결 대상 조사 ${h(target)}.` : '아직 연결할 조사를 지정하지 않았습니다.'} ${here ? '이 조사가 대상입니다.' : target ? '이 화면의 조사가 아니어서 자동 연결하지 않습니다.' : ''}</p>
    ${items.filter((/** @type {any} */ it) => it.status !== 'excluded').slice(0, 12).map((/** @type {any} */ it) => `<article class="card paper-row" data-inbox-id="${h(it.id)}">
      <p><strong>${h(/** @type {any} */ (INBOX_LABEL)[it.status] || it.status)}</strong> ${h(it.name)} ${it.doi ? `· ${h(it.doi)}` : ''} ${it.error ? `· ${h(it.error)}` : ''}</p>
      ${here && (it.status === 'review' || it.clientAction === 'review' || it.clientAction === 'replace') ? `<label>연결할 논문<select data-ract="inbox-pick" data-id="${h(it.id)}">${(S.papers || []).map((/** @type {any} */ p) => `<option value="${h(p.id)}" ${p.id === it.pick ? 'selected' : ''}>${h(String(p.title || p.id).slice(0, 80))}</option>`).join('')}</select></label>
        <div class="row"><button class="btn small" type="button" data-ract="inbox-link" data-id="${h(it.id)}">이 논문에 연결</button><button class="btn small" type="button" data-ract="inbox-exclude" data-id="${h(it.id)}">제외</button></div>` : ''}
      ${it.reason ? `<p class="hint">${h(it.reason)}</p>` : ''}
    </article>`).join('')}
  </section>`;
}

/** @param {any} S */
export function summarySection(S) {
  if (S.dataMode !== 'real') return '';
  const sel = S.selPapers.length;
  const ver = S.summaries || [];
  const draftIds = S.summaryDraftIds || [];
  const versions = ver.length ? `<ol>${ver.map((/** @type {any} */ v) => `<li>${h(v.at.slice(0, 16).replace('T', ' '))} · ${v.source === 'user' ? '내가 고침' : 'AI 정리본'} · 논문 ${v.paperIds.length}편
      <button class="btn small" type="button" data-ract="summary-load" data-id="${h(v.id)}">불러오기</button>
      <button class="btn small" type="button" data-ract="summary-dl" data-id="${h(v.id)}">.md 저장</button>
      <button class="btn small" type="button" data-ract="summary-develop" data-id="${h(v.id)}">더 발전시키는 프롬프트</button></li>`).join('')}</ol>` : '<p>아직 저장한 정리본이 없어요.</p>';
  return `<section class="card stack" aria-labelledby="sm-h"><h2 id="sm-h" style="font-size:1.25rem">4. Gemini 정리 프롬프트</h2>
    <p class="hint">PDF를 Gemini에 직접 첨부하고 이 지시서를 붙여 넣으세요. 첨부를 마치면 “정리 시작”이라고 입력하세요. 목록만 복사하면 원문은 전달되지 않습니다.</p>
    <p class="meta topic-line" title="${h(S.input || '')}">조사 주제 · ${h(S.input || '지정 안 함')}</p>
    <label class="focus-label" for="summary-focus">이번 정리에서 무엇을 알고 싶나요?</label>
    <textarea id="summary-focus" data-ract="summary-request" data-fk="summary-focus" rows="3" placeholder="예: 공정 변수와 결함의 관계를 다룬 방법 위주로, 처음 읽을 2~3편과 이유를 알고 싶어요.">${h(S.summaryRequest || '')}</textarea>
    <p class="hint">구체적으로 적을수록 Gemini가 넓게 늘어놓지 않고 이 질문에 맞춰 정리합니다.</p>
    <div class="row"><button class="btn primary" type="button" data-ract="summary-make" ${sel ? '' : 'disabled'}>${sel}편으로 정리 프롬프트 복사</button></div>
    <details><summary>전달 방식과 미리보기</summary>
      <label>전달 방식<select data-ract="summary-mode"><option value="attachments" ${S.summaryMode !== 'text' ? 'selected' : ''}>PDF 첨부용 · 짧은 지시서 (기본)</option><option value="text" ${S.summaryMode === 'text' ? 'selected' : ''}>PDF 첨부 없이 · 본문 발췌 포함</option></select></label>
      ${S.summaryPrompt ? `<label>미리보기<textarea rows="8" data-ract="summary-prompt-edit">${h(S.summaryPrompt)}</textarea></label><button class="btn" type="button" data-ract="summary-copy">다시 복사</button><button class="btn" type="button" data-ract="summary-prompt-dl">지시서 .md 저장</button><p class="hint">${S.summaryPrompt.length.toLocaleString()}자 · PDF와 별도 전달</p>` : '<p class="hint">복사 뒤에 미리보기가 열립니다.</p>'}
    </details>
    <h3>.md 가져오기</h3>
    <form data-rform="summary-import" class="stack"><label>.md 내용 붙여넣기<textarea name="md" rows="4"></textarea></label>
      <label>또는 .md 파일<input type="file" name="file" accept=".md,text/markdown,text/plain"></label>
      <button class="btn" type="submit">가져오고 형식 검사</button></form>
    <p role="status">${h(S.summaryMsg || '')}</p>
    <details><summary>저장한 정리본 ${ver.length}개</summary>${versions}
      ${S.summaryDraft ? `<label>불러온 정리본<textarea rows="8" data-ract="summary-draft">${h(S.summaryDraft)}</textarea></label>
        <div class="row"><button class="btn" type="button" data-ract="summary-save-draft">새 버전으로 저장</button><button class="btn" type="button" data-ract="summary-dl" data-id="__draft">.md로 저장</button></div>
        <p class="hint">${draftIds.map((/** @type {string} */ id, /** @type {number} */ i) => `P${i + 1}=${h(id)}`).join(' · ')}</p>` : ''}
    </details>
    <details><summary>안내</summary><p class="hint">이 사이트는 Gemini를 호출하지 않습니다. PDF는 Gemini의 파일 추가로 첨부하세요. 첨부 한도에 걸리면 같은 대화에서 나눠 첨부하고 마지막에 정리 시작을 요청하세요. 이전 정리본 발전 시에는 해당 .md도 첨부하세요. <label>도서관 주소 앞부분<input data-ract="proxy-set" value="${h(proxyPrefix())}" placeholder="https://"></label></p></details>
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
  const directions = (S.aiDirections || []).length ? `<details><summary>가져온 연구 방향 ${S.aiDirections.length}개</summary><ul>${S.aiDirections.map((/** @type {any} */ d) => `<li>${h(d.question)} <span class="hint">논문 ${d.paperIds.length}편${d.weak ? ' · 근거 부족' : ''} · ${h(d.reason || '')}</span></li>`).join('')}</ul></details>` : '';
  const compare = S.aiCompare?.rows?.length ? `<details><summary>가져온 비교 초안 · 확인된 수치가 아님</summary><ul>${S.aiCompare.rows.map((/** @type {any} */ r) => `<li>${h(r.item)} · ${r.cells.length}칸</li>`).join('')}</ul></details>` : '';
  const memos = (S.aiMemos || []).length ? `<details><summary>ChatGPT 메모 ${S.aiMemos.length}개</summary><ul>${S.aiMemos.slice(-5).map((/** @type {any} */ m) => `<li>${h(m.purpose)} · ${h(m.at.slice(0, 16).replace('T', ' '))} · ${h(m.text.slice(0, 120))}</li>`).join('')}</ul></details>` : '';
  const plan = S.chatgptPlan?.queries?.length ? `<details><summary>가져온 검색 문구 ${S.chatgptPlan.queries.length}개 · 아직 검색하지 않음</summary><ul>${S.chatgptPlan.queries.map((/** @type {any} */ q) => `<li>${h(q.text)} <span class="hint">${h(q.purpose || '')}</span></li>`).join('')}</ul><button class="btn small" type="button" data-ract="gpt-copy-queries">검색 문구 복사</button></details>` : '';
  return `<section class="stack" aria-labelledby="gpt-h"><h2 id="gpt-h" style="font-size:1.125rem">내 ChatGPT에 맡기기</h2>
    <label>목적<select data-ract="gpt-purpose">${PURPOSES.map(p => `<option value="${p.id}" ${p.id === purpose.id ? 'selected' : ''}>${h(p.title)}</option>`).join('')}</select></label>
    <p class="hint">${h(purpose.blurb)}</p>
    ${focus}${note}${range}
    <div class="row"><button class="btn primary" type="button" data-ract="gpt-build">ChatGPT에 붙일 내용 만들고 복사</button>${S.chatgptPrompt ? '<button class="btn" type="button" data-ract="gpt-copy">다시 복사</button><button class="btn" type="button" data-ract="gpt-dl">.md로 저장</button>' : ''}${S.chatgptUndo ? '<button class="btn" type="button" data-ract="gpt-undo">마지막 적용 되돌리기</button>' : ''}</div>
    ${S.chatgptPrompt ? `<label>미리보기(고쳐서 복사할 수 있어요)<textarea rows="8" data-ract="gpt-prompt">${h(S.chatgptPrompt)}</textarea></label>` : ''}
    <form data-rform="gpt-import" class="stack"><label>ChatGPT 답변 붙여넣기<textarea name="answer" rows="5" placeholder="JSON 또는 글"></textarea></label><button class="btn" type="submit">답변 확인</button></form>
    <p role="status" class="hint">${h(S.chatgptMsg || '')}</p>
    ${preview}${directions}${compare}${memos}${plan}
  </section>`;
}

export { summaryPrompt };
