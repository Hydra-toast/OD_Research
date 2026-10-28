import { test, expect } from '@playwright/test';

const plan = { schemaVersion: 'consult-v1', professorRequirements: [], userConditions: [], assumptions: [], unknowns: [], topicCandidates: [], selectedTopic: { name: '가상 주제', question: '가상 질문' }, searchCriteria: { core: ['lignin'], preferred: [], excluded: [], synonyms: [] }, queries: ['lignin electrospinning fibers', 'lignin nanofiber polymers', 'lignin spinning conditions', 'lignin polymer blends', 'lignin fiber morphology'].map((text, i) => ({ id: `q${i + 1}`, text, purpose: '가상 탐색' })) };

test('AI 검색어 생성은 선택적이며 확인 뒤 여러 검색어를 실행한다', async ({ page }) => {
  let sent, searches = 0;
  await page.route('**/api/config', r => r.fulfill({ json: { search: true, auth: false } }));
  await page.route('**/api/research/gemini-queries', r => { sent = r.request().postDataJSON(); return r.fulfill({ json: { brief: plan } }); });
  await page.route('**/api/research/search', r => { searches++; expect(r.request().postDataJSON().queries).toEqual(plan.queries.map(q => q.text)); return r.fulfill({ json: { papers: [], collectedBefore: 0, collectedAfter: 0, warnings: [], failed: [] } }); });
  await page.goto('/');
  await page.locator('#brief').fill('리그닌 전기방사');
  await page.getByRole('button', { name: 'AI 검색어 생성' }).click();
  await expect(page.locator('[data-query]')).toHaveCount(5);
  expect(sent.speech).toBe('리그닌 전기방사');
  expect(searches).toBe(0);
  await page.getByRole('button', { name: '선택한 검색 문구 실행' }).click();
  await expect.poll(() => searches).toBe(1);
  expect(await page.evaluate(async () => (await import('/src/state/store.js')).S.input)).toBe('리그닌 전기방사');
});

test('찾기는 Gemini 호출 없이 그대로 검색한다', async ({ page }) => {
  let aiCalls = 0, searches = 0;
  await page.route('**/api/config', r => r.fulfill({ json: { search: true } }));
  await page.route('**/api/research/gemini-queries', r => { aiCalls++; return r.abort(); });
  await page.route('**/api/search', r => { searches++; return r.fulfill({ json: { mode: 'real', papers: [], warnings: [], estimatedTotal: 0 } }); });
  await page.goto('/');
  await page.locator('#brief').fill('EUV photoresist');
  await page.getByRole('button', { name: '찾기', exact: true }).click();
  await expect.poll(() => searches).toBe(1);
  expect(aiCalls).toBe(0);
});

test('AI 생성 후 입력을 바꾸면 이전 검색어를 실행하지 않는다', async ({ page }) => {
  let searches = 0;
  await page.route('**/api/config', r => r.fulfill({ json: { search: true } }));
  await page.route('**/api/research/gemini-queries', r => r.fulfill({ json: { brief: plan } }));
  await page.route('**/api/research/search', r => { searches++; return r.abort(); });
  await page.goto('/');
  await page.locator('#brief').fill('리그닌 전기방사');
  await page.getByRole('button', { name: 'AI 검색어 생성' }).click();
  await expect(page.locator('[data-query]')).toHaveCount(5);
  await page.locator('#brief').fill('다른 연구 주제');
  await page.getByRole('button', { name: '선택한 검색 문구 실행' }).click();
  await expect(page.locator('[data-brief-status]')).toContainText('입력 내용이 바뀌었어요');
  expect(searches).toBe(0);
});

