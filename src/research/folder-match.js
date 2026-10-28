import { looseDoi } from './inbox-match.js';

/** @param {string} value */
function titleKey(value) {
  return String(value || '').normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

/** PDF 첫 페이지와 문서 메타데이터만 사용한다. 참고문헌과 파일 이름은 자동 연결 근거가 아니다.
 * @param {{ firstPage: string, metadataTitle?: string }} pdf @param {any[]} papers */
export function matchFolderPdf(pdf, papers) {
  const head = String(pdf.firstPage || '').split(/\b(?:references|bibliography)\b|참고문헌/i)[0].slice(0, 5000);
  const dois = [...new Set((head.match(/10\.\d{4,9}\/[^\s<>"\]]+/gi) || []).map(looseDoi))];
  const doiMatches = papers.filter(p => p.doi && dois.includes(looseDoi(p.doi)));
  if (doiMatches.length > 1) return { paper: null, basis: '', reason: 'DOI가 여러 논문과 일치 · 직접 선택' };
  const metadata = titleKey(pdf.metadataTitle || '');
  const first = ` ${titleKey(head)} `;
  const titleMatches = papers.filter(p => {
    const title = titleKey(p.title || '');
    if (title.length < 12 || title.split(' ').length < 3) return false;
    return metadata === title || first.includes(` ${title} `);
  });
  if (doiMatches.length === 1) {
    if (titleMatches.length === 1 && titleMatches[0].id !== doiMatches[0].id) return { paper: null, basis: '', reason: 'DOI와 제목이 서로 다른 논문과 일치 · 직접 선택' };
    return { paper: doiMatches[0], basis: 'doi', reason: 'DOI 일치 · 연결됨' };
  }
  if (titleMatches.length > 1) return { paper: null, basis: '', reason: '같은 제목의 논문이 여러 편 · 직접 선택' };
  if (titleMatches.length === 1) {
    const paper = titleMatches[0];
    if (dois.length && paper.doi && !dois.includes(looseDoi(paper.doi))) return { paper: null, basis: '', reason: '문서 DOI와 논문 DOI가 다름 · 직접 확인' };
    return { paper, basis: 'title', reason: '제목 일치 · 연결됨' };
  }
  return { paper: null, basis: '', reason: 'DOI·제목 미확인 · 직접 선택' };
}
