import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const errors = [];
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('requestfailed', r => errors.push('REQFAIL: ' + r.url() + ' ' + (r.failure()?.errorText || '')));

await page.goto('http://localhost:8123/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// Check chapters rendered
const chapterCount = await page.locator('.chapter-row').count();
console.log('chapter rows:', chapterCount);

// Move scrubber to ~60% and screenshot preview
await page.locator('#scrub').evaluate(el => { el.value = 600; el.dispatchEvent(new Event('input', { bubbles: true })); });
await page.waitForTimeout(300);

// Check canvas has non-empty content
const canvasInfo = await page.evaluate(() => {
  const c = document.getElementById('preview');
  const ctx = c.getContext('2d');
  const data = ctx.getImageData(0, c.height - Math.round(c.height * 0.15), c.width, Math.round(c.height * 0.1)).data;
  let nonTransparent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) nonTransparent++;
  return { w: c.width, h: c.height, nonTransparent };
});
console.log('canvas:', JSON.stringify(canvasInfo));

await page.locator('.preview-card').screenshot({ path: '/tmp/preview.png' });
console.log('feature support:', JSON.stringify(await page.evaluate(() => ({
  VideoEncoder: typeof VideoEncoder !== 'undefined',
  VideoDecoder: typeof VideoDecoder !== 'undefined',
  AudioEncoder: typeof AudioEncoder !== 'undefined',
  roundRect: !!CanvasRenderingContext2D.prototype.roundRect,
}))));

const burninNote = await page.locator('#burninSupport').textContent();
console.log('burnin note:', burninNote.trim());

console.log('\n--- CONSOLE LOGS ---');
logs.forEach(l => console.log(l));
console.log('\n--- ERRORS ---');
errors.forEach(e => console.log(e));
console.log(errors.length ? `\nFAILED with ${errors.length} error(s)` : '\nNO ERRORS');

await browser.close();
