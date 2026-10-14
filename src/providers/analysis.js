// AnalysisProvider P0 구현: 예시 분석과 고정 응답(성공·부분·실패). 외부 AI 호출은 없다.
import { buildDirections } from '../logic.js';
import { validateDirection, assertModeConsistent } from '../schema.js';
import { ProviderError } from './contracts.js';

/**
 * @typedef {{topicKey:string|null, papers:any[], scope:any, userMeta?:Record<string,any>}} AnalysisInput
 * @typedef {{status:'ok'|'partial'|'failed', directions:any[], count:number, reason:string, notices:string[], error?:string}} AnalysisResult
 */

/** 공급자 결과를 검증한다. 형식이 틀린 방향은 버리고 부분 결과로 표시한다. */
export function checkResult(raw) {
  const notices = [...(raw.notices ?? [])];
  const good = [], bad = [];
  for (const d of raw.directions) (validateDirection(d).length ? bad : good).push(d);
  if (bad.length) notices.push(`방향 ${bad.length}개는 형식 오류로 제외했어요.`);
  const status = raw.status === 'failed' ? 'failed' : (bad.length || raw.status === 'partial') ? 'partial' : 'ok';
  return { ...raw, directions: good, status, notices };
}

export function createExampleAnalysis() {
  return {
    mode: 'example',
    /** @param {AnalysisInput} i @returns {Promise<AnalysisResult>} */
    async analyze(i) {
      assertModeConsistent('example', i.papers);
      const r = buildDirections(i.topicKey, i.papers, i.scope, i.userMeta);
      return checkResult({ status: 'ok', directions: r.directions, count: r.count, reason: r.reason, notices: r.available ? [] : [r.reason] });
    },
  };
}

/** @param {'ok'|'partial'|'fail'|'malformed'|'timeout'} scenario */
export function createFixtureAnalysis(scenario = 'ok') {
  return {
    mode: 'fixture',
    /** @param {AnalysisInput} i @returns {Promise<AnalysisResult>} */
    async analyze(i) {
      if (scenario === 'timeout') throw new ProviderError('timeout', '분석 시간이 초과됐어요');
      if (scenario === 'fail') return { status: 'failed', directions: [], count: i.papers.length, reason: '', notices: [], error: '분석에 실패했어요. 분석 이전 결과는 그대로 남아 있어요.' };
      const r = buildDirections(i.topicKey, i.papers, i.scope, i.userMeta);
      if (scenario === 'malformed') return checkResult({ status: 'ok', directions: [...r.directions.slice(0, 1), { id: '', label: '' }], count: r.count, reason: '', notices: [] });
      if (scenario === 'partial') return checkResult({ status: 'partial', directions: r.directions.slice(0, 1), count: r.count, reason: '', notices: ['일부 방향만 분석됐어요. 나머지는 다시 시도할 수 있어요.'] });
      return checkResult({ status: 'ok', directions: r.directions, count: r.count, reason: r.reason, notices: [] });
    },
  };
}
