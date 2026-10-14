// 방향 분석 갱신. 늦게 도착한 오래된 분석 응답은 버리고, 실패하면 이전 결과를 유지한다.
import { S } from '../state/store.js';
import { createLatest } from '../logic.js';
import { analysisProvider } from './deps.js';
import { render } from './render.js';

const latest = createLatest();

export function cancelAnalysis() { latest.next(); }

export async function refreshAnalysis() {
  if (S.status !== 'ok') return;
  const id = latest.next();
  const input = { topicKey: S.topicKey, papers: S.papers, scope: S.scope, userMeta: S.userMeta };
  /** @type {any} */ let r;
  try { r = await analysisProvider().analyze(input); }
  catch (e) { r = { status: 'failed', directions: [], count: 0, reason: '', notices: [], error: `분석에 실패했어요(${/** @type {any} */ (e)?.message ?? '알 수 없는 오류'}). 이전 결과는 그대로 남아 있어요.` }; }
  if (!latest.isLatest(id) || S.status !== 'ok') return;
  if (r.status === 'failed') r = { ...r, directions: S.analysis?.directions ?? [], count: S.analysis?.count ?? 0, reason: S.analysis?.reason ?? '' };
  S.analysis = r;
  render();
}
