// 단일 프로세스 작업 저장. 메시지 브로커는 쓰지 않는다.
export function createJobStore({ now = () => Date.now(), staleMs = 15000 } = {}) {
  /** @type {Map<string, any>} */
  const jobs = new Map();
  /** @type {Map<string, string>} */
  const idem = new Map();
  let chain = Promise.resolve();
  const run = (/** @type {() => any} */ fn) => {
    const job = chain.then(fn, fn);
    chain = job.then(() => {}, () => {});
    return job;
  };
  let seq = 0;
  return {
    /** @param {{ projectId: string, idempotencyKey: string, inputRevision: number, kind: string }} input */
    enqueue(input) {
      return run(() => {
        const existing = idem.get(input.idempotencyKey);
        if (existing) return jobs.get(existing);
        const id = `job-${++seq}`;
        const row = { id, projectId: input.projectId, kind: input.kind, status: 'queued', inputRevision: input.inputRevision, idempotencyKey: input.idempotencyKey, attempts: 0, heartbeat: now(), error: null, done: 0, total: 0, succeededIds: /** @type {string[]} */ ([]), failedIds: /** @type {string[]} */ ([]) };
        jobs.set(id, row); idem.set(input.idempotencyKey, id);
        return row;
      });
    },
    claim() {
      return run(() => {
        const row = [...jobs.values()].find(j => j.status === 'queued');
        if (!row) return null;
        row.status = 'running'; row.attempts += 1; row.heartbeat = now();
        return row;
      });
    },
    /** @param {string} id */
    heartbeat(id) { const row = jobs.get(id); if (row && row.status === 'running') row.heartbeat = now(); },
    /** @param {string} id @param {{ done?: number, total?: number, succeededIds?: string[], failedIds?: string[], partial?: boolean }} patch */
    finish(id, patch) {
      const row = jobs.get(id);
      if (!row || row.status === 'cancelled') return row ?? null;
      row.done = patch.done ?? row.done; row.total = patch.total ?? row.total;
      row.succeededIds = patch.succeededIds ?? row.succeededIds;
      row.failedIds = patch.failedIds ?? row.failedIds;
      row.status = patch.partial ? 'partial' : 'succeeded';
      return row;
    },
    /** @param {string} id @param {string} error */
    fail(id, error) { const row = jobs.get(id); if (!row || row.status === 'cancelled') return row ?? null; row.status = 'failed'; row.error = error; return row; },
    /** @param {string} id */
    cancel(id) { const row = jobs.get(id); if (!row) return null; if (row.status === 'succeeded') return row; row.status = 'cancelled'; return row; },
    recover() {
      const stale = [...jobs.values()].filter(j => j.status === 'running' && now() - j.heartbeat > staleMs);
      for (const row of stale) { row.status = 'queued'; row.error = 'heartbeat_lost'; }
      return stale.map(j => j.id);
    },
    /** @param {string} id */
    get(id) { return jobs.get(id) ?? null; },
  };
}
