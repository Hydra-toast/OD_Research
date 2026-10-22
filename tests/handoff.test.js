import { describe, it, expect } from 'vitest';
import { buildHandoff, parseHandoff, basisVersion } from '../src/research/handoff.js';

const papers = [
  { id: 'oa:1', title: 'Oxide resist', abstract: 'Spin coating of a metal oxide.', doi: '10.1000/a', year: 2020 },
  { id: 'oa:2', title: 'Another film', abstract: 'Thickness was measured.', doi: '10.1000/b', year: 2021 },
];

const ctx = { speech: '금속산화물 박막을 보자', rankVersion: 'rule-v1', papers, selectedIds: ['oa:1', 'oa:2'], criteria: { core: ['metal oxide'] }, lab: null, note: '범위를 좁히자', warnings: ['0건'] };

describe('ChatGPT 전달 묶음', () => {
  it('관련성 프롬프트에 기준 버전·포함 ID·빠짐 수를 적고 41편은 40편만 담는다', () => {
    const many = Array.from({ length: 41 }, (_, i) => ({ id: `oa:${i}`, title: `T${i}`, abstract: 'abs' }));
    const pack = buildHandoff('review', { ...ctx, papers: many, selectedIds: [] });
    expect(pack.schema).toBe('review-v1');
    expect(pack.includedIds).toHaveLength(40);
    expect(pack.omitted).toBe(1);
    expect(pack.prompt).toContain(pack.basisVersion);
    expect(pack.prompt).toContain('oa:0');
    expect(pack.prompt).toContain('빠뜨린 논문: 1편');
    expect(pack.prompt).not.toContain('openai');
    expect(basisVersion('rule-v1', papers)).not.toBe(pack.basisVersion);
  });

  it('없는 방향 ID는 적용 대상에서 빼고 한 편짜리 방향은 근거 부족이다', () => {
    const built = buildHandoff('direction', ctx);
    expect(built.prompt).toContain('연구실 조건: 미입력');
    expect(built.prompt).toContain('direction-v1');
    const bad = parseHandoff('direction', JSON.stringify({
      schemaVersion: 'direction-v1', basisVersion: built.basisVersion, directions: [
        { id: 'd1', question: '어떤 박막인가', paperIds: ['oa:1', 'missing'], reason: '초록', labLink: '', uncertainty: '', readNext: ['oa:1'] },
      ],
    }), ctx, built.basisVersion);
    expect(bad.ok).toBe(false);
    expect(bad.unknown).toContain('missing');
    expect(bad.payload).toBeNull();
    const one = parseHandoff('direction', JSON.stringify({
      schemaVersion: 'direction-v1', basisVersion: built.basisVersion, directions: [
        { id: 'd1', question: '어떤 박막인가', paperIds: ['oa:1'], reason: '초록만', labLink: '미입력', uncertainty: '근거 부족', readNext: [] },
      ],
    }), ctx, built.basisVersion);
    expect(one.ok).toBe(true);
    expect(one.payload?.directions[0].weak).toBe(true);
    expect(one.payload?.directions[0].paperIds).toEqual(['oa:1']);
  });

  it('기준 버전이 다른 비교와 한국어 검색 문구는 적용하지 않는다', () => {
    const built = buildHandoff('compare', ctx);
    const stale = parseHandoff('compare', JSON.stringify({
      schemaVersion: 'compare-v1', basisVersion: 'old', rows: [{ item: '목적', cells: [{ paperId: 'oa:1', text: '박막', status: 'found' }] }],
    }), ctx, built.basisVersion);
    expect(stale.stale).toBe(true);
    expect(stale.payload).toBeNull();
    const feedback = parseHandoff('feedback', JSON.stringify({
      schemaVersion: 'feedback-v1', basisVersion: buildHandoff('feedback', ctx).basisVersion, keep: ['선택 유지'], changes: [], queries: [{ id: 'q1', text: '금속 산화물', purpose: '보완' }],
    }), ctx, buildHandoff('feedback', ctx).basisVersion);
    expect(feedback.ok).toBe(false);
    expect(feedback.payload).toBeNull();
  });

  it('읽기 도움은 글을 메모로 받고 JSON은 실행하지 않으며 검색 보완은 원문을 포함한다', () => {
    const memo = parseHandoff('read', '```markdown\n용어: 스핀 코팅\n```', ctx, '');
    expect(memo.ok).toBe(true);
    expect(memo.payload?.text).toContain('스핀 코팅');
    const json = parseHandoff('meeting', '{"schemaVersion":"meeting"}', ctx, '');
    expect(json.ok).toBe(false);
    const repair = buildHandoff('repair', ctx);
    expect(repair.prompt).toContain('금속산화물 박막을 보자');
    expect(repair.prompt).toContain('consult-v1');
    expect(repair.prompt).toContain('0건');
    const parsed = parseHandoff('repair', JSON.stringify({
      schemaVersion: 'consult-v1', professorRequirements: [], userConditions: [], assumptions: ['잠정'], unknowns: [],
      topicCandidates: [{ name: '박막', question: '어떤 조건인가', reason: '입력' }],
      selectedTopic: { name: '박막', question: '어떤 조건인가' },
      searchCriteria: { core: ['metal oxide film'] },
      queries: [
        { id: 'q1', text: 'metal oxide thin film', purpose: '핵심' },
        { id: 'q2', text: 'oxide film spin coating', purpose: '공정' },
        { id: 'q3', text: 'oxide film thickness', purpose: '특성' },
        { id: 'q4', text: 'oxide film annealing', purpose: '조건' },
        { id: 'q5', text: 'oxide film deposition', purpose: '공정' },
      ],
    }), ctx, repair.basisVersion);
    expect(parsed.ok).toBe(true);
    expect(parsed.payload?.queries).toHaveLength(5);
  });
});
