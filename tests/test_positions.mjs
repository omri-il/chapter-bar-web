import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type()==='error') errors.push('CONSOLE: '+m.text()); });
await page.goto('http://localhost:8123/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.evaluate(() => document.querySelectorAll('.card.collapsed').forEach(c => c.classList.remove('collapsed')));
await page.locator('#showCircle').check();
await page.locator('#scrub').evaluate(el => { el.value=200; el.dispatchEvent(new Event('input',{bubbles:true})); });
const opts = await page.locator('#circlePos option').evaluateAll(els => els.map(e=>e.value));
console.log('position options:', opts.join(','), '(count', opts.length+')');
for (const p of ['tc','mc','ml','bc']) {
  await page.locator('#circlePos').selectOption(p);
  await page.waitForTimeout(120);
  await page.locator('.canvas-wrap').screenshot({ path: `C:/tmp/pos_${p}.png` });
}
console.log(errors.length ? 'ERRORS:\n'+errors.join('\n') : 'NO ERRORS');
await browser.close();
