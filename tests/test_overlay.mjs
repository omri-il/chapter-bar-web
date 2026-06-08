import { chromium } from 'playwright';
import fs from 'fs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

await page.goto('http://localhost:8123/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.evaluate(() => document.querySelectorAll('.card.collapsed').forEach(c => c.classList.remove('collapsed')));

// short clip for a fast test — set chapter starts within the 2s length so it validates
await page.locator('#videoLength').fill('0:02');
await page.locator('#videoLength').dispatchEvent('input');
const starts = await page.$$('.ch-start');
const sv = ['0:00', '0:00.5', '0:01', '0:01.5'];
for (let i = 0; i < starts.length; i++) await starts[i].fill(sv[i] || '0:01.5');
await page.locator('#videoLength').fill('0:02');
await page.locator('#videoLength').dispatchEvent('input');

const downloadPromise = page.waitForEvent('download', { timeout: 60000 }).catch(() => null);
await page.locator('#exportOverlay').click();

const download = await downloadPromise;
if (download) {
  const path = 'C:/tmp/' + download.suggestedFilename();
  await download.saveAs(path);
  const size = fs.statSync(path).size;
  console.log('DOWNLOAD ok:', download.suggestedFilename(), size, 'bytes');
} else {
  console.log('NO DOWNLOAD');
}

await page.waitForTimeout(500);
console.log('status:', (await page.locator('#exportStatusText').textContent()).trim());
console.log('--- ERRORS ---');
errors.forEach(e => console.log(e));
console.log(errors.length ? `FAILED ${errors.length}` : 'NO ERRORS');
await browser.close();
