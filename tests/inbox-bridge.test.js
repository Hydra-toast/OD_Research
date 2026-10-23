import { it, expect } from 'vitest';
import { mountInboxBridge } from '../server/inbox-bridge.js';
it('허용 출처와 연결 코드가 모두 맞아야 수신 API에 접근한다', () => {
 let handler; mountInboxBridge({use: (_path, fn) => {handler=fn;}}, 'secret');
 const call=(origin,token,method='GET')=>{
  const req={hostname:'127.0.0.1',method,get:k=>({'origin':origin,'host':'127.0.0.1:5173','x-pc-token':token}[k])};
  const res={locals:{},code:200,setHeader(){},status(n){this.code=n;return this;},json(){},sendStatus(n){this.code=n;}};
  let next=false;handler(req,res,()=>{next=true;});return {res,next};
 };
 expect(call('https://evil.test','secret').res.code).toBe(403);
 expect(call('https://www.ondot.my','wrong').res.code).toBe(401);
 expect(call('https://www.ondot.my','secret').res.locals.pcBridge).toBe(true);
 expect(call('https://www.ondot.my','','OPTIONS').res.code).toBe(204);
 expect(call('http://127.0.0.1:5173','').next).toBe(true);
});
