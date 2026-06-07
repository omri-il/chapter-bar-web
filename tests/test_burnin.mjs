import { chromium } from 'playwright';
import fs from 'fs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

await page.goto('http://localhost:8123/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// pick the sample file
await page.locator('#videoFile').setInputFiles('C:/tmp/sample.mp4');
await page.waitForTimeout(300);
console.log('burnin button disabled?', await page.locator('#exportBurnin').isDisabled());

const downloadPromise = page.waitForEvent('download', { timeout: 90000 }).catch(() => null);
await page.locator('#exportBurnin').click();

const download = await downloadPromise;
if (download) {
  const path = 'C:/tmp/' + download.suggestedFilename();
  await download.saveAs(path);
  console.log('DOWNLOAD ok:', download.suggestedFilename(), fs.statSync(path).size, 'bytes');
} else {
  console.log('NO DOWNLOAD');
}
await page.waitForTimeout(500);
console.log('status:', (await page.locator('#exportStatusText').textContent()).trim());
console.log('--- ERRORS ---');
errors.forEach(e => console.log(e));
console.log(errors.length ? `FAILED ${errors.length}` : 'NO ERRORS');
await browser.close();
