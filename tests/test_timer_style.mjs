import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type()==='error') errors.push('CONSOLE: '+m.text()); });
await page.goto('http://localhost:8123/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.evaluate(() => { document.querySelectorAll('.card.collapsed').forEach(c => c.classList.remove('collapsed')); document.querySelectorAll('details').forEach(d => d.open = true); });
await page.locator('#showCircle').check();
await page.locator('#circlePos').selectOption('mc');
await page.locator('#circleSizeFrac').evaluate(el => { el.value='0.5'; el.dispatchEvent(new Event('input',{bubbles:true})); });
await page.locator('#scrub').evaluate(el => { el.value=200; el.dispatchEvent(new Event('input',{bubbles:true})); });
// custom ring color + thicker + bigger text + colored text + colored bg + font
await page.locator('#circleUseChapterColor').uncheck();
await page.locator('#circleRingColor').evaluate(el => { el.value='#ff5a3c'; el.dispatchEvent(new Event('input',{bubbles:true})); });
await page.locator('#circleTextColor').evaluate(el => { el.value='#ffe14d'; el.dispatchEvent(new Event('input',{bubbles:true})); });
await page.locator('#circleBgColor').evaluate(el => { el.value='#101820'; el.dispatchEvent(new Event('input',{bubbles:true})); });
await page.locator('#circleThicknessFrac').evaluate(el => { el.value='0.3'; el.dispatchEvent(new Event('input',{bubbles:true})); });
await page.locator('#circleTextScale').evaluate(el => { el.value='1.4'; el.dispatchEvent(new Event('input',{bubbles:true})); });
await page.locator('#circleFontFamily').selectOption('Secular One');
await page.waitForTimeout(500);
await page.locator('.canvas-wrap').screenshot({ path: 'C:/tmp/timer_styled.png' });
// verify readStyle picked up the values
const s = await page.evaluate(() => {
  const $ = id => document.getElementById(id);
  return { useChapter: $('circleUseChapterColor').checked, ring: $('circleRingColor').value, scale: $('circleTextScale').value, font: $('circleFontFamily').value };
});
console.log('controls:', JSON.stringify(s));
console.log(errors.length ? 'ERRORS:\n'+errors.join('\n') : 'NO ERRORS');
await browser.close();
