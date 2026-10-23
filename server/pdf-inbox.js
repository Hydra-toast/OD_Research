// 사용자가 직접 저장한 PDF 수신함. data/pdfs 출력 폴더와 분리한다. CAPTCHA는 다루지 않는다.
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, writeFile, lstat, realpath } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { inspectPdf, LIMITS } from '../src/pdf/policy.js';
import { normalizeDoi } from './scihub.js';
import { HttpError } from './errors.js';

const PARTIAL = /\.(?:crdownload|part|tmp)$/i;
const DOI_RE = /(?:https?:\/\/(?:dx\.)?doi\.org\/|doi\s*[:：]\s*)(10\.\d{4,9}\/[^\s<>"#?]+)/gi;

/** 인용 끝 구두점만 벗긴다. DOI 안의 문자는 자르지 않는다. @param {string} value */
export function normalizeInboxDoi(value) {
  let s = String(value || '').trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi\s*[:：]\s*/i, '');
  while (/[).,;\]>'"]$/.test(s)) {
    const next = s.slice(0, -1);
    if (!normalizeDoi(next)) break;
    s = next;
  }
  return normalizeDoi(s);
}

/** 메타데이터와 첫 페이지 앞부분의 문서 DOI. 참고문헌 절 이후는 자동 연결 근거가 아니다.
 * @param {{ metadataText?: string, firstPage?: string }} src */
export function documentDois(src) {
  const head = String(src.firstPage || '').split(/\b(?:references|bibliography|참고문헌)\b/i)[0].slice(0, 2500);
  /** @type {string[]} */
  const found = [];
  const push = (/** @type {string} */ raw) => {
    const doi = normalizeInboxDoi(raw);
    if (doi && !found.some(x => x.toLowerCase() === doi.toLowerCase())) found.push(doi);
  };
  for (const text of [String(src.metadataText || ''), head]) {
    for (const m of text.matchAll(DOI_RE)) push(m[1]);
  }
  return { doi: found.length === 1 ? found[0] : null, candidates: found, ambiguous: found.length > 1 };
}

/** @param {string} parent @param {string} candidate */
export function pathInside(parent, candidate) {
  const root = resolve(parent);
  const file = resolve(candidate);
  return file === root || file.startsWith(root + sep);
}

/**
 * @param {{
 *   inboxDir: string, pdfDir?: string|null, stateFile: string, extract: (buf: Buffer) => Promise<any>,
 *   stabilityMs?: number, maxFiles?: number, maxBytes?: number, fileBytes?: number, now?: () => number,
 *   readFile?: typeof readFile, stat?: typeof stat, skipMetadata?: boolean,
 * }} opts
 */
