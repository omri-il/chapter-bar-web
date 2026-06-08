import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type()==='error') errors.push('CONSOLE: '+m.text()); });
await page.goto('http://localhost:8123/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
// first card heading should now be video settings
const firstH2 = await page.locator('.controls .card h2').first().textContent();
console.log('first card:', firstH2.trim());
// font options count + a few values
const opts = await page.$$eval('#fontFamily option', els => els.map(e=>e.value));
console.log('font options:', JSON.stringify(opts));
// select Open Sans, render
await page.locator('#fontFamily').selectOption('Open Sans');
await page.waitForTimeout(800);
await page.locator('#scrub').evaluate(el => { el.value=300; el.dispatchEvent(new Event('input',{bubbles:true})); });
await page.waitForTimeout(300);
await page.locator('.preview-card').screenshot({ path: 'C:/tmp/opensans.png' });
console.log(errors.length ? 'ERRORS:\n'+errors.join('\n') : 'NO ERRORS');
await browser.close();
