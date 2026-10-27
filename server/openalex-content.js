import { Readable } from 'node:stream';
import { HttpError } from './errors.js';

/** @param {{apiKey?: string, fetchImpl?: typeof fetch}} [opts] */
export function createOpenAlexPdfHandler(opts = {}) {
  const key = opts.apiKey || '';
  const fetchImpl = opts.fetchImpl || fetch;
  return async (req, res, next) => {
    const id = typeof req.query.work === 'string' ? req.query.work : '';
    if (!/^W\d{1,20}$/.test(id)) return next(new HttpError(400, 'bad_input', 'OpenAlex 논문 ID를 확인해 주세요.'));
    if (!key) return next(new HttpError(503, 'openalex_key_missing', '서버에 OpenAlex API 키가 설정되지 않았어요.'));
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 30000);
    try {
      const response = await fetchImpl(`https://content.openalex.org/works/${id}.pdf`, { headers: { Authorization: `Bearer ${key}` }, redirect: 'manual', signal: ctl.signal });
      if (!response.ok) {
        clearTimeout(timer);
        const code = response.status === 401 || response.status === 403 ? 'openalex_key_rejected' : response.status === 429 ? 'rate_limited' : response.status === 404 ? 'not_found' : 'provider_error';
        const message = code === 'openalex_key_rejected' ? 'OpenAlex 키가 거절됐어요. 서버의 키 설정을 확인해 주세요.' : code === 'rate_limited' ? 'OpenAlex 사용 한도에 도달했어요.' : code === 'not_found' ? 'OpenAlex에서 이 PDF를 찾지 못했어요.' : 'OpenAlex 원문을 가져오지 못했어요.';
        await response.body?.cancel().catch(() => {});
        return next(new HttpError(response.status === 429 ? 429 : response.status === 404 ? 404 : 502, code, message));
      }
      if (!(response.headers.get('content-type') || '').toLowerCase().includes('application/pdf') || !response.body) {
        clearTimeout(timer);
        await response.body?.cancel().catch(() => {});
        return next(new HttpError(502, 'invalid_pdf', 'OpenAlex가 PDF 파일을 반환하지 않았어요.'));
      }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${id}.pdf"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const stream = Readable.fromWeb(/** @type {any} */ (response.body));
      res.on('close', () => { ctl.abort(); clearTimeout(timer); });
      stream.on('error', () => { clearTimeout(timer); res.destroy(); });
      stream.on('end', () => clearTimeout(timer));
      stream.pipe(res);
    } catch {
      clearTimeout(timer);
      if (!res.headersSent) next(new HttpError(502, 'provider_error', 'OpenAlex 원문에 연결하지 못했어요.'));
    }
  };
}
