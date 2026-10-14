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
  try {
    if (hooks.failNextSave) { hooks.failNextSave = false; throw new Error('테스트용 저장 실패'); }
    await repo.save(rec);
    failed = false;
    if (S.projectId === rec.id && S.status === 'ok') {
      setSave(`이 브라우저에 저장됨 · ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`, false);
    }
    renderSaved();
  } catch {
    failed = true;
    if (S.projectId === rec.id) setSave('저장 실패 — 변경 내용은 화면에만 있어요.', true);
  }
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
