// 랜딩: 입력 폼, 추천 주제, 기능 예시 전환.
import { EXAMPLE_TOPICS } from '../data/examples.js';
import { $ } from './render.js';
import { search, searchExample } from './session.js';

const DEMO = {
  cond: { excerpt: '…가상 발췌: <mark>노광 후 베이크 온도와 현상 시간</mark>을 바꾸며 패턴을 비교했다…', why: '같은 조건에서 비교했는지 확인해야 결과를 직접 비교할 수 있어요.', use: '“조건이 같을 때만 결과를 나란히 놓았다”는 문장의 근거로 사용' },
  limit: { excerpt: '…가상 발췌: <mark>한 가지 기판에서만 평가했기 때문에 일반화에는 한계가 있다</mark>…', why: '저자가 밝힌 한계는 우리 연구에 적용할 때 추가로 확인할 항목이에요.', use: '“적용 범위는 추가 확인 필요”로 발표 문장에 한계를 함께 표기' },
};
function setDemo(/** @type {'cond'|'limit'} */ k) {
  document.querySelectorAll('[data-demo]').forEach(b => b.setAttribute('aria-pressed', String(/** @type {HTMLElement} */ (b).dataset.demo === k)));
  $('#demo-excerpt').innerHTML = DEMO[k].excerpt; $('#demo-why').textContent = DEMO[k].why; $('#demo-use').textContent = DEMO[k].use;
}

export function initLanding() {
  document.addEventListener('click', e => {
    const t = /** @type {any} */ (e.target)?.closest?.('[data-example],[data-demo]');
    if (!t) return;
    if (t.dataset.example) { $('#brief').value = EXAMPLE_TOPICS[t.dataset.example].input; $('#brief-error').hidden = true; $('#brief').focus(); }
    else if (t.dataset.demo) setDemo(t.dataset.demo);
  });
  $('#brief-form').addEventListener('submit', (/** @type {Event} */ e) => {
    e.preventDefault();
    const v = $('#brief').value.trim(), err = $('#brief-error');
    if (!v) { err.textContent = '기억나는 주제나 표현을 적어주세요.'; err.hidden = false; $('#brief').focus(); return; }
    err.hidden = true; search(v);
  });
  $('#try-example').addEventListener('click', () => { $('#brief-error').hidden = true; searchExample('euv'); });
  setDemo('cond');
}
