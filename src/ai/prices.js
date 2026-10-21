// 2026-10-21 OpenAI 공식 문서의 gpt-5.4-mini 표준 단가. 다른 모델은 확인 전까지 호출하지 않는다.
const OFFICIAL = {
  'gpt-5.4-mini': { input: 0.75, cached: 0.075, output: 4.5, checkedOn: '2026-10-21', source: 'https://developers.openai.com/api/docs/models/gpt-5.4-mini' },
};

/** @param {string} model */
export function priceFor(model) { return OFFICIAL[model] || null; }

export function liveAiEnabled() {
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-5.4-mini';
  return !!process.env.OPENAI_API_KEY?.trim() && !!priceFor(model);
}

/** @param {any} usage @param {string} model */
export function costUsd(usage, model) {
  const price = priceFor(model);
  if (!price) return 0;
  const input = Number(usage.input_tokens || 0);
  const cached = Number(usage.input_tokens_details?.cached_tokens || usage.cached_tokens || 0);
  const output = Number(usage.output_tokens || 0);
  const fresh = Math.max(0, input - cached);
  return (fresh * price.input + cached * price.cached + output * price.output) / 1_000_000;
}
