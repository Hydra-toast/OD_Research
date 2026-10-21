// 세부 검색: 포함/제외 단어 걸러내기와 추가 검색 결과 합치기. 논문은 지우지 않는다.
const norm = (/** @type {any} */ s) => String(s || '').toLowerCase();

/** 쉼표·줄바꿈으로 나눈 단어 목록. @param {string} text */
export function splitTerms(text) {
  return [...new Set(String(text || '').split(/[,\n;]+/).map(t => t.trim()).filter(t => t.length >= 2))];
}

/** 제목·초록에 포함어가 모두 있고 제외어가 없는 논문만 통과. released는 사용자가 제외를 해제한 ID.
 * @param {any[]} papers @param {{ include?: string[], exclude?: string[], released?: string[] }} f */
export function applyRefine(papers, f) {
  const include = f.include || [], exclude = f.exclude || [], released = new Set(f.released || []);
  const visible = [], hidden = [];
  for (const p of papers) {
    const text = norm(`${p.title || ''} ${p.abstract || ''}`);
    const missing = include.filter(t => !text.includes(norm(t)));
    const blocked = exclude.filter(t => text.includes(norm(t)));
    const reasons = [];
    if (missing.length) reasons.push(`포함 단어 없음: ${missing.join(', ')}`);
    if (blocked.length && !released.has(p.id)) reasons.push(`제외 단어 포함: ${blocked.join(', ')}`);
    if (reasons.length) hidden.push({ paper: p, reasons, canRelease: !missing.length });
    else visible.push(p);
  }
  return { visible, hidden };
}

/** 기존 묶음에 새 결과를 합친다. DOI 또는 ID가 같으면 한 편으로 보고 foundBy를 합친다.
 * @param {any[]} existing @param {any[]} incoming */
export function mergePool(existing, incoming) {
  const keyOf = (/** @type {any} */ p) => String(p.doi || p.id || '').toLowerCase();
  const map = new Map(existing.map(p => [keyOf(p), { ...p }]));
  let added = 0;
  for (const p of incoming) {
    const k = keyOf(p);
    if (!k) continue;
    const prev = map.get(k);
    if (!prev) { map.set(k, { ...p }); added++; continue; }
    prev.foundBy = [...new Set([...(prev.foundBy || []), ...(p.foundBy || [])])];
  }
  return { papers: [...map.values()], added };
}

/** 기존 검색 문구에 포함어를 붙인 새 문구. 제외어는 문법을 만들지 않고 화면에서만 적용한다.
 * @param {string[]} queries @param {string[]} include */
export function refinedQueries(queries, include) {
  const extra = include.join(' ');
  const base = queries.length ? queries : [''];
  return [...new Set(base.map(q => `${q} ${extra}`.trim()).filter(Boolean))].slice(0, 8);
}
