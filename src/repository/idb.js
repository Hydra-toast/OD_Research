import { validateProject } from '../schema.js';
import { SCHEMA_VERSION, storedEntry, validateRecord } from '../state/record.js';
import { ProviderError } from '../providers/contracts.js';

export { SCHEMA_VERSION };
const DB = 'research-landscape', STORE = 'projects', FT_STORE = 'fulltexts';
export const PDF_KEEP = { fileBytes: 20 * 1024 * 1024, files: 30, totalBytes: 600 * 1024 * 1024 };

/** 원문 쪽별 텍스트는 프로젝트 레코드와 분리해 저장한다. 키는 projectId:paperId. */
export async function saveFulltext(/** @type {string} */ projectId, /** @type {string} */ paperId, /** @type {any[]} */ pages, /** @type {Blob|null} */ pdf = null) {
  const db = await open();
  await new Promise((res, rej) => {
    const t = db.transaction(FT_STORE, 'readwrite');
    const store = t.objectStore(FT_STORE), id = `${projectId}:${paperId}`;
    let quota = false, settled = false;
    const finish = (/** @type {(v: any) => void} */ fn, /** @type {any} */ value) => { if (settled) return; settled = true; db.close(); fn(value); };
    const rows = store.getAll();
    rows.onsuccess = () => {
      const others = rows.result.filter(r => r.projectId === projectId && r.id !== id && r.pdf);
      const used = others.reduce((s, r) => s + (r.pdf?.size || 0), 0);
      if (pdf && (pdf.size > PDF_KEEP.fileBytes || others.length >= PDF_KEEP.files || used + pdf.size > PDF_KEEP.totalBytes)) {
        quota = true; t.abort(); return;
      }
      store.put({ id, projectId, paperId, pages, pdf, at: new Date().toISOString() });
    };
    t.oncomplete = () => finish(res, null);
    t.onerror = t.onabort = () => {
      const full = quota || t.error?.name === 'QuotaExceededError';
      finish(rej, new ProviderError(full ? 'quota' : 'save_failed', full ? '브라우저 저장 공간 부족' : '원문 저장 실패'));
    };
  });
}
export async function loadFulltextPdf(/** @type {string} */ projectId, /** @type {string} */ paperId) {
  const db = await open();
  return new Promise((res, rej) => {
    const q = db.transaction(FT_STORE, 'readonly').objectStore(FT_STORE).get(`${projectId}:${paperId}`);
    q.onsuccess = () => { db.close(); res(q.result?.pdf ?? null); };
    q.onerror = () => { db.close(); rej(new ProviderError('save_failed', '보관 PDF를 읽지 못했어요')); };
  });
}
export async function loadFulltext(/** @type {string} */ projectId, /** @type {string} */ paperId) {
  const db = await open();
  return new Promise((res) => {
    const q = db.transaction(FT_STORE, 'readonly').objectStore(FT_STORE).get(`${projectId}:${paperId}`);
    q.onsuccess = () => { db.close(); res(q.result?.pages ?? null); };
    q.onerror = () => { db.close(); res(null); };
  });
}
export async function deleteFulltexts(/** @type {string} */ projectId) {
  const db = await open();
  await new Promise((res) => {
    const t = db.transaction(FT_STORE, 'readwrite'), s = t.objectStore(FT_STORE), q = s.getAllKeys();
    q.onsuccess = () => { for (const k of q.result) if (String(k).startsWith(projectId + ':')) s.delete(k); };
    t.oncomplete = () => { db.close(); res(null); };
    t.onerror = t.onabort = () => { db.close(); res(null); };
  });
}

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' });
      if (!r.result.objectStoreNames.contains(FT_STORE)) r.result.createObjectStore(FT_STORE, { keyPath: 'id' });
    };
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
      if (!['example', 'real'].includes(p.dataMode)) throw new ProviderError('bad_mode', '테스트 공급자 자료는 사용자 조사로 저장하지 않아요');
      const checked = validateRecord({ ...p, schemaVersion: SCHEMA_VERSION });
      if (!checked.ok) throw new ProviderError('save_failed', `저장할 수 없는 데이터: ${checked.errors.join(', ')}`);
      await tx('readwrite', s => s.put({ ...p, schemaVersion: p.schemaVersion && p.schemaVersion > SCHEMA_VERSION ? p.schemaVersion : SCHEMA_VERSION, updatedAt: new Date().toISOString() }));
    },
    async list() {
      const all = await tx('readonly', s => s.getAll());
      return all.map(storedEntry);
    },
    async delete(id) {
      const db = await open();
      await new Promise((res, rej) => {
        const t = db.transaction([STORE, FT_STORE], 'readwrite');
        t.objectStore(STORE).delete(id);
        const ft = t.objectStore(FT_STORE), keys = ft.getAllKeys();
        keys.onsuccess = () => { for (const k of keys.result) if (String(k).startsWith(id + ':')) ft.delete(k); };
        t.oncomplete = () => { db.close(); res(null); };
        t.onerror = t.onabort = () => { db.close(); rej(new ProviderError('save_failed', '조사와 원문을 삭제하지 못했어요')); };
      });
    },
  };
}
