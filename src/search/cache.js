// 공개 검색 캐시. 개인 지시가 섞인 검색은 사용자 키로만 격리하고, 익명이면 공유 캐시에 넣지 않는다.
/** @param {{ now?: () => number }} [opt] */
export function createSearchCache(opt = {}) {
  const now = opt.now ?? (() => Date.now());
  /** @type {Map<string, { at: number, ttl: number, value: any }>} */
  const box = new Map();
  return {
    /** @param {string} key @param {number|((value:any)=>number)} ttl @param {() => Promise<any>} load @param {{ personal?: boolean, userId?: string }} [scope] */
    async get(key, ttl, load, scope = {}) {
      const id = scope.personal ? (scope.userId ? `user:${scope.userId}|${key}` : '') : key;
      if (!id) return { value: await load(), cached: false };
      const hit = box.get(id);
      if (hit && now() - hit.at < hit.ttl) return { value: hit.value, cached: true, collectedAt: new Date(hit.at).toISOString() };
      const value = await load();
      const ms = typeof ttl === 'function' ? ttl(value) : ttl;
      box.set(id, { at: now(), ttl: ms, value });
      return { value, cached: false, collectedAt: new Date(now()).toISOString() };
    },
  };
}

export const TTL = { search: 60 * 60 * 1000, empty: 5 * 60 * 1000, paper: 24 * 60 * 60 * 1000 };
