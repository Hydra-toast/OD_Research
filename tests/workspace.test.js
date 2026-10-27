import { describe, it, expect } from 'vitest';
import { fresh } from '../src/state/store.js';
import { renderSafeSummaryMd, paperRefLabel, workspaceDetailHtml } from '../src/views/workspace.js';
import { fromRecord, toRecord } from '../src/state/record.js';
import { workspaceVisibleItems } from '../src/research/list.js';
import { EXAMPLE_TOPICS } from '../src/data/examples.js';
import { fulltextLine } from '../src/views/research.js';

describe('기본 작업 화면', () => {
  it('개별 OpenAlex 원문은 키를 노출하지 않는 서버 주소로 연결한다', () => {
    const S = { ...fresh(), dataMode: 'real' };
    const p = { id: 'user:test', title: '가상 예시 · 실제 논문 아님', origin: 'provider', doi: '10.1234/example', access: 'abstract', fulltext: { contentPdfUrl: 'https://content.openalex.org/works/W1.pdf', landingPageUrl: 'https://example.org/article' } };
    expect(fulltextLine(S, p)).toContain('href="/api/openalex-pdf?work=W1"');
    const withoutLanding = { ...p, fulltext: { contentPdfUrl: p.fulltext.contentPdfUrl } };
    expect(fulltextLine(S, withoutLanding)).toContain('href="/api/openalex-pdf?work=W1"');
    expect(fulltextLine(S, withoutLanding)).not.toContain('content.openalex.org');
  });
  const papers = EXAMPLE_TOPICS.euv.papers;
  it('표가 아닌 파이프 행·제목이 아닌 #행에서도 진행하고 HTML을 실행하지 않는다', () => {
    const S = fresh();
    const html = renderSafeSummaryMd(S, { md: '| 단독 행\n#공백없음\n##### 다섯 단계\n<img src=x onerror=alert(1)>', paperIds: [] });
    expect(html).toContain('| 단독 행');
    expect(html).toContain('#공백없음');
    expect(html).toContain('##### 다섯 단계');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
  });
  it('논문 참조는 정렬 위치가 아닌 전달 묶음을 따른다', () => {
    const S = { ...fresh(), papers, selPapers: [papers[1].id, papers[0].id], summaryCtx: { paperIds: [papers[0].id, papers[1].id] } };
    expect(paperRefLabel(S, papers[0].id)).toBe('[P1]');
    expect(paperRefLabel(S, papers[2].id)).toBe('');
    const html = renderSafeSummaryMd(S, { md: '[P2] [P99]', paperIds: [papers[0].id, papers[1].id] });
    expect(html).toContain(`data-id="${papers[1].id}"`);
    expect(html).toContain('tag warn');
  });
  it('선택 보기에서 현재 필터 밖의 논문도 찾을 수 있다', () => {
    const S = { ...fresh(), papers, topicKey: 'euv', selPapers: [papers[0].id], pShowSelectedOnly: true };
    S.refine.include = ['no-match-at-all'];
    expect(workspaceVisibleItems(S).map(x => x.paper.id)).toEqual(S.selPapers);
  });
  it('옛 저장본은 비교 선택 기본값으로 열리고 새 초점·선택도 보존된다', () => {
    const S = { ...fresh(), papers, summaryRequest: '읽기 순서', pCompareIds: [papers[0].id] };
    const record = toRecord(S, '');
    expect(fromRecord(record).summaryRequest).toBe('읽기 순서');
    expect(fromRecord(record).pCompareIds).toEqual([papers[0].id]);
    delete record.pCompareIds;
    delete record.summaryRequest;
    expect(fromRecord(record).pCompareIds).toEqual([]);
    expect(fromRecord(record).summaryRequest).toBe('');
  });
  it('상세는 현재 한 편의 메모만 표시한다', () => {
    const S = { ...fresh(), papers, topicKey: 'euv', pDetailId: papers[0].id };
    expect(workspaceDetailHtml(S).match(/data-act="note"/g)).toHaveLength(1);
  });
});
