// DOM 반영. 뷰 함수가 만든 HTML을 꽂고 포커스를 복원한다.
import { S } from '../state/store.js';
import { exploreHtml } from '../views/explore.js';
import { prepareHtml } from '../views/prepare.js';
import { evidenceHtml } from '../views/evidence.js';
import { savedListHtml } from '../views/saved.js';
import { repo } from './deps.js';

export const $ = /** @type {(s:string)=>any} */ (s => document.querySelector(s));
export const cssEsc = (/** @type {string} */ s) => CSS.escape(s);
export const focusFk = (/** @type {string} */ k) => $(`[data-fk="${cssEsc(k)}"]`)?.focus?.();

export function showWorkspace(on = true) { $('#workspace').hidden = !on; }

export function render() {
  const fk = /** @type {any} */ (document.activeElement)?.dataset?.fk;
  const recovery = S.status === 'corrupt' || S.status === 'missing';
  const tab = recovery ? 'explore' : S.tab;
  $('#sel-count').textContent = String(S.selPapers.length + S.selDirs.length);
  const ex = $('#tab-explore'), pr = $('#tab-prepare');
  ex.setAttribute('aria-selected', String(tab === 'explore')); ex.tabIndex = tab === 'explore' ? 0 : -1;
  pr.setAttribute('aria-selected', String(tab === 'prepare')); pr.tabIndex = tab === 'prepare' ? 0 : -1;
  $('#panel-explore').hidden = tab !== 'explore';
  $('#panel-prepare').hidden = tab !== 'prepare';
  if (tab === 'explore') $('#panel-explore').innerHTML = exploreHtml(S); else $('#panel-prepare').innerHTML = prepareHtml(S);
  renderEvidence();
  if (fk) focusFk(fk);
}

export function renderEvidence() {
  const el = $('#evidence-panel');
  const html = evidenceHtml(S);
  el.hidden = html == null;
  if (html != null) $('#ev-body').innerHTML = html;
}

export function setSave(/** @type {string} */ msg, /** @type {boolean} */ err) {
  S.saveMsg = msg; S.saveErr = err;
  const el = $('#save-state');
  el.className = 'save-state' + (err ? ' err' : '');
  el.replaceChildren(document.createTextNode(msg));
  if (err) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn small'; b.dataset.act = 'retry-save'; b.textContent = '다시 저장';
    el.append(' ', b);
  }
}

export async function renderSaved() {
  const box = $('#saved-list');
  try { box.innerHTML = savedListHtml(await repo.list()); }
  catch { box.innerHTML = '<p class="error">저장소를 읽지 못했어요. 브라우저의 저장 설정을 확인해 주세요.</p>'; }
}
