import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://localhost:8123/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
// LTR default
console.log('active dir:', (await page.locator('#barDirection .seg.active').textContent()).trim());
console.log('scrub dir:', await page.locator('#scrub').getAttribute('dir'));
// URL field present; test Drive message
await page.locator('#videoUrl').fill('https://drive.google.com/file/d/ABC123/view?usp=sharing');
await page.locator('#loadUrl').click();
await page.waitForTimeout(1500);
console.log('urlMeta:', (await page.locator('#urlMeta').textContent()).trim());
console.log(errors.length?'ERRORS '+errors.join(';'):'NO ERRORS');
await browser.close();
