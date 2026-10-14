/** 응답으로 나갈 오류. 스택·비밀·토큰은 넣지 않는다. */
export class HttpError extends Error {
  /** @param {number} status @param {string} code @param {string} message @param {Record<string, any>} [extra] */
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function requestId(req, res, next) {
  const incoming = req.get('x-request-id');
  req.id = typeof incoming === 'string' && /^[\w.-]{8,80}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
}

/** @param {HttpError|any} err @param {any} req @param {any} res @param {any} next */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const requestId = req.id ?? 'unknown';
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'payload_too_large', message: '요청이 너무 커요.', requestId } });
    return;
  }
  if (err instanceof SyntaxError && /** @type {any} */ (err).status === 400) {
    res.status(400).json({ error: { code: 'bad_json', message: '요청 본문을 읽을 수 없어요.', requestId } });
    return;
  }
  const status = err instanceof HttpError ? err.status : 500;
  const code = err instanceof HttpError ? err.code : 'internal';
  const message = err instanceof HttpError ? err.message : '요청을 처리하지 못했어요.';
  const body = { error: { code, message, requestId, ...(err instanceof HttpError ? err.extra : {}) } };
  res.status(status).json(body);
}
