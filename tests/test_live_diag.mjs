import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type()==='error') errors.push('CONSOLE: '+m.text()); });
await page.goto('https://omri-il.github.io/chapter-bar-web/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
// is the layout toggle present?
console.log('layout toggle present:', await page.locator('#layout').count());
console.log('circleControls present:', await page.locator('#circleControls').count());
console.log('fontFamily present:', await page.locator('#fontFamily').count());
// try clicking pomodoro
const seg = page.locator('.seg[data-layout="circle"]');
if (await seg.count()) {
  await seg.click(); await page.waitForTimeout(300);
  console.log('after click -> circleControls hidden:', await page.locator('#circleControls').isHidden());
} else console.log('NO pomodoro button on live');
console.log(errors.length ? 'ERRORS:\n'+errors.join('\n') : 'NO ERRORS');
await browser.close();
