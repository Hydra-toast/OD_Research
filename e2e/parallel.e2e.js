import { test, expect } from '@playwright/test';

test('패러렐 화면: 양쪽 동기화, 탭 전환, 저장본 공유, 좁은 화면', async ({ page }) => {
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/parallel.html');
  await page.getByRole('button',{name:'예시로 살펴보기'}).click();
  await expect(page.locator('#ws-panels')).toHaveClass(/is-parallel/);
  await expect(page.locator('#panel-explore')).toBeVisible();
  await expect(page.locator('#panel-prepare')).toBeVisible();
  await page.locator('#panel-explore [data-act=toggle-paper]').first().click();
  await expect(page.locator('#panel-prepare')).toContainText('논문 비교 (1편)');
  const note=page.locator('#panel-prepare textarea[data-act=note]').first();
  await note.fill('패러렐 메모 보존 확인'); await note.blur();
  await expect(page.locator('#save-state')).toContainText('저장됨');
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'docs/captures/parallel-1440.png',fullPage:true});
  const bounds=await page.locator('#ws-panels').evaluate(el=>Array.from(el.children).map(p=>p.getBoundingClientRect().x));
  expect(bounds[1]).toBeGreaterThan(bounds[0]);
  await page.locator('#parallel-toggle').click();
  await expect(page.locator('#panel-prepare')).toBeHidden();
  await page.locator('#tab-prepare').click();
  await expect(page.locator('#panel-prepare textarea[data-act=note]').first()).toHaveValue('패러렐 메모 보존 확인');
  await page.locator('#parallel-toggle').click();
  await page.setViewportSize({width:375,height:812});
  await expect(page.locator('#panel-explore')).toBeVisible();
  const small=await page.locator('body').evaluate(el=>({width:document.documentElement.scrollWidth,viewport:innerWidth}));
  expect(small.width).toBeLessThanOrEqual(small.viewport);
  await page.screenshot({path:'docs/captures/parallel-375.png',fullPage:true});
  await page.goto('/');
  await expect(page.locator('#saved-list')).toContainText('열기');
  await page.locator('#saved-list [data-act=open-saved]').first().click();
  await page.locator('#tab-prepare').click();
  await expect(page.locator('#panel-prepare textarea[data-act=note]').first()).toHaveValue('패러렐 메모 보존 확인');
  expect(errors).toEqual([]);
});

