import { randomBytes } from 'node:crypto';
process.env.INBOX_BRIDGE_TOKEN = randomBytes(24).toString('hex');
console.log('PC 연결 코드 (ondot.my의 PC 연결 입력란에 입력): ' + process.env.INBOX_BRIDGE_TOKEN);
const { start } = await import('../server/index.js');
await start(5173);
