// 검색 요청 조율(순수): 늦게 도착한 오래된 응답은 버린다. DOM·상태에 의존하지 않아 단독 테스트할 수 있다.
import { createLatest } from './logic.js';

/**
 * @param {{search:(q:string)=>Promise<any>}} provider
 * @param {{onStart:(q:string)=>void, onResult:(q:string,r:any)=>void, onError:(q:string,e:any)=>void}} hooks
 */
export function createSearchRunner(provider, hooks) {
  const latest = createLatest();
  return {
    /** @param {string} text @returns {Promise<'applied'|'stale'|'error'>} */
    async run(text) {
      const id = latest.next();
      hooks.onStart(text);
      let r;
      try { r = await provider.search(text); }
      catch (e) { if (!latest.isLatest(id)) return 'stale'; hooks.onError(text, e); return 'error'; }
      if (!latest.isLatest(id)) return 'stale';
      hooks.onResult(text, r);
      return 'applied';
    },
    /** 진행 중인 요청을 모두 무효화(다른 프로젝트 열기·삭제 시). */
    cancel() { latest.next(); },
  };
}
