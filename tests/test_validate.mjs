import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8123/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

// default: length 10:00, last start 8:20 -> valid
console.log('default warn hidden:', await page.locator('#lengthWarn').isHidden(), '| overlay disabled:', await page.locator('#exportOverlay').isDisabled());

// set length too low (5:00 < last start 8:20) -> invalid
await page.locator('#videoLength').fill('5:00');
await page.locator('#videoLength').dispatchEvent('input');
await page.waitForTimeout(150);
console.log('low warn hidden:', await page.locator('#lengthWarn').isHidden(), '| warn text:', (await page.locator('#lengthWarn').textContent()).trim());
console.log('low overlay disabled:', await page.locator('#exportOverlay').isDisabled());

// fix length back to 12:00 -> valid again
await page.locator('#videoLength').fill('12:00');
await page.locator('#videoLength').dispatchEvent('input');
await page.waitForTimeout(150);
console.log('fixed warn hidden:', await page.locator('#lengthWarn').isHidden(), '| overlay disabled:', await page.locator('#exportOverlay').isDisabled());

console.log(errors.length ? 'ERRORS:\n'+errors.join('\n') : 'NO ERRORS');
await browser.close();
