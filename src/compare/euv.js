// 원문에 있는 값만 꺼낸다. 합성 문서와 실제 논문을 구분해서 써야 한다.
const RULES = [
  ['resist', /(?:photoresist|resist|레지스트)\s*[:：]?\s*([A-Za-z0-9가-힣.+-]+)/i, 'resist'],
  ['thickness', /(\d+(?:\.\d+)?)\s*(nm|μm|um)/i, 'thickness'],
  ['dose', /(\d+(?:\.\d+)?)\s*(mJ\/cm2|mJ\/cm²)/i, 'dose'],
  ['ler', /(?:LER|LWR)\s*(\d+(?:\.\d+)?)\s*(nm)/i, 'ler'],
];

/** @param {{ page: number, label?: string, text: string }[]} pages */
export function extractReported(pages) {
  /** @type {any[]} */
  const found = [];
  for (const page of pages) {
    if (page.page == null || !page.text) continue;
    for (const [key, re] of RULES) {
      const m = page.text.match(re);
      if (!m) continue;
      found.push({ key, value: m[1], unit: m[2] || '', page: page.page, label: page.label ?? String(page.page), quote: m[0], source: 'extracted' });
    }
  }
  const keys = ['resist', 'thickness', 'dose', 'ler'];
  return keys.map(key => {
    const hit = found.find(f => f.key === key);
    return hit ? { ...hit, emptyReason: undefined } : { key, value: '', unit: '', page: null, quote: '', emptyReason: 'not_found_in_sources' };
  });
}

/** 조건이 다른 같은 수치는 순위를 만들지 않는다. @param {any[]} rows */
export function refuseRank(rows) {
  const nums = rows.filter(r => r.value && r.unit);
  const units = new Set(nums.map(r => r.unit));
  return units.size > 1 ? '단위나 조건이 달라 순위를 만들지 않았어요.' : null;
}
