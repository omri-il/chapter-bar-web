import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type()==='error') errors.push('CONSOLE: '+m.text()); });
await page.goto('http://localhost:8123/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.evaluate(() => document.querySelectorAll('.card.collapsed').forEach(c => c.classList.remove('collapsed')));
// bar stays on; ALSO enable the circle timer -> both layers
await page.locator('#showCircle').check();
await page.waitForTimeout(150);
console.log('showBar checked:', await page.locator('#showBar').isChecked(), '| showCircle checked:', await page.locator('#showCircle').isChecked());
console.log('circleShowName checked (should be false after first enable):', await page.locator('#circleShowName').isChecked());
console.log('barControls hidden:', await page.locator('#barControls').isHidden(), '| circleControls hidden:', await page.locator('#circleControls').isHidden());
// scrub to ~2:00 inside a chapter so the countdown shows
await page.locator('#scrub').evaluate(el => { el.value=200; el.dispatchEvent(new Event('input',{bubbles:true})); });
await page.waitForTimeout(200);
await page.locator('.canvas-wrap').screenshot({ path: 'C:/tmp/combined_bar_timer.png' });
console.log(errors.length ? 'ERRORS:\n'+errors.join('\n') : 'NO ERRORS');
await browser.close();
