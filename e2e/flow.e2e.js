import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const shot = (page, name) => page.screenshot({ path: `docs/captures/${name}.png`, fullPage: true });

const addPaper = page => page.locator('article.paper button[aria-pressed=false]').first().click();

async function startEuv(page) {
  await page.goto('/');
  await page.getByRole('button', { name: '예시로 살펴보기' }).click();
  await expect(page.getByRole('heading', { name: '이런 내용을 중심으로 찾아봤어요' })).toBeVisible();
}

test('랜딩: 문구·예시 채우기·기능 예시 전환', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('교수님이 주신 주제, 어떤 논문부터 읽어야 할까요?');
  await expect(page).toHaveTitle(/Research Landscape/);
  await expect(page.getByText('가상 예시 · 실제 논문 아님').first()).toBeVisible();
  await page.getByRole('button', { name: 'ALD / High-k' }).click();
  await expect(page.locator('#brief')).toHaveValue(/ALD/);
  await page.locator('#brief').fill('ALD 수정한 문장');
  await expect(page.locator('#brief')).toHaveValue('ALD 수정한 문장');
  const before = await page.locator('#demo-excerpt').innerText();
  await page.getByRole('button', { name: '한계', exact: true }).click();
  expect(await page.locator('#demo-excerpt').innerText()).not.toBe(before);
  await expect(page.getByRole('button', { name: '한계', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await shot(page, 'landing-1280');
});

test('빈 입력은 안내, 범위 밖 입력은 실검색 미연결 안내', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '읽을 논문 찾기' }).click();
  await expect(page.locator('#brief-error')).toBeVisible();
  await page.locator('#brief').fill('양자 컴퓨터 큐비트');
  await page.getByRole('button', { name: '읽을 논문 찾기' }).click();
  await expect(page.getByRole('heading', { name: '이 주제의 실검색은 아직 연결되지 않았어요' })).toBeVisible();
  await expect(page.getByRole('button', { name: /EUV 포토레지스트 예시로 보기/ })).toBeVisible();
});

test('범위 수정·갈래 필터·정렬·선택 보존', async ({ page }) => {
  await startEuv(page);
  const cards = page.locator('#panel-explore article.paper');
  await expect(cards).toHaveCount(5);
  await page.getByRole('button', { name: /추가 결과 펼치기/ }).click();
  await expect(cards).toHaveCount(8);

  await addPaper(page);
  const picked = await page.locator('#panel-explore article.paper h3').first().innerText();

  await page.getByRole('button', { name: '조정하기' }).click();
  await page.locator('input[name=exclude]').fill('확률적 결함');
  await page.getByRole('button', { name: '조정 내용 반영' }).click();
  await expect(cards.count()).resolves.toBeLessThan(8);
  await expect(page.getByText(/범위 조정으로 \d+편을 제외했어요/)).toBeVisible();
  await expect(page.locator('.sel-bar')).toContainText('선택 1편');

  await page.getByRole('button', { name: /^금속산화물 레지스트/ }).click();
  const n = await cards.count();
  expect(n).toBeGreaterThan(0);
  await page.getByRole('button', { name: /^전체/ }).click();

  await page.getByLabel('정렬').selectOption('citations');
  await expect(page.getByText(/인용수가 미확인인 항목은 0이 아니라 뒤로/)).toBeVisible();
  await page.getByLabel('정렬').selectOption('recent');

  await page.getByRole('button', { name: '잘 모르겠어요. 우선 추천대로 볼게요' }).click();
  await expect(page.locator('.scope-list')).not.toContainText('제외');
  await expect(page.locator('.sel-bar')).toContainText('선택 1편');
  expect(picked).toContain('예시 논문');
});