test('AI 검색어로 찾은 논문이 추천 단계에 연결되고 상태가 버튼 옆에 표시된다', async ({ page }) => {
  const papers = Array.from({ length: 3 }, (_, i) => ({ id: `user:example-search-${i}`, title: `가상 예시 · 실제 논문 아님 ${i + 1}`, abstract: `가상 초록 ${i + 1}`, origin: 'user', authors: [], year: 2024, doi: null }));
  await page.route('**/api/config', r => r.fulfill({ json: { search: true } }));
  await page.route('**/api/research/gemini-queries', r => r.fulfill({ json: { brief: plan } }));
  await page.route('**/api/research/search', r => r.fulfill({ json: { papers, collectedBefore: 3, collectedAfter: 3, warnings: [], failed: [] } }));
  await page.route('**/api/research/gemini-shortlist', r => r.fulfill({ json: { overview: '가상 설명', recommendations: [2, 1, 3].map(number => ({ number, reason: '가상 추천 이유' })) } }));
  await page.goto('/');
  await page.locator('#brief').fill('리그닌 전기방사');
  await page.getByRole('button', { name: 'AI 검색어 생성' }).click();
  await page.getByRole('button', { name: '선택한 검색 문구 실행' }).click();
  await expect(page.locator('.pw-paper-row')).toHaveCount(3);
  await expect(page.locator('[data-ract="gemini-shortlist"]')).toBeEnabled();
  await page.locator('[data-ract="gemini-shortlist"]').click();
  await expect(page.locator('.pw-summary-status')).toContainText('추천 논문 3편');
  await expect.poll(() => page.evaluate(async () => (await import('/src/state/store.js')).S.selPapers.length)).toBe(3);
});

test('선택된 논문이 없으면 추천 버튼 옆에 선택 안내를 표시한다', async ({ page }) => {
  await page.route('**/api/config', r => r.fulfill({ json: { search: true } }));
  await page.route('**/api/search', r => r.fulfill({ json: { mode: 'real', papers: [{ id: 'user:example-no-selection', title: '가상 예시 · 실제 논문 아님', abstract: '가상 초록', origin: 'user', authors: [] }], warnings: [], inputRevision: r.request().postDataJSON().inputRevision } }));
  await page.goto('/');
  await page.locator('#brief').fill('lignin fibers');
  await page.getByRole('button', { name: '찾기', exact: true }).click();
  await expect(page.locator('.pw-paper-row')).toHaveCount(1);
  await page.evaluate(async () => { const { S } = await import('/src/state/store.js'); const { render } = await import('/src/controller/render.js'); S.selPapers = []; S.pTask = 'cluster'; render(); });
  await expect(page.locator('[data-ract="gemini-shortlist"]')).toBeDisabled();
  await expect(page.locator('.pw-summary-status')).toContainText('논문 목록에서 추천할 논문을 선택');
});

test('검색 결과가 30편을 넘어도 별도 추천 버튼 없이 선택한 논문에서 추천한다', async ({ page }) => {
  const papers = Array.from({ length: 40 }, (_, i) => ({ id: `user:example-wide-${i}`, title: `가상 예시 · 실제 논문 아님 ${i + 1}`, abstract: `가상 초록 ${i + 1}`, origin: 'user', authors: [], year: 2024, doi: null }));
  let sentCount = 0;
  await page.route('**/api/config', r => r.fulfill({ json: { search: true } }));
  await page.route('**/api/research/gemini-queries', r => r.fulfill({ json: { brief: plan } }));
  await page.route('**/api/research/search', r => r.fulfill({ json: { papers, collectedBefore: 40, collectedAfter: 40, warnings: [], failed: [] } }));
  await page.route('**/api/research/gemini-shortlist', r => { sentCount = r.request().postDataJSON().papers.length; return r.fulfill({ json: { overview: '가상 설명', recommendations: [3, 1, 2].map(number => ({ number, reason: '가상 이유' })) } }); });
  await page.goto('/');
  await page.locator('#brief').fill('리그닌 전기방사');
  await page.getByRole('button', { name: 'AI 검색어 생성' }).click();
  await page.getByRole('button', { name: '선택한 검색 문구 실행' }).click();
  await expect(page.locator('.pw-paper-row')).toHaveCount(30);
  await expect(page.getByRole('button', { name: /검색된 논문.*편에서 추천/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Gemini로 추천 논문 고르기' }).click();
  await expect.poll(() => page.evaluate(async () => (await import('/src/state/store.js')).S.selPapers.length)).toBe(3);
  expect(sentCount).toBe(30);
});
