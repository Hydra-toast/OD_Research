// Express 앱. 정적 UI와 /api를 같은 출처로 제공한다.
import express from 'express';
import { HttpError, errorHandler, requestId } from './errors.js';
import { createStatic } from './static.js';
import { readName, readProjectWrite } from './projects.js';

const AUTH_MSG = {
  unauthorized: '로그인이 필요해요.',
  token_expired: '로그인이 만료됐어요. 다시 로그인해 주세요.',
  auth_not_configured: '계정 연결이 설정되지 않았어요. 예시 모드만 사용할 수 있어요.',
};

/** @param {{ auth: any, projects: any, config: { authEnabled: boolean }, root: string }} deps */
export function createApp(deps) {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/config', (_req, res) => {
    res.json({
      auth: deps.config.authEnabled,
      mode: deps.config.authEnabled ? 'account' : 'example',
      lab: '계정에 가져온 연구실 정보는 프로젝트 기록의 lab 필드에만 저장되며, 로그인한 소유자만 볼 수 있어요. 외부 AI 전송 동의와는 별개예요.',
    });
  });

  app.post('/api/auth/signup', async (req, res, next) => {
    try { res.status(202).json(await deps.auth.signup(req.body ?? {})); } catch (e) { next(e); }
  });
  app.post('/api/auth/login', async (req, res, next) => {
    try { res.json(await deps.auth.login(req.body ?? {})); } catch (e) { next(e); }
  });
  app.post('/api/auth/logout', async (req, res, next) => {
    try { res.json(await deps.auth.logout(bearer(req))); } catch (e) { next(e); }
  });
  app.post('/api/auth/reset', async (req, res, next) => {
    try { res.json(await deps.auth.requestReset(req.body?.email)); } catch (e) { next(e); }
  });

  app.use('/api/projects', async (req, res, next) => {
    try {
      const verdict = await deps.auth.verify(bearer(req));
      if (!verdict.ok) {
        const code = /** @type {keyof typeof AUTH_MSG} */ (verdict.code);
        const status = code === 'auth_not_configured' ? 503 : 401;
        throw new HttpError(status, code, AUTH_MSG[code] ?? AUTH_MSG.unauthorized);
      }
      req.user = verdict.user;
      req.projects = deps.projects.forToken(bearer(req));
      next();
    } catch (e) { next(e); }
  });

  app.get('/api/projects', async (req, res, next) => {
    try { res.json({ projects: await req.projects.list(req.user.id) }); } catch (e) { next(e); }
  });
  app.get('/api/projects/:id', async (req, res, next) => {
    try {
      const row = await req.projects.get(req.user.id, req.params.id);
      if (!row) throw new HttpError(404, 'not_found', '조사를 찾지 못했어요.');
      res.json(row);
    } catch (e) { next(e); }
  });
  app.put('/api/projects/:id', async (req, res, next) => {
    try {
      const input = readProjectWrite(req.body, req.params.id);
      const result = await req.projects.save(req.user.id, input);
      if (result.error === 'not_found') throw new HttpError(404, 'not_found', '조사를 찾지 못했어요.');
      if (result.error === 'deleting') throw new HttpError(409, 'delete_in_progress', '삭제가 진행 중이에요.', { status: 'deleting' });
      if (result.error === 'revision') throw new HttpError(409, 'revision_conflict', '다른 화면에서 먼저 저장했어요. 조용히 덮어쓰지 않았어요.', { serverRevision: result.serverRevision, status: 'conflict' });
      res.json(result.row);
    } catch (e) { next(e); }
  });
  app.patch('/api/projects/:id', async (req, res, next) => {
    try {
      if (!Number.isInteger(req.body?.baseRevision)) throw new HttpError(400, 'bad_input', 'revision이 필요해요.');
      const result = await req.projects.rename(req.user.id, req.params.id, readName(req.body?.name), req.body.baseRevision);
      if (result.error === 'not_found') throw new HttpError(404, 'not_found', '조사를 찾지 못했어요.');
      if (result.error === 'revision') throw new HttpError(409, 'revision_conflict', '다른 화면에서 먼저 저장했어요. 조용히 덮어쓰지 않았어요.', { serverRevision: result.serverRevision, status: 'conflict' });
      res.json(result.row);
    } catch (e) { next(e); }
  });
  app.delete('/api/projects/:id', async (req, res, next) => {
    try {
      const result = await req.projects.remove(req.user.id, req.params.id);
      if (result.status === 'not_found') throw new HttpError(404, 'not_found', '조사를 찾지 못했어요.');
      if (result.status === 'deleting') throw new HttpError(409, 'delete_in_progress', '삭제가 진행 중이에요.', { status: 'deleting' });
      if (result.status === 'failed') throw new HttpError(500, 'delete_failed', '삭제하지 못했어요. 데이터는 그대로 있어요.', { status: 'failed' });
      res.json({ status: 'completed' });
    } catch (e) { next(e); }
  });

  app.use(createStatic(deps.root));
  app.use(errorHandler);
  return app;
}

function bearer(/** @type {any} */ req) {
  const header = req.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}
