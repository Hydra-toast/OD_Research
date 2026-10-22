// 랩미팅 준비 화면.
import { h, tag, exampleTag, accessTag, originTag } from './common.js';
import { recoveryHtml } from './saved.js';
import { COMPARE_ITEMS, EMPTY_LABEL } from '../data/content.js';
import { EMPTY_REASONS } from '../schema.js';
import { buildCompareRows, rowCompareWarning, candidateEvidencePapers, claimLabels, nextQuestion, ORIGIN_LABEL } from '../logic.js';
import { meta, scopeText, selectedPapers } from '../state/store.js';

/** @param {any} S */
export function prepareHtml(S) {
  if (S.status === 'corrupt' || S.status === 'missing') return recoveryHtml(S);
  if (S.status !== 'ok') return `<div class="card stack"><h2 tabindex="-1">먼저 주제를 입력해 주세요</h2><p>탐색에서 논문이나 방향을 고르면 이곳으로 가져와요.</p><a class="btn primary" href="#brief">입력하러 가기</a></div>`;
  if (!S.selPapers.length && !S.selDirs.length) return `<div class="card stack"><h2 tabindex="-1">선택한 자료가 없어요</h2><p>탐색 화면에서 논문의 “준비 자료에 추가”를 눌러주세요.</p><button class="btn primary" data-act="goto-explore" data-fk="back">탐색으로 돌아가기</button></div>`;
  const papers = selectedPapers(S);
  const claims = S.selDirs.map((/** @type {string} */ id) => S.claims[id]).filter(Boolean);
  const rows = buildCompareRows(papers, meta(S), S.cellEdits);
  const open = claims.filter((/** @type {any} */ c) => !c.state.userConfirmed);
  const origins = new Set(papers.map((/** @type {any} */ p) => p.origin));
  return `<div class="stack">
    <section class="card stack"><h2 tabindex="-1">조사 질문과 범위</h2><p class="orig">${h(S.input)}</p><p>${h(scopeText(S))}</p>
      <p>${S.dataMode === 'real' ? tag('info', '실제 검색 자료 · 본문 미확보') : exampleTag()} <button class="btn small" data-act="goto-explore">탐색으로 돌아가기</button></p>
      ${origins.has('user') ? `<p class="notice">${tag('warn', ORIGIN_LABEL.user)} 선택한 논문에 사용자가 직접 넣은 자료가 있어요${origins.has('example') ? '. 가상 예시와 섞여 있으니 구분해서 봐주세요' : ''}.</p>` : ''}</section>
    <section class="stack"><h2 style="font-size:1.25rem">논문 비교 (${papers.length}편)</h2>
      ${papers.length ? compareTable(S, rows) : '<p class="card">선택한 논문이 없어요.</p>'}
      <p class="hint">빈칸은 추정으로 채우지 않아요. 수치에는 단위·측정 조건·근거를 연결해야 하며, 초록만 확보한 자료는 위치를 제공하지 않아요. 단위나 조건이 다른 수치는 직접 비교하지 않아요.</p></section>
    <section class="stack"><h2 style="font-size:1.25rem">논문 메모</h2>${papers.map((/** @type {any} */ p) => `<label>${h(p.title)} 메모<textarea data-act="note" data-id="${p.id}" data-fk="note-${p.id}">${h(S.notes[p.id] ?? '')}</textarea></label>`).join('') || '<p class="hint">선택한 논문이 없어요.</p>'}</section>
    <section class="stack"><h2 style="font-size:1.25rem">발표할 문장과 근거</h2>
      <p class="notice">${tag('info', 'AI 해석 안내')} ${S.dataMode === 'real' ? '이 검색 결과에는 AI 분석을 실행하지 않았어요. 직접 정리한 문장과 조건은 원문에서 확인하세요.' : 'AI 해석이 포함되어 있어요. 발표에 사용할 조건과 수치는 연결된 원문에서 확인하세요. (이 예시에서는 실제 AI가 실행되지 않았어요.)'}</p>
      ${claims.map((/** @type {any} */ c) => claimCard(S, c)).join('') || '<p class="card">고른 논문의 비교와 메모로 정리해요.</p>'}</section>
    <section class="card stack"><h2 style="font-size:1.25rem">아직 확인할 사항</h2>
      <ul>${open.map((/** @type {any} */ c) => `<li>${h(c.text)} — ${claimLabels(c).join(' / ')}</li>`).join('') || '<li>미확인 문장 없음</li>'}${S.questions.map((/** @type {string} */ q) => `<li>나중에 확인: ${h(q)}</li>`).join('')}</ul></section>
    <section class="card stack"><h2 style="font-size:1.25rem">내보내기</h2>
      <p class="hint">선택한 논문·메모·수정한 값·출처·자료 범위·미확인·예시 표시가 파일에도 남아요. 실제 PPT는 만들지 않아요.</p>
      <div class="row"><button class="btn" data-act="export" data-kind="summary" data-mode="copy">한 페이지 요약 복사</button><button class="btn" data-act="export" data-kind="summary" data-mode="download">요약 Markdown 받기</button>
      <button class="btn" data-act="export" data-kind="guide" data-mode="copy">발표 가이드 복사</button><button class="btn" data-act="export" data-kind="guide" data-mode="download">가이드 Markdown 받기</button></div>
      <p id="export-status" role="status" class="hint"></p>
      <details><summary>랩미팅 피드백으로 새 버전</summary>
        <form data-act="feedback-save" class="stack"><label>피드백<select name="kind"><option value="no_equipment">장비 없음</option><option value="weak_link">기존 연구와 연결 약함</option><option value="compare_other">다른 소재 비교</option><option value="need_recent">최근 논문 보강</option><option value="free">자유 입력</option></select></label><button class="btn" type="submit">피드백 반영</button></form>
        <p class="hint">선택과 메모는 지우지 않아요. ${h(S.feedbackNote || '')}</p></details>
      <button class="btn" type="button" data-act="print">인쇄용 요약 보기</button>
      ${S.exportText ? `<label>복사용 텍스트(직접 선택해 복사하세요)<textarea class="fallback" readonly id="export-fallback">${h(S.exportText)}</textarea></label>` : ''}</section></div>`;
}

