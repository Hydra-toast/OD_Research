// 공개 원문 받기와 PDF 텍스트 추출. 합법적으로 공개된 주소와 사용자가 올린 PDF만 다룬다. PDF 바이트는 저장하지 않는다.
import express from 'express';
import { createHash } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { HttpError } from './errors.js';
import { blockedUrl, inspectPdf, LIMITS } from '../src/pdf/policy.js';

const TIMEOUT_MS = 20000;

/** @param {string} ip */
export function privateIp(ip) {
  const v = ip.toLowerCase();
  if (isIP(v) === 4) {
    const [a, b] = v.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (v.startsWith('::ffff:')) return privateIp(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

/** 최소한의 pdfjs 추출. @param {Buffer} buf */
export async function extractPdfText(buf) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  let doc;
  const task = pdfjs.getDocument(/** @type {any} */ ({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false, disableFontFace: true, verbosity: 0 }));
  try {
    doc = await task.promise;
  } catch (e) {
    const name = /** @type {any} */ (e)?.name || '';
    return { status: name === 'PasswordException' ? 'encrypted' : 'damaged', pages: [], pageCount: 0 };
  }
  try {
    const total = doc.numPages;
    const limit = Math.min(total, LIMITS.pages);
    /** @type {{page:number,text:string}[]} */
    const pages = [];
    for (let n = 1; n <= limit; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push({ page: n, text: content.items.map((/** @type {any} */ i) => i.str).join(' ').replace(/\s+/g, ' ').trim() });
      page.cleanup();
    }
    const chars = pages.reduce((s, p) => s + p.text.length, 0);
    return { status: chars < 20 ? 'scan_only' : 'extracted', pages, pageCount: total, truncatedPages: total > limit };
  } catch {
    return { status: 'damaged', pages: [], pageCount: 0 };
  } finally { await task.destroy?.().catch?.(() => {}); }
}

/** @param {string} text */
export function findDoi(text) {
  const m = String(text || '').match(/10\.\d{4,9}\/[^\s"<>]+/);
  return m ? m[0].replace(/[).,;\]]+$/, '') : null;
}

/** @param {any} app @param {{ fetchImpl?: any, mailto?: string, lookup?: any, extract?: any }} [deps] */
export function mountFulltext(app, deps = {}) {
  const doFetch = deps.fetchImpl ?? ((/** @type {any} */ u, /** @type {any} */ o) => fetch(u, o));
  const lookup = deps.lookup ?? ((/** @type {string} */ h) => dnsLookup(h, { all: true }));
  const extract = deps.extract ?? extractPdfText;

  const sameOrigin = (/** @type {any} */ req, /** @type {any} */ _res, /** @type {any} */ next) => {
    const origin = req.get('origin');
    if (origin) { try { if (new URL(origin).host !== req.get('host')) return next(new HttpError(403, 'bad_origin', '같은 출처의 요청만 받아요.')); } catch { return next(new HttpError(403, 'bad_origin', '같은 출처의 요청만 받아요.')); } }
    next();
  };

  /** @param {string} url */
  async function safeFetch(url, accept = 'application/pdf,*/*') {
    let current = url;
    for (let i = 0; i <= LIMITS.redirects; i++) {
      const why = blockedUrl(current);
      if (why) return { error: why };
      let addrs;
      try { addrs = await lookup(new URL(current).hostname); } catch { return { error: 'dns_failed' }; }
      if (!addrs.length || addrs.some((/** @type {any} */ a) => privateIp(a.address))) return { error: 'blocked_host' };
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
      try {
        const response = await doFetch(current, { redirect: 'manual', signal: ctl.signal, headers: { accept, 'user-agent': 'research-landscape-personal/1.0' } });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const loc = response.headers.get('location');
          if (!loc) return { error: 'failed' };
          current = new URL(loc, current).href;
          continue;
        }
        if (!response.ok) return { error: response.status === 403 || response.status === 401 ? 'access_denied' : 'failed' };
        const declared = Number(response.headers.get('content-length') || 0);
        if (declared > LIMITS.fileBytes) return { error: 'too_large' };
        /** @type {Uint8Array[]} */
        const chunks = [];
        let size = 0;
        if (response.body?.getReader) {
          const reader = response.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > LIMITS.fileBytes) { await reader.cancel().catch(() => {}); return { error: 'too_large' }; }
            chunks.push(value);
          }
        } else {
          const ab = new Uint8Array(await response.arrayBuffer());
          if (ab.length > LIMITS.fileBytes) return { error: 'too_large' };
          chunks.push(ab);
        }
        return { bytes: Buffer.concat(chunks), finalUrl: current };
      } catch (e) {
        return { error: /** @type {any} */ (e)?.name === 'AbortError' ? 'timeout' : 'failed' };
      } finally { clearTimeout(timer); }
    }
    return { error: 'too_many_redirects' };
  }

  /** @param {string} doi */
  async function unpaywallUrls(doi) {
    if (!deps.mailto || !doi) return [];
    const r = await safeFetch(`https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(deps.mailto)}`, 'application/json');
    if (!r.bytes) return [];
    try {
      const j = JSON.parse(r.bytes.toString('utf8'));
      return (Array.isArray(j.oa_locations) ? j.oa_locations : []).map((/** @type {any} */ l) => l?.url_for_pdf).filter((/** @type {any} */ u) => typeof u === 'string');
    } catch { return []; }
  }

  /** @param {Buffer} bytes @param {any} extra */
  async function finish(bytes, extra) {
    const check = inspectPdf(bytes);
    if (!check.ok) return { status: check.code };
    const out = await extract(bytes);
    return { ...out, sha256: createHash('sha256').update(bytes).digest('hex'), extractor: 'pdfjs-dist', ...extra };
  }

  app.post('/api/fulltext/fetch', sameOrigin, async (req, res, next) => {
    try {
      const body = req.body || {};
      const given = (Array.isArray(body.urls) ? body.urls : []).filter((/** @type {any} */ u) => typeof u === 'string').slice(0, 10);
      const doi = typeof body.doi === 'string' ? body.doi.trim() : '';
      const viaUnpaywall = given.length < 10 ? await unpaywallUrls(doi) : [];
      const candidates = [...new Set([...given, ...viaUnpaywall])].slice(0, 12);
      if (!candidates.length) { res.json({ status: 'no_candidate', pages: [], pageCount: 0, tried: 0 }); return; }
      let last = 'failed';
      let tried = 0;
      for (const url of candidates) {
        tried++;
        const got = await safeFetch(url);
        if (!got.bytes) { last = got.error || 'failed'; continue; }
        const done = await finish(got.bytes, { source: new URL(got.finalUrl).hostname, license: typeof body.license === 'string' ? body.license : null, tried });
        if (done.status === 'extracted' || done.status === 'scan_only') { res.json(done); return; }
        last = done.status;
      }
      res.json({ status: last, pages: [], pageCount: 0, tried });
    } catch (e) { next(e); }
  });

  app.post('/api/fulltext/upload', sameOrigin, express.raw({ type: () => true, limit: LIMITS.fileBytes + 1024 }), async (req, res, next) => {
    try {
      if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'empty', '파일이 비어 있어요.');
      const done = await finish(req.body, { source: 'upload', license: null });
      const firstText = (done.pages || []).slice(0, 2).map((/** @type {any} */ p) => p.text).join(' ');
      res.json({ ...done, doiFound: findDoi(firstText) });
    } catch (e) { next(e); }
  });
}
