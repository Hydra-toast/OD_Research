import { validateProject } from '../schema.js';
import { SCHEMA_VERSION, storedEntry } from '../state/record.js';
import { ProviderError } from '../providers/contracts.js';

export { SCHEMA_VERSION };
const DB = 'research-landscape', STORE = 'projects';

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(new ProviderError('save_failed', '브라우저 저장소를 열 수 없어요'));
  });
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); res(out.result); };
    t.onerror = t.onabort = () => { db.close(); rej(new ProviderError('save_failed', '저장 실패')); };
  });
}

/** 이전 버전 이전은 state/record.js(validateRecord)가 담당한다. 여기서는 원본을 그대로 돌려준다. */
export const migrate = rec => rec;

/** 저장 목록. 깨진 레코드는 지우지 않고 corrupt 표시로 돌려준다. */
export function createIdbRepository() {
  return {
    async load(id) { const r = await tx('readonly', s => s.get(id)); return r ?? null; },
    async save(p) {
      const errs = validateProject(p);
      if (errs.length) throw new ProviderError('save_failed', `저장할 수 없는 데이터: ${errs.join(', ')}`);
      if (p.dataMode !== 'example') throw new ProviderError('bad_mode', 'P0 브라우저 저장은 예시 프로젝트만 지원해요');
      await tx('readwrite', s => s.put({ ...p, schemaVersion: p.schemaVersion && p.schemaVersion > SCHEMA_VERSION ? p.schemaVersion : SCHEMA_VERSION, updatedAt: new Date().toISOString() }));
    },
    async list() {
      const all = await tx('readonly', s => s.getAll());
      return all.map(storedEntry);
    },
    async delete(id) { await tx('readwrite', s => s.delete(id)); },
  };
}