test('방향 카드: 연구실 미입력/입력, 장비 확인 필요, 비교', async ({ page }) => {
  await startEuv(page);
  await expect(page.getByText('연구실 정보 미입력').first()).toBeVisible();
  await page.getByRole('button', { name: '연구실 정보 입력' }).click();
  await page.getByRole('button', { name: '예시 연구실 불러오기' }).click();
  await expect(page.getByText(/재료 유사성:/).first()).toBeVisible();
  await expect(page.getByText('확인 필요').first()).toBeVisible();
  await page.getByRole('button', { name: '비교에 담기' }).nth(0).click();
  await page.getByRole('button', { name: '비교에 담기' }).nth(0).click();
  await expect(page.getByRole('region', { name: '방향 비교 표' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/적합도|유망|%/);
});

test('HBM은 자료 부족으로 방향 후보 없음', async ({ page }) => {
  await page.goto('/');
  await page.locator('#brief').fill('HBM 패키징');
  await page.getByRole('button', { name: '읽을 논문 찾기' }).click();
  await expect(page.getByText(/방향 후보를 만들지 않았어요/)).toBeVisible();
  await expect(page.locator('#panel-explore article.paper')).toHaveCount(3);
});

test('P0 대표 흐름: 선택→준비→Claim 수정→근거→저장→새로고침 복원→내보내기→삭제', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await startEuv(page);
  await addPaper(page);
  await page.locator('article.dir').first().getByRole('button', { name: '준비 자료에 추가' }).click();
  await shot(page, 'explore-1280');
  await page.getByRole('button', { name: '선택한 자료로 랩미팅 준비' }).click();
  await expect(page.getByRole('heading', { name: '조사 질문과 범위' })).toBeVisible();
  await expect(page.locator('#panel-prepare table').first()).toBeVisible();
  await expect(page.getByText('원문 미확보').first()).toBeVisible();

  // 비교 셀 수정 이력
  await page.getByRole('button', { name: '주요 결과 수정' }).first().click();
  await page.locator('[data-fk=cell-input]').fill('직접 확인한 값');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByText(/사용자 수정 1건 · 원래 값: 원문 미확보/)).toBeVisible();

  // Claim: 확인 → 문장 수정 시 해제
  await page.getByRole('button', { name: '내가 확인했어요' }).click();
  await expect(page.locator('article.claim .labels')).toContainText('사용자 확인');
  const ta = page.locator('article.claim textarea').first();
  await ta.fill('수정한 발표 문장');
  await ta.blur();
  await expect(page.locator('article.claim .labels')).not.toContainText('사용자 확인');
  await expect(page.locator('article.claim .labels')).toContainText('추가 확인 필요');

  // 근거 패널과 포커스 복귀
  const evBtn = page.getByRole('button', { name: '근거 보기' }).first();
  await evBtn.click();
  await expect(page.locator('#evidence-panel')).toBeVisible();
  await expect(page.locator('#evidence-panel')).toContainText('위치 정보 없음');
  await expect(page.locator('#evidence-panel')).not.toContainText(/Figure|Fig\./);
  await page.keyboard.press('Escape');
  await expect(page.locator('#evidence-panel')).toBeHidden();
  await expect(page.getByRole('button', { name: '근거 보기' }).first()).toBeFocused();

  // 질문 한 번에 하나
  await page.getByRole('button', { name: '근거 함께 살펴보기' }).click();
  await expect(page.locator('.q-box strong')).toHaveCount(1);
  await page.getByRole('button', { name: '교수님께 확인할 질문으로 남기기' }).click();
  await expect(page.getByText(/교수님께 확인:/)).toBeVisible();
  await shot(page, 'prepare-1280');

  // 저장 → 새로고침 후 열기
  await expect(page.locator('#save-state')).toContainText('이 브라우저에 저장됨');
  await page.reload();
  // 새로고침해도 같은 조사·같은 탭(랩미팅 준비)으로 복원된다.
  await expect(page.getByRole('tab', { name: /랩미팅 준비/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#sel-count')).toHaveText('2');
  await expect(page.locator('article.claim textarea').first()).toHaveValue('수정한 발표 문장');
  await expect(page.getByText(/교수님께 확인:/)).toBeVisible();

  // 내보내기
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '요약 Markdown 받기' }).click()]);
  const md = fs.readFileSync(await dl.path(), 'utf8');
  expect(md).toContain('가상 예시 · 실제 논문 아님');
  expect(md).toContain('미확인');
  expect(md).toContain('초록 확보');
  await page.getByRole('button', { name: '발표 가이드 복사' }).click();
  await expect(page.locator('#export-status')).toContainText('복사했어요');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain('발표 가이드');

  // 삭제
  page.once('dialog', d => { expect(d.message()).toContain('삭제'); d.accept(); });
  await page.locator('#saved-list').getByRole('button', { name: '삭제' }).click();
  await expect(page.getByText('아직 저장한 조사가 없어요')).toBeVisible();
});

