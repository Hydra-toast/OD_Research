import { describe, it, expect } from 'vitest';
import { createSearchRunner } from '../src/search-runner.js';

/** 제어 가능한 지연 공급자: 각 호출의 resolve를 직접 호출한다. */
function controllable() {
  const calls = [];
  return {
    calls,
    search(q) { return new Promise((res, rej) => calls.push({ q, res, rej })); },
  };
}

describe('지연 응답 역전(통합)', () => {
  it('나중에 보낸 검색이 먼저 끝나면, 늦게 온 이전 응답은 화면에 반영하지 않는다', async () => {
    const p = controllable(), applied = [];
    const runner = createSearchRunner(p, { onStart() {}, onError() {}, onResult: (q, r) => applied.push([q, r.tag]) });
    const a = runner.run('EUV'), b = runner.run('ALD');
    p.calls[1].res({ tag: 'ald' });
    expect(await b).toBe('applied');
    p.calls[0].res({ tag: 'euv' });
    expect(await a).toBe('stale');
    expect(applied).toEqual([['ALD', 'ald']]);
  });
  it('오래된 요청의 오류도 최신 화면을 오류로 바꾸지 않는다', async () => {
    const p = controllable(), errors = [], applied = [];
    const runner = createSearchRunner(p, { onStart() {}, onError: q => errors.push(q), onResult: q => applied.push(q) });
    const a = runner.run('A'), b = runner.run('B');
    p.calls[1].res({});
    await b;
    p.calls[0].rej(new Error('late'));
    expect(await a).toBe('stale');
    expect(errors).toEqual([]);
    expect(applied).toEqual(['B']);
  });
  it('최신 요청의 오류는 알린다. cancel 이후 응답은 버린다', async () => {
    const p = controllable(), errors = [], applied = [];
    const runner = createSearchRunner(p, { onStart() {}, onError: q => errors.push(q), onResult: q => applied.push(q) });
    const a = runner.run('A'); p.calls[0].rej(new Error('x'));
    expect(await a).toBe('error'); expect(errors).toEqual(['A']);
    const b = runner.run('B'); runner.cancel(); p.calls[1].res({});
    expect(await b).toBe('stale'); expect(applied).toEqual([]);
  });
});
