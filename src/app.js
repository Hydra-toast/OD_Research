// 진입점: 모듈을 연결하고 시작한다. 로직은 logic.js, 상태는 state/, 화면은 views/, 연결은 controller/.
import { initEvents } from './controller/events.js';
import { initResearch } from './controller/research.js';
import { initLanding } from './controller/landing.js';
import { render, renderSaved } from './controller/render.js';
import { initFromUrl, handlePopState } from './controller/session.js';
import { initAccount } from './controller/account.js';
import { loadRuntime } from './controller/runtime.js';
import { initInbox } from './controller/inbox.js';

initLanding();
initEvents();
initResearch();
initInbox();
window.addEventListener('popstate', () => { handlePopState(); });
render();
renderSaved();
loadRuntime();
initAccount();
initFromUrl();

document.getElementById('parallel-toggle')?.addEventListener('click', e => {
  const button = /** @type {HTMLButtonElement} */ (e.currentTarget);
  const single = document.body.dataset.single !== 'true';
  document.body.dataset.single = String(single);
  button.setAttribute('aria-pressed', String(!single));
  button.textContent = single ? '탭으로 보기' : '좌우 함께 보기';
  render();
});

document.querySelector('.parallel-steps')?.addEventListener('click', e => {
  const target = /** @type {HTMLElement} */ (e.target);
  const link = target.closest('a');
  if (!link || document.body.dataset.single !== 'true') return;
  const pane = link.getAttribute('href') === '#panel-prepare' ? 'prepare' : 'explore';
  document.getElementById('tab-' + pane)?.click();
});
