// 확인된 반도체 용어만 영문으로 바꾼다. 사전에 없는 말은 번역된 것처럼 두지 않는다.
const DICT = [
  ['고유전율 절연막', 'high-k dielectric'],
  ['EUV 포토레지스트', 'EUV photoresist'],
  ['원자층 증착', 'atomic layer deposition'],
  ['포토레지스트', 'photoresist'],
  ['원자층', 'atomic layer deposition'],
  ['고유전', 'high-k'],
].sort((a, b) => b[0].length - a[0].length);

/**
 * @param {string} input
 * @returns {{ original: string, english: string, untranslated: string[], dictionary: boolean }}
 */
export function planQuery(input) {
  const original = String(input ?? '').trim();
  let rest = original;
  /** @type {string[]} */
  const parts = [];
  let dictionary = false;
  while (rest) {
    const hit = DICT.find(([ko]) => rest.toLowerCase().includes(ko.toLowerCase()));
    if (!hit) break;
    const at = rest.toLowerCase().indexOf(hit[0].toLowerCase());
    const before = rest.slice(0, at).trim();
    if (before) parts.push(before);
    parts.push(hit[1]);
    rest = rest.slice(at + hit[0].length);
    dictionary = true;
  }
  if (rest.trim()) parts.push(rest.trim());
  const english = parts.join(' ').replace(/\s+/g, ' ').trim();
  const untranslated = [...english.matchAll(/[가-힣]+/g)].map(m => m[0]);
  return { original, english, untranslated: [...new Set(untranslated)], dictionary };
}
