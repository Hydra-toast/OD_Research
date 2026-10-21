import { test, expect } from '@playwright/test';

// 외부 호출 없이 고정 응답으로 세부 검색 → 선택 → 원문 → 총정리 흐름을 확인한다. 가상 데이터이며 실제 논문이 아니다.
const mk = (n, title, abstract) => ({ id: `oa:W${n}`, providerId: `W${n}`, doi: `10.9999/fixture.${n}`, title, authors: ['Fixture Author'], year: 2024, venue: 'Fixture Journal', citationCount: null, abstract, access: 'abstract', origin: 'provider', collectedAt: '2026-10-21T00:00:00.000Z', source: 'OpenAlex', link: null, fulltext: { pdfUrl: 'https://example.test/a.pdf', status: 'not_fetched' } });
const base = [
  mk(1, 'Fixture perovskite solar stability', 'perovskite solar cell stability fixture text'),
  mk(2, 'Fixture perovskite encapsulation', 'perovskite encapsulation fixture text'),
  mk(3, 'Fixture organic transistor', 'organic transistor fixture text'),
];

test('세부 검색, 전체 선택, 원문, 총정리 프롬프트, md 가져오기와 새로고침 복원', async ({ page }) => {
  await page.route('**/api/config', r => r.fulfill({ json: { auth: false, search: true, searchProvider: 'OpenAlex' } }));
  await page.route('**/api/search', async r => r.fulfill({ json: { mode: 'real', papers: base, estimatedTotal: 3, collectedAt: '2026-10-21T00:00:00.000Z', warnings: [], inputRevision: r.request().postDataJSON().inputRevision } }));
  await page.route('**/api/research/search', r => r.fulfill({ json: { mode: 'real', papers: [mk(4, 'Fixture perovskite tandem', 'perovskite tandem fixture')], failed: [], collectedBefore: 1, collectedAfter: 1, warnings: [], inputRevision: r.request().postDataJSON().inputRevision } }));
  await page.route('**/api/fulltext/fetch', r => r.fulfill({ json: { status: 'extracted', pages: [{ page: 1, text: 'Fixture full text page one.' }], pageCount: 1, sha256: 'a'.repeat(64), extractor: 'pdfjs-dist', source: 'example.test' } }));
  await page.goto('/');
  await expect.poll(() => page.evaluate(async () => (await import('/src/controller/runtime.js')).runtime.search)).toBe(true);
  await page.locator('#brief').fill('perovskite solar');
  await page.getByRole('button', { name: '조사 방향 정리하기', exact: true }).click();
  await page.getByRole('button', { name: '현재 내용으로 넓게 탐색하기', exact: true }).click();
  const panel = page.locator('#panel-explore');
  await expect(panel.locator('article.paper')).toHaveCount(3);

  await panel.locator('[name=include]').fill('perovskite');
  await panel.getByRole('button', { name: '지금 결과에서 거르기' }).click();
  await expect(panel.locator('article.paper')).toHaveCount(2);
  await panel.locator('[name=exclude]').fill('encapsulation');
  await panel.getByRole('button', { name: '지금 결과에서 거르기' }).click();
  await expect(panel.locator('article.paper')).toHaveCount(1);
  await panel.getByRole('button', { name: '조건 지우기' }).click();
  await panel.locator('[name=include]').fill('perovskite');
  await panel.getByRole('button', { name: '이 단어로 더 찾기 (OpenAlex)' }).click();
  await expect(panel).toContainText('새 논문 1편');
  await panel.getByRole('button', { name: '지금 결과에서 거르기' }).click();
  await expect(panel.locator('article.paper')).toHaveCount(3);

  await panel.getByRole('button', { name: /^보이는 3편 모두 선택/ }).click();
  await expect(panel.locator('.sel-bar')).toContainText('선택 3편');
  await panel.getByRole('button', { name: /공개 원문 받기$/ }).last().click();
  await expect(panel).toContainText('확보 3');
  await panel.getByRole('button', { name: /총정리 프롬프트 만들고 복사/ }).click();
  const prompt = panel.locator('[data-ract=summary-prompt-edit]');
  await expect(prompt).toHaveValue(/\[P1\]/);
  await expect(prompt).toHaveValue(/원문 텍스트 포함 3편/);

  await panel.locator('[data-rform=summary-import] textarea[name=md]').fill('# 정리\n\n문장 하나가 여기에 정말 있습니다 [P1 p.1].\n\n| a | b |\n|---|---|\n| 1 | 2 |');
  await panel.getByRole('button', { name: '가져오고 형식 검사' }).click();
  await expect(panel).toContainText('외부 AI 초안 · 정확성 미검증');
  await expect(page.locator('#save-state')).toContainText('저장됨');
  await page.reload();
  await expect(panel).toContainText('외부 AI 초안 · 정확성 미검증');
  await expect(panel).toContainText('원문 텍스트 1쪽 확보');
});
