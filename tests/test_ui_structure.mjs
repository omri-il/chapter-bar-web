import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type()==='error') errors.push('CONSOLE: '+m.text()); });
await page.goto('http://localhost:8123/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
// unique ids that moved
for (const id of ['fps','widthMode','barDirection','bgOpacity','playheadStyle','circleShowName','circleThicknessFrac','circleFontFamily']) {
  const n = await page.locator('#'+id).count();
  if (n !== 1) console.log(`DUPLICATE/MISSING #${id}: count=${n}`);
}
// advanced details present + closed by default
const details = await page.locator('details.adv').count();
const open = await page.locator('details.adv[open]').count();
console.log('details.adv:', details, '| open by default:', open);
// expand design card, count visible field-rows before opening advanced
await page.evaluate(() => document.querySelectorAll('.card.collapsed').forEach(c=>c.classList.remove('collapsed')));
await page.waitForTimeout(100);
console.log('design basic visible inputs:', await page.locator('[data-card="design"] .field-row:visible').count());
console.log(errors.length ? 'ERRORS:\n'+errors.join('\n') : 'NO ERRORS');
await browser.close();
