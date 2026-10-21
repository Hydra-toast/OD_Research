// 진입점: 모듈을 연결하고 시작한다. 로직은 logic.js, 상태는 state/, 화면은 views/, 연결은 controller/.
import { initEvents } from './controller/events.js';
import { initResearch } from './controller/research.js';
import { initLanding } from './controller/landing.js';
import { render, renderSaved } from './controller/render.js';
import { initFromUrl, handlePopState } from './controller/session.js';
import { initAccount } from './controller/account.js';
import { loadRuntime } from './controller/runtime.js';

initLanding();
initEvents();
initResearch();
window.addEventListener('popstate', () => { handlePopState(); });
render();
renderSaved();
loadRuntime();
initAccount();
initFromUrl();
