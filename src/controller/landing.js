// 랜딩: 입력 폼.
import { EXAMPLE_TOPICS } from '../data/examples.js';
import { $, isWorkspaceLayout } from './render.js';
import { search, searchExample, searchMany } from './session.js';
import { runtime } from './runtime.js';
import { consultPrompt } from '../research/brief.js';
import { parseConsult } from '../research/import.js';
import { h } from '../views/common.js';

/** @type {any} */
let importedBrief = null;

function contextOf() {
  return { speech: $('#brief').value.trim(), field: $('#brief-field')?.value?.trim() || '', conditions: $('#brief-conditions')?.value?.trim() || '' };
}

function showPlan() {
  const box = $('#brief-plan');
  const ctx = contextOf();
  const consult = consultPrompt(ctx);
  const workspace = isWorkspaceLayout();
  box.hidden = false;
  box.innerHTML = `${workspace ? '' : '<div class="row"><button type="button" class="btn primary" data-brief="broad">바로 찾기</button></div>'}
    <details ${workspace ? 'open' : ''}><summary>ChatGPT로 검색 문구 다듬기 · 직접 검색 문구 작성</summary>
    <p class="hint">복사한 글을 본인 ChatGPT에 붙여 넣으세요. 이 사이트는 전송하지 않습니다.</p>
    <textarea data-consult-prompt rows="8">${h(consult)}</textarea>
    <div class="row">
      <button type="button" class="btn" data-brief="copy">ChatGPT 상담 프롬프트 복사</button>
      <button type="button" class="btn" data-brief="paste">상담 결과 붙여넣기</button>
      <button type="button" class="btn" data-brief="manual">직접 검색 문구 작성</button>
    </div>
    <form data-brief-form="consult" hidden class="stack"><label>상담 결과<textarea data-consult-result rows="8" placeholder="consult-v1 JSON 또는 일반 문장"></textarea></label><button class="btn" type="submit">결과 확인</button><div data-brief-status></div></form>
    <form data-brief-form="manual" hidden class="stack">${[1, 2, 3, 4, 5].map(n => `<label>검색 문구 ${n}<input data-manual  placeholder="english keywords"></label>`).join('')}<button class="btn primary" type="submit">작성한 검색 문구 실행</button></form>
    </details>`;
}

function setFormStatus(/** @type {HTMLFormElement} */ form, /** @type {string} */ message, /** @type {string} */ repair = '') {
  let slot = form.querySelector('[data-brief-status]');
  if (!slot) {
    form.insertAdjacentHTML('beforeend', '<div data-brief-status></div>');
    slot = form.querySelector('[data-brief-status]');
  }
  if (!slot) return;
  slot.innerHTML = `<p class="error" role="alert">${h(message)}</p>${repair ? `<label>ChatGPT에 다시 붙일 보완 요청<textarea data-repair-prompt rows="8" readonly>${h(repair)}</textarea></label><button type="button" class="btn" data-brief="repair-copy">보완 요청 복사</button>` : ''}`;
}

function queryEditor(/** @type {any} */ brief) {
  const rows = brief.queries.map((/** @type {any} */ q) => `<label class="card"><input type="checkbox" data-query checked value="${h(q.text)}"> <strong>${h(q.text)}</strong><br><span class="hint">${h(q.purpose || '')}</span></label>`).join('');
  const confirm = brief.needsConfirm?.length ? `<p class="notice">사용자 확인 필요: 근거 문장이 입력한 내용에 없어요. ${brief.needsConfirm.map(h).join(', ')}.</p>` : '';
  const notes = [...(brief.warnings || []), ...(brief.assumptions || []), ...(brief.unknowns || [])];
  return `<h2>검색 문구를 확인하고 실행</h2>${confirm}<p>제안된 초기 조사 주제: ${h(brief.selectedTopic?.name || '직접 확인')}</p><p>${h(brief.selectedTopic?.question || '')}</p>${notes.length ? `<details><summary>가정과 확인할 내용</summary><ul>${notes.map(n => `<li>${h(n)}</li>`).join('')}</ul></details>` : ''}<p class="hint">원래 입력은 바꾸지 않았어요. 가정과 검색 문구를 확인한 뒤 실행하세요.</p><form data-brief-form="queries" class="stack">${rows}<label>검색 문구 추가<input data-query-add type="text" placeholder="영문 검색 문구"></label><div class="row"><button class="btn primary" type="submit">선택한 검색 문구 실행</button></div></form>`;
}

