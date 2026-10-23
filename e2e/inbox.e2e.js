import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { buildSimplePdf } from '../tests/pdf-fixture.js';

const dir = process.env.INBOX_DIR;
const paper = {
  id: 'oa:inbox1', providerId: 'inbox1', doi: '10.9999/fixture', title: 'Fixture inbox paper',
  authors: ['Fixture Author'], year: 2024, venue: 'Fixture Journal', citationCount: null,
  abstract: 'Fixture abstract. 가상 예시 · 실제 논문 아님', access: 'abstract', origin: 'provider',
  source: 'OpenAlex', link: null, fulltext: { status: 'not_fetched' },
};

test('수신 폴더 PDF가 대상 조사에 연결되고 프롬프트에 들어간다', async ({ page }) => {
  test.skip(!dir, 'INBOX_DIR이 없으면 수신 폴더 검사를 건너뜁니다.');
  await mkdir(dir, { recursive: true });
  await page.route('**/api/config', r => r.fulfill({ json: { auth: false, search: true, searchProvider: 'OpenAlex' } }));
  await page.route('**/api/search', r => r.fulfill({ json: { mode: 'real', papers: [paper], estimatedTotal: 1, collectedAt: '2026-10-23T00:00:00.000Z', warnings: [], inputRevision: r.request().postDataJSON().inputRevision } }));
  await page.goto('/');
  await expect.poll(() => page.evaluate(async () => (await import('/src/controller/runtime.js')).runtime.search)).toBe(true);
  await page.locator('#brief').fill('fixture inbox');
  await page.getByRole('button', { name: '찾기', exact: true }).click();
  await page.getByRole('button', { name: '바로 찾기', exact: true }).click();
  const panel = page.locator('#panel-explore');
  await expect(panel.locator('article.paper')).toHaveCount(1);
  await panel.getByRole('button', { name: '자동 가져오기 켜기' }).click();
  await panel.getByRole('button', { name: '현재 조사에 연결' }).click();
  await expect(panel).toContainText('이 조사가 대상입니다');
  await writeFile(`${dir}/fixture-inbox.pdf`, buildSimplePdf('doi: 10.9999/fixture virtual example'));
  await expect(panel).toContainText('저장 완료', { timeout: 20000 });
  await expect(panel).toContainText('로컬 폴더에서 가져온 PDF');
  await panel.getByRole('button', { name: '1편으로 정리 프롬프트 복사' }).click();
  await expect(panel.locator('[data-ract=summary-prompt-edit]')).toHaveValue(/10\.9999\/fixture/);
});
