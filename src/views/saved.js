// 저장한 조사 목록과 손상·없음 복구 화면.
import { h, tag, fmtTime } from './common.js';

/** @param {any[]} all */
export function savedListHtml(all) {
  if (!all.length) return '<p class="card">아직 저장한 조사가 없어요. 예시 주제로 시작하면 이 브라우저에 자동 저장돼요.</p>';
  return all.map(p => p.corrupt
    ? `<div class="saved-item"><span>${tag('warn', p.readOnly ? '읽기 전용' : '복구 필요')} ${p.readOnly ? '더 새로운 형식으로 저장된 조사예요.' : '저장 데이터가 깨졌어요.'} 삭제하지 않았어요. <span class="hint">(${h(p.name ?? p.id)})</span></span>
       <span class="row" style="margin:0"><button class="btn small" data-act="open-saved" data-id="${h(p.id)}">상태 보기</button><button class="btn small" data-act="raw-export" data-id="${h(p.id)}">원본 내보내기</button>${p.readOnly ? '' : `<button class="btn small" data-act="delete-saved" data-id="${h(p.id)}" data-name="${h(p.name ?? p.id)}">삭제</button>`}</span></div>`
    : `<div class="saved-item"><span><strong>${h(p.name)}</strong> <span class="hint">· ${h(p.scope)} · ${h(fmtTime(p.updatedAt))}</span></span>
       <span class="row" style="margin:0"><button class="btn small" data-act="open-saved" data-id="${h(p.id)}">열기</button><button class="btn small" data-act="rename-saved" data-id="${h(p.id)}">이름 변경</button><button class="btn small" data-act="delete-saved" data-id="${h(p.id)}" data-name="${h(p.name)}">삭제</button></span></div>`).join('');
}

/** 손상 또는 없는 프로젝트. 자동 삭제·자동 덮어쓰기를 하지 않는다. @param {any} S */
export function recoveryHtml(S) {
  if (S.status === 'missing') {
    return `<div class="card stack" role="alert"><h2 tabindex="-1">저장된 조사를 찾지 못했어요</h2>
      <p>주소의 조사(${h(S.notFoundId)})가 이 브라우저에 없어요. 삭제됐거나 다른 브라우저에서 만든 조사일 수 있어요.</p>
      <div class="row"><button class="btn primary" data-act="go-home" data-fk="home">새 조사 시작하기</button></div></div>`;
  }
  const c = S.corrupt ?? { errors: [], id: '' };
  const shown = c.errors.slice(0, 8);
  return `<div class="card stack" role="alert"><h2 tabindex="-1">${S.readOnly ? '이 조사는 읽기 전용으로만 열 수 있어요' : '저장된 조사를 열 수 없어요'}</h2>
    <p>${S.readOnly ? '더 새로운 버전의 앱에서 저장한 데이터예요. 지금 앱에서 열거나 덮어쓰면 내용이 손상될 수 있어서 열지 않았어요.' : '저장된 데이터에서 다음 문제를 찾았어요. 데이터는 지우거나 고치지 않고 그대로 남겨뒀어요.'}</p>
    <ul>${shown.map((/** @type {string} */ e) => `<li>${h(e)}</li>`).join('')}${c.errors.length > shown.length ? `<li>…외 ${c.errors.length - shown.length}건</li>` : ''}</ul>
    <div class="row"><button class="btn" data-act="raw-export" data-id="${h(c.id)}" data-fk="raw">원본 내보내기(JSON)</button>
    ${S.readOnly ? '' : `<button class="btn" data-act="delete-saved" data-id="${h(c.id)}" data-name="${h(c.name ?? c.id)}" data-fk="del">이 조사 삭제</button>`}
    <button class="btn primary" data-act="go-home" data-fk="home">새 조사 시작하기</button></div></div>`;
}
