// 주소 정책: ?project=<무작위 ID>&tab=prepare 만 쓴다. 사용자가 입력한 글은 주소에 넣지 않는다.
import { S, isValidProjectId } from '../state/store.js';

/** 현재 화면이 가리키는 프로젝트 ID(손상·없음 화면 포함). */
export const urlProjectId = () => S.projectId ?? S.corrupt?.id ?? S.notFoundId ?? null;

/** @param {'push'|'replace'|'none'} mode */
export function setUrl(mode = 'push') {
  if (mode === 'none') return;
  const u = new URL(location.href);
  u.search = '';
  const id = urlProjectId();
  if (id) u.searchParams.set('project', id);
  if (id && S.tab === 'prepare' && S.status === 'ok') u.searchParams.set('tab', 'prepare');
  try { (mode === 'push' ? history.pushState : history.replaceState).call(history, { project: id, tab: S.tab }, '', u); } catch { /* 파일 환경 */ }
}

/** @returns {{project:string|null, invalidProject:boolean, topic:string|null, tab:'explore'|'prepare'}} */
export function parseUrl() {
  const p = new URLSearchParams(location.search);
  const raw = p.get('project');
  return {
    project: isValidProjectId(raw) ? raw : null,
    invalidProject: raw != null && !isValidProjectId(raw),
    topic: p.get('topic'),
    tab: p.get('tab') === 'prepare' ? 'prepare' : 'explore',
  };
}
