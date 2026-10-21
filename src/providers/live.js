// OpenAlex 주 검색 + Crossref 서지 보완/장애 시 검색. 예시로 대체하지 않는다.
import { dedupePapers } from '../schema.js';
import { ProviderError } from './contracts.js';
import { createSearchCache, TTL } from '../search/cache.js';

/** @param {unknown} v */
function safeUrl(v) {
  try {
    if (typeof v !== 'string') return null;
    const u = new URL(v);
    if (u.protocol !== 'https:') return null;
    for (const k of ['api_key', 'email', 'mailto']) u.searchParams.delete(k);
    return u.href;
  } catch { return null; }
}
/** @param {unknown} v */
function doiValue(v) {
  if (typeof v !== 'string') return null;
  const doi = v.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  return /^10\.\d{4,9}\/\S+$/i.test(doi) ? doi : null;
}
/** 제공된 단어 위치만 복원한다. @param {any} index */
export function reconstructAbstract(index) {
  if (!index || typeof index !== 'object' || Array.isArray(index)) return null;
  const words = new Map();
  for (const [word, positions] of Object.entries(index)) {
    if (!Array.isArray(positions)) continue;
    for (const pos of positions) if (Number.isInteger(pos) && pos >= 0 && pos < 100000) words.set(pos, word);
  }
  return words.size ? [...words.entries()].sort((a, b) => a[0] - b[0]).map(([, word]) => word).join(' ') : null;
}
/** @param {any} row @param {string} collectedAt */
export function mapOpenAlexPaper(row, collectedAt) {
  const providerId = String(row.id).split('/').pop();
  const abstract = reconstructAbstract(row.abstract_inverted_index);
  const oa = row.best_oa_location, doi = doiValue(row.doi);
  return {
    id: 'oa:' + providerId, providerId, doi, title: String(row.title || row.display_name || '').trim(),
    authors: Array.isArray(row.authorships) ? row.authorships.map(a => a?.author?.display_name).filter(n => typeof n === 'string') : [],
    year: Number.isInteger(row.publication_year) ? row.publication_year : null,
    venue: row.primary_location?.source?.display_name || null,
    citationCount: Number.isFinite(row.cited_by_count) ? row.cited_by_count : null,
    abstract, access: abstract ? 'abstract' : 'metadata', origin: 'provider', collectedAt,
    source: 'OpenAlex', fieldSources: /** @type {Record<string,string>} */ ({}),
    link: safeUrl(oa?.pdf_url) || safeUrl(oa?.landing_page_url) || safeUrl(row.primary_location?.landing_page_url) || (doi ? 'https://doi.org/' + doi : null),
    // 원문 위치만 보관한다. 링크가 있어도 원문 확보/분석 완료로 표시하지 않는다.
    fulltext: { pdfUrl: safeUrl(oa?.pdf_url), landingPageUrl: safeUrl(oa?.landing_page_url), license: oa?.license || null,
      contentPdfUrl: safeUrl(row.content_urls?.pdf), contentXmlUrl: safeUrl(row.content_urls?.grobid_xml), status: 'not_fetched',
      locationPdfUrls: [...new Set((Array.isArray(row.locations) ? row.locations : []).map((/** @type {any} */ l) => safeUrl(l?.pdf_url)).filter(Boolean))].slice(0, 6) },
    referencedWorks: Array.isArray(row.referenced_works) ? row.referenced_works : [],
    relatedWorks: Array.isArray(row.related_works) ? row.related_works : [],
  };
}
/** @param {any} row @param {string} collectedAt */
export function mapCrossrefPaper(row, collectedAt) {
  const doi = doiValue(row.DOI);
  const abstract = typeof row.abstract === 'string' ? row.abstract.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || null : null;
  const year = row.published?.['date-parts']?.[0]?.[0] ?? row.issued?.['date-parts']?.[0]?.[0];
  return {
    id: 'cr:' + encodeURIComponent(doi?.toLowerCase() || ''), providerId: 'crossref:' + doi?.toLowerCase(), doi, title: String(row.title?.[0] || '').trim(),
    authors: Array.isArray(row.author) ? row.author.map(a => [a.given, a.family].filter(Boolean).join(' ') || a.name).filter(Boolean) : [],
    year: Number.isInteger(year) ? year : null, venue: row['container-title']?.[0] || null,
    citationCount: Number.isFinite(row['is-referenced-by-count']) ? row['is-referenced-by-count'] : null,
    abstract, access: abstract ? 'abstract' : 'metadata', origin: 'provider', source: 'Crossref', collectedAt,
    link: safeUrl(row.URL) || (doi ? 'https://doi.org/' + doi : null), fieldSources: /** @type {Record<string,string>} */ ({}),
    fulltext: { status: 'not_fetched', links: Array.isArray(row.link) ? row.link.map(l => ({ url: safeUrl(l.URL), contentType: l['content-type'] || null })).filter(l => l.url) : [] },
  };
}

