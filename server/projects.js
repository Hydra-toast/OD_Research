// 프로젝트 저장. 소유자는 검증된 사용자이며, 요청 본문의 userId는 쓰지 않는다.
import { HttpError } from './errors.js';

const ID_RE = /^[A-Za-z0-9-]{4,40}$/;

/** @param {any} body @param {string} id */
export function readProjectWrite(body, id) {
  if (!ID_RE.test(id)) throw new HttpError(400, 'bad_input', '프로젝트 ID 형식이 올바르지 않아요.');
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'bad_input', '저장 본문이 필요해요.');
  const name = String(body.name ?? '').trim();
  if (!name || name.length > 120) throw new HttpError(400, 'bad_input', '이름은 1~120자예요.');
  if (!Number.isInteger(body.baseRevision) || body.baseRevision < 0) throw new HttpError(400, 'bad_input', 'revision이 필요해요.');
  if (!body.record || typeof body.record !== 'object' || Array.isArray(body.record)) throw new HttpError(400, 'bad_input', '프로젝트 내용이 필요해요.');
  const acknowledgeRevision = body.acknowledgeRevision == null ? null : body.acknowledgeRevision;
  if (acknowledgeRevision != null && (!Number.isInteger(acknowledgeRevision) || acknowledgeRevision < 1)) throw new HttpError(400, 'bad_input', '확인한 revision이 올바르지 않아요.');
  return { id, name, baseRevision: body.baseRevision, acknowledgeRevision, record: { ...body.record, id, name } };
}

/** @param {string} name */
export function readName(name) {
  const n = String(name ?? '').trim();
  if (!n || n.length > 120) throw new HttpError(400, 'bad_input', '이름은 1~120자예요.');
  return n;
}

/** 메모리 저장. 다른 소유자 행은 없는 것과 같이 다룬다. */
export function createMemoryProjects() {
  /** @type {Map<string, any>} */
  const rows = new Map();
  /** @type {Map<string, any[]>} */
  const files = new Map();
  /** @type {Map<string, any[]>} */
  const jobs = new Map();
  const visible = (/** @type {string} */ userId, /** @type {string} */ id) => {
    const row = rows.get(id);
    if (!row || row.ownerId !== userId) return null;
    return row;
  };
  return {
    async list(/** @type {string} */ userId) {
      return [...rows.values()].filter(r => r.ownerId === userId).map(summary);
    },
    async get(/** @type {string} */ userId, /** @type {string} */ id) {
      const row = visible(userId, id);
      return row ? publicRow(row) : null;
    },
    async save(/** @type {string} */ userId, /** @type {any} */ input) {
      const existing = rows.get(input.id);
      if (existing && existing.ownerId !== userId) return { error: 'not_found' };
      if (existing?.deleting) return { error: 'deleting' };
      if (!existing && input.baseRevision !== 0) return { error: 'not_found' };
      if (existing && existing.revision !== input.baseRevision) {
        if (input.acknowledgeRevision !== existing.revision) return { error: 'revision', serverRevision: existing.revision };
      }
      const revision = (existing?.revision ?? 0) + 1;
      const row = {
        id: input.id, ownerId: userId, name: input.name, revision,
        record: input.record, updatedAt: new Date().toISOString(), deleting: false,
      };
      rows.set(input.id, row);
      if (!files.has(input.id)) files.set(input.id, []);
      if (!jobs.has(input.id)) jobs.set(input.id, []);
      return { row: publicRow(row) };
    },
    async rename(/** @type {string} */ userId, /** @type {string} */ id, /** @type {string} */ name, /** @type {number} */ baseRevision) {
      const row = visible(userId, id);
      if (!row) return { error: 'not_found' };
      if (row.deleting) return { error: 'deleting' };
      if (row.revision !== baseRevision) return { error: 'revision', serverRevision: row.revision };
      row.name = name;
      row.record = { ...row.record, name };
      row.revision += 1;
      row.updatedAt = new Date().toISOString();
      return { row: publicRow(row) };
    },
    async remove(/** @type {string} */ userId, /** @type {string} */ id) {
      const row = visible(userId, id);
      if (!row) return { status: 'not_found' };
      if (row.deleting) return { status: 'deleting' };
      row.deleting = true;
      try {
        files.delete(id);
        jobs.delete(id);
        rows.delete(id);
        return { status: 'completed' };
      } catch {
        row.deleting = false;
        return { status: 'failed' };
      }
    },
    /** 이후 단계의 파일·작업을 지우는 계약이 저장소에 있는지 테스트에서 확인한다. */
    _attached(/** @type {string} */ id) { return { files: files.get(id) ?? null, jobs: jobs.get(id) ?? null }; },
    forToken() { return this; },
  };
}

function summary(/** @type {any} */ row) {
  return { id: row.id, name: row.name, revision: row.revision, updatedAt: row.updatedAt, scope: row.record?.scope ?? '' };
}
function publicRow(/** @type {any} */ row) {
  return { ...summary(row), record: row.record };
}

