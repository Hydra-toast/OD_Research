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
  await page.route('**/api/fulltext/fetch', async r => {
    await new Promise(done => setTimeout(done, 300));
    await r.fulfill({ json: { status: 'extracted', pages: [{ page: 1, text: 'Fixture full text page one.' }], pageCount: 1, sha256: 'a'.repeat(64), extractor: 'pdfjs-dist', source: 'example.test' } });
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(async () => (await import('/src/controller/runtime.js')).runtime.search)).toBe(true);
  await page.locator('#brief').fill('perovskite solar');
  await page.getByRole('button', { name: '찾기', exact: true }).click();
  await page.getByRole('button', { name: '바로 찾기', exact: true }).click();
  const panel = page.locator('#panel-explore');
  await expect(panel.locator('article.paper')).toHaveCount(3);

  await panel.locator('[name=include]').fill('perovskite');
  await panel.getByRole('button', { name: '적용', exact: true }).click();
  await expect(panel.locator('article.paper')).toHaveCount(2);
  await panel.locator('[name=exclude]').fill('encapsulation');
  await panel.getByRole('button', { name: '적용', exact: true }).click();
  await expect(panel.locator('article.paper')).toHaveCount(1);
  await panel.getByText('더 찾기·기록').click();
  await panel.getByRole('button', { name: '조건 지우기' }).click();
  await panel.locator('[name=include]').fill('perovskite');
  await panel.getByText('더 찾기·기록').click();
  await panel.getByRole('button', { name: '이 단어로 더 찾기' }).click();
  await expect(panel).toContainText('새 논문 1편');
  await panel.getByRole('button', { name: '적용', exact: true }).click();
  await expect(panel.locator('article.paper')).toHaveCount(3);
  await expect(panel.locator('.sel-bar')).toContainText('선택 3편');
  await panel.getByRole('button', { name: '3편 원문 모두 받기' }).click();
  await expect(panel).toContainText('받는 중');
  await expect(panel).toContainText('확보 3');
  await panel.getByRole('button', { name: '3편으로 정리 프롬프트 복사' }).click();
  const prompt = panel.locator('[data-ract=summary-prompt-edit]');
  await expect(prompt).toHaveValue(/\[P1\]/);
  await expect(prompt).toHaveValue(/Gemini/);
  await expect(prompt).toHaveValue(/첨부 여부는 Gemini에서 확인/);
  await expect(prompt).not.toHaveValue(/Fixture full text page one/);
  await panel.getByLabel('이번 정리에서 무엇을 알고 싶나요?').fill('결함 원인 위주로');
  await panel.getByText('전달 방식과 미리보기', { exact: true }).click();
  await panel.locator('[data-ract=summary-mode]').selectOption('text');
  await panel.getByRole('button', { name: '3편으로 정리 프롬프트 복사' }).click();
  await expect(prompt).toHaveValue(/원문 텍스트 포함 3편/);
  await expect(prompt).toHaveValue(/summary-v3-gemini/);
  await expect(prompt).toHaveValue(/## 이번 정리의 초점 \(가장 우선\)\n결함 원인 위주로/);
  await expect(prompt).toHaveValue(/### 2\. 연구군 지도/);
  await expect(prompt).toHaveValue(/### 3\. 공통 입문 읽기 순서/);
  await expect(prompt).toHaveValue(/### 4\. 관심사별 읽기 경로/);
  await expect(prompt).toHaveValue(/\[p\.1\] Fixture full text page one\./);

  await panel.locator('[data-rform=summary-import] textarea[name=md]').fill('# 정리\n\n문장 하나가 여기에 정말 있습니다 [P1 p.1].\n\n| a | b |\n|---|---|\n| 1 | 2 |');
  await panel.getByRole('button', { name: '가져오고 형식 검사' }).click();
  await expect(panel).toContainText('외부 AI 초안 · 정확성 미검증');
  await expect(page.locator('#save-state')).toContainText('저장됨');
  await page.reload();
  await expect(page.locator('#workspace')).toBeHidden();
  await page.locator('#saved-list').getByRole('button', { name: '열기' }).click();
  await expect(panel).toContainText('외부 AI 초안 · 정확성 미검증');
  await expect(panel).toContainText('원문 텍스트 1쪽 확보');
});

test('일괄 받기는 같은 버튼으로 취소한 뒤 다시 받을 수 있다', async ({ page }) => {
  const one = [mk(1, 'Fixture perovskite solar stability', 'perovskite solar cell stability fixture text')];
  await page.route('**/api/config', r => r.fulfill({ json: { auth: false, search: true, searchProvider: 'OpenAlex' } }));
  await page.route('**/api/search', async r => r.fulfill({ json: { mode: 'real', papers: one, estimatedTotal: 1, collectedAt: '2026-10-21T00:00:00.000Z', warnings: [], inputRevision: r.request().postDataJSON().inputRevision } }));
  let gate = true;
  await page.route('**/api/fulltext/fetch', async r => {
    if (gate) await new Promise(done => setTimeout(done, 4000));
    await r.fulfill({ json: { status: 'extracted', pages: [{ page: 1, text: 'Fixture full text page one.' }], pageCount: 1, sha256: 'b'.repeat(64), extractor: 'pdfjs-dist', source: 'example.test' } });
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(async () => (await import('/src/controller/runtime.js')).runtime.search)).toBe(true);
  await page.locator('#brief').fill('perovskite solar');
  await page.getByRole('button', { name: '찾기', exact: true }).click();
  await page.getByRole('button', { name: '바로 찾기', exact: true }).click();
  const panel = page.locator('#panel-explore');
  await panel.getByRole('button', { name: '1편 원문 모두 받기' }).click();
  await expect(panel.getByRole('button', { name: '받기 취소' })).toBeVisible();
  await panel.getByRole('button', { name: '받기 취소' }).click();
  await expect(panel).toContainText('받기를 취소했어요');
  gate = false;
  await panel.getByRole('button', { name: '1편 원문 모두 받기' }).click();
  await expect(panel).toContainText('확보 1');
});
