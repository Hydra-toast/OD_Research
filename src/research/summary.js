// 선택 논문 총정리: 외부 AI에 붙여 넣을 프롬프트와 돌아온 md의 형식 검사. 사이트는 AI를 호출하지 않는다.
export const SUMMARY_PROMPT_VERSION = 'summary-v1';
export const EXCERPT_CAP = 12000;

/** 쪽 번호를 붙인 발췌. 상한을 넘으면 잘린 쪽 수를 알린다. @param {{page:number,text:string}[]} pages */
export function excerptOf(pages, cap = EXCERPT_CAP) {
  let out = '', used = 0;
  for (const p of pages || []) {
    const text = String(p.text || '').replace(/\s+/g, ' ').trim();
    if (!text) { used++; continue; }
    const block = `[p.${p.page}] ${text}\n`;
    if (out.length + block.length > cap) {
      const room = cap - out.length;
      if (room > 200) out += block.slice(0, room) + ' …(잘림)\n';
      return { text: out, truncated: true, pagesShown: used + 1, pagesTotal: pages.length };
    }
    out += block; used++;
  }
  return { text: out, truncated: false, pagesShown: used, pagesTotal: (pages || []).length };
}

const RULES = [
  '당신은 논문을 정리하는 조력자입니다. 아래 "자료"에 적힌 내용만 사용하세요. 자료에 없는 사실·수치·논문·저자·페이지는 만들거나 추측하지 마세요.',
  '1. 해당 분야를 모르는 사람도 이해할 수 있게 쉬운 한국어로 쓰고, 전문 용어는 처음 나올 때 풀어 쓰세요. 용어 섹션을 따로 두세요.',
  '2. 수치와 데이터는 자료의 텍스트에 직접 적힌 값만 사용하세요. 그림·그래프 속 값을 읽어 내거나 추정하지 마세요. 필요한 정보는 Markdown 표, 그리고 표의 값만 쓰는 Mermaid 그림(xychart-beta, pie, flowchart 등)으로 표현하세요. 단위와 조건(온도, 시료 등)이 자료에 있으면 함께 쓰세요.',
  '3. 모든 문장과 모든 데이터에 근거 논문을 붙이세요. 형식은 [P1] 또는 쪽을 알면 [P1 p.5]입니다. 근거를 찾을 수 없으면 "자료에 없음 / 확인 필요"라고 쓰세요.',
  '4. "초록만" 제공된 논문은 초록에 있는 내용까지만 말하고, 본문에만 있을 법한 내용(방법 세부, 상세 수치)은 쓰지 마세요.',
  '5. 서로 조건이 다른 수치를 하나의 순위나 우열로 만들지 마세요. 비교할 수 없으면 이유를 쓰세요.',
  '6. 결과는 Markdown 문서 하나로, 코드 블록 바깥에 설명을 덧붙이지 말고 아래 섹션 순서를 따르세요: 한눈에 보기 / 용어 / 논문별 핵심 / 데이터 표 / 그림 (Mermaid) / 비교·공통점·차이 / 한계·확인 필요 / 출처 목록.',
  '7. 출처 목록에는 [P#]와 함께 아래 자료의 제목·DOI를 그대로 옮기세요. 자료 번호를 바꾸거나 새 번호를 만들지 마세요.',
];

/** @param {any} p @param {any} ft */
function paperBlock(p, n, ft, pages) {
  const head = [`[P${n}] ${p.title || '(제목 없음)'}`, `- ID: ${p.id}`, `- DOI: ${p.doi || '없음'}`, `- 연도: ${p.year ?? '없음'} · 학술지: ${p.venue || p.journal || '없음'}`];
  if (Array.isArray(p.authors) && p.authors.length) head.push(`- 저자: ${p.authors.slice(0, 6).map((/** @type {any} */ a) => a.name || a).join(', ')}`);
  const hasText = ft?.status === 'extracted' && pages?.length;
  head.push(`- 자료 범위: ${hasText ? `원문 추출(${ft.pageCount}쪽 중 일부 또는 전체)` : '초록만'}`);
  head.push(`- 초록: ${p.abstract ? String(p.abstract).replace(/\s+/g, ' ').trim() : '없음(초록을 확보하지 못함)'}`);
  if (hasText) {
    const ex = excerptOf(pages);
    head.push(`- 원문 발췌${ex.truncated ? ` (분량 제한으로 ${ex.pagesTotal}쪽 중 앞부분만, 잘림)` : ''}:\n${ex.text}`);
  } else if (ft && ft.status && ft.status !== 'extracted') head.push(`- 원문: 확보하지 못함(${ft.status})`);
  return head.join('\n');
}

/** @param {{ topic?: string, papers: any[], fulltext?: Record<string,any>, pagesById?: Record<string, any[]>, keywords?: string[], request?: string, previousMd?: string }} o */
export function summaryPrompt(o) {
  const ft = o.fulltext || {}, pages = o.pagesById || {};
  const blocks = o.papers.map((p, i) => paperBlock(p, i + 1, ft[p.id], pages[p.id]));
  const full = o.papers.filter(p => ft[p.id]?.status === 'extracted' && pages[p.id]?.length).length;
  const out = [
    `# 논문 총정리 요청 (${SUMMARY_PROMPT_VERSION})`,
    RULES.join('\n'),
    `## 조사 주제\n${o.topic || '(지정 안 함)'}`,
  ];
  if (o.keywords?.length) out.push(`## 사이트가 빈도로 찾은 표현 (의미 판단 아님)\n${o.keywords.join(', ')}`);
  if (o.request?.trim()) out.push(`## 사용자 추가 요청\n${o.request.trim()}`);
  out.push(`## 자료 범위\n논문 ${o.papers.length}편 중 원문 텍스트 포함 ${full}편, 초록만 ${o.papers.length - full}편. 이 사이트는 위 자료 외의 내용을 전달하지 않았습니다.`);
  if (o.previousMd?.trim()) {
    out.push('## 이전 정리본 (이를 발전시키세요)\n아래 문서를 바탕으로 수정·보완한 전체 문서를 작성하고, 맨 끝에 "## 변경 내역"을 추가해 무엇을 바꿨는지 쓰세요. 이전 문서의 [P#] 번호는 아래 자료 번호와 같습니다. 자료로 확인되지 않는 기존 문장은 "확인 필요"로 바꾸세요.\n\n' + o.previousMd.trim());
  }
  out.push('## 자료\n' + blocks.join('\n\n'));
  return out.join('\n\n');
}

/** md 형식 검사. 내용의 사실 여부는 보지 않는다. @param {string} md @param {number} paperCount */
export function checkSummaryMd(md, paperCount) {
  const text = String(md || '');
  const refs = [...text.matchAll(/\[P(\d+)(?:[^\]]*)\]/g)].map(m => Number(m[1]));
  const invalidRefs = [...new Set(refs.filter(n => n < 1 || n > paperCount))].map(n => `P${n}`);
  const noCode = text.replace(/```[\s\S]*?```/g, '\n');
  const paras = noCode.split(/\n\s*\n/).map(s => s.trim()).filter(s => s && !/^#/.test(s) && !/^\|?[\s:|-]+$/.test(s));
  const unsourced = paras.filter(s => s.length > 20 && !/\[P\d+/.test(s) && !/^\|/.test(s)).length;
  return {
    refCount: refs.length, invalidRefs, unsourcedParagraphs: unsourced,
    mermaid: (text.match(/```mermaid/g) || []).length,
    tables: (text.match(/^\s*\|?\s*:?-{3,}:?\s*\|/gm) || []).length,
    empty: !text.trim(),
  };
}
