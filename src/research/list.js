// 화면에 보여줄 논문. 실검색은 거르기 뒤 정렬 기준 상위 30편만 쓴다.
import { ranked, meta } from '../state/store.js';
import { applyRefine } from './refine.js';

export const LIST_CAP = 30;
export const EXAMPLE_CAP = 5;

/** 거르기를 통과한 논문. 정렬은 ranked가 이미 적용했다. @param {any} S */
export function matchedItems(S) {
  const ok = new Set(applyRefine(S.papers, S.refine).visible.map((/** @type {any} */ p) => p.id));
  const m = meta(S);
  return ranked(S).items.filter((/** @type {any} */ it) => (!S.branch || m[it.paper.id]?.branches.includes(S.branch)) && ok.has(it.paper.id));
}

/** 목록에 그릴 논문. 예시는 기본 5편, 실검색은 30편. @param {any} S */
export function listedItems(S) {
  const list = matchedItems(S);
  if (S.dataMode === 'real') return list.slice(0, LIST_CAP);
  return S.showAll ? list : list.slice(0, EXAMPLE_CAP);
}

/** 실검색에서 지금 목록을 선택으로 맞춘다. 사용자가 해제한 선택은 다음 거르기까지 유지되므로 렌더에서는 부르지 않는다. @param {any} S */
export function autoSelectListed(S) {
  if (S.dataMode !== 'real') return;
  S.selPapers = listedItems(S).map((/** @type {any} */ it) => it.paper.id);
}