export function initLanding() {
  document.addEventListener('click', e => {
    const t = /** @type {any} */ (e.target)?.closest?.('[data-example]');
    if (!t) return;
    $('#brief').value = EXAMPLE_TOPICS[t.dataset.example].input; $('#brief-error').hidden = true; $('#brief').focus();
  });
  $('#brief-form').addEventListener('submit', (/** @type {Event} */ e) => {
    e.preventDefault();
    const v = $('#brief').value.trim(), err = $('#brief-error');
    if (!v) { err.textContent = '알아보고 싶은 내용을 적어 주세요.'; err.hidden = false; $('#brief').focus(); return; }
    err.hidden = true;
    // 기본 작업 화면의 기본 찾기는 중간 '바로 찾기' 클릭 없이 한 번에 실행한다.
    if (!runtime.search || isWorkspaceLayout()) {
      const box = $('#brief-plan');
      if (box) box.hidden = true;
      search(v);
      return;
    }
    showPlan();
  });
  document.addEventListener('click', async (e) => {
    const t = /** @type {any} */ (e.target)?.closest?.('[data-brief]');
    if (!t) return;
    const box = $('#brief-plan');
    const speech = $('#brief').value.trim();
    if (!speech) { $('#brief-error').textContent = '알아보고 싶은 내용을 적어 주세요.'; $('#brief-error').hidden = false; $('#brief').focus(); return; }
    $('#brief-error').hidden = true;
    if (t.dataset.brief === 'open-plan') {
      if (!box.hidden) { box.hidden = true; return; }
      showPlan();
      return;
    }
    if (box.hidden) showPlan();
    if (t.dataset.brief === 'broad') { box.hidden = true; search(speech); return; }
    if (t.dataset.brief === 'copy') {
      const text = box.querySelector('[data-consult-prompt]')?.value || consultPrompt(contextOf());
      try { await navigator.clipboard.writeText(text); t.textContent = '복사했어요'; } catch { box.insertAdjacentHTML('beforeend', `<textarea readonly>${h(text)}</textarea>`); }
      return;
    }
    if (t.dataset.brief === 'repair-copy') {
      const input = box.querySelector('[data-repair-prompt]');
      try { await navigator.clipboard.writeText(input?.value || ''); t.textContent = '복사했어요'; }
      catch { input?.focus(); input?.select(); t.textContent = '선택된 내용을 직접 복사하세요'; }
      return;
    }
    if (t.dataset.brief === 'paste') box.querySelector('[data-brief-form="consult"]')?.removeAttribute('hidden');
    if (t.dataset.brief === 'manual') box.querySelector('[data-brief-form="manual"]')?.removeAttribute('hidden');
  });
  document.addEventListener('submit', async (e) => {
    const form = /** @type {any} */ (e.target);
    if (form?.dataset?.briefForm === 'consult') {
      e.preventDefault();
      const parsed = parseConsult(form.querySelector('[data-consult-result]')?.value || '', $('#brief').value);
      if (!parsed.ok) {
        setFormStatus(form, parsed.message || parsed.errors?.join(' ') || '결과를 확인하지 못했어요.', parsed.repairPrompt || '');
        return;
      }
      importedBrief = { ...parsed.brief, needsConfirm: parsed.needsConfirm, speech: $('#brief').value };
      $('#brief-plan').innerHTML = queryEditor({ ...parsed.brief, needsConfirm: parsed.needsConfirm, warnings: parsed.warnings });
    }
    if (form?.dataset?.briefForm === 'manual') {
      e.preventDefault();
      const queries = [...form.querySelectorAll('[data-manual]')].map((el) => el.value.trim()).filter(Boolean);
      if (!queries.length) { setFormStatus(form, '영문 검색 문구를 하나 이상 적어 주세요.'); return; }
      importedBrief = { selectedTopic: { name: $('#brief').value.trim() }, searchCriteria: { core: [], preferred: [], excluded: [], synonyms: [] }, queries: queries.map((text, i) => ({ id: `m${i + 1}`, text, purpose: '사용자 작성' })), speech: $('#brief').value };
      const box = $('#brief-plan');
      if (box) box.hidden = true;
      await searchMany(queries, $('#brief').value.trim(), importedBrief);
    }
    if (form?.dataset?.briefForm === 'queries') {
      e.preventDefault();
      const picked = [...form.querySelectorAll('[data-query]:checked')].map((el) => el.value.trim()).filter(Boolean);
      if (!picked.length && !form.querySelector('[data-query-add]')?.value?.trim()) { setFormStatus(form, '실행할 검색 문구를 하나 이상 남겨 주세요.'); return; }
      const extra = form.querySelector('[data-query-add]')?.value?.trim();
      if (extra) picked.push(extra);
      const speech = $('#brief').value.trim();
      const box = $('#brief-plan');
      if (box) box.hidden = true;
      await searchMany(picked, importedBrief?.selectedTopic?.name || speech, importedBrief || { speech, searchCriteria: {} });
    }
  });
  $('#try-example')?.addEventListener('click', () => { $('#brief-error').hidden = true; searchExample('euv'); });
}
