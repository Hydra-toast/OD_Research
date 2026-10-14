// 진입점: 모듈을 연결하고 시작한다. 로직은 logic.js, 상태는 state/, 화면은 views/, 연결은 controller/.
import { initEvents } from './controller/events.js';
import { initLanding } from './controller/landing.js';
import { renderSaved } from './controller/render.js';
import { initFromUrl, handlePopState } from './controller/session.js';
import { initAccount } from './controller/account.js';

initLanding();
initEvents();
window.addEventListener('popstate', () => { handlePopState(); });
renderSaved();
initAccount();
initFromUrl();
