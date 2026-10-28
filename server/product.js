// 10~13단계 API. 키가 없으면 실호출 대신 거절하거나 주입된 고정 응답만 쓴다.
import { HttpError } from './errors.js';
import { createConsentStore } from '../src/ai/consent.js';
import { createBudget } from '../src/ai/budget.js';
import { validateAnalysisOutput } from '../src/ai/validate.js';
import { createJobStore } from '../src/jobs/store.js';
import { createFileStore } from '../src/pdf/files.js';
import { blockedUrl, LIMITS } from '../src/pdf/policy.js';
import { extractReported } from '../src/compare/euv.js';
import { mergeHits } from '../src/research/brief.js';
import { ruleRank } from '../src/research/rank.js';
import { validateShortlistInput, validateShortlistResult } from './gemini-shortlist.js';
import { queryInput, queryResult } from './gemini-queries.js';

/** @param {any} app @param {any} deps */
export function mountProduct(app, deps) {
  const consent = deps.consent ?? createConsentStore();
  const budget = deps.budget ?? createBudget();
  const jobs = deps.jobs ?? createJobStore();
  const files = deps.files ?? createFileStore();
  const paidOff = (_req, _res, next) => next(new HttpError(403, 'paid_ai_disabled', '이 흐름에서는 유료 AI API를 호출하지 않아요. 개인 AI 결과를 붙여 넣거나 검색 문구를 직접 쓰세요.'));
  app.post('/api/research/interpret', paidOff);
  app.post('/api/research/queries', paidOff);
  app.post('/api/research/gemini-queries', async (req, res, next) => {
    try {
      if (!deps.geminiQueries) throw new HttpError(503, 'gemini_unavailable', 'Gemini API가 연결되지 않았어요. 로컬 서버의 API 키 설정을 확인해 주세요.');
      const host = String(req.get('host') || '');
      if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) throw new HttpError(403, 'local_only', '이 기능은 로컬 서버에서만 사용할 수 있어요.');
      const origin = req.get('origin');
      if (origin && origin !== `http://${host}`) throw new HttpError(403, 'origin_denied', '같은 사이트에서 요청해 주세요.');
      const input = queryInput(req.body);
      res.json({ brief: queryResult(await deps.geminiQueries(input), input) });
    } catch (error) { next(error); }
  });
  app.post('/api/research/gemini-shortlist', async (req, res, next) => {
    try {
      if (!deps.geminiShortlist) throw new HttpError(503, 'gemini_unavailable', 'Gemini API가 연결되지 않았어요. 로컬 서버의 API 키 설정을 확인해 주세요.');
      const host = String(req.get('host') || '');
      if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) throw new HttpError(403, 'local_only', '이 기능은 로컬 서버에서만 사용할 수 있어요.');
      const origin = req.get('origin');
      if (origin && origin !== `http://${host}`) throw new HttpError(403, 'origin_denied', '같은 사이트에서 요청해 주세요.');
      const input = validateShortlistInput(req.body);
      const output = validateShortlistResult(await deps.geminiShortlist(input), input);
      res.json(output);
    } catch (error) { next(error); }
  });
  app.post('/api/research/search', async (req, res, next) => {
    try {
      if (!deps.search) throw new HttpError(503, 'search_not_configured', '실제 검색이 꺼져 있어요.');
      const queries = (Array.isArray(req.body?.queries) ? req.body.queries : []).map((/** @type {any} */ q) => String(q).trim()).filter(Boolean).slice(0, 8);
      if (!queries.length) throw new HttpError(400, 'bad_input', '검색 문구가 필요해요.');
      const batches = [];
      for (let i = 0; i < queries.length; i += 2) {
        const slice = queries.slice(i, i + 2);
        const part = await Promise.all(slice.map(async (query) => {
          try { const found = await deps.search.search({ english: query, page: 0, personal: true, userId: '' }); return { query, ok: true, papers: found.papers, source: found.source, partial: found.partial }; }
          catch (e) { return { query, ok: false, message: /** @type {any} */ (e).message }; }
        }));
        batches.push(...part);
      }
      const merged = mergeHits(batches);
      const allFailed = batches.every(b => !b.ok);
      if (allFailed) throw new HttpError(502, 'search_failed', '모든 검색 문구가 실패했어요. 예시 결과로 바꾸지 않았어요.');
      res.json({ ...merged, mode: 'real', inputRevision: req.body?.inputRevision ?? null, warnings: merged.failed.length ? ['일부 검색 문구만 실패했어요.'] : [] });
    } catch (e) { next(e); }
  });
  app.post('/api/research/rank', (req, res) => {
    const papers = Array.isArray(req.body?.papers) ? req.body.papers : [];
    const ranked = ruleRank(papers, req.body?.criterion?.searchCriteria || req.body?.criteria || {});
    res.json({ ok: true, ...ranked, kind: 'rule' });
  });
  app.post('/api/ai/consent', (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items.map(String) : [];
    if (!req.body?.projectId || !req.body?.purpose || !items.length) throw new HttpError(400, 'bad_input', '동의 범위가 필요해요.');
    res.status(201).json(consent.grant({ projectId: String(req.body.projectId), purpose: String(req.body.purpose), items }));
  });
  app.post('/api/ai/withdraw', (req, res) => {
    res.json(consent.withdraw(String(req.body?.projectId || '')));
  });
  app.post('/api/ai/analyze', async (req, res, next) => {
    try {
      const items = Array.isArray(req.body?.items) ? req.body.items.map(String) : [];
      if (!consent.allows(String(req.body?.projectId || ''), String(req.body?.purpose || ''), items)) {
        throw new HttpError(403, 'consent_required', '이 범위의 외부 전송 동의가 없어요. 검색과 수동 정리는 그대로 쓸 수 있어요.');
      }
      const estimate = Number(req.body?.maxUsd || 0.05);
      await budget.reserve(String(req.body.projectId), estimate);
      try {
        if (!deps.completeAi) throw new HttpError(503, 'paid_ai_disabled', '이 흐름에서는 유료 AI API를 호출하지 않아요. 주입된 고정 응답만 검사에 사용해요.');
        const output = await deps.completeAi(req.body);
        const check = validateAnalysisOutput(output, req.body?.papers ?? [], req.body?.removed ?? []);
        await budget.settle(String(req.body.projectId), estimate, Math.min(estimate, 0.01));
        if (!check.ok) { res.status(422).json({ code: 'rejected', errors: check.errors, accuracyVerified: false }); return; }
        res.json({ output, accuracyVerified: false });
      } catch (e) {
        await budget.settle(String(req.body.projectId), estimate, Math.min(estimate, 0.01));
        throw e;
      }
    } catch (e) {
      if (/** @type {any} */ (e)?.code === 'budget_exceeded') return next(new HttpError(402, 'budget_exceeded', /** @type {any} */ (e).message));
      next(e);
    }
  });
  app.post('/api/jobs', async (req, res, next) => {
    try {
      const row = await jobs.enqueue({ projectId: String(req.body?.projectId || ''), idempotencyKey: String(req.body?.idempotencyKey || ''), inputRevision: Number(req.body?.inputRevision || 0), kind: String(req.body?.kind || 'analyze') });
      res.status(202).json(row);
    } catch (e) { next(e); }
  });
  app.get('/api/jobs/:id', (req, res) => {
    const row = jobs.get(req.params.id);
    if (!row) throw new HttpError(404, 'not_found', '작업이 없어요.');
    res.json(row);
  });
  app.post('/api/jobs/:id/cancel', (req, res) => {
    const row = jobs.cancel(req.params.id);
    if (!row) throw new HttpError(404, 'not_found', '작업이 없어요.');
    res.json(row);
  });
  app.post('/api/jobs/recover', (_req, res) => { res.json({ requeued: jobs.recover() }); });
  async function ownerId(req) {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const verdict = await deps.auth.verify(token);
    if (!verdict.ok) throw new HttpError(401, 'unauthorized', '로그인이 필요해요.');
    return verdict.user.id;
  }
  app.post('/api/files', async (req, res, next) => {
    try {
    const owner = await ownerId(req);
    const bytes = Buffer.from(String(req.body?.dataBase64 || ''), 'base64');
    const saved = files.add({ ownerId: owner, projectId: String(req.body?.projectId || ''), filename: String(req.body?.filename || 'upload.pdf'), bytes });
    if (saved.error) throw new HttpError(400, saved.error, '파일을 저장하지 않았어요.');
    res.status(201).json(saved.file);
    } catch (e) { next(e); }
  });
  app.post('/api/files/:id/extract', async (req, res, next) => {
    try {
    const owner = await ownerId(req);
    const row = files.get(owner, req.params.id);
    if (!row) throw new HttpError(404, 'not_found', '파일이 없어요.');
    const pages = Array.isArray(req.body?.pages) ? req.body.pages : [];
    if (pages.length > LIMITS.pages) throw new HttpError(400, 'too_many_pages', '페이지가 너무 많아요.');
    const text = pages.map((/** @type {any} */ p) => p.text || '').join('');
    const scanOnly = text.trim().length === 0;
    files.saveExtract(row.ownerId, row.id, { extractor: 'injected-or-pdfjs', pages, scanOnly, damaged: !!req.body?.damaged });
    const cells = extractReported(pages);
    res.json({ scanOnly, cells, understood: false });
    } catch (e) { next(e); }
  });
  app.delete('/api/files/:id', async (req, res, next) => {
    try {
    const owner = await ownerId(req);
    const result = files.remove(owner, req.params.id);
    if (result.status === 'not_found') throw new HttpError(404, 'not_found', '파일이 없어요.');
    res.json(result);
    } catch (e) { next(e); }
  });
  app.post('/api/files/fetch', async (req, res, next) => {
    try {
      if (!req.body?.confirmed) throw new HttpError(403, 'confirm_required', '원문 가져오기는 사용자가 실행할 때만 해요.');
      let current = String(req.body?.url || '');
      for (let i = 0; i <= LIMITS.redirects; i++) {
        const why = blockedUrl(current);
        if (why) throw new HttpError(400, why, '이 주소는 가져오지 않아요.');
        if (!deps.fetchImpl) throw new HttpError(503, 'fetch_not_configured', '원문 가져오기가 연결되지 않았어요.');
        const response = await deps.fetchImpl(current, { redirect: 'manual' });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          current = new URL(response.headers.get('location'), current).href;
          continue;
        }
        res.json({ status: response.status, downloaded: false });
        return;
      }
      throw new HttpError(400, 'too_many_redirects', '리다이렉트가 너무 많아요.');
    } catch (e) { next(e); }
  });
  return { jobs, files };
}
