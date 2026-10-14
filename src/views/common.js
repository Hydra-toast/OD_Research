// 뷰 공통 도우미. 상태를 읽지 않는 순수 함수.
import { EXAMPLE_LABEL } from '../data/examples.js';
import { ACCESS_LABEL, ORIGIN_LABEL } from '../logic.js';

export const h = (/** @type {any} */ s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));

/** 색에만 의존하지 않도록 아이콘을 함께 쓴다. 아이콘은 장식(aria-hidden), 뜻은 글자가 전한다. */
const ICON = { ok: '✓', warn: '!', example: '◇', info: 'i' };
export const tag = (/** @type {'ok'|'warn'|'example'|'info'|''} */ kind, /** @type {string} */ text) =>
  `<span class="tag ${kind}">${kind ? `<span class="ico" aria-hidden="true">${ICON[kind]}</span>` : ''}${h(text)}</span>`;

export const exampleTag = () => tag('example', EXAMPLE_LABEL);
export const accessTag = (/** @type {any} */ p) => tag('', ACCESS_LABEL[p.access]);
/** 논문 출처 표시: 예시/사용자/공급자를 구분한다. */
export const originTag = (/** @type {any} */ p) => p.origin === 'user' ? tag('warn', ORIGIN_LABEL.user) : p.origin === 'example' ? exampleTag() : tag('info', ORIGIN_LABEL.provider);
export const fmtTime = (/** @type {string|null} */ iso) => { try { return iso ? new Date(iso).toLocaleString('ko-KR') : '미상'; } catch { return '미상'; } };
