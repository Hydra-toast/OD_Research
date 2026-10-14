// 계정 메뉴. 서버가 계정 연결을 보고할 때만 보인다. 로컬 예시는 자동으로 올리지 않는다.
import { S, scopeText } from '../state/store.js';
import { toRecord } from '../state/record.js';
import { $ } from './render.js';

const TOKEN = 'rl-token';
/** @type {Map<string, number>} */
const revisions = new Map();
let token = '';

function status(/** @type {string} */ text) { $('#account-status').textContent = text; }

async function api(/** @type {string} */ path, /** @type {RequestInit} */ opt = {}) {
  const headers = { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(opt.headers ?? {}) };
  const res = await fetch(path, { ...opt, headers });
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

function setSession(/** @type {string} */ next) {
  token = next;
  if (next) sessionStorage.setItem(TOKEN, next);
  else sessionStorage.removeItem(TOKEN);
  $('#account-logout').hidden = !next;
  $('#account-import').hidden = !next;
  $('#account-login').hidden = !!next;
  $('#account-signup').hidden = !!next;
}

async function refreshCloud() {
  const box = $('#cloud-saved');
  if (!token) { box.hidden = true; box.innerHTML = ''; return; }
  const { res, body } = await api('/api/projects');
  if (res.status === 401) { setSession(''); status(body.error?.message || '다시 로그인해 주세요.'); return; }
  box.hidden = false;
  const items = body.projects ?? [];
  for (const p of items) revisions.set(p.id, p.revision);
  box.innerHTML = `<h3>계정에 저장한 조사</h3>` + (items.length
    ? items.map((/** @type {any} */ p) => `<div class="saved-item"><span><strong></strong></span></div>`).join('')
    : '<p class="hint">계정에 가져온 조사가 없어요.</p>');
  // 이름은 textContent로만 넣는다.
  [...box.querySelectorAll('.saved-item')].forEach((el, i) => {
    const name = el.querySelector('strong');
    if (name) name.textContent = items[i].name;
    const open = document.createElement('button');
    open.type = 'button'; open.className = 'btn small'; open.textContent = '계정에서 열기';
    open.addEventListener('click', () => openCloud(items[i].id));
    el.append(open);
  });
}

async function openCloud(/** @type {string} */ id) {
  const { res, body } = await api('/api/projects/' + encodeURIComponent(id));
  if (!res.ok) { status(body.error?.message || '열지 못했어요.'); return; }
  revisions.set(id, body.revision);
  status(`계정 조사 “${body.name}”를 읽었어요. 로컬 예시를 바꾸지는 않았어요.`);
}

async function importCurrent(/** @type {number|null} */ acknowledgeRevision) {
  if (!S.projectId || S.status !== 'ok') { status('가져갈 조사가 없어요. 예시를 연 뒤 다시 눌러 주세요.'); return; }
  const id = S.projectId;
  const baseRevision = revisions.get(id) ?? 0;
  const { res, body } = await api('/api/projects/' + encodeURIComponent(id), {
    method: 'PUT',
    body: JSON.stringify({ name: S.name || '조사', baseRevision, acknowledgeRevision, record: toRecord(S, scopeText(S)) }),
  });
  if (res.status === 409 && body.error?.code === 'revision_conflict') {
    status(`다른 화면의 저장(revision ${body.error.serverRevision})이 있어요. 덮어쓰지 않았어요. 그 버전을 확인했다면 다시 가져오기를 눌러 주세요.`);
    revisions.set(id, body.error.serverRevision);
    $('#account-import').dataset.ack = String(body.error.serverRevision);
    return;
  }
  if (!res.ok) { status(body.error?.message || '가져오지 못했어요.'); return; }
  revisions.set(id, body.revision);
  delete $('#account-import').dataset.ack;
  status('이 조사만 계정에 가져왔어요. 다른 로컬 예시는 올리지 않았어요.');
  refreshCloud();
}

export async function initAccount() {
  let config;
  try { config = await (await fetch('/api/config')).json(); } catch { return; }
  if (!config?.auth) return;
  const nav = $('#nav-account');
  nav.hidden = false;
  nav.addEventListener('click', () => { $('#account-dialog').hidden = !$('#account-dialog').hidden; });
  const saved = sessionStorage.getItem(TOKEN) || '';
  if (saved) { setSession(saved); refreshCloud(); }
  $('#account-form').addEventListener('submit', async (/** @type {Event} */ e) => {
    e.preventDefault();
    const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
    const { res, body } = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: fd.get('email'), password: fd.get('password') }) });
    if (!res.ok) { status(body.error?.message || '로그인하지 못했어요.'); return; }
    setSession(body.token);
    status(`${body.user.email} 로그인`);
    refreshCloud();
  });
  $('#account-signup').addEventListener('click', async () => {
    const fd = new FormData(/** @type {HTMLFormElement} */ ($('#account-form')));
    const { res, body } = await api('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email: fd.get('email'), password: fd.get('password') }) });
    status(res.ok && body.status === 'confirmation_sent' ? '확인 메일을 보냈어요. 링크를 연 뒤 로그인해 주세요.' : (body.error?.message || '가입하지 못했어요.'));
  });
  $('#account-reset').addEventListener('click', async () => {
    const fd = new FormData(/** @type {HTMLFormElement} */ ($('#account-form')));
    const { res, body } = await api('/api/auth/reset', { method: 'POST', body: JSON.stringify({ email: fd.get('email') }) });
    status(res.ok ? '재설정 안내를 요청했어요. 가입된 메일로만 도착해요.' : (body.error?.message || '요청하지 못했어요.'));
  });
  $('#account-logout').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    setSession('');
    $('#cloud-saved').hidden = true;
    status('로그아웃했어요.');
  });
  $('#account-import').addEventListener('click', () => {
    const ack = $('#account-import').dataset.ack;
    importCurrent(ack ? Number(ack) : null);
  });
}
