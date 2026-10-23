import { timingSafeEqual } from 'node:crypto';
export function mountInboxBridge(app, token) {
  app.use('/api/pdf-inbox', (req, res, next) => {
    const origin = req.get('origin');
    if (!origin || origin === 'http://' + req.get('host')) return next();
    if (origin !== 'https://www.ondot.my' || !token || !['127.0.0.1','localhost','[::1]'].includes(req.hostname)) return res.status(403).json({error:{message:'허용되지 않은 PC 연결입니다.'}});
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','content-type, x-inbox-token, x-pc-token');
    res.setHeader('Access-Control-Allow-Private-Network','true');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    const given = Buffer.from(req.get('x-pc-token') || '');
    const expected = Buffer.from(token);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return res.status(401).json({error:{message:'PC 연결 코드가 맞지 않습니다.'}});
    res.locals.pcBridge = true;
    next();
  });
}
