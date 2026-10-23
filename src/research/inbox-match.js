// 수신 PDF와 조사 논문을 맞춘다. 문서 DOI 또는 Sci-Hub 파일명(저자명연도.pdf)이 한 편과 맞을 때 자동 연결한다.

/** @param {string} value */
export function looseDoi(value) {
  return String(value || '').trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/[).,;]+$/, '').toLowerCase();
}

/** Sci-Hub 저장 이름. 저자명 뒤의 4자리 연도. 구분자(공백, _, -)는 허용한다. @param {string} name */
export function parseAuthorYear(name) {
  const base = String(name || '').replace(/\.pdf$/i, '').trim();
  const m = base.match(/^(.*?)[ _.-]*((?:19|20)\d{2})$/);
  if (!m) return null;
  const author = m[1].replace(/[ _.-]+$/g, '').replace(/^.*[ _.-]/, '');
  if (!/^[\p{L}][\p{L}'’-]{1,60}$/u.test(author)) return null;
  return { author, year: Number(m[2]) };
}

/** @param {string} value */
function fold(value) {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9가-힣]/g, '');
}

/** @param {any} paper @param {string} author @param {number} year */
function authorYearHit(paper, author, year) {
  if (Number(paper.year) !== year) return false;
  const token = fold(author);
  if (token.length < 2) return false;
  return (paper.authors || []).some((/** @type {string} */ raw) => {
    const text = String(raw || '');
    const surname = text.includes(',') ? text.split(',')[0] : (text.trim().split(/\s+/).at(-1) || '');
    return fold(surname) === token || fold(text) === token;
  });
}

/** @param {string} a @param {string} b */
function titleClash(a, b) {
  const words = (/** @type {string} */ s) => String(s || '').toLowerCase().split(/[^a-z0-9가-힣]+/).filter(w => w.length > 3);
  const left = words(a);
  const right = words(b);
  if (!left.length || !right.length) return false;
  return !left.some(w => right.includes(w));
}

/**
 * @param {any} item
 * @param {any[]} papers
 * @param {Record<string, any>} fulltext
 */
export function matchInboxItem(item, papers, fulltext) {
  const sha = item.sha256 || '';
  const same = papers.find(p => fulltext[p.id]?.sha256 && fulltext[p.id].sha256 === sha);
  if (same) return { action: 'ack', paperId: same.id, reason: '' };
  if (item.extractStatus === 'encrypted' || item.extractStatus === 'damaged' || item.status === 'failed' || item.status === 'over_limit') {
    return { action: 'review', paperId: null, reason: item.error || item.extractStatus || '확인이 필요해요' };
  }
  const parsed = parseAuthorYear(item.name || '');
  const byName = parsed ? papers.filter(p => authorYearHit(p, parsed.author, parsed.year)) : [];
  const doi = looseDoi(item.doi || '');
  const doiOk = !!(doi && !item.ambiguous && (item.doiCandidates || []).length === 1);
  const byDoi = doiOk ? papers.filter(p => looseDoi(p.doi) === doi) : [];
  if (byName.length > 1 && parsed) return { action: 'review', paperId: null, reason: `파일명 ${parsed.author}${parsed.year}과 맞는 논문이 여러 편이에요` };
  if (byName.length === 1 && byDoi.length === 1 && byName[0].id !== byDoi[0].id) return { action: 'review', paperId: null, reason: '파일명의 저자·연도와 문서 DOI가 다른 논문을 가리켜요' };
  const paper = byName[0] || byDoi[0];
  if (!paper) {
    if (item.ambiguous) return { action: 'review', paperId: null, reason: '문서 DOI가 여러 개예요' };
    return { action: 'review', paperId: null, reason: parsed ? '파일명의 저자·연도와 맞는 논문이 없어요' : '문서 DOI를 확인하지 못했어요' };
  }
  if (!byName.length && byDoi.length !== 1) return { action: 'review', paperId: null, reason: byDoi.length ? '같은 DOI 논문이 여러 편이에요' : '이 조사에 같은 DOI가 없어요' };
  if (item.metadataTitle && titleClash(item.metadataTitle, paper.title || '')) return { action: 'review', paperId: paper.id, reason: '문서 제목과 논문 제목이 달라요' };
  const kept = fulltext[paper.id];
  if (kept && ['extracted', 'scan_only'].includes(kept.status) && kept.sha256 !== sha) return { action: 'replace', paperId: paper.id, reason: '이미 다른 원문이 보관되어 있어요' };
  const reason = byName.length && parsed ? `파일명 ${parsed.author}${parsed.year}이 저자·연도와 일치해요` : '문서 DOI가 이 조사의 논문 한 편과 일치해요';
  return { action: 'auto', paperId: paper.id, reason };
}
