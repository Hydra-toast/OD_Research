// 빈도 기반 자동 키워드. 제목·초록의 영문 단어만 센다. 의미를 판단하지 않는다.
const STOP = new Set(('a an and are as at be been but by can could did do does for from had has have how if in into is it its may more most not of on or other our over per such than that the their then there these they this those through to under up use used using via was we were what when which while who will with within without also both each between among after before during about across all any however thus their than very can been being only same new based study studies paper results result show shows shown present approach method methods').split(' '));

/** @param {string} text */
function words(text) {
  return (String(text || '').toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []).filter(w => !STOP.has(w));
}

/** @param {any[]} papers @param {{ known?: string[], limit?: number }} [opt] @returns {{ term: string, docCount: number }[]} */
export function suggestKeywords(papers, opt = {}) {
  const known = (opt.known || []).map(t => String(t).toLowerCase());
  const df = new Map();
  for (const p of papers) {
    const seen = new Set();
    for (const text of [p.title, p.abstract]) {
      const w = words(text);
      for (let i = 0; i < w.length; i++) {
        seen.add(w[i]);
        if (i + 1 < w.length) seen.add(`${w[i]} ${w[i + 1]}`);
      }
    }
    for (const t of seen) df.set(t, (df.get(t) || 0) + 1);
  }
  const min = Math.min(3, Math.max(2, Math.ceil(papers.length * 0.05)));
  const rows = [...df.entries()]
    .filter(([t, n]) => n >= min && !known.some(k => k && (t === k || t.includes(k) || k.includes(t))))
    .map(([term, docCount]) => ({ term, docCount }));
  // 두 단어 표현을 우선하되, 같은 빈도의 하위 단어는 중복으로 보고 뺀다.
  const phrases = rows.filter(r => r.term.includes(' '));
  const singles = rows.filter(r => !r.term.includes(' ') && !phrases.some(p => p.docCount === r.docCount && p.term.split(' ').includes(r.term)));
  return [...phrases, ...singles]
    .sort((a, b) => b.docCount - a.docCount || a.term.localeCompare(b.term))
    .slice(0, opt.limit ?? 15);
}
