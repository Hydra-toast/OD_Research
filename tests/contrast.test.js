import { describe, it, expect } from 'vitest';

const lum = hex => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const T = { bg: '#F7F9F8', card: '#FFFFFF', ink: '#172B35', muted: '#586873', accent: '#066873', soft: '#EAF5F4', line: '#DCE5E4', warn: '#8A5A16' };

describe('색 대비(일반 글자 4.5:1)', () => {
  const pairs = [
    ['ink', 'bg'], ['ink', 'card'], ['ink', 'soft'],
    ['muted', 'bg'], ['muted', 'card'], ['muted', 'soft'],
    ['accent', 'bg'], ['accent', 'card'], ['accent', 'soft'],
    ['warn', 'bg'], ['warn', 'card'], ['warn', 'soft'],
  ];
  for (const [f, b] of pairs) it(`${f} on ${b}`, () => { const r = ratio(T[f], T[b]); console.log(`${f}(${T[f]}) on ${b}(${T[b]}) = ${r.toFixed(2)}`); expect(r).toBeGreaterThanOrEqual(4.5); });
  it('흰 글자 on 강조색 버튼', () => expect(ratio('#FFFFFF', T.accent)).toBeGreaterThanOrEqual(4.5));
  it('포커스 링(강조색)은 배경 대비 3:1 이상', () => { for (const b of ['bg', 'card', 'soft']) expect(ratio(T.accent, T[b])).toBeGreaterThanOrEqual(3); });
  it('입력 경계 #6b7c86은 흰색 대비 3:1 이상', () => expect(ratio('#6b7c86', T.card)).toBeGreaterThanOrEqual(3));
});