/** @param {any} S @param {any[]} rows */
function compareTable(S, rows) {
  const head = rows.map(r => `<th scope="col">${h(r.paper.title)}<br>${originTag(r.paper)}</th>`).join('');
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
    <div class="row"><button class="btn" data-act="claim-ev" data-id="${c.id}" data-fk="ev-${c.id}">근거 보기</button>
    <button class="btn" data-act="claim-recheck" data-id="${c.id}" data-fk="rc-${c.id}">근거 다시 확인</button>
    <button class="btn" data-act="claim-confirm" data-id="${c.id}" data-fk="cf-${c.id}">내가 확인했어요</button>
    <button class="btn" data-act="claim-q" data-id="${c.id}" data-fk="cq-${c.id}">근거 함께 살펴보기</button></div>
    ${S.qClaim === c.id ? (q ? `<div class="q-box" role="group" aria-label="확인 질문"><p><strong>${h(q.text)}</strong></p><div class="row">
      <button class="btn small" data-act="q-act" data-kind="revise" data-id="${c.id}">주장 범위 수정</button>
      <button class="btn small" data-act="q-act" data-kind="evidence" data-id="${c.id}" data-fk="qe-${c.id}">근거 추가</button>
      <button class="btn small" data-act="q-act" data-kind="ask" data-id="${c.id}">나중에 확인할 질문으로 남기기</button>
      <button class="btn small" data-act="q-act" data-kind="unknown" data-id="${c.id}">모르겠어요 / 원문에서 못 찾았어요</button></div>
      ${S.qMsg ? `<p class="notice" role="status">${h(S.qMsg)}</p>` : ''}
      ${S.qPick === c.id && cands.length ? `<div role="group" aria-label="추가할 근거 고르기"><p class="hint">추가할 논문을 고르세요(초록 기준 근거, 위치 없음).</p>${cands.map((/** @type {any} */ p) => `<button class="btn small" data-act="ev-pick" data-id="${c.id}" data-pid="${h(p.id)}">${h(p.title)} ${accessTag(p)}</button>`).join(' ')}</div>` : ''}</div>`
      : '<p class="q-box">지금 더 물어볼 질문이 없어요. 그래도 원문 확인은 필요해요.</p>') : ''}</article>`;
}
