// 수신 폴더 PDF를 현재 대상 조사에만 연결한다. 서버 감지만으로 원문 확보로 표시하지 않는다.
import { S, paperById } from '../state/store.js';
import { render } from './render.js';
import { applyStoredPdf } from './research.js';
import { matchInboxItem } from '../research/inbox-match.js';

const token = sessionStorage.getItem('rl.inbox') || ('t' + Math.random().toString(36).slice(2));
try { sessionStorage.setItem('rl.inbox', token); } catch { /* 저장 불가 */ }
/** @type {Set<string>} */
const quiet = new Set();
let applying = false;

function bytesToBase64(/** @type {ArrayBuffer} */ buf) {
  const bytes = new Uint8Array(buf);
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

async function settings(/** @type {any} */ body) {
  const res = await fetch('/api/pdf-inbox/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (res.ok) S.inbox = await res.json();
  else S.inbox = { ...(S.inbox || {}), offline: true, enabled: false, items: S.inbox?.items || [] };
  render();
}

async function link(/** @type {any} */ item, /** @type {string} */ paperId, /** @type {boolean} */ announce) {
  const projectId = S.projectId;
  if (!projectId || projectId !== S.inbox?.targetProjectId || item.projectId && item.projectId !== projectId) return;
  const paper = paperById(paperId);
  if (!paper) return;
  const kept = S.fulltext[paperId];
  if (kept?.sha256 === item.sha256 && ['extracted', 'scan_only'].includes(kept.status)) {
    await fetch('/api/pdf-inbox/' + item.id + '/ack', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, projectId, paperId, sha256: item.sha256 }) });
    quiet.add(item.id);
    return;
  }
  const claim = await fetch('/api/pdf-inbox/' + item.id + '/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
  if (claim.status === 409) return;
  if (!claim.ok) return;
  const detail = await claim.json();
  if (S.projectId !== projectId) return;
  const pdf = await fetch('/api/pdf-inbox/' + item.id + '/pdf', { headers: { 'x-inbox-token': token } });
  if (!pdf.ok || S.projectId !== projectId) return;
  const buf = await pdf.arrayBuffer();
  await applyStoredPdf(paper, {
    status: detail.item.extractStatus === 'scan_only' ? 'scan_only' : 'extracted',
    pages: detail.pages || [], pageCount: detail.item.pageCount || 0, source: '로컬 폴더에서 가져온 PDF',
    sha256: item.sha256, pdfBase64: bytesToBase64(buf), extractor: 'pdfjs-dist',
  });
  const ack = await fetch('/api/pdf-inbox/' + item.id + '/ack', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, projectId, paperId, sha256: item.sha256 }) });
  if (ack.ok) {
    const body = await ack.json();
    if (announce && !body.duplicate && !quiet.has(item.id)) S.fulltextMsg = `${paper.title || '논문'}에 로컬 폴더 PDF를 연결했습니다.`;
    quiet.add(item.id);
  }
}

async function pull() {
  if (applying || S.status !== 'ok') return;
  const res = await fetch('/api/pdf-inbox');
  if (!res.ok) {
    if (!S.inbox?.offline) { S.inbox = { enabled: false, dir: '', pending: 0, items: [], offline: true }; render(); }
    return;
  }
  const snap = await res.json();
  const items = (snap.items || []).map((/** @type {any} */ item) => {
    const decision = S.projectId && snap.targetProjectId === S.projectId && item.projectId === S.projectId ? matchInboxItem(item, S.papers, S.fulltext) : null;
    return { ...item, clientAction: decision?.action || '', pick: decision?.paperId || item.pick || '', reason: decision?.reason || item.reason || '' };
  });
  const next = { ...snap, items };
  const prev = JSON.stringify(S.inbox || {});
  S.inbox = next;
  if (prev !== JSON.stringify(next)) render();
  if (!snap.enabled || snap.targetProjectId !== S.projectId) return;
  const auto = items.find((/** @type {any} */ item) => item.clientAction === 'auto' && !quiet.has(item.id));
  const ackOnly = items.find((/** @type {any} */ item) => item.clientAction === 'ack' && item.status !== 'done' && !quiet.has(item.id));
  const chosen = auto || ackOnly;
  if (!chosen) return;
  applying = true;
  try { await link(chosen, chosen.pick, chosen.clientAction === 'auto'); } finally { applying = false; }
}

export function initInbox() {
  setInterval(() => { void pull().catch(() => {}); }, 2000);
  document.addEventListener('click', async (e) => {
    const t = /** @type {any} */ (e.target)?.closest?.('[data-ract]');
    if (!t) return;
    if (t.dataset.ract === 'inbox-toggle') await settings({ enabled: !S.inbox?.enabled });
    if (t.dataset.ract === 'inbox-bind' && S.projectId) await settings({ targetProjectId: S.projectId });
    if (t.dataset.ract === 'inbox-copy') {
      try { await navigator.clipboard.writeText(S.inbox?.dir || ''); S.fulltextMsg = '수신 폴더 경로를 복사했습니다.'; } catch { S.fulltextMsg = S.inbox?.dir || ''; }
      render();
    }
    if (t.dataset.ract === 'inbox-exclude') {
      await fetch('/api/pdf-inbox/' + t.dataset.id + '/exclude', { method: 'POST' });
      await pull();
    }
    if (t.dataset.ract === 'inbox-link') {
      const item = (S.inbox?.items || []).find((/** @type {any} */ it) => it.id === t.dataset.id);
      const sel = document.querySelector(`[data-ract="inbox-pick"][data-id="${t.dataset.id}"]`);
      const paperId = /** @type {any} */ (sel)?.value || item?.pick;
      if (item && paperId) { applying = true; try { await link(item, paperId, true); } finally { applying = false; } await pull(); }
    }
  });
  void pull().catch(() => {});
}
