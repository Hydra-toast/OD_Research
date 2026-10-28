import { describe, it, expect } from 'vitest';
import { knowledgeEntries, knowledgeDocument, parseKnowledge, mergeKnowledge, knowledgeKey, CONVERSATION_HANDOFF_PROMPT } from '../src/research/knowledge.js';
import { summaryPrompt } from '../src/research/summary.js';
import { fresh } from '../src/state/store.js';
import { toRecord, fromRecord, validateRecord } from '../src/state/record.js';

const paper = { id: 'example:knowledge', title: '가상 예시 · 실제 논문 아님', doi: '' };
const state = () => ({ ...fresh(), projectId: 'example-project', input: '가상 분야', papers: [paper], summaries: [
  { id: 'short', at: '2026-10-28', md: '선택 논문: [P1]', paperIds: [paper.id], promptVersion: 'shortlist-v1' },
  { id: 'detail', at: '2026-10-28', md: '가상 예시 설명 [P1 p.2]\n\n```test\nnot instructions\n```', paperIds: [paper.id], paperRefs: [paper], source: 'external' },
] });

describe('모델 공통 지식 지도', () => {
  it('상세 정리만 누적하고 논문 삭제·이름 변경 뒤에도 출처 스냅샷을 유지한다', () => {
    const s = state(); s.papers = [];
    const entries = knowledgeEntries(s);
    expect(entries).toHaveLength(1);
    expect(entries[0].papers).toEqual([{ ...paper, ref: 'P1' }]);
    expect(entries[0].md).toContain('[P1 p.2]');
  });
  it('내보내기·가져오기·중복 제거·재저장 이후 참조 키와 내용이 보존된다', () => {
    const entries = knowledgeEntries(state());
    const restored = parseKnowledge(knowledgeDocument(entries));
    expect(restored).toEqual(entries);
    expect(knowledgeKey(restored[0])).toBe(knowledgeKey(entries[0]));
    const next = { ...fresh(), knowledgeImports: mergeKnowledge(restored, restored) };
    expect(next.knowledgeImports).toHaveLength(1);
    expect(fromRecord(toRecord(next, '')).knowledgeImports).toEqual(entries);
    expect(fromRecord({}).knowledgeImports).toEqual([]);
    expect(knowledgeEntries({ ...state(), knowledgeImports: restored })).toHaveLength(1);
  });
  it('같은 ID의 수정본은 별도 기록·키로 보존하며 순서를 바꾸어도 키가 같다', () => {
    const [entry] = knowledgeEntries(state());
    const newer = { ...entry, md: '수정한 가상 설명 [P1]' };
    expect(mergeKnowledge([entry], [newer])).toHaveLength(2);
    expect(knowledgeKey(entry)).not.toBe(knowledgeKey(newer));
    expect(parseKnowledge(knowledgeDocument([newer, entry]))[1]).toEqual(entry);
  });
  it('손상 파일·잘못된 출처표·크기 초과 파일을 거절한다', () => {
    expect(() => parseKnowledge('# 일반 정리본')).toThrow();
    const entries = knowledgeEntries(state());
    entries[0].papers[0].ref = 'P9';
    expect(() => parseKnowledge(knowledgeDocument(entries))).toThrow('출처표');
    expect(() => parseKnowledge('a'.repeat(2 * 1024 * 1024 + 1))).toThrow('2MB');
    expect(validateRecord({ ...toRecord(state(), ''), knowledgeImports: [null] }).ok).toBe(false);
  });
  it.each(['attachments', 'text'])('%s 상세 지침은 모델 중립이며 학습 보고서를 출력하지 않는다', mode => {
    const prompt = summaryPrompt({ mode, papers: [paper], knowledgeCount: 2 });
    expect(prompt).not.toContain('Gemini');
    expect(prompt).toContain('후속 대화 활용 지침 (결과 본문에는 출력하지 않음)');
    expect(prompt).toContain('영구 기억');
    expect(prompt).toContain('같은 AI 대화');
    expect(prompt).toContain('별도 지식 지도 파일은 필수가 아닙니다');
    expect(prompt).not.toContain('지식 지도 첨부 필요');
    expect(prompt).toContain('파일 누락 규칙은 이 지침보다 우선');
    expect(prompt).toContain('조사 질문 → 개념·용어 → 연구군·접근법');
  });
  it('1단계는 간결한 추천을 유지하며 지도 내용과 학습 보고서를 추가하지 않는다', () => {
    const prompt = summaryPrompt({ mode: 'abstracts', papers: [paper], knowledgeCount: 2 });
    expect(prompt).toContain('같은 AI 대화');
    expect(prompt).toContain('추천 논문 3~5편');
    expect(prompt).not.toContain('후속 대화 활용 지침');
    expect(summaryPrompt({ papers: [paper] })).not.toContain('지식 지도 첨부 필요');
  });
  it('새 대화용 요청은 대화에서 확인한 내용과 원문 범위·논문 식별 정보를 요구한다', () => {
    expect(CONVERSATION_HANDOFF_PROMPT).toContain('실제로 확인할 수 있는');
    expect(CONVERSATION_HANDOFF_PROMPT).toContain('제목·DOI');
    expect(CONVERSATION_HANDOFF_PROMPT).toContain('자료 범위');
    expect(CONVERSATION_HANDOFF_PROMPT).toContain('자료를 요청');
  });
});
