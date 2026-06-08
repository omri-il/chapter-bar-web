import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type()==='error') errors.push('CONSOLE: '+m.text()); });
await page.goto('http://localhost:8123/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
// switch to circle layout
await page.locator('.seg[data-layout="circle"]').click();
await page.waitForTimeout(200);
console.log('barControls hidden:', await page.locator('#barControls').isHidden(), '| circleControls hidden:', await page.locator('#circleControls').isHidden());
// scrub to ~2:00 (inside chapter "נושא ראשון" 1:24->3:17) of 10:00 -> 20%
await page.locator('#scrub').evaluate(el => { el.value=200; el.dispatchEvent(new Event('input',{bubbles:true})); });
await page.waitForTimeout(200);
await page.locator('.canvas-wrap').screenshot({ path: 'C:/tmp/circle_br.png' });
// move to center + bigger
await page.locator('#circlePos').selectOption('center');
await page.locator('#circleSizeFrac').evaluate(el => { el.value='0.45'; el.dispatchEvent(new Event('input',{bubbles:true})); });
await page.waitForTimeout(200);
await page.locator('.canvas-wrap').screenshot({ path: 'C:/tmp/circle_center.png' });
console.log(errors.length ? 'ERRORS:\n'+errors.join('\n') : 'NO ERRORS');
await browser.close();
