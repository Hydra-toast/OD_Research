// 근거 패널: 주장 근거 보기와 예시 문서 보기가 같은 패널을 쓴다.
import { h, accessTag, originTag, exampleTag } from './common.js';
import { claimByCid, paperById } from '../state/store.js';

/** @param {any} S @returns {string|null} 패널에 넣을 HTML. 열려 있지 않으면 null */
export function evidenceHtml(S) {
  const ev = S.evOpen;
  if (!ev) return null;
  if (ev.paperId) {
    const p = paperById(ev.paperId, S);
    if (!p) return null;
    return `<h3>${h(p.title)}</h3><p>${originTag(p)} ${accessTag(p)}</p>
      <p class="meta">${p.origin === 'user' ? '사용자가 입력한 내용이에요(확인 전).' : '가상 예시 문서예요. 실제 논문이 아니에요.'}</p>
      ${p.abstract ? `<h4>초록</h4><blockquote>${h(p.abstract)}</blockquote>` : '<p>초록이 없어요(서지정보만 확보).</p>'}
      <p>위치 정보 없음 — 원문이 없어서 절·그림·페이지를 제공하지 않아요.</p><p class="hint">원문 링크: 없음</p>`;
  }
  const c = claimByCid(ev.claimId, S);
  if (!c) return null;
  return `<p class="hint">${h(c.text)}</p><p>${exampleTag()}</p>` + (c.evidence ?? []).filter(Boolean).map((/** @type {any} */ e) => {
    const p = paperById(e.paperId, S);
    const loc = e.location && typeof e.location === 'object' ? Object.entries(e.location).filter(([, v]) => v != null) : [];
    return `<section><h3>${h(p?.title ?? e.paperId)}</h3><p class="meta">${p ? accessTag(p) : ''} · 문서 버전 ${h(e.documentVersion)}</p><blockquote>${h(e.excerpt)}</blockquote>
      <p>${loc.length ? loc.map(([k, v]) => `${k}: ${h(v)}`).join(', ') : '위치 정보 없음 — 초록만 확보해서 절·그림·페이지를 제공하지 않아요. 원문에서 확인하세요.'}</p><p class="hint">원문 링크: 없음</p></section>`;
  }).join('');
}
