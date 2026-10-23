import { describe, it, expect } from 'vitest';
import { runBulk } from '../src/research/bulk.js';

const papers = [
  { id: 'a', doi: '10.1/a' },
  { id: 'b', doi: '10.1/b' },
  { id: 'c', doi: '10.1/c' },
];

describe('원문 일괄 받기', () => {
  it('공개 원문이 되면 Sci-Hub를 부르지 않는다', async () => {
    const calls = [];
    const ctrl = new AbortController();
    await runBulk({
      papers: papers.slice(0, 2),
      hasText: () => false,
      signal: ctrl.signal,
      sleep: async () => {},
      fetchOpen: async (p) => { calls.push('open:' + p.id); return 'extracted'; },
      fetchScihub: async (p) => { calls.push('hub:' + p.id); return 'extracted'; },
      mark: async () => {},
    });
    expect(calls).toEqual(['open:a', 'open:b']);
  });
  it('공개 원문 실패 뒤에만 Sci-Hub를 부르고, 로봇 확인이면 나머지를 표시만 한다', async () => {
    const calls = [];
    const marked = [];
    const ctrl = new AbortController();
    let hub = 0;
    await runBulk({
      papers: [...papers, { id: 'd', doi: '10.1/d' }],
      hasText: (p) => p.id === 'a',
      signal: ctrl.signal,
      gapMs: 1500,
      sleep: async (ms) => { calls.push('wait:' + ms); },
      fetchOpen: async (p) => { calls.push('open:' + p.id); return 'no_candidate'; },
      fetchScihub: async (p) => { calls.push('hub:' + p.id); hub++; return hub === 2 ? 'challenge_required' : 'not_found'; },
      mark: async (p, status) => { marked.push(p.id + ':' + status); },
    });
    const opens = calls.filter(c => c.startsWith('open'));
    expect(opens.sort()).toEqual(['open:b', 'open:c', 'open:d']);
    expect(Math.max(...opens.map(c => calls.indexOf(c)))).toBeLessThan(calls.findIndex(c => c.startsWith('hub')));
    expect(calls).toContain('wait:1500');
    expect(calls.filter(c => c.startsWith('hub'))).toHaveLength(2);
    expect(marked).toHaveLength(1);
    expect(marked[0]).toContain('challenge_required');
  });
  it('취소하면 대기 중인 논문은 받지 않는다', async () => {
    const calls = [];
    const ctrl = new AbortController();
    const done = runBulk({
      papers,
      hasText: () => false,
      signal: ctrl.signal,
      sleep: async () => {},
      fetchOpen: (p, signal) => new Promise((resolve, reject) => {
        calls.push(p.id);
        if (calls.length === 1) ctrl.abort();
        const stop = () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); };
        if (signal.aborted) stop();
        else signal.addEventListener('abort', stop);
      }),
      fetchScihub: async (p) => { calls.push('hub:' + p.id); return 'extracted'; },
      mark: async () => {},
    });
    const result = await done;
    expect(result.cancelled).toBe(true);
    expect(calls.some(c => String(c).startsWith('hub'))).toBe(false);
    expect(calls.length).toBeLessThan(3);
  });
});