/** @param {{fetchImpl?:any, apiKey?:string, mailto?:string, cache?:ReturnType<typeof createSearchCache>, sleep?:(ms:number)=>Promise<void>, timeoutMs?:number, now?:()=>string}} [opt] */
export function createLiveSearch(opt = {}) {
  const fetchImpl = opt.fetchImpl ?? fetch, cache = opt.cache ?? createSearchCache();
  const sleep = opt.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  const timestamp = () => opt.now?.() || new Date().toISOString();
  let queue = Promise.resolve();
  /** @param {string} url @param {Record<string,string>} [headers] */
  function call(url, headers = {}) {
    const run = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), opt.timeoutMs ?? 12000);
        try {
          const res = await fetchImpl(url, { headers, signal: ctrl.signal });
          if (res.status === 429 && attempt < 2) {
            const raw = res.headers?.get?.('retry-after');
            const sec = raw && Number.isFinite(Number(raw)) ? Math.max(0, Number(raw)) : raw ? Math.max(0, (Date.parse(raw) - Date.now()) / 1000) : 0;
            await sleep(Math.min(30000, Math.max(Number.isFinite(sec) ? sec * 1000 : 0, 1000 * 2 ** attempt)) + Math.floor(Math.random() * 200));
            continue;
          }
          return res;
        } catch (e) {
          if (attempt === 2 || /** @type {any} */ (e)?.name === 'AbortError') throw new ProviderError('timeout', '검색 공급자에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
          await sleep(300 * 2 ** attempt);
        } finally { clearTimeout(timer); }
      }
    };
    const job = queue.then(run, run);
    queue = job.then(() => {}, () => {});
    return job;
  }
  /** @returns {Record<string,string>} */
  function oaHeaders() { return opt.apiKey?.trim() ? { Authorization: 'Bearer ' + opt.apiKey.trim() } : {}; }
  function crHeaders() { return { 'user-agent': 'ResearchLandscape/0.1' + (opt.mailto ? ' (mailto:' + opt.mailto + ')' : '') }; }
  /** @param {string} path */
  function crUrl(path) {
    const url = new URL(path, 'https://api.crossref.org');
    if (opt.mailto) url.searchParams.set('mailto', opt.mailto);
    return url.href;
  }
  /** @param {any} res @param {string} provider */
  async function bodyOf(res, provider) {
    if (res.status === 429) throw new ProviderError('rate_limited', provider + ' 호출 한도에 도달했어요. 잠시 뒤 다시 시도해 주세요.');
    if (!res.ok) throw new ProviderError('timeout', provider + ' 조회에 실패했어요. 공급자 설정과 연결을 확인해 주세요.');
    return res.json();
  }
  /** @param {string} doi */
  async function crossrefRecord(doi) {
    const got = await cache.get('cr|' + doi.toLowerCase(), TTL.paper, async () => {
      const res = await call(crUrl('/works/' + encodeURIComponent(doi)), crHeaders());
      if (res.status === 404) return null;
      return (await bodyOf(res, 'Crossref')).message ?? null;
    });
    return got.value;
  }
  return {
    mode: 'real',
    /** @param {{english:string,page?:number,personal?:boolean,userId?:string}} q */
    async search(q) {
      const english = String(q.english || '').trim(), page = q.page ?? 0;
      if (!english || english.length > 400) throw new ProviderError('bad_mode', '영문 검색어를 확인해 주세요.');
      if (!Number.isInteger(page) || page < 0 || page > 20) throw new ProviderError('bad_mode', '페이지 범위를 확인해 주세요.');
      const scope = { personal: q.personal, userId: q.userId };
      const warnings = ['추천 이유는 검색어와 수집 순서 기반이며 AI 추천이 아니에요. 원문 링크가 있어도 본문을 읽은 상태는 아니에요.'];
      if (!opt.apiKey) warnings.push('OpenAlex 공개 검색 중이에요. 무료 키 없이 이용 가능한 호출량은 더 적어요.');
      let got, papers, total, source, partial = false;
      try {
        got = await cache.get('oa|' + english.toLowerCase() + '|' + page, b => b.results.length ? TTL.search : TTL.empty, async () => {
          const url = new URL('https://api.openalex.org/works');
          url.searchParams.set('search', english); url.searchParams.set('page', String(page + 1)); url.searchParams.set('per_page', '50');
          const body = await bodyOf(await call(url.href, oaHeaders()), 'OpenAlex');
          if (!Array.isArray(body.results)) throw new ProviderError('bad_mode', 'OpenAlex 응답 형식을 확인하지 못했어요.');
          return body;
        }, scope);
        papers = dedupePapers(got.value.results.filter(r => /^https:\/\/openalex\.org\/W\d+$/.test(r?.id) && (r.title || r.display_name)?.trim()).map(r => mapOpenAlexPaper(r, got.collectedAt || timestamp())));
        total = Number.isFinite(got.value.meta?.count) ? got.value.meta.count : null; source = 'OpenAlex';
      } catch (oaError) {
        warnings.push('OpenAlex 검색에 실패해 Crossref 공개 검색 결과를 표시해요. 초록·인용 정보 범위가 달라요.');
        try {
          got = await cache.get('cr-search|' + english.toLowerCase() + '|' + page, b => b.items.length ? TTL.search : TTL.empty, async () => {
            const url = new URL(crUrl('/works')); url.searchParams.set('query', english); url.searchParams.set('rows', '50'); url.searchParams.set('offset', String(page * 50));
            const body = await bodyOf(await call(url.href, crHeaders()), 'Crossref');
            if (!Array.isArray(body.message?.items)) throw new ProviderError('bad_mode', 'Crossref 응답 형식을 확인하지 못했어요.');
            return body.message;
          }, scope);
        } catch (crError) {
          throw new ProviderError(oaError?.code === 'rate_limited' && crError?.code === 'rate_limited' ? 'rate_limited' : 'timeout', 'OpenAlex와 Crossref 모두 조회하지 못했어요. 잠시 뒤 다시 시도해 주세요. 예시 결과로 바꾸지 않았어요.');
        }
        papers = dedupePapers(got.value.items.filter(r => doiValue(r.DOI) && r.title?.[0]?.trim()).map(r => mapCrossrefPaper(r, got.collectedAt || timestamp())));
        total = Number.isFinite(got.value['total-results']) ? got.value['total-results'] : null; source = 'Crossref'; partial = true;
      }
      if (source === 'OpenAlex' && opt.mailto) {
        papers = await Promise.all(papers.map(async p => {
          if (!p.doi || (p.venue && p.year != null && p.abstract)) return p;
          try {
            const row = await crossrefRecord(p.doi);
            if (!row) return p;
            const extra = mapCrossrefPaper(row, p.collectedAt), next = { ...p, fieldSources: { ...p.fieldSources } };
            for (const key of ['venue', 'year', 'abstract']) if (next[key] == null && extra[key] != null) { next[key] = extra[key]; next.fieldSources[key] = 'Crossref'; }
            if (next.abstract) next.access = 'abstract';
            return next;
          } catch { partial = true; return p; }
        }));
        if (partial) warnings.push('Crossref 서지 보완 일부에 실패했어요. OpenAlex에서 확보한 내용은 유지했어요.');
      } else if (!opt.mailto) warnings.push('CROSSREF_MAILTO가 비어 있어 개별 논문 보완은 생략했어요. 본인 이메일을 설정할 수 있어요.');
      return { papers, estimatedTotal: total, collected: papers.length, collectedAt: got.collectedAt || timestamp(), partial, cached: !!got.cached, warnings, mode: 'real', source };
    },
    /** @param {string} value */
    async resolve(value) {
      const doi = doiValue(value);
      if (!doi) throw new ProviderError('bad_mode', 'DOI 형식을 확인해 주세요.');
      try {
        const res = await call('https://api.openalex.org/works/' + encodeURIComponent('https://doi.org/' + doi), oaHeaders());
        if (res.status !== 404) {
          const row = await bodyOf(res, 'OpenAlex');
          if (/^https:\/\/openalex\.org\/W\d+$/.test(row?.id) && (row.title || row.display_name)?.trim()) return mapOpenAlexPaper(row, timestamp());
          throw new ProviderError('bad_mode', 'OpenAlex 논문 응답 형식이 올바르지 않아요.');
        }
      } catch { /* OpenAlex에 없거나 연결 불가하면 DOI를 Crossref에서 조회한다. */ }
      const row = await crossrefRecord(doi);
      return row && doiValue(row.DOI) && row.title?.[0]?.trim() ? mapCrossrefPaper(row, timestamp()) : null;
    },
  };
}