/**
 * 사용자 JWT로 PostgREST를 부른다. service-role 키는 헤더에 넣지 않는다.
 * @param {{url:string, anonKey:string, serviceRoleKey?:string}} env
 * @param {any} [fetchImpl]
 */
export function createSupabaseProjects(env, fetchImpl = fetch) {
  const base = env.url.replace(/\/$/, '') + '/rest/v1';
  const headers = (/** @type {string} */ token) => {
    if (env.serviceRoleKey && (token === env.serviceRoleKey || env.anonKey === env.serviceRoleKey)) {
      throw new HttpError(500, 'bad_config', '서버 전용 키로는 사용자 요청을 처리하지 않아요.');
    }
    return { authorization: `Bearer ${token}`, apikey: env.anonKey, 'content-type': 'application/json', prefer: 'return=representation' };
  };
  const api = {
    async list(/** @type {string} */ _userId, /** @type {string} */ token) {
      const res = await fetchImpl(`${base}/projects?select=id,name,revision,updated_at,record`, { headers: headers(token) });
      if (!res.ok) throw new HttpError(502, 'store_failed', '저장소를 읽지 못했어요.');
      const rows = await res.json();
      return rows.map((/** @type {any} */ r) => ({ id: r.id, name: r.name, revision: r.revision, updatedAt: r.updated_at, scope: r.record?.scope ?? '' }));
    },
    async get(/** @type {string} */ _userId, /** @type {string} */ id, /** @type {string} */ token) {
      const res = await fetchImpl(`${base}/projects?id=eq.${encodeURIComponent(id)}&select=id,name,revision,updated_at,record`, { headers: headers(token) });
      if (!res.ok) throw new HttpError(502, 'store_failed', '저장소를 읽지 못했어요.');
      const rows = await res.json();
      const r = rows[0];
      return r ? { id: r.id, name: r.name, revision: r.revision, updatedAt: r.updated_at, scope: r.record?.scope ?? '', record: r.record } : null;
    },
    async save(/** @type {string} */ userId, /** @type {any} */ input, /** @type {string} */ token) {
      const existing = await this.get(userId, input.id, token);
      if (!existing && input.baseRevision !== 0) return { error: 'not_found' };
      if (existing && existing.revision !== input.baseRevision && input.acknowledgeRevision !== existing.revision) return { error: 'revision', serverRevision: existing.revision };
      const revision = (existing?.revision ?? 0) + 1;
      const payload = { id: input.id, owner_id: userId, name: input.name, revision, record: input.record, updated_at: new Date().toISOString() };
      const res = await fetchImpl(existing ? `${base}/projects?id=eq.${encodeURIComponent(input.id)}` : `${base}/projects`, {
        method: existing ? 'PATCH' : 'POST', headers: headers(token), body: JSON.stringify(payload),
      });
      if (!res.ok) throw new HttpError(502, 'store_failed', '저장하지 못했어요.');
      return { row: { id: input.id, name: input.name, revision, updatedAt: payload.updated_at, scope: input.record?.scope ?? '', record: input.record } };
    },
    async rename(/** @type {string} */ userId, /** @type {string} */ id, /** @type {string} */ name, /** @type {number} */ baseRevision, /** @type {string} */ token) {
      const existing = await this.get(userId, id, token);
      if (!existing) return { error: 'not_found' };
      if (existing.revision !== baseRevision) return { error: 'revision', serverRevision: existing.revision };
      const res = await fetchImpl(`${base}/projects?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: headers(token), body: JSON.stringify({ name, revision: existing.revision + 1 }),
      });
      if (!res.ok) throw new HttpError(502, 'store_failed', '이름을 바꾸지 못했어요.');
      return { row: { ...existing, name, revision: existing.revision + 1 } };
    },
    async remove(/** @type {string} */ userId, /** @type {string} */ id, /** @type {string} */ token) {
      const existing = await this.get(userId, id, token);
      if (!existing) return { status: 'not_found' };
      const files = await fetchImpl(`${base}/project_files?project_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: headers(token) });
      const jobs = await fetchImpl(`${base}/jobs?project_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: headers(token) });
      const row = await fetchImpl(`${base}/projects?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: headers(token) });
      if (!files.ok || !jobs.ok || !row.ok) return { status: 'failed' };
      return { status: 'completed' };
    },
  };
  return {
    forToken(/** @type {string} */ token) {
      return {
        list: (/** @type {string} */ userId) => api.list(userId, token),
        get: (/** @type {string} */ userId, /** @type {string} */ id) => api.get(userId, id, token),
        save: (/** @type {string} */ userId, /** @type {any} */ input) => api.save(userId, input, token),
        rename: (/** @type {string} */ userId, /** @type {string} */ id, /** @type {string} */ name, /** @type {number} */ baseRevision) => api.rename(userId, id, name, baseRevision, token),
        remove: (/** @type {string} */ userId, /** @type {string} */ id) => api.remove(userId, id, token),
      };
    },
  };
}
