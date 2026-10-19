import assert from 'node:assert/strict';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, webkit } from 'playwright';
const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
const reproduce = process.argv.includes('--reproduce');
const artifacts = path.resolve(`.tmp-tests/qr-header-${engine}`);
await mkdir(artifacts, { recursive: true });
const bundle = await build({
  entryPoints: ['tests/fixtures/application-browser.tsx'], outdir: artifacts, entryNames: 'fixture',
  bundle: true, splitting: true, format: 'esm', jsx: 'automatic', platform: 'browser', logLevel: 'warning', metafile: true,
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
  const page = await browser.newPage({ viewport: { width, height: 900 }, acceptDownloads: true });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  try {
    await run(page); assert.deepEqual(errors, []);
    checks.push(name); console.log(`PASS: ${name}`);
  } catch (error) {
    failures.push({ name, error: error.message }); console.error(`FAIL: ${name}: ${error.message}`);
    await page.screenshot({ path: path.join(artifacts, `${name}-failure.png`), fullPage: true });
  } finally { await page.close(); }
};
const open = async (page, language = 'en') => {
  await page.goto(`${origin}/?qr&language=${language}#/qr`);
  await page.locator('.qr-shell header h1').waitFor();
  await page.locator('.qr-image').first().waitFor();
};
const copy = { en: ['Download PDF', 'Print'], sk: ['Stiahnuť PDF', 'Tlačiť'], de: ['PDF herunterladen', 'Drucken'], fr: ['Télécharger le PDF', 'Imprimer'], es: ['Descargar PDF', 'Imprimir'] };
const pdfModule = Object.entries(bundle.metafile.outputs).find(([, output]) => output.entryPoint?.endsWith('/jspdf.es.min.js'));
assert.ok(pdfModule, 'The fixture must use the real PDF renderer');
const contrastChecks = [];
const assertContrast = async (page, button) => {
  const label = button.locator('.button-label > span, :scope > span:not(.button-label):not(.button-spinner)').first();
  const metrics = await label.evaluate(element => {
    const bounds = element.getBoundingClientRect(), button = element.closest('button').getBoundingClientRect();
    const metrics = {
      color: getComputedStyle(element).color, original: element.style.color,
      left: bounds.left - button.left, top: bounds.top - button.top, right: bounds.right - button.left, bottom: bounds.bottom - button.top
    };
    element.style.color = 'transparent'; return metrics;
  });
  let raster;
  try { raster = await button.screenshot({ animations: 'disabled' }); }
  finally { await label.evaluate((element, color) => { element.style.color = color; }, metrics.original); }
  const minimum = await page.evaluate(async ({ encoded, metrics }) => {
    const image = new Image(); image.src = `data:image/png;base64,${encoded}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    const luminance = rgb => rgb.map(value => { const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; })
      .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const foreground = luminance(metrics.color.match(/[\d.]+/g).slice(0, 3).map(Number));
    let minimum = Infinity;
    for (let y = Math.ceil(metrics.top); y < Math.floor(metrics.bottom); y++) for (let x = Math.ceil(metrics.left); x < Math.floor(metrics.right); x++) {
      const offset = (y * image.width + x) * 4, background = luminance([pixels[offset], pixels[offset + 1], pixels[offset + 2]]);
      minimum = Math.min(minimum, (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05));
    }
    return minimum;
  }, { encoded: raster.toString('base64'), metrics });
  assert.ok(Number.isFinite(minimum) && minimum >= 4.5, `Action text contrast ${minimum} is below WCAG AA`);
  contrastChecks.push(minimum);
};
try {
  for (const language of reproduce ? ['en', 'sk'] : Object.keys(copy))
    for (const width of reproduce ? [320, 1440] : [320, 375, 390, 430, 768, 1024, 1440])
      await scenario(`layout-${language}-${width}`, width, async (page) => {
        await open(page, language);
        const header = page.locator('.qr-shell header');
        if (reproduce) {
          await mkdir('.netlify/qr-header-before', { recursive: true });
          await page.screenshot({ path: `.netlify/qr-header-before/${language}-${width}.png`, fullPage: true });
          const metrics = await header.locator('.topbar-actions > button').evaluateAll(buttons => buttons.map(b => ({ width: b.getBoundingClientRect().width, height: b.getBoundingClientRect().height, text: b.textContent.trim() })));
          console.log(JSON.stringify({ language, width, before: metrics }));
          assert.equal(metrics.length, 2);
          assert.ok(metrics.every(b => b.height >= 44 && b.height <= 46 && b.text), 'QR actions must have visible labels and compact 44–46px heights');
          return;
        }
        const download = header.getByRole('button', { name: copy[language][0], exact: true }), print = header.getByRole('button', { name: copy[language][1], exact: true });
        assert.ok(await download.isVisible());
        assert.ok(await print.isVisible());
        const metrics = await header.evaluate(element => {
          const rect = node => {
            const bounds = node.getBoundingClientRect();
            return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: bounds.width, height: bounds.height };
          };
          return {
            header: rect(element), controls: [...element.querySelectorAll('button,a')].map(rect),
            actions: [...element.querySelectorAll('.qr-header-actions button')].map(button => {
              const icon = button.querySelector('svg'), label = button.querySelector('.button-label > span') ?? button.querySelector(':scope > span');
              return { box: rect(button), icon: rect(icon), label: rect(label) };
            }),
          };
        });
        assert.equal(metrics.actions.length, 2);
        for (const { box, icon, label } of metrics.actions) {
          assert.ok(box.height >= 44 && box.height <= 46, `Button stretched to ${box.height}`);
          assert.ok(icon.right <= label.left + 1, 'Icon must precede its label');
          assert.ok(Math.abs((icon.top + icon.bottom - label.top - label.bottom) / 2) < 2, 'Icon and label must share their center line');
          assert.ok(box.left >= metrics.header.left && box.right <= metrics.header.right);
        }
        assert.ok(Math.abs(metrics.actions[0].box.height - metrics.actions[1].box.height) < 1);
        for (let i = 0; i < metrics.controls.length; i++)
          for (let j = i + 1; j < metrics.controls.length; j++) {
            const a = metrics.controls[i], b = metrics.controls[j];
            assert.ok(Math.min(a.right, b.right) - Math.max(a.left, b.left) <= 1 || Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) <= 1, 'Header controls overlap');
          }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        if (language === 'en' && [320, 1440].includes(width)) {
          await assertContrast(page, download); await assertContrast(page, print);
        }
        await download.focus();
        await page.keyboard.press('Tab');
        assert.equal(await print.evaluate(el => el === document.activeElement), true);
        const focus = await print.evaluate(el => getComputedStyle(el).outlineStyle);
        assert.notEqual(focus, 'none');
        await header.locator('.user-menu-trigger').click();
        await page.locator('.household-sheet').waitFor();
        const selector = page.locator('.household-sheet select');
        assert.equal(await selector.isEnabled(), true);
        assert.equal(await selector.locator('option').count(), 2);
        assert.equal(await selector.inputValue(), '33333333-3333-4333-8333-333333333333');
        await page.keyboard.press('Escape');
        await page.locator('.household-sheet').waitFor({ state: 'hidden' });
        await header.locator('.invitation-inbox-trigger').click();
        await page.getByRole('dialog').waitFor();
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        if (['en', 'sk'].includes(language) && [320, 1440].includes(width))
          await page.screenshot({ path: path.join(artifacts, `${language}-${width}.png`), fullPage: true });
      });
  if (!reproduce) {
    for (const width of [320, 1440])
      await scenario(`download-and-print-${width}`, width, async (page) => {
        await page.addInitScript(() => { window.__qrPrintCalls = 0; window.print = () => { window.__qrPrintCalls++; }; });
        await open(page);
        const header = page.locator('.qr-shell header');
        const initial = await page.evaluate(() => ({ household: localStorage.getItem('flowscan-active-household-v1'), image: document.querySelector('.qr-image').src, url: document.querySelector('.base-url-panel input').value }));
        const downloads = [];
        page.on('download', download => downloads.push(download));
        const pendingDownload = page.waitForEvent('download');
        await header.getByRole('button', { name: 'Download PDF', exact: true }).press('Enter');
        const download = await pendingDownload;
        assert.equal(download.suggestedFilename(), 'plantie-qr-labels-a4.pdf');
        const file = path.join(artifacts, `labels-${width}.pdf`);
        await download.saveAs(file);
        const pdf = (await readFile(file)).toString('latin1');
        assert.ok(pdf.startsWith('%PDF-'));
        assert.match(pdf, /Plantie QR labels/);
        assert.match(pdf, /\/Subtype \/Image/);
        const media = pdf.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
        assert.ok(media);
        assert.ok(Math.abs(Number(media[1]) - 595.28) < 0.1);
        assert.ok(Math.abs(Number(media[2]) - 841.89) < 0.1);
        await page.waitForFunction(() => document.querySelector('.report-status')?.textContent.includes('PDF is ready'));
        assert.equal(await page.evaluate(() => window.__qrPrintCalls), 0);
        const print = header.getByRole('button', { name: 'Print', exact: true });
        await print.press('Space');
        await print.press('Enter');
        assert.equal(await page.evaluate(() => window.__qrPrintCalls), 2);
        assert.equal(downloads.length, 1);
        assert.deepEqual(await page.evaluate(() => ({ household: localStorage.getItem('flowscan-active-household-v1'), image: document.querySelector('.qr-image').src, url: document.querySelector('.base-url-panel input').value })), initial);
        await page.emulateMedia({ media: 'print' });
        assert.equal(await header.isVisible(), false);
        assert.equal(await page.locator('.qr-image').isVisible(), true);
      });
    await scenario('loading-and-repeated-clicks', 390, async (page) => {
      await open(page);
      let release;
      const held = new Promise(resolve => { release = resolve; });
      const requested = page.waitForRequest(/jspdf\.es\.min-.*\.js$/);
      await page.route(/jspdf\.es\.min-.*\.js$/, async (route) => { await held; await route.continue(); });
      const downloads = [];
      page.on('download', download => downloads.push(download));
      const pendingDownload = page.waitForEvent('download');
      pendingDownload.catch(() => { });
      try {
        await page.evaluate(() => { document.querySelector('.qr-header-actions button').click(); document.querySelector('.pdf-export-actions button').click(); });
        await requested;
        const buttons = page.locator('.qr-header-actions button').first().or(page.locator('.pdf-export-actions button'));
        assert.equal(await buttons.count(), 2);
        for (const button of await buttons.all()) {
          assert.equal(await button.isDisabled(), true);
          assert.equal(await button.getAttribute('aria-busy'), 'true');
        }
        assert.ok(await page.getByRole('status').isVisible());
        assert.ok((await page.locator('.qr-header-actions button').first().boundingBox()).height <= 46);
        await page.evaluate(() => { document.querySelector('.qr-header-actions button').click(); document.querySelector('.pdf-export-actions button').click(); });
      }
      finally {
        release();
      }
      const download = await pendingDownload;
      await download.saveAs(path.join(artifacts, 'single-generation.pdf'));
      await page.waitForFunction(() => document.querySelector('.report-status')?.textContent.includes('PDF is ready') && !document.querySelector('.qr-header-actions button').disabled);
      assert.equal(downloads.length, 1, 'Repeated clicks must generate exactly one PDF');
    });
    await scenario('empty-household', 320, async (page) => {
      await page.goto(`${origin}/?qr&empty#/qr`);
      await page.locator('.qr-shell header').waitFor();
      const buttons = page.locator('.qr-header-actions button');
      assert.equal(await buttons.count(), 2);
      for (const button of await buttons.all())
        assert.equal(await button.isDisabled(), true);
      assert.equal(await page.locator('.qr-label').count(), 0);
    });
    await scenario('export-error-and-retry', 390, async page => {
      await open(page);
      const module = path.basename(pdfModule[0]);
      await page.evaluate(async file => {
        const { default: jsPDF } = await import(`/${file}`);
        window.__qrOriginalAddImage = jsPDF.API.addImage;
        jsPDF.API.addImage = () => { throw new Error('Fixture PDF rendering failed'); };
      }, module);
      await page.locator('.qr-header-actions button').first().click();
      await page.getByRole('status').filter({ hasText: 'Fixture PDF rendering failed' }).waitFor();
      for (const button of await page.locator('.qr-header-actions button').first().or(page.locator('.pdf-export-actions button')).all()) {
        assert.equal(await button.isEnabled(), true); assert.equal(await button.getAttribute('aria-busy'), null);
      }
      await page.evaluate(async file => { const { default: jsPDF } = await import(`/${file}`); jsPDF.API.addImage = window.__qrOriginalAddImage; }, module);
      const pendingDownload = page.waitForEvent('download');
      await page.locator('.qr-header-actions button').first().click();
      await (await pendingDownload).saveAs(path.join(artifacts, 'retry.pdf'));
      await page.getByRole('status').filter({ hasText: 'PDF is ready' }).waitFor();
    });
  }
}
finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ engine, checks, contrastChecks, failures }, null, 2));
console.log(JSON.stringify({ engine, passed: checks.length, minimumTextContrast: Math.min(...contrastChecks), failures }));
if (failures.length)
  process.exitCode = 1;
