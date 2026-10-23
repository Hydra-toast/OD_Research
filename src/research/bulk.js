// 선택 논문 원문 일괄 받기. 공개 원문을 먼저 받고, 실패한 DOI만 Sci-Hub로 한 편씩 이어 받는다.

/** @param {number} ms @param {AbortSignal} signal */
export function abortableSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); return; }
    const t = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(undefined); }, ms);
    const onAbort = () => { clearTimeout(t); const e = new Error('aborted'); e.name = 'AbortError'; reject(e); };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

const openOk = (/** @type {string} */ st) => st === 'extracted' || st === 'scan_only';

/**
 * @param {{
 *   papers: any[],
 *   hasText: (p: any) => boolean,
 *   fetchOpen: (p: any, signal: AbortSignal) => Promise<string>,
 *   fetchScihub: (p: any, signal: AbortSignal) => Promise<string>,
 *   mark: (p: any, status: string) => Promise<void>,
 *   signal: AbortSignal,
 *   gapMs?: number,
 *   sleep?: (ms: number, signal: AbortSignal) => Promise<void>,
 *   onProgress?: (s: { done: number, total: number, ok: number, fail: number, none: number, active: string[] }) => void,
 * }} opt
 */
export async function runBulk(opt) {
  const sleep = opt.sleep || abortableSleep;
  const gap = opt.gapMs ?? 1500;
  const counts = { done: 0, total: opt.papers.length, ok: 0, fail: 0, none: 0 };
  /** @type {Set<string>} */
  let active = new Set();
  const report = () => opt.onProgress?.({ ...counts, active: [...active] });
  const todo = [];
  for (const p of opt.papers) {
    if (opt.hasText(p)) { counts.done++; counts.ok++; }
    else todo.push(p);
  }
  report();
  /** @type {any[]} */
  const scihub = [];
  const queue = [...todo];
  const finishOpen = (/** @type {any} */ p, /** @type {string} */ st) => {
    if (openOk(st)) { counts.done++; counts.ok++; return; }
    if (p.doi && st !== 'quota') { scihub.push(p); return; }
    counts.done++;
    if (st === 'no_candidate' || st === 'not_pdf') counts.none++;
    else counts.fail++;
  };
  const worker = async () => {
    for (;;) {
      if (opt.signal.aborted) return;
      const p = queue.shift();
      if (!p) return;
      active.add(p.id);
      report();
      let st = 'failed';
      try { st = await opt.fetchOpen(p, opt.signal); }
      catch (e) {
        active.delete(p.id);
        report();
        if (opt.signal.aborted || /** @type {any} */ (e)?.name === 'AbortError') return;
        st = 'failed';
      }
      if (opt.signal.aborted || st === 'aborted') { active.delete(p.id); report(); return; }
      active.delete(p.id);
      finishOpen(p, st);
      report();
    }
  };
  await Promise.all([worker(), worker()]);
  if (opt.signal.aborted) return { cancelled: true, challenge: false, counts };
  let challenge = false;
  for (let i = 0; i < scihub.length; i++) {
    if (opt.signal.aborted) return { cancelled: true, challenge, counts };
    const p = scihub[i];
    if (challenge) {
      try { await opt.mark(p, 'challenge_required'); } catch { /* 표시만 실패해도 다음으로 */ }
      counts.done++; counts.fail++;
      report();
      continue;
    }
    if (i > 0) {
      try { await sleep(gap, opt.signal); }
      catch { return { cancelled: true, challenge, counts }; }
    }
    if (opt.signal.aborted) return { cancelled: true, challenge, counts };
    active = new Set([p.id]);
    report();
    let st = 'failed';
    try { st = await opt.fetchScihub(p, opt.signal); }
    catch (e) {
      active = new Set();
      report();
      if (opt.signal.aborted || /** @type {any} */ (e)?.name === 'AbortError') return { cancelled: true, challenge, counts };
    }
    if (opt.signal.aborted || st === 'aborted') { active = new Set(); report(); return { cancelled: true, challenge, counts }; }
    active = new Set();
    counts.done++;
    if (openOk(st)) counts.ok++;
    else if (st === 'no_candidate' || st === 'not_pdf') counts.none++;
    else counts.fail++;
    if (st === 'challenge_required') challenge = true;
    report();
  }
  return { cancelled: false, challenge, counts };
}
