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
import { planQuery } from '../search/terms.js';
import { runtime } from './runtime.js';
import { ProviderError } from '../providers/contracts.js';
import { ruleRank, RANK_VERSION } from '../research/rank.js';
import { applyRefine, mergePool, refinedQueries } from '../research/refine.js';

/** 다음 검색이 끝날 때 주소를 어떻게 바꿀지(첫 진입은 기록을 늘리지 않는다). */
let nextUrlMode = /** @type {'push'|'replace'} */ ('push');
const openLatest = createLatest();

const routed = {
  async search(/** @type {string} */ q) {
    if (!runtime.search || S.forceExample) return provider.search(q);
    S.dataMode = 'real';
    const plan = S.englishOverride ? { ...planQuery(q), english: S.englishOverride, untranslated: [] } : planQuery(q);
    S.queryPlan = plan;
    if (plan.untranslated.length && !S.englishOverride) {
      return { papers: [], estimatedTotal: 0, collectedAt: new Date().toISOString(), partial: false, warnings: ['사전에 없는 표현은 번역하지 않았어요. 영문 검색어를 직접 수정해 주세요.'], mode: 'real', needsEnglish: true };
    }
    const res = await fetch('/api/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: q, english: plan.english, page: S.searchPage || 0, inputRevision: S.inputRevision, personal: true }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ProviderError(body.error?.code || 'timeout', body.error?.message || '검색에 실패했어요. 예시 결과로 바꾸지 않았어요.');
    if (body.inputRevision != null && body.inputRevision !== S.inputRevision) return { papers: [], stale: true, warnings: [], estimatedTotal: null, collectedAt: body.collectedAt, partial: false };
    return body;
  },
};
const runner = createSearchRunner(routed, {
  onStart(text) { S.input = text; S.dataMode = runtime.search && !S.forceExample ? 'real' : 'example'; S.status = 'loading'; S.searchError = ''; render(); showWorkspace(); },
  onError(_text, error) { S.searchError = error?.message || '논문을 불러오지 못했어요.'; S.status = 'error'; render(); },
  onResult(text, r) {
    if (r.stale) return;
    if (r.needsEnglish) { S.queryPlan = S.queryPlan || planQuery(text); S.status = 'ok'; S.papers = []; S.topicKey = null; S.dataMode = 'real'; S.warnings = r.warnings; render(); showWorkspace(); return; }
    if (r.mode === 'real' && S.searchPage > 0) {
      const ids = new Set(S.papers.map((/** @type {any} */ p) => p.id));
      S.papers = [...S.papers, ...r.papers.filter((/** @type {any} */ p) => !ids.has(p.id))];
      S.warnings = r.warnings; S.cached = !!r.cached; S.estimatedTotal = r.estimatedTotal ?? null; S.collectedAt = r.collectedAt || null; S.status = 'ok'; scheduleSave(); render(); return;
    }
    const key = r.mode === 'real' ? null : r.papers[0]?.id.match(/^example:([a-z]+)-/)?.[1] ?? null;
    S.queryPlan = S.queryPlan || planQuery(text);
    S.cached = !!r.cached; S.collectedAt = r.collectedAt || null; S.estimatedTotal = r.estimatedTotal ?? null;
    const same = !!key && key === S.topicKey && !!S.projectId;
    const keepUser = same ? S.papers.filter((/** @type {any} */ p) => p.origin === 'user') : [];
    const real = r.mode === 'real';
    const keepPlan = S.queryPlan;
    if (!same) resetState({ input: text, queryPlan: keepPlan, dataMode: real ? 'real' : 'example', forceExample: S.forceExample, cached: !!r.cached, collectedAt: r.collectedAt || null, estimatedTotal: r.estimatedTotal ?? null, searchPage: S.searchPage || 0 });
    S.papers = [...r.papers, ...keepUser]; S.warnings = r.warnings; S.topicKey = key;
    S.status = r.papers.length ? 'ok' : 'empty';
    const mode = nextUrlMode; nextUrlMode = 'push';
    if (r.papers.length && !S.projectId) {
      S.projectId = newId(); S.name = `${real ? text.slice(0, 80) : TOPIC_DEFS[key ?? ''].name} 조사`;
      S.versions = [{ at: new Date().toISOString(), label: '최초 분석', scope: scopeText(S) }];
      scheduleSave();
    }
    if (S.status === 'ok') refreshAnalysis();
    setUrl(S.status === 'ok' ? mode : 'replace');
    render(); showWorkspace(); focusHeading();
  },
});

export function focusHeading() { requestAnimationFrame(() => $('#panel-explore h2')?.focus()); }

/** @param {string} text @param {{url?:'push'|'replace', keepPage?: boolean, english?: string, example?:boolean}} [opt] */
export async function search(text, opt = {}) {
  if (!(await flushSave())) return;
  S.forceExample = !!opt.example;
  if (!opt.keepPage) { S.searchPage = 0; S.englishOverride = opt.english || ''; }
  S.inputRevision += 1;
  openLatest.next();
  nextUrlMode = opt.url ?? 'push';
  return runner.run(text);
}
/** 사용자가 고른 검색 문구만 실행한다. 제목만으로 논문을 합치지 않는다. @param {string[]} queries @param {string} label @param {any} criterion */
export async function searchMany(queries, label, criterion) {
  if (!(await flushSave())) return;
  S.forceExample = false;
  S.searchPage = 0;
  S.englishOverride = '';
  S.inputRevision += 1;
  const revision = S.inputRevision;
  S.input = label;
  S.dataMode = 'real';
  S.status = 'loading';
  S.searchError = '';
  render();
  showWorkspace();
  const res = await fetch('/api/research/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ queries, inputRevision: revision }) });
  const body = await res.json().catch(() => ({}));
  if (S.inputRevision !== revision) return;
  if (!res.ok) { S.searchError = body.error?.message || '검색에 실패했어요. 예시 결과로 바꾸지 않았어요.'; S.status = 'error'; render(); return; }
  if (S.inputRevision !== revision) return;
  const ranked = ruleRank(body.papers || [], criterion?.searchCriteria || {});
  const papers = ranked.papers;
  const notes = [...(body.warnings || []), `규칙 정렬 ${RANK_VERSION}. AI 의미 분석이 아니에요.`];
  notes.push(`수집 ${body.collectedBefore ?? papers.length}건, 중복 제거 후 ${body.collectedAfter ?? papers.length}건`);
  if (!papers.length && !(body.failed || []).length) notes.push('실행한 검색 문구의 결과가 0건이에요.');
  const keepPlan = { english: queries.join(' | '), untranslated: [] };
  resetState({ input: label, queryPlan: keepPlan, dataMode: 'real', forceExample: false, cached: false, collectedAt: new Date().toISOString(), estimatedTotal: null, searchPage: 0, inputRevision: revision });
  S.papers = papers;
  S.warnings = notes;
  S.researchBrief = { ...(criterion || {}), rankVersion: RANK_VERSION, importedAt: new Date().toISOString(), speech: S.input };
  S.topicKey = null;
  S.status = papers.length ? 'ok' : 'empty';
  if (S.status === 'ok' && !S.projectId) {
    S.projectId = newId();
    S.name = `${label.slice(0, 80)} 조사`;
    S.versions = [{ at: new Date().toISOString(), label: '최초 분석', scope: scopeText(S) }];
    scheduleSave();
  }
  if (S.status === 'ok') refreshAnalysis();
  setUrl(S.status === 'ok' ? 'push' : 'replace');
  render();
  showWorkspace();
  focusHeading();
}

/** 세부 검색: 포함어를 붙인 검색 문구로 다시 찾아 기존 묶음에 합친다. 기존 선택·메모는 유지한다. */
export async function refineSearch() {
  const include = S.refine.include;
  if (!include.length) { S.refineMsg = '반드시 포함할 단어를 하나 이상 적어야 더 찾을 수 있어요.'; render(); return; }
  const base = (S.researchBrief?.queries || []).map((/** @type {any} */ q) => q.text).filter(Boolean);
  const fallback = String(S.queryPlan?.english || S.input || '').split(' | ').filter(Boolean);
  const queries = refinedQueries(base.length ? base : fallback, include);
  const revision = S.inputRevision;
  S.refineBusy = true; S.refineMsg = ''; render();
  let body;
  try {
    const res = await fetch('/api/research/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ queries, inputRevision: revision }) });
    body = await res.json().catch(() => ({}));
    if (!res.ok) { if (S.inputRevision === revision) { S.refineBusy = false; S.refineMsg = body.error?.message || '추가 검색에 실패했어요. 기존 결과는 그대로예요.'; render(); } return; }
  } catch { S.refineBusy = false; S.refineMsg = '추가 검색에 실패했어요. 기존 결과는 그대로예요.'; render(); return; }
  if (S.inputRevision !== revision) return;
  const merged = mergePool(S.papers, body.papers || []);
  const criteria = { ...(S.researchBrief?.searchCriteria || {}) };
  criteria.core = [...new Set([...(criteria.core || []), ...include])];
  S.papers = ruleRank(merged.papers, criteria).papers;
  S.researchBrief = { ...(S.researchBrief || {}), searchCriteria: criteria, rankVersion: RANK_VERSION };
  S.refine.rounds.push({ id: `r${S.refine.rounds.length + 1}`, at: new Date().toISOString(), mode: 'search', include: [...include], exclude: [...S.refine.exclude], queries, added: merged.added, matched: applyRefine(S.papers, S.refine).visible.length });
  S.refineBusy = false;
  S.refineMsg = `${queries.length}개 검색 문구로 찾아 새 논문 ${merged.added}편을 더했어요.${(body.failed || []).length ? ` 일부 실패: ${body.failed.length}건.` : ''}`;
  scheduleSave(); render();
}

export function searchExample(/** @type {string} */ key, opt = {}) {
  $('#brief').value = EXAMPLE_TOPICS[key].input;
  return search(EXAMPLE_TOPICS[key].input, { ...opt, example: true });
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
    else resetState({ ...fromRecord(v.record), status: 'ok', forceExample: v.record.dataMode !== 'real', warnings: v.record.dataMode === 'real' ? v.record.searchWarnings || [] : [EXAMPLE_LABEL], tab: opt.tab ?? 'explore' });
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
