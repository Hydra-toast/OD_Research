// 자동 저장(디바운스). 화면을 떠나기 전에 대기 중인 저장을 끝내고, 손상·읽기 전용은 덮어쓰지 않는다.
import { S, scopeText } from '../state/store.js';
import { toRecord } from '../state/record.js';
import { hooks, repo } from './deps.js';
import { setSave, renderSaved } from './render.js';

let timer = /** @type {any} */ (null);
let pending = /** @type {any} */ (null);
/** @type {Promise<void>} */
let chain = Promise.resolve();
let failed = false;
let inFlight = false;
let shadowOk = true;
const shadowKey = (/** @type {string} */ id) => `rl.pending.${id}`;

/** 현재 탭에서 저장 대기 중이던 기록이 저장된 revision보다 최신이면 복구한다. @param {string} id @param {any} stored */
export function pendingRecovery(id, stored) {
  try {
    const pendingRecord = JSON.parse(sessionStorage.getItem(shadowKey(id)) || 'null');
    if (!pendingRecord || pendingRecord.id !== id) return null;
    if (stored && Number(pendingRecord.revision || 0) <= Number(stored.revision || 0)) return null;
    return pendingRecord;
  } catch { return null; }
}

function writeShadow(/** @type {any} */ rec) {
  try { sessionStorage.setItem(shadowKey(rec.id), JSON.stringify(rec)); shadowOk = true; }
  catch { shadowOk = false; }
}

function clearShadow(/** @type {any} */ rec) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(shadowKey(rec.id)) || 'null');
    if (saved && saved.revision <= rec.revision) sessionStorage.removeItem(shadowKey(rec.id));
  } catch { /* 브라우저 저장소 접근 불가 */ }
}

// 저장 대기 기록을 탭 저장소에 남길 수 없으면 새로고침 전 브라우저 확인을 요청한다.
if (typeof window !== 'undefined') window.addEventListener('beforeunload', e => {
  if ((pending || inFlight || failed) && !shadowOk) { e.preventDefault(); e.returnValue = ''; }
});

const canSave = () => S.status === 'ok' && !!S.projectId && !S.readOnly;

export function cancelSave() {
  clearTimeout(timer); timer = null; pending = null;
}

export function scheduleSave() {
  if (!canSave()) return;
  S.revision++;
  setSave('저장 중…', false);
  failed = false;
  pending = toRecord(S, scopeText(S));
  writeShadow(pending);
  clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void enqueue(); }, hooks.saveDelayMs ?? 250);
}

function enqueue() {
  const rec = pending;
  if (!rec) return chain;
  pending = null;
  chain = chain.then(() => write(rec));
  return chain;
}

/** @param {any} rec */
async function write(rec) {
  inFlight = true;
  try {
    if (hooks.failNextSave) { hooks.failNextSave = false; throw new Error('테스트용 저장 실패'); }
    await repo.save(rec);
    clearShadow(rec);
    failed = false;
    if (S.projectId === rec.id && S.status === 'ok') {
      setSave(`이 브라우저에 저장됨 · ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`, false);
    }
    renderSaved();
  } catch {
    failed = true;
    if (S.projectId === rec.id) setSave('저장 실패 — 변경 내용은 화면에만 있어요.', true);
  } finally { inFlight = false; }
}

/** 대기 중인 변경을 지금 저장한다. 실패하면 false (화면의 변경을 버리지 않기 위한 신호). */
export async function flushSave() {
  clearTimeout(timer); timer = null;
  await enqueue();
  return !failed;
}

export async function doSave() {
  clearTimeout(timer); timer = null;
  pending = null;
  if (!canSave()) return;
  chain = chain.then(() => write(toRecord(S, scopeText(S))));
  await chain;
}
