// 조사 세션: 검색 시작, 저장된 조사 열기·복원, 홈으로, 뒤로 가기 처리.
import { S, resetState, newId, scopeText } from '../state/store.js';
import { EXAMPLE_TOPICS, EXAMPLE_LABEL } from '../data/examples.js';
import { TOPIC_DEFS } from '../data/content.js';
import { createLatest } from '../logic.js';
import { createSearchRunner } from '../search-runner.js';
import { validateRecord, fromRecord } from '../state/record.js';
import { provider, repo } from './deps.js';
import { render, renderSaved, showWorkspace, setSave, $ } from './render.js';
import { scheduleSave, flushSave } from './persist.js';
import { refreshAnalysis, cancelAnalysis } from './analysis.js';
import { setUrl, parseUrl } from './router.js';

/** 다음 검색이 끝날 때 주소를 어떻게 바꿀지(첫 진입은 기록을 늘리지 않는다). */
let nextUrlMode = /** @type {'push'|'replace'} */ ('push');
const openLatest = createLatest();

const runner = createSearchRunner(provider, {
  onStart(text) { S.input = text; S.status = 'loading'; render(); showWorkspace(); },
  onError() { S.status = 'error'; render(); },
  onResult(text, r) {
    const key = r.papers[0]?.id.match(/^example:([a-z]+)-/)?.[1] ?? null;
    const same = !!key && key === S.topicKey && !!S.projectId;
    const keepUser = same ? S.papers.filter((/** @type {any} */ p) => p.origin === 'user') : [];
    if (!same) resetState({ input: text });
    S.papers = [...r.papers, ...keepUser]; S.warnings = r.warnings; S.topicKey = key;
    S.status = r.papers.length ? 'ok' : 'empty';
    const mode = nextUrlMode; nextUrlMode = 'push';
    if (r.papers.length && !S.projectId) {
      S.projectId = newId(); S.name = `${TOPIC_DEFS[key ?? ''].name} 조사`;
      S.versions = [{ at: new Date().toISOString(), label: '최초 분석', scope: scopeText(S) }];
      scheduleSave();
    }
    if (S.status === 'ok') refreshAnalysis();
    setUrl(S.status === 'ok' ? mode : 'replace');
    render(); showWorkspace(); focusHeading();
  },
});

export function focusHeading() { requestAnimationFrame(() => $('#panel-explore h2')?.focus()); }

/** @param {string} text @param {{url?:'push'|'replace'}} [opt] */
export async function search(text, opt = {}) {
  if (!(await flushSave())) return;
  openLatest.next();
  nextUrlMode = opt.url ?? 'push';
  return runner.run(text);
}
export function searchExample(/** @type {string} */ key, opt = {}) {
  $('#brief').value = EXAMPLE_TOPICS[key].input;
  return search(EXAMPLE_TOPICS[key].input, opt);
}

/** 저장된 조사를 연다. 손상·읽기 전용·없음은 복구 화면으로 보낸다(삭제·덮어쓰기 없음).
 * @param {string} id @param {{tab?:'explore'|'prepare', url?:'push'|'replace'|'none'}} [opt] */
export async function openProject(id, opt = {}) {
  if (!(await flushSave())) return;
  const ticket = openLatest.next();
  runner.cancel(); cancelAnalysis();
  showWorkspace();
  let raw;
  try { raw = await repo.load(id); }
  catch { if (!openLatest.isLatest(ticket)) return; resetState({ status: 'error' }); render(); return; }
  if (!openLatest.isLatest(ticket)) return;
  if (!raw) {
    resetState({ status: 'missing', notFoundId: id });
  } else {
    const v = validateRecord(raw);
    if (!v.ok) resetState({ status: 'corrupt', readOnly: v.readOnly, corrupt: { id, name: raw?.name ?? null, errors: v.errors } });
    else resetState({ ...fromRecord(v.record), status: 'ok', warnings: [EXAMPLE_LABEL], tab: opt.tab ?? 'explore' });
  }
  setUrl(opt.url ?? 'push');
  render();
  if (S.status === 'ok') { setSave('이 브라우저에 저장됨(불러옴)', false); refreshAnalysis(); } else setSave('', false);
  $('#workspace').scrollIntoView?.();
  focusHeading();
}

/** 첫 화면으로. 저장된 조사는 지우지 않는다. */
export async function goHome(opt = { url: /** @type {'push'|'replace'|'none'} */ ('push') }) {
  if (!(await flushSave())) return;
  openLatest.next(); runner.cancel(); cancelAnalysis();
  resetState();
  showWorkspace(false); setSave('', false);
  setUrl(opt.url);
  renderSaved();
}

/** 뒤로/앞으로 가기: 주소의 프로젝트와 탭에 화면을 맞춘다. */
export async function handlePopState() {
  const u = parseUrl();
  if (u.project) {
    const cur = S.projectId ?? S.corrupt?.id ?? S.notFoundId;
    if (cur === u.project && S.status === 'ok') { S.tab = u.tab; render(); return; }
    await openProject(u.project, { tab: u.tab, url: 'none' });
  } else if (u.invalidProject) {
    resetState({ status: 'missing', notFoundId: '(잘못된 주소)' }); showWorkspace(); render();
  } else {
    await goHome({ url: 'none' });
  }
}

/** 첫 진입. ?project= 복원 우선, ?topic=은 새 조사를 시작하고 주소를 ?project=로 바꾼다. */
export async function initFromUrl() {
  const u = parseUrl();
  if (u.project) return openProject(u.project, { tab: u.tab, url: 'replace' });
  if (u.invalidProject) { resetState({ status: 'missing', notFoundId: '(잘못된 주소)' }); showWorkspace(); render(); return; }
  if (u.topic && EXAMPLE_TOPICS[u.topic]) {
    await searchExample(u.topic, { url: 'replace' });
    if (u.tab === 'prepare' && S.status === 'ok') { S.tab = 'prepare'; setUrl('replace'); render(); }
  }
}