export function createPdfInbox(opts) {
  const now = opts.now ?? (() => Date.now());
  const rd = opts.readFile ?? readFile;
  const st = opts.stat ?? stat;
  const stabilityMs = opts.stabilityMs ?? 400;
  const maxFiles = opts.maxFiles ?? 40;
  const maxBytes = opts.maxBytes ?? 600 * 1024 * 1024;
  const fileBytes = opts.fileBytes ?? LIMITS.fileBytes;
  const leaseMs = 20000;
  /** @type {any} */
  let state = { settings: { enabled: false, targetProjectId: null }, items: /** @type {any[]} */ ([]), excluded: /** @type {string[]} */ ([]), warnings: /** @type {string[]} */ ([]) };
  let corrupt = false;
  let running = false;
  let timer = /** @type {any} */ (null);
  let busy = false;
  let queued = false;
  /** @type {Map<string, { size: number, mtimeMs: number }>} */
  const samples = new Map();
  /** @type {Map<string, any[]>} */
  const pages = new Map();

  const inboxDir = resolve(opts.inboxDir);
  const pdfDir = opts.pdfDir ? resolve(opts.pdfDir) : null;

  function publicItem(/** @type {any} */ item) {
    return {
      id: item.id, name: item.name, bytes: item.bytes, sha256: item.sha256, status: item.status, error: item.error || '',
      attempts: item.attempts || 0, foundAt: item.foundAt, doi: item.doi || null, doiCandidates: item.doiCandidates || [],
      ambiguous: !!item.ambiguous, extractStatus: item.extractStatus || null, pageCount: item.pageCount || 0,
      projectId: item.projectId || null, paperId: item.paperId || null, metadataTitle: item.metadataTitle || '',
    };
  }

  async function load() {
    try {
      const raw = await readFile(opts.stateFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.items) || !parsed.settings) throw new Error('shape');
      state = { settings: { enabled: !!parsed.settings.enabled, targetProjectId: parsed.settings.targetProjectId || null }, items: parsed.items, excluded: Array.isArray(parsed.excluded) ? parsed.excluded : [], warnings: [] };
      corrupt = false;
    } catch (e) {
      if (/** @type {any} */ (e)?.code === 'ENOENT') { corrupt = false; return; }
      corrupt = true;
    }
  }

  async function persist() {
    if (corrupt) return;
    await mkdir(resolve(opts.stateFile, '..'), { recursive: true });
    const tmp = opts.stateFile + '.tmp';
    await writeFile(tmp, JSON.stringify(state));
    await rename(tmp, opts.stateFile);
  }

  function bind(/** @type {any} */ item) {
    if (!item.projectId && state.settings.targetProjectId) item.projectId = state.settings.targetProjectId;
  }

  async function inspectFile(/** @type {string} */ file, /** @type {string} */ name, /** @type {any} */ seen) {
    const before = await st(file);
    if (before.size !== seen.size || before.mtimeMs !== seen.mtimeMs) return { status: 'waiting', error: '아직 쓰는 중' };
    if (before.size > fileBytes) return { status: 'over_limit', error: '파일이 20MB를 넘어요', bytes: before.size };
    let buf;
    try { buf = await rd(file); } catch (e) {
      const code = /** @type {any} */ (e)?.code;
      return { status: 'waiting', error: code === 'EBUSY' || code === 'EPERM' ? '파일이 잠겨 있어요' : '읽지 못했어요' };
    }
    const after = await st(file);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || buf.length !== before.size) return { status: 'waiting', error: '읽는 동안 바뀌었어요' };
    const check = inspectPdf(buf);
    const sha256 = createHash('sha256').update(buf).digest('hex');
    if (!check.ok) return { status: check.code === 'too_large' ? 'over_limit' : 'failed', error: check.code, sha256, bytes: buf.length, extractStatus: check.code };
    const extracted = await opts.extract(buf);
    let metadataText = '';
    let metadataTitle = '';
    if (!opts.skipMetadata) try {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const doc = await pdfjs.getDocument(/** @type {any} */ ({ data: new Uint8Array(buf), verbosity: 0, isEvalSupported: false })).promise;
      const meta = await doc.getMetadata().catch(() => ({ info: {} }));
      const info = meta?.info || {};
      metadataTitle = String(info.Title || '');
      metadataText = [info.Title, info.Subject, info.Keywords, info.Creator].filter(Boolean).join(' ');
      await /** @type {any} */ (doc).destroy?.().catch?.(() => {});
    } catch { /* 메타데이터 없음 */ }
    const ids = documentDois({ metadataText, firstPage: extracted.pages?.[0]?.text || '' });
    const status = extracted.status === 'extracted' && ids.doi ? 'ready' : (extracted.status === 'encrypted' || extracted.status === 'damaged' ? 'failed' : 'review');
    pages.set(sha256, extracted.pages || []);
    return {
      status, error: extracted.status === 'encrypted' || extracted.status === 'damaged' ? extracted.status : '', sha256, bytes: buf.length,
      extractStatus: extracted.status, pageCount: extracted.pageCount || 0, doi: ids.doi, doiCandidates: ids.candidates, ambiguous: ids.ambiguous || !ids.doi, metadataTitle,
    };
  }

  async function scanOnce() {
    if (corrupt || !state.settings.enabled) return state;
    if (busy) { queued = true; return state; }
    busy = true;
    try {
      let names = [];
      try { names = await readdir(inboxDir); } catch { state.warnings = ['수신 폴더를 열 수 없어요. 로컬 서버가 켜져 있고 폴더가 있어야 합니다.']; return state; }
      state.warnings = [];
      let used = state.items.reduce((s, it) => s + (it.bytes || 0), 0);
      for (const name of names) {
        if (name.startsWith('.') || PARTIAL.test(name) || !/\.pdf$/i.test(name)) continue;
        const file = join(inboxDir, name);
        let lst;
        try { lst = await lstat(file); } catch { continue; }
        if (lst.isSymbolicLink()) {
          let real = '';
          try { real = await realpath(file); } catch { continue; }
          if (!pathInside(inboxDir, real) || (pdfDir && pathInside(pdfDir, real))) continue;
        }
        if (!lst.isFile()) continue;
        let real = file;
        try { real = await realpath(file); } catch { continue; }
        if (!pathInside(inboxDir, real) || (pdfDir && pathInside(pdfDir, real))) continue;
        let first;
        let second;
        try {
          first = await st(file);
          await new Promise(r => setTimeout(r, stabilityMs));
          second = await st(file);
        } catch { continue; }
        if (first.size !== second.size || first.mtimeMs !== second.mtimeMs || second.size === 0) {
          samples.set(real, { size: second.size, mtimeMs: second.mtimeMs });
          if (second.size === 0 || first.size !== second.size) {
            const row = state.items.find(it => it.real === real);
            if (row && !['done', 'excluded'].includes(row.status)) { row.status = 'waiting'; row.error = '다운로드가 끝나기를 기다리는 중'; row.attempts = (row.attempts || 0) + 1; }
            else if (!row && state.items.length < maxFiles) state.items.push({ id: 'in' + randomBytes(6).toString('hex'), real, name, bytes: second.size, sha256: '', status: 'waiting', error: '다운로드가 끝나기를 기다리는 중', attempts: 1, foundAt: new Date(now()).toISOString(), projectId: null });
          }
          continue;
        }
        const prev = samples.get(real);
        samples.set(real, { size: second.size, mtimeMs: second.mtimeMs });
        if (!prev || prev.size !== second.size || prev.mtimeMs !== second.mtimeMs) continue;
        if (state.items.some(it => it.real === real && ['ready', 'review', 'done', 'excluded', 'failed', 'over_limit'].includes(it.status) && it.bytes === second.size)) continue;
        if (state.items.length >= maxFiles || used + second.size > maxBytes) {
          state.warnings.push('수신 대기열 한도를 넘었어요. 초과 파일은 자동으로 연결하지 않습니다.');
          if (!state.items.some(it => it.real === real)) state.items.push({ id: 'in' + randomBytes(6).toString('hex'), real, name, bytes: second.size, sha256: '', status: 'over_limit', error: '대기열 한도 초과', attempts: 0, foundAt: new Date(now()).toISOString(), projectId: null });
          continue;
        }
        let result;
        try { result = await inspectFile(file, name, second); }
        catch { result = { status: 'waiting', error: '검사 중 오류', attempts: 1 }; }
        const sha = result.sha256 || '';
        if (sha && (state.excluded.includes(sha) || state.items.some(it => it.sha256 === sha && it.real !== real && ['done', 'excluded', 'ready', 'review'].includes(it.status)))) {
          const twin = state.items.find(it => it.sha256 === sha);
          if (twin) twin.name = name;
          continue;
        }
        let row = state.items.find(it => it.real === real) || (sha ? state.items.find(it => it.sha256 === sha) : null);
        if (!row) {
          row = { id: 'in' + randomBytes(6).toString('hex'), real, foundAt: new Date(now()).toISOString(), attempts: 0, projectId: null };
          state.items.push(row);
          used += second.size;
        }
        Object.assign(row, { name, real, ...result, attempts: (row.attempts || 0) + (result.status === 'waiting' ? 1 : 0) });
        bind(row);
      }
      await persist();
    } catch {
      state.warnings = ['수신 폴더를 확인하지 못했어요. 다음 확인에서 다시 시도합니다.'];
    } finally {
      busy = false;
      if (queued) { queued = false; await scanOnce(); }
    }
    return state;
  }

  return {
    async start() {
      await load();
      if (running) return;
      running = true;
      if (state.settings.enabled) await mkdir(inboxDir, { recursive: true }).catch(() => {});
      timer = setInterval(() => { void scanOnce(); }, opts.stabilityMs === 0 ? 50 : 2000);
      timer.unref?.();
      if (state.settings.enabled) void scanOnce();
    },
    stop() { running = false; clearInterval(timer); timer = null; },
    scanOnce,
    snapshot() {
      const pending = state.items.filter(it => !['done', 'excluded'].includes(it.status)).length;
      return {
        enabled: state.settings.enabled, running, dir: inboxDir, corrupt, pending, warnings: state.warnings,
        targetProjectId: state.settings.targetProjectId, items: state.items.map(publicItem),
      };
    },
    async setSettings(/** @type {any} */ patch) {
      if (corrupt) return { error: '대기열 기록이 손상되어 덮어쓰지 않았어요.' };
      if (typeof patch.enabled === 'boolean') state.settings.enabled = patch.enabled;
      if (patch.targetProjectId === null) state.settings.targetProjectId = null;
      else if (typeof patch.targetProjectId === 'string' && /^[A-Za-z0-9-]{4,40}$/.test(patch.targetProjectId)) state.settings.targetProjectId = patch.targetProjectId;
      if (state.settings.enabled) await mkdir(inboxDir, { recursive: true }).catch(() => {});
      for (const item of state.items) bind(item);
      await persist();
      if (state.settings.enabled) await scanOnce();
      return this.snapshot();
    },
    async claim(/** @type {string} */ id, /** @type {string} */ token) {
      const item = state.items.find(it => it.id === id);
      if (!item || !token) return null;
      const until = item.leaseUntil || 0;
      if (item.leaseToken && item.leaseToken !== token && until > now()) return { conflict: true };
      item.leaseToken = token;
      item.leaseUntil = now() + leaseMs;
      if (item.sha256 && !pages.has(item.sha256) && item.real && pathInside(inboxDir, item.real)) {
        try {
          const buf = await rd(item.real);
          if (createHash('sha256').update(buf).digest('hex') === item.sha256) {
            const extracted = await opts.extract(buf);
            pages.set(item.sha256, extracted.pages || []);
          }
        } catch { /* 다음 시도 */ }
      }
      return { item: publicItem(item), pages: pages.get(item.sha256) || [] };
    },
    async readBytes(/** @type {string} */ id, /** @type {string} */ token) {
      const item = state.items.find(it => it.id === id);
      if (!item || item.leaseToken !== token || (item.leaseUntil || 0) <= now()) return null;
      const file = item.real;
      if (!pathInside(inboxDir, file)) return null;
      const buf = await rd(file);
      const sha = createHash('sha256').update(buf).digest('hex');
      if (sha !== item.sha256) return null;
      return buf;
    },
    async ack(/** @type {string} */ id, /** @type {any} */ body) {
      const item = state.items.find(it => it.id === id);
      if (!item) return null;
      const key = `${body.projectId}:${body.paperId}:${item.sha256}`;
      item.links = item.links || [];
      if (item.links.some((/** @type {any} */ l) => l.key === key)) return { ok: true, duplicate: true, item: publicItem(item) };
      if (item.projectId && body.projectId !== item.projectId) return { mismatch: true };
      if (item.leaseToken !== body.token || (item.leaseUntil || 0) <= now()) return { conflict: true };
      item.links.push({ key, projectId: body.projectId, paperId: body.paperId, at: new Date(now()).toISOString() });
      item.status = 'done';
      item.paperId = body.paperId;
      item.leaseToken = null;
      await persist();
      return { ok: true, duplicate: false, item: publicItem(item) };
    },
    async exclude(/** @type {string} */ id) {
      const item = state.items.find(it => it.id === id);
      if (!item) return null;
      item.status = 'excluded';
      if (item.sha256 && !state.excluded.includes(item.sha256)) state.excluded.push(item.sha256);
      await persist();
      return publicItem(item);
    },
    inboxDir,
  };
}

