// gpt-5.4-mini만 호출한다. 사용량은 공식 단가로 정산한다.
import { priceFor, costUsd } from './prices.js';
import { DATA_NOT_INSTRUCTIONS } from './validate.js';

/** @param {{ apiKey: string, model: string, fetchImpl?: any }} opt */
export function createOpenAI(opt) {
  const fetchImpl = opt.fetchImpl ?? fetch;
  return {
    /** @param {string} instruction @param {any} data @param {number} maxOutput */
    async json(instruction, data, maxOutput = 900) {
      const price = priceFor(opt.model);
      if (!price) throw Object.assign(new Error('확인된 단가가 없는 모델이라 호출하지 않았어요.'), { code: 'ai_not_configured' });
      const res = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { authorization: `Bearer ${opt.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: opt.model,
          max_output_tokens: maxOutput,
          input: [
            { role: 'system', content: `${DATA_NOT_INSTRUCTIONS}\n${instruction}\nJSON만 반환하세요.` },
            { role: 'user', content: JSON.stringify(data) },
          ],
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(body?.error?.message || 'AI 호출에 실패했어요.'), { code: 'ai_failed' });
      if (body.model && !String(body.model).startsWith(opt.model)) throw Object.assign(new Error('요청한 모델과 다른 응답이라 사용하지 않았어요.'), { code: 'ai_failed' });
      const text = body.output_text || (body.output || []).flatMap((/** @type {any} */ o) => o.content || []).map((/** @type {any} */ c) => c.text || '').join('');
      let parsed;
      try { parsed = JSON.parse(text); } catch { throw Object.assign(new Error('AI 응답 형식이 올바르지 않아요.'), { code: 'ai_failed' }); }
      return { parsed, usd: costUsd(body.usage || {}, opt.model), usage: body.usage || {} };
    },
  };
}
