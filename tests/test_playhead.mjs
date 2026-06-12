import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type()==='error') errors.push('CONSOLE: '+m.text()); });
await page.goto('http://localhost:8123/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.evaluate(() => { document.querySelectorAll('.card.collapsed').forEach(c => c.classList.remove('collapsed')); document.querySelectorAll('details').forEach(d => d.open = true); });
await page.locator('#scrub').evaluate(el => { el.value=480; el.dispatchEvent(new Event('input',{bubbles:true})); });
await page.locator('#playheadColor').evaluate(el => { el.value='#ff3b3b'; el.dispatchEvent(new Event('input',{bubbles:true})); });
await page.locator('#playheadWidthFrac').evaluate(el => { el.value='0.18'; el.dispatchEvent(new Event('input',{bubbles:true})); });
for (const s of ['bar','line','triangle','circle','none']) {
  await page.locator('#playheadStyle').selectOption(s);
  await page.waitForTimeout(150);
  await page.locator('.canvas-wrap').screenshot({ path: `C:/tmp/ph_${s}.png` });
}
console.log(errors.length ? 'ERRORS:\n'+errors.join('\n') : 'NO ERRORS (playhead styles)');
await browser.close();
