// 세부 검색: 포함/제외 단어 걸러내기와 추가 검색 결과 합치기. 논문은 지우지 않는다.
const norm = (/** @type {any} */ s) => String(s || '').toLowerCase();

/** 쉼표·줄바꿈으로 나눈 단어 목록. @param {string} text */
export function splitTerms(text) {
  return [...new Set(String(text || '').split(/[,\n;]+/).map(t => t.trim()).filter(t => t.length >= 2))];
}

/** 저장된 값이 비어 있어도 같은 모양을 유지한다. */
export function emptyRefine() {
  return { include: /** @type {string[]} */ ([]), exclude: /** @type {string[]} */ ([]), released: /** @type {string[]} */ ([]), rounds: /** @type {any[]} */ ([]), yearFrom: /** @type {number|null} */ (null), yearTo: /** @type {number|null} */ (null), requireAbstract: false };
}

/** 입력칸의 연도. 비었거나 네 자리 연도가 아니면 null. @param {any} value */
export function yearOrNull(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= 1000 && n <= 2100 ? n : null;
}

/** 저장본의 거르기 조건을 기본값으로 채운다. @param {any} raw */
export function normalizeRefine(raw) {
  const base = emptyRefine();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  return {
    ...base,
    include: Array.isArray(raw.include) ? raw.include.filter((/** @type {any} */ x) => typeof x === 'string') : [],
    exclude: Array.isArray(raw.exclude) ? raw.exclude.filter((/** @type {any} */ x) => typeof x === 'string') : [],
    released: Array.isArray(raw.released) ? raw.released.filter((/** @type {any} */ x) => typeof x === 'string') : [],
    rounds: Array.isArray(raw.rounds) ? raw.rounds : [],
    yearFrom: yearOrNull(raw.yearFrom),
    yearTo: yearOrNull(raw.yearTo),
    requireAbstract: !!raw.requireAbstract,
  };
}

/** 제목·초록에 포함어가 모두 있고 제외어가 없는 논문만 통과. released는 사용자가 제외를 해제한 ID.
 * 연도 조건이 있으면 연도가 없는 논문은 숨긴다. requireAbstract는 초록이 있는 논문만 남긴다.
 * @param {any[]} papers @param {{ include?: string[], exclude?: string[], released?: string[], yearFrom?: number|null, yearTo?: number|null, requireAbstract?: boolean }} f */
export function applyRefine(papers, f) {
  const include = f.include || [], exclude = f.exclude || [], released = new Set(f.released || []);
  const from = yearOrNull(f.yearFrom), to = yearOrNull(f.yearTo);
  const visible = [], hidden = [];
  for (const p of papers) {
    const text = norm(`${p.title || ''} ${p.abstract || ''}`);
    const missing = include.filter(t => !text.includes(norm(t)));
    const blocked = exclude.filter(t => text.includes(norm(t)));
    const reasons = [];
    if (missing.length) reasons.push(`포함 단어 없음: ${missing.join(', ')}`);
    if (blocked.length && !released.has(p.id)) reasons.push(`제외 단어 포함: ${blocked.join(', ')}`);
    const year = Number.isInteger(p.year) ? p.year : null;
    let yearBlocked = false;
    if (from != null || to != null) {
      if (year == null) { reasons.push('연도 없음'); yearBlocked = true; }
      else if (from != null && year < from) { reasons.push(`연도가 ${from}년보다 이전`); yearBlocked = true; }
      else if (to != null && year > to) { reasons.push(`연도가 ${to}보다 큼`); yearBlocked = true; }
    }
    const abstractBlocked = !!f.requireAbstract && !String(p.abstract || '').trim();
    if (abstractBlocked) reasons.push('초록 없음');
    if (reasons.length) hidden.push({ paper: p, reasons, canRelease: !missing.length && !yearBlocked && !abstractBlocked });
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
