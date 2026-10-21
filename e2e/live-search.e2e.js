import { test, expect } from '@playwright/test';

// 실제 외부 호출이 아닌 API 고정 응답으로 화면 계약과 모드 경계를 검증한다.
const paper = {
  id: 'oa:W123456789', providerId: 'W123456789', doi: null, title: 'OpenAlex UI fixture paper',
  authors: ['Fixture Author'], year: 2024, venue: 'Fixture Journal', citationCount: null,
  abstract: 'Fixture abstract for EUV materials.', access: 'abstract', origin: 'provider',
  collectedAt: '2026-10-21T00:00:00.000Z', source: 'OpenAlex', link: 'https://example.test/paper',
};
async function enable(page) {
  await page.route('**/api/config', r => r.fulfill({ json: { auth: false, search: true, searchProvider: 'OpenAlex' } }));
  await page.goto('/');
  await expect.poll(() => page.evaluate(async () => (await import('/src/controller/runtime.js')).runtime.search)).toBe(true);
}
async function submit(page) {
  await page.locator('#brief').fill('EUV photoresist');
  await page.getByRole('button', { name: '조사 방향 정리하기', exact: true }).click();
  await page.getByRole('button', { name: '현재 내용으로 넓게 탐색하기', exact: true }).click();
}
test('키 없는 실제 모드 응답은 출처·초록·선택·복원을 보존하고 예시로 표시하지 않는다', async ({ page }) => {
  await page.route('**/api/search', async r => {
    const input = r.request().postDataJSON();
    await r.fulfill({ json: { mode: 'real', papers: [paper], estimatedTotal: 1, collectedAt: paper.collectedAt, warnings: ['OpenAlex 공개 검색 중이에요.'], inputRevision: input.inputRevision } });
  });
  await enable(page); await submit(page);
  const panel = page.locator('#panel-explore');
  await expect(panel.locator('article.paper')).toHaveCount(1);
  await expect(panel).toContainText('출처: OpenAlex');
  await expect(panel).toContainText('OpenAlex 공개 검색');
  await expect(panel).not.toContainText('가상 예시 · 실제 논문 아님');
  await panel.getByRole('button', { name: '초록 보기', exact: true }).click();
  await expect(page.locator('#ev-body')).toContainText(paper.abstract);
  await expect(page.locator('#ev-body')).not.toContainText('가상 예시 문서');
  await page.keyboard.press('Escape');
  await panel.getByRole('button', { name: '준비 자료에 추가', exact: true }).click();
  await expect(page.locator('#save-state')).toContainText('저장됨');
  await page.reload();
  await expect(panel.locator('article.paper')).toHaveCount(1);
  await expect(panel).not.toContainText('가상 예시 · 실제 논문 아님');
  await expect(panel.locator('.sel-bar')).toContainText('선택 1편');
});
test('실검색 0건과 실패는 예시 미연결 안내나 성공으로 바뀌지 않는다', async ({ page }) => {
  let fail = false;
  await page.route('**/api/search', r => r.fulfill(fail ? { status: 429, json: { error: { code: 'rate_limited', message: '공급자 호출 제한이에요.' } } } : { json: { mode: 'real', papers: [], estimatedTotal: 0, warnings: [] } }));
  await enable(page); await submit(page);
  await expect(page.getByRole('heading', { name: '검색 결과가 없어요', exact: true })).toBeVisible();
  fail = true;
  await page.getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect(page.locator('#panel-explore')).toContainText('공급자 호출 제한이에요.');
  await expect(page.locator('#panel-explore article.paper')).toHaveCount(0);
});
test('실검색이 켜져 있어도 명시적인 예시 버튼은 외부 요청 없이 예시만 연다', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/search', r => { calls++; return r.fulfill({ status: 500, json: {} }); });
  await enable(page);
  await page.getByRole('button', { name: '예시로 살펴보기', exact: true }).click();
  await expect(page.locator('#panel-explore article.paper')).toHaveCount(5);
  await expect(page.locator('#panel-explore')).toContainText('가상 예시 · 실제 논문 아님');
  expect(calls).toBe(0);
});