test('클립보드 실패 시 선택 가능한 텍스트 제공', async ({ page }) => {
  await startEuv(page);
  await addPaper(page);
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('x')) } }); });
  await page.getByRole('button', { name: '선택한 자료로 랩미팅 준비' }).click();
  await page.getByRole('button', { name: '한 페이지 요약 복사' }).click();
  await expect(page.locator('#export-fallback')).toBeVisible();
  await expect(page.locator('#export-fallback')).toContainText('가상 예시 · 실제 논문 아님');
});

test('저장 실패 표시와 재시도', async ({ page }) => {
  await startEuv(page);
  await expect(page.locator('#save-state')).toContainText('이 브라우저에 저장됨');
  await page.evaluate(() => { window.__rl.failNextSave = true; });
  await addPaper(page);
  await expect(page.locator('#save-state')).toContainText('저장 실패');
  await page.getByRole('button', { name: '다시 저장' }).click();
  await expect(page.locator('#save-state')).toContainText('이 브라우저에 저장됨');
});

test('선택 없이 준비 화면 이동 시 안내, URL에 입력 원문 없음', async ({ page }) => {
  await startEuv(page);
  await page.getByRole('button', { name: '선택한 자료로 랩미팅 준비' }).click();
  await expect(page.getByRole('heading', { name: '선택한 자료가 없어요' })).toBeVisible();
  expect(page.url()).toMatch(/[?&]project=p-/);
  expect(page.url()).not.toContain('topic=');
  expect(decodeURIComponent(page.url())).not.toContain('포토레지스트에서');
  await page.goBack();
  await expect(page.getByRole('heading', { name: '이런 내용을 중심으로 찾아봤어요' })).toBeVisible();
});

test('키보드: 탭 방향키, 가로 넘침 없음(1280)', async ({ page }) => {
  await startEuv(page);
  await page.getByRole('tab', { name: '탐색' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /랩미팅 준비/ })).toHaveAttribute('aria-selected', 'true');
  const over = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(over).toBe(false);
});

test.describe('모바일 375px', () => {
  test.use({ viewport: { width: 375, height: 800 } });
  test('가로 넘침 없음, 범위→갈래→논문 순서, 표는 영역 안 스크롤', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await shot(page, 'landing-375');
    await page.getByRole('button', { name: '예시로 살펴보기' }).click();
    await expect(page.getByRole('heading', { name: '이런 내용을 중심으로 찾아봤어요' })).toBeVisible();
    const ys = await page.evaluate(() => ['#scope-h', '#br-h', '#pp-h'].map(s => document.querySelector(s).getBoundingClientRect().top));
    expect(ys[0]).toBeLessThan(ys[1]); expect(ys[1]).toBeLessThan(ys[2]);
    await addPaper(page);
    await shot(page, 'explore-375');
    await page.getByRole('button', { name: '선택한 자료로 랩미팅 준비' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await shot(page, 'prepare-375');
  });
});

test('reduced-motion에서도 동작', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/');
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
  await ctx.close();
});