/** @param {any} app @param {ReturnType<typeof createPdfInbox>} inbox */
export function mountPdfInbox(app, inbox) {
  const sameOrigin = (/** @type {any} */ req, /** @type {any} */ _res, /** @type {any} */ next) => {
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(req.hostname)) return next(new HttpError(403, 'bad_host', '개인 PC에서만 원문을 요청할 수 있어요.'));
    if (_res.locals.pcBridge) return next();
    const origin = req.get('origin');
    if (origin) { try { if (new URL(origin).host !== req.get('host')) return next(new HttpError(403, 'bad_origin', '같은 출처의 요청만 받아요.')); } catch { return next(new HttpError(403, 'bad_origin', '같은 출처의 요청만 받아요.')); } }
    next();
  };
  app.get('/api/pdf-inbox', sameOrigin, (_req, res) => { res.json(inbox.snapshot()); });
  app.post('/api/pdf-inbox/settings', sameOrigin, async (req, res, next) => {
    try {
      const out = await inbox.setSettings(req.body || {});
      if (out.error) { res.status(409).json({ error: { code: 'corrupt', message: out.error } }); return; }
      res.json(out);
    } catch (e) { next(e); }
  });
  app.post('/api/pdf-inbox/:id/claim', sameOrigin, async (req, res) => {
    if (!/^in[0-9a-f]+$/.test(req.params.id)) { res.status(404).json({ error: { code: 'not_found', message: '없는 항목이에요.' } }); return; }
    const out = await inbox.claim(req.params.id, String(req.body?.token || ''));
    if (!out) { res.status(404).json({ error: { code: 'not_found', message: '없는 항목이에요.' } }); return; }
    if (out.conflict) { res.status(409).json({ error: { code: 'leased', message: '다른 탭에서 처리 중이에요.' } }); return; }
    res.json(out);
  });
  app.get('/api/pdf-inbox/:id/pdf', sameOrigin, async (req, res, next) => {
    try {
      if (!/^in[0-9a-f]+$/.test(req.params.id)) { res.status(404).end(); return; }
      const buf = await inbox.readBytes(req.params.id, String(req.get('x-inbox-token') || ''));
      if (!buf) { res.status(404).end(); return; }
      res.setHeader('content-type', 'application/pdf');
      res.setHeader('x-content-type-options', 'nosniff');
      res.end(buf);
    } catch (e) { next(e); }
  });
  app.post('/api/pdf-inbox/:id/ack', sameOrigin, async (req, res, next) => {
    try {
      const out = await inbox.ack(req.params.id, req.body || {});
      if (!out) { res.status(404).json({ error: { code: 'not_found', message: '없는 항목이에요.' } }); return; }
      if (out.conflict) { res.status(409).json({ error: { code: 'leased', message: '처리 시간이 지났거나 다른 탭의 항목이에요.' } }); return; }
      if (out.mismatch) { res.status(409).json({ error: { code: 'project', message: '처음 지정한 조사가 아니에요.' } }); return; }
      res.json(out);
    } catch (e) { next(e); }
  });
  app.post('/api/pdf-inbox/:id/exclude', sameOrigin, async (req, res, next) => {
    try {
      const out = await inbox.exclude(req.params.id);
      if (!out) { res.status(404).json({ error: { code: 'not_found', message: '없는 항목이에요.' } }); return; }
      res.json(out);
    } catch (e) { next(e); }
  });
}
