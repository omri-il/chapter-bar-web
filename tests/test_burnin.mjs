import { chromium } from 'playwright';
import fs from 'fs';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
await page.goto('http://localhost:8123/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.evaluate(() => document.querySelectorAll(".card.collapsed").forEach(c => c.classList.remove("collapsed")));

// set video length + chapter start times suited to the 3s sample
await page.locator('#videoLength').fill('0:03');
const starts = await page.$$('.ch-start');
const vals = ['0:00','0:01','0:02','0:02'];
for (let i=0;i<starts.length;i++){ await starts[i].fill(vals[i] || '0:02'); }
await page.locator('#videoFile').setInputFiles('C:/tmp/sample.mp4');
await page.waitForTimeout(300);

const dl = page.waitForEvent('download', { timeout: 90000 }).catch(()=>null);
await page.locator('#exportBurnin').click();
const download = await dl;
if (download) {
  const p = 'C:/tmp/' + download.suggestedFilename();
  await download.saveAs(p);
  console.log('DOWNLOAD ok:', download.suggestedFilename(), fs.statSync(p).size, 'bytes');
} else console.log('NO DOWNLOAD');
await page.waitForTimeout(400);
console.log('status:', (await page.locator('#exportStatusText').textContent()).trim());
console.log(errors.length ? 'ERRORS:\n'+errors.join('\n') : 'NO ERRORS');
await browser.close();
