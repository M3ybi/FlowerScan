import assert from 'node:assert/strict';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, webkit } from 'playwright';
const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';

const artifacts = path.resolve(`.tmp-tests/mobile-navigation-${engine}`);
await mkdir(artifacts, { recursive: true });
await build({
  entryPoints: ['tests/fixtures/application-browser.tsx'], outdir: artifacts, entryNames: 'fixture',
  bundle: true, splitting: true, format: 'esm', jsx: 'automatic', platform: 'browser', logLevel: 'warning',
  define: { 'import.meta.env': JSON.stringify({ DEV: true, VITE_BACKEND_PROVIDER: 'netlify', VITE_SUPABASE_URL: 'https://fixture.example.invalid', VITE_SUPABASE_ANON_KEY: 'fixture-public-key', VITE_DISABLE_SUPABASE_READS: 'true' }) },
  plugins: [{
    name: 'offline-auth-boundary', setup(builder) {
      builder.onResolve({ filter: /\/authService(?:\.js|\.ts)?$/ }, () => ({ path: path.resolve('tests/fixtures/application-auth-boundary.ts') }));
    },
  }],
});
await writeFile(path.join(artifacts, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>');
const server = createServer(async (request, response) => {
  const name = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (!/^[\w.-]+$/.test(name)) { response.writeHead(404).end(); return; }
  try {
    response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'");
    response.end(await readFile(name === 'styles.css' ? 'src/styles.css' : path.join(artifacts, name)));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let executablePath;
if (engine === 'chromium')
  for (const p of [process.env.PLANTIE_TEST_BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].filter(Boolean)) {
    try {
      await access(p);
      executablePath = p;
      break;
    }
    catch { }
  }
const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true, ...(executablePath ? { executablePath } : {}) });

const checks = [], failures = [];
const scenario = async (name, width, run) => {
  const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  try {
    await run(page);
    assert.deepEqual(errors, []);
    checks.push(name);
    console.log(`PASS: ${name}`);
  } catch (error) {
    failures.push({ name, error: error.message });
    console.error(`FAIL: ${name}: ${error.message}`);
    await page.screenshot({ path: path.join(artifacts, `${name}-failure.png`), fullPage: true });
  } finally { await page.close(); }
};
const go = async (page, hash, selector) => {
  await page.evaluate(value => { location.hash = value; }, hash);
  await page.locator(selector).waitFor();
};
const assertNavigation = async (page, destination) => {
  assert.equal(await page.locator('.mobile-bottom-nav').count(), 1);
  assert.ok(await page.locator('.mobile-bottom-nav').isVisible());
  assert.equal(await page.locator('.mobile-bottom-nav [aria-current="page"]').getAttribute('href'), destination);
  assert.equal(await page.locator('.mobile-bottom-nav a').count(), 4);
  assert.equal(await page.locator('.mobile-bottom-nav button').count(), 1);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
};
const assertPage = async (page, expected, total) => {
  const pagination = page.locator('.plant-pagination');
  await page.waitForFunction(({ expected, total }) => document.querySelector('.plant-pagination [role="status"]')?.textContent === `${expected} of ${total}`, { expected, total });
  for (const name of ['First page', 'Previous page']) assert.equal(await pagination.getByRole('button', { name, exact: true }).isDisabled(), expected === 1);
  for (const name of ['Next page', 'Last page']) assert.equal(await pagination.getByRole('button', { name, exact: true }).isDisabled(), expected === total);
};
const cancelAdd = async page => {
  const opener = page.locator('.mobile-bottom-nav button');
  const hash = await page.evaluate(() => location.hash);
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Add new plant' });
  await dialog.waitFor();
  assert.equal(await page.evaluate(() => location.hash), hash, 'Add plant preserves the underlying route');
  assert.equal(await page.getByRole('dialog').count(), 1);
  assert.ok(await dialog.evaluate(node => node.contains(document.activeElement)));
  assert.ok(await page.evaluate(() => {
    const nav = document.querySelector('.mobile-bottom-nav').getBoundingClientRect();
    return !!document.elementFromPoint(nav.x + nav.width / 2, nav.y + nav.height / 2)?.closest('.modal-backdrop');
  }), 'Modal backdrop intercepts navigation');
  await page.keyboard.press('Shift+Tab');
  assert.ok(await dialog.evaluate(node => node.contains(document.activeElement)), 'Focus stays in the modal');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.ok(await opener.evaluate(node => node === document.activeElement), 'Focus returns to the existing navigation');
};

try {
  for (const width of [320, 360, 375, 390, 430, 768]) await scenario(`responsive-${width}`, width, async page => {
    await page.goto(`${origin}/?plants=23#/`);
    await page.locator('.flower-card').first().waitFor();
    await assertNavigation(page, '#/');
    await page.evaluate(() => { window.__mobileNavNode = document.querySelector('.mobile-bottom-nav'); });
    await page.locator('.plant-card-open-action').first().click();
    await page.locator('.detail-shell').waitFor();
    await assertNavigation(page, '#/');
    const back = page.locator('.floating-back-link');
    const initial = await back.boundingBox();
    assert.ok(initial.width >= 44 && initial.height >= 44);
    if (width === 390) await page.screenshot({ path: path.join(artifacts, 'detail-top-390.png') });
    for (const fraction of [0.3, 0.65, 1]) {
      await page.evaluate(value => window.scrollTo(0, document.documentElement.scrollHeight * value), fraction);
      const box = await back.boundingBox();
      assert.ok(Math.abs(box.x - initial.x) < 1 && Math.abs(box.y - initial.y) < 1, 'Back button follows the viewport');
      assert.ok(await back.evaluate(node => {
        const box = node.getBoundingClientRect();
        return node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      }), 'Back button stays clickable while scrolling');
    }
    if (width === 390) await page.screenshot({ path: path.join(artifacts, 'detail-scrolled-390.png') });
    await cancelAdd(page);
    await back.click();
    await page.locator('.flower-card').first().waitFor();
    await page.locator('.mobile-bottom-nav a[href="#/diagnose"]').click();
    await page.locator('#diagnose-picker-title').waitFor();
    await assertNavigation(page, '#/diagnose');
    await page.locator('.diagnose-picker-card').first().click();
    await page.locator('.detail-shell').waitFor();
    await assertNavigation(page, '#/');
    await page.locator('.mobile-bottom-nav a[href="#/qr"]').click();
    await page.locator('.qr-shell').waitFor();
    await assertNavigation(page, '#/qr');
    await page.locator('.mobile-bottom-nav a[href="#/menu"]').click();
    await page.locator('.menu-stack').waitFor();
    await assertNavigation(page, '#/menu');
    await cancelAdd(page);
    await go(page, '/menu?section=account', '.menu-stack');
    await assertNavigation(page, '#/menu');
    await go(page, '/terms', '.release-page');
    await assertNavigation(page, '#/menu');
    assert.ok(await page.evaluate(() => window.__mobileNavNode === document.querySelector('.mobile-bottom-nav')), 'Navigation survives route transitions');
    await go(page, '/', '.flower-grid');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const pagination = await page.locator('.plant-pagination').boundingBox();
    const nav = await page.locator('.mobile-bottom-nav').boundingBox();
    assert.ok(pagination.y + pagination.height < nav.y, 'Pagination clears bottom navigation');
    const lastCard = await page.locator('.flower-card').last().boundingBox();
    assert.ok(lastCard.y + lastCard.height < nav.y, 'Last content can scroll above navigation');
    for (const button of await page.locator('.plant-pagination button').all()) {
      const box = await button.boundingBox(); assert.ok(box.width >= 44 && box.height >= 44);
    }
    await page.screenshot({ path: path.join(artifacts, `dashboard-${width}.png`) });
  });
  await scenario('pagination-state-and-addition', 390, async page => {
    await page.goto(`${origin}/?plants=23#/`);
    await page.locator('.flower-card').first().waitFor();
    await assertPage(page, 1, 3);
    assert.equal(await page.locator('.plant-pagination svg').count(), 4);
    await page.getByRole('button', { name: 'Next page', exact: true }).click(); await assertPage(page, 2, 3);
    await page.getByRole('button', { name: 'Previous page', exact: true }).click(); await assertPage(page, 1, 3);
    await page.getByRole('button', { name: 'Last page', exact: true }).click(); await assertPage(page, 3, 3);
    await page.locator('input[type="search"]').fill('Fixture'); await assertPage(page, 3, 3);
    await page.locator('.plant-card-open-action').first().click();
    await page.locator('.detail-shell').waitFor();
    await cancelAdd(page);
    await page.locator('.mobile-bottom-nav button').click();
    const dialog = page.getByRole('dialog', { name: 'Add new plant' });
    await dialog.getByRole('textbox').fill('Added from details');
    const jpeg = Buffer.from((await page.evaluate(() => window.__applicationFixture.image)).split(',')[1], 'base64');
    await dialog.locator('input[type="file"]').setInputFiles({ name: 'fixture.jpg', mimeType: 'image/jpeg', buffer: jpeg });
    await dialog.locator('.plant-image-preview').waitFor();
    await dialog.getByRole('button', { name: 'Add plant', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.ok((await page.evaluate(() => location.hash)).startsWith('#/flower/'));
    await page.locator('.floating-back-link').click();
    await page.locator('.flower-card').first().waitFor(); await assertPage(page, 3, 3);
    assert.equal(await page.locator('input[type="search"]').inputValue(), 'Fixture');
    await page.locator('input[type="search"]').fill('no-matching-plant');
    await page.locator('.empty-state').waitFor();
    assert.equal(await page.locator('.plant-pagination').count(), 0);
    await page.locator('input[type="search"]').fill(''); await assertPage(page, 1, 3);
    for (const name of ['Next page', 'Previous page']) {
      await page.evaluate(name => { for (let index = 0; index < 8; index++) document.querySelector(`[aria-label="${name}"]`).click(); }, name);
      await assertPage(page, name === 'Next page' ? 3 : 1, 3);
    }
    await page.getByRole('button', { name: 'Last page', exact: true }).click(); await assertPage(page, 3, 3);
    await page.getByRole('button', { name: 'First page', exact: true }).click(); await assertPage(page, 1, 3);
  });
  for (const count of [0, 1, 10]) await scenario(`unpaginated-${count}`, 320, async page => {
    await page.goto(`${origin}/?plants=${count}#/`);
    await page.locator('.hero').waitFor();
    assert.equal(await page.locator('.plant-pagination').count(), 0);
    await assertNavigation(page, '#/');
  });
  await scenario('safe-areas-and-direct-link', 390, async page => {
    await page.goto(`${origin}/?plants=23#/menu`);
    await page.locator('.menu-stack').waitFor();
    await go(page, '/flower/fixture-plant', '.detail-shell');
    await page.reload(); await page.locator('.detail-shell').waitFor();
    await page.addStyleTag({ content: ':root { --safe-area-top: 24px; --safe-area-bottom: 34px; --safe-area-left: 8px; --safe-area-right: 8px; }' });
    const back = await page.locator('.floating-back-link').boundingBox();
    const nav = await page.locator('.mobile-bottom-nav').boundingBox();
    assert.equal(back.y, 40); assert.equal(back.x, 24);
    assert.ok(844 - nav.y - nav.height >= 46);
    await page.locator('.floating-back-link').click();
    await page.locator('.flower-grid').waitFor();
    assert.equal(await page.evaluate(() => location.hash), '#/', 'Refreshed details return to plants instead of unrelated history');
  });
  await scenario('deletion-clamps-last-page', 390, async page => {
    await page.goto(`${origin}/?plants=21#/`);
    await page.locator('.flower-card').first().waitFor();
    await page.getByRole('button', { name: 'Last page', exact: true }).click(); await assertPage(page, 3, 3);
    assert.equal(await page.locator('.flower-card').count(), 1);
    await page.locator('.plant-card-open-action').click();
    await page.locator('.detail-shell').waitFor();
    await page.getByRole('button', { name: 'Remove plant', exact: true }).click();
    await page.locator('.confirm-modal .danger-action').click();
    await page.locator('.flower-card').first().waitFor(); await assertPage(page, 2, 2);
    assert.equal(await page.locator('.flower-card').count(), 10);
  });
  for (const language of ['sk', 'de', 'fr', 'es']) await scenario(`localized-${language}`, 320, async page => {
    await page.goto(`${origin}/?plants=23&language=${language}#/`);
    await page.locator('.flower-card').first().waitFor();
    await assertNavigation(page, '#/');
    assert.equal(await page.locator('.plant-pagination svg').count(), 4);
    assert.ok(await page.locator('.plant-pagination [role="status"]').getAttribute('aria-label'));
    for (const item of await page.locator('.mobile-bottom-nav > *').all()) {
      assert.ok(await item.evaluate(node => node.scrollHeight <= node.clientHeight), 'Translated label fits its touch target');
    }
    if (language === 'sk') {
      await page.getByRole('button', { name: 'Posledná stránka', exact: true }).click();
      assert.equal(await page.locator('.plant-pagination [role="status"]').textContent(), '3 z 3');
      await page.screenshot({ path: path.join(artifacts, 'dashboard-sk-320.png') });
    }
  });
  await scenario('short-viewport-and-form-focus', 390, async page => {
    await page.goto(`${origin}/?plants=23#/`);
    await page.locator('.flower-card').first().waitFor();
    await page.setViewportSize({ width: 390, height: 400 });
    await page.locator('input[type="search"]').focus();
    await page.waitForFunction(() => document.querySelector('input[type="search"]').getBoundingClientRect().bottom <= document.querySelector('.mobile-bottom-nav').getBoundingClientRect().top);
    const input = await page.locator('input[type="search"]').boundingBox();
    const navigation = await page.locator('.mobile-bottom-nav').boundingBox();
    assert.ok(input.y + input.height <= navigation.y, 'Focused field clears navigation in a shortened viewport');
    await cancelAdd(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('input[type="search"]').focus();
    await page.setViewportSize({ width: 390, height: 400 });
    await page.waitForFunction(() => document.querySelector('input[type="search"]').getBoundingClientRect().bottom <= document.querySelector('.mobile-bottom-nav').getBoundingClientRect().top);
  });
  await scenario('care-state-survives-navigation', 390, async page => {
    await page.goto(`${origin}/?plants=1#/`);
    await page.locator('.flower-card').waitFor();
    await page.locator('.plant-card-actions button').click();
    await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('flowscan-flower-records-v1'))?.['fixture-plant']?.lastWatered);
    const records = await page.evaluate(() => localStorage.getItem('flowscan-flower-records-v1'));
    await page.locator('.plant-card-open-action').click();
    await page.locator('.detail-shell').waitFor();
    await page.locator('.mobile-bottom-nav a[href="#/diagnose"]').click();
    await page.locator('#diagnose-picker-title').waitFor();
    await page.locator('.mobile-bottom-nav a[href="#/"]').click();
    await page.locator('.flower-card').waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('flowscan-flower-records-v1')), records);
    assert.equal(await page.locator('.image-watering-label strong').textContent(), '100 %');
  });
  for (const width of [1024, 1440]) await scenario(`desktop-${width}`, width, async page => {
    await page.goto(`${origin}/?plants=23#/flower/fixture-plant`);
    await page.locator('.detail-shell').waitFor();
    assert.equal(await page.locator('.mobile-bottom-nav').isVisible(), false);
    assert.equal(await page.locator('.floating-back-link').evaluate(node => getComputedStyle(node).position), 'relative');
    assert.ok(await page.locator('.app-tab-nav').isVisible());
    await page.locator('.app-tab-nav a[href="#/"]').click();
    await page.locator('.flower-grid').waitFor();
    await page.getByRole('button', { name: 'Last page', exact: true }).click(); await assertPage(page, 3, 3);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  });
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ engine, checks, failures }, null, 2));
console.log(JSON.stringify({ engine, passed: checks.length, failures }));
if (failures.length) process.exitCode = 1;
