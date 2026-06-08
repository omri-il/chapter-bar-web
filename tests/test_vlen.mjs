import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8123/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
console.log('initial value:', await page.locator('#videoLength').inputValue());
console.log('readonly?', await page.locator('#videoLength').getAttribute('readonly'));
console.log('disabled?', await page.locator('#videoLength').isDisabled());
// try typing
await page.locator('#videoLength').fill('3:30');
console.log('after fill:', await page.locator('#videoLength').inputValue());
await page.locator('#videoLength').click();
await page.locator('#videoLength').pressSequentially('0', {delay:30});
console.log('after type:', await page.locator('#videoLength').inputValue());
console.log(errors.length ? 'ERRORS:\n'+errors.join('\n') : 'NO ERRORS');
await browser.close();
