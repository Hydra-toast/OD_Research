// DOI 조회 전용 어댑터. 모델 API/MCP 프로세스 없이 검증된 HTTP 경로를 사용한다.
export const SCIHUB_ORIGINS = ['https://sci-hub.st', 'https://sci-hub.ru', 'https://sci-hub.kr'];

export function normalizeDoi(value) {
  const doi = typeof value === 'string' ? value.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '') : '';
  return doi.length <= 300 && /^10\.\d{4,9}\/[^\s<>"#?]+$/i.test(doi) ? doi : null;
}

function decode(value) {
  return value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => {
      const code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    });
}

/** HTML은 실행하지 않는다. 현재 citation_pdf_url/object와 기존 embed/iframe 구조를 지원한다. */
export function parseScihubPage(html, pageUrl, requestedDoi) {
  const urls = [], declaredDois = [];
  for (const tag of html.match(/<(?:meta|object|embed|iframe|a)\b[^>]*>/gi) || []) {
    const attrs = {};
    for (const m of tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[m[1].toLowerCase()] = decode(m[2] ?? m[3]);
    if (attrs.name?.toLowerCase() === 'citation_doi') declaredDois.push(normalizeDoi(attrs.content));
    const value = attrs.name?.toLowerCase() === 'citation_pdf_url' ? attrs.content
      : /^<object\b/i.test(tag) ? attrs.data
      : /^<(?:embed|iframe)\b/i.test(tag) ? attrs.src
      : /^<a\b/i.test(tag) && /\.pdf(?:[?#]|$)/i.test(attrs.href || '') ? attrs.href : null;
    if (!value) continue;
    try { const u = new URL(value, pageUrl); u.hash = ''; if (u.protocol === 'https:') urls.push(u.href); } catch { /* invalid link */ }
  }
  if (declaredDois.some(d => d && d.toLowerCase() !== requestedDoi.toLowerCase())) return { status: 'doi_mismatch', urls: [] };
  if (urls.length) return { status: 'found', urls: [...new Set(urls)].slice(0, 3) };
  return { status: /captcha|altcha-widget|robot|로봇 확인/i.test(html) ? 'challenge_required' : 'not_found', urls: [] };
}

/** @param {string} doi @param {Function} fetchSafe @param {string[]} origins */
export async function fetchScihubPdf(doi, fetchSafe, origins = SCIHUB_ORIGINS) {
  const attempts = [];
  for (const origin of origins.slice(0, 3)) {
    const page = await fetchSafe(`${origin}/${encodeURI(doi)}`, 'text/html,application/pdf');
    if (!page.bytes) { attempts.push({ stage: 'page', status: page.error || 'failed' }); continue; }
    if (page.bytes.subarray(0, 5).toString() === '%PDF-') return { ...page, attempts };
    const parsed = parseScihubPage(page.bytes.toString('utf8'), page.finalUrl, doi);
    if (!parsed.urls.length) { attempts.push({ stage: 'page', status: parsed.status }); continue; }
    for (const url of parsed.urls) {
      const pdf = await fetchSafe(url);
      if (pdf.bytes?.subarray(0, 5).toString() === '%PDF-') return { ...pdf, attempts };
      const status = pdf.error || (/captcha|altcha-widget|로봇 확인/i.test(pdf.bytes?.toString('utf8') || '') ? 'challenge_required' : 'not_pdf');
      attempts.push({ stage: 'pdf', status });
    }
  }
  return { error: attempts.find(a => a.status === 'challenge_required')?.status || attempts.at(-1)?.status || 'not_found', attempts };
}